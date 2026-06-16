/* =====================================================================
 *  GERADOR DE COMUNICADOS RH — CONTOURLINE
 *  app.js — motor de render (Canvas), pan/zoom, lógica de gênero,
 *  fit de texto e download. Config-driven: lê tudo de window.APP_CONFIG.
 *
 *  Padrão herdado do gerador de eventos FullFace:
 *   - foto desenhada ATRÁS, recortada no vazado (alpha) do PNG;
 *   - arte (PNG) desenhada POR CIMA; foto aparece pelo recorte;
 *   - textos dinâmicos desenhados por último, por cima de tudo;
 *   - pan via Pointer Events (mouse+touch unificados com pointer capture);
 *   - NÃO setar crossOrigin (data URL same-origin não taintar o canvas).
 * ===================================================================== */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const { BRAND, GENDER_TEXT, GENDER_WORDS = {}, GENERO_LABELS, TEMPLATES, FIELD_META, ZOOM, UPLOAD } = CFG;
  const QRCODE = CFG.QRCODE || null;
  const BRANDS = CFG.BRANDS || [];

  const $ = (id) => document.getElementById(id);

  // ---- Elementos da UI (criados/declarados no index.html) ----
  const brandSelect    = $('brandSelect');         // caixa de seleção de marca
  const templateSelect = $('templateSelect');      // caixa de seleção de equipamento
  const noEquipMsg     = $('noEquipMsg');           // aviso de marca sem equipamentos
  const fieldsTitle    = $('fieldsTitle');         // título da seção de campos
  const dynamicFields  = $('dynamicFields');       // onde injetamos nome/sobrenome/cargo
  const generoWrap     = $('generoWrap');          // bloco dos radios de gênero
  const generoLabel    = $('generoLabel');         // rótulo do bloco de gênero
  const generoOptions  = $('generoOptions');
  const qrToggle       = $('qrToggle');            // ativar QR Code do SDR
  const uploadSection  = $('uploadSection');       // seção inteira de upload (some no nascimento)
  const uploadTitle    = $('uploadTitle');         // título da seção de upload
  const uploadHint     = $('uploadHint');          // dica abaixo do título
  const dropzone       = $('dropzone');
  const dropzoneIdle   = $('dropzoneIdle');
  const dropzonePrev   = $('dropzonePreview');
  const previewThumb   = $('previewThumb');
  const previewName    = $('previewName');
  const clearPhotoBtn  = $('clearPhoto');
  const fileInput      = $('fileInput');
  const fileError      = $('fileError');

  // Importação de condições por documento (Word/PDF/texto).
  const docDropzone    = $('docDropzone');
  const docInput       = $('docInput');
  const importStatus   = $('importStatus');

  const canvasFrame    = $('canvasFrame');
  const canvas         = $('canvas');
  const ctx            = canvas.getContext('2d');
  const zoomSlider     = $('zoomSlider');
  const zoomInBtn      = $('zoomInBtn');
  const zoomOutBtn     = $('zoomOutBtn');
  const centerBtn      = $('centerBtn');
  const adjustControls = $('adjustControls');

  const downloadBtn    = $('downloadBtn');
  const pdfList        = $('pdfList');
  const pdfCount       = $('pdfCount');
  const pdfEmpty       = $('pdfEmpty');
  const generatePdfBtn = $('generatePdfBtn');

  // ------------------------------------------------------------------
  // ESTADO ÚNICO (single source of truth). O preview é função do estado.
  // ------------------------------------------------------------------
  // Valores em branco de UM equipamento (genero não é usado, mantido p/ o motor).
  const blankValues = () => ({
    condicao1: '', condicao2: '', condicao3: '', condicao4: '', genero: 'neutro',
    qrcode: false, // QR Code do SDR ligado/desligado para ESTE equipamento
  });

  const state = {
    brandId: CFG.DEFAULT_BRAND || (BRANDS[0] && BRANDS[0].id) || null,
    templateId: CFG.DEFAULT_TEMPLATE,
    // Dados POR EQUIPAMENTO: { [templateId]: {condicao1..4} }. Cada layout
    // tem seu próprio preenchimento; trocar de equipamento troca o conjunto.
    data: {},
    values: null,      // referência ao data[templateId] ATIVO (preenchido abaixo)
    photoImg: null,
    file: null,
    // Transform do usuário aplicado dentro do recorte (coords do canvas).
    transform: { offsetX: 0, offsetY: 0, zoom: 1 },
    frames: {},        // cache de Image por URL da arte
    framesLoading: {}, // promessas em voo (por URL)
    fontReady: false,
  };

  // Garante (e retorna) o objeto de dados de um equipamento.
  const ensureData = (id) => (state.data[id] || (state.data[id] = blankValues()));

  // ------------------------------------------------------------------
  // SALVAMENTO AUTOMÁTICO (localStorage) — sobrevive a F5 / fechar a aba.
  // ------------------------------------------------------------------
  // Guardamos só os textos por equipamento + a última seleção. Imagens e
  // zoom NÃO entram (não cabem/não fazem sentido). Tudo em try/catch: se o
  // localStorage estiver indisponível (modo privado, desativado), o app
  // continua funcionando, só sem persistir.
  const STORAGE_KEY = 'contourline:orcamento:v1';

  const saveSession = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        brandId: state.brandId, templateId: state.templateId, data: state.data,
      }));
    } catch (_) { /* sem localStorage: ignora silenciosamente */ }
  };
  // Salva debounced (não escreve a cada tecla durante a digitação).
  let saveTimer = null;
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveSession, 300); };

  const loadSession = () => {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch (_) { return; }
    if (!saved || typeof saved !== 'object') return;

    // Restaura só equipamentos que AINDA existem no catálogo, garantindo
    // todas as chaves (o config.js pode ter mudado entre as sessões).
    if (saved.data && typeof saved.data === 'object') {
      Object.keys(saved.data).forEach((id) => {
        if (!TEMPLATES[id]) return;
        const v = saved.data[id] || {};
        state.data[id] = Object.assign(blankValues(), {
          condicao1: v.condicao1 || '', condicao2: v.condicao2 || '',
          condicao3: v.condicao3 || '', condicao4: v.condicao4 || '',
          genero: v.genero || 'neutro', qrcode: !!v.qrcode,
        });
      });
    }
    // Restaura a última marca/equipamento, se ainda forem válidos.
    if (saved.brandId && BRANDS.some((b) => b.id === saved.brandId)) state.brandId = saved.brandId;
    if (saved.templateId && TEMPLATES[saved.templateId]) state.templateId = saved.templateId;
  };

  loadSession();   // restaura ANTES de apontar values/selecionar a marca inicial
  state.values = state.templateId ? ensureData(state.templateId) : blankValues();

  // Há um equipamento válido selecionado?
  const hasTemplate = () => !!(state.templateId && TEMPLATES[state.templateId]);
  // Templates (objetos) de uma marca, na ordem de TEMPLATES.
  const templatesOfBrand = (brandId) =>
    Object.values(TEMPLATES).filter((t) => t.brand === brandId);

  // Um equipamento "entra no PDF" quando a Condição 1 está preenchida.
  const isFilled = (id) => !!(state.data[id] && (state.data[id].condicao1 || '').trim());
  // Ids incluídos no PDF, na ordem dos TEMPLATES.
  const includedIds = () => Object.keys(TEMPLATES).filter(isFilled);
  // Alguma marca tem equipamento preenchido?
  const brandHasFilled = (brandId) =>
    templatesOfBrand(brandId).some((t) => isFilled(t.id));

  const tpl = () => TEMPLATES[state.templateId];

  // Modo de upload do template atual.
  const usesHole    = (id = state.templateId) => !!TEMPLATES[id].photoHole;
  const usesOverlay = (id = state.templateId) => !!TEMPLATES[id].imageZone;
  const usesUpload  = (id = state.templateId) => usesHole(id) || usesOverlay(id);

  // URL da arte considerando gênero (nascimento troca o PNG por gênero).
  const frameUrlFor = (id = state.templateId) => {
    const t = TEMPLATES[id];
    if (t.frameByGender) return t.frameByGender[state.values.genero] || Object.values(t.frameByGender)[0];
    return t.frameUrl;
  };

  // Todas as URLs de arte de um template (para preload).
  const frameUrlsOf = (t) => t.frameByGender ? Object.values(t.frameByGender) : (t.frameUrl ? [t.frameUrl] : []);

  // ------------------------------------------------------------------
  // CARREGAMENTO DE IMAGENS / FONTE
  // ------------------------------------------------------------------
  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    // NÃO setar crossOrigin: assets same-origin + data URL. Com
    // crossOrigin='anonymous' o Chrome pode taintar o canvas e
    // toBlob() retorna null silenciosamente.
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem: ' + src));
    img.src = src;
  });

  // Garante um PNG de arte (cache por URL — nascimento tem 2 artes).
  const ensureFrame = (url = frameUrlFor()) => {
    if (!url) return Promise.resolve(null);
    if (state.frames[url]) return Promise.resolve(state.frames[url]);
    if (state.framesLoading[url]) return state.framesLoading[url];
    state.framesLoading[url] = loadImage(url)
      .then((img) => { state.frames[url] = img; return img; })
      .catch((e) => { console.warn(e); return null; });
    return state.framesLoading[url];
  };

  // Carrega a fonte da marca e marca pronto (evita texto com fallback).
  const ensureFont = async () => {
    const fam = BRAND.font.family;
    try {
      await Promise.all([
        document.fonts.load(`800 64px "${fam}"`),
        document.fonts.load(`700 46px "${fam}"`),
        document.fonts.load(`500 32px "${fam}"`),
      ]);
      await document.fonts.ready;
    } catch (_) { /* segue com fallback */ }
    state.fontReady = true;
    renderCanvas();
  };

  const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Falha ao ler arquivo.'));
    r.readAsDataURL(file);
  });

  // ------------------------------------------------------------------
  // TRANSFORM (zoom/pan) — clamp garante que a foto cobre o recorte
  // ------------------------------------------------------------------
  const resetTransform = () => {
    state.transform = { offsetX: 0, offsetY: 0, zoom: 1 };
    if (zoomSlider) zoomSlider.value = '1';
  };

  // Raio efetivo do recorte (para clamp). Em rect usamos metade do menor lado.
  const holeRadius = () => {
    const h = tpl().photoHole;
    return h.shape === 'circle' ? h.r : Math.min(h.w, h.h) / 2;
  };

  const clampTransform = () => {
    if (!state.photoImg) return;
    const img = state.photoImg;
    const r = holeRadius();
    const size = r * 2;
    const baseScale = Math.max(size / img.width, size / img.height);
    const scale = baseScale * state.transform.zoom;
    const halfW = (img.width * scale) / 2;
    const halfH = (img.height * scale) / 2;
    const maxOX = Math.max(0, halfW - r);
    const maxOY = Math.max(0, halfH - r);
    state.transform.offsetX = Math.max(-maxOX, Math.min(maxOX, state.transform.offsetX));
    state.transform.offsetY = Math.max(-maxOY, Math.min(maxOY, state.transform.offsetY));
  };

  // ------------------------------------------------------------------
  // DESENHO
  // ------------------------------------------------------------------
  const clipToHole = (c) => {
    const h = tpl().photoHole;
    c.beginPath();
    if (h.shape === 'circle') {
      c.arc(h.cx, h.cy, h.r, 0, Math.PI * 2);
    } else {
      const rad = h.radius || 0;
      // retângulo (com cantos arredondados se radius>0)
      const { x, y, w, ww } = { x: h.x, y: h.y, w: h.w, ww: h.h };
      if (rad > 0 && c.roundRect) c.roundRect(x, y, w, ww, rad);
      else c.rect(x, y, w, ww);
    }
    c.closePath();
    c.clip();
  };

  // Desenha a foto recortada no vazado, aplicando offset e zoom (object-fit: cover).
  const drawPhotoInHole = (c) => {
    if (!state.photoImg) return;
    const img = state.photoImg;
    const h = tpl().photoHole;
    const cx = h.shape === 'circle' ? h.cx : h.x + h.w / 2;
    const cy = h.shape === 'circle' ? h.cy : h.y + h.h / 2;
    const r = holeRadius();

    c.save();
    clipToHole(c);
    const size = r * 2;
    const baseScale = Math.max(size / img.width, size / img.height);
    const scale = baseScale * state.transform.zoom;
    const w = img.width * scale;
    const hh = img.height * scale;
    c.drawImage(
      img,
      cx - w / 2 + state.transform.offsetX,
      cy - hh / 2 + state.transform.offsetY,
      w, hh
    );
    c.restore();
  };

  // Resolve placeholders: {firstName} {lastName} {fullName} {gender} (frase
  // do GENDER_TEXT), {qualquerCampo} (valor cru de state.values — cargo,
  // comunicado, nomeBebe, mensagemBebe...) e palavras de gênero (GENDER_WORDS).
  const resolveText = (templateStr) => {
    const v = state.values;
    const first = (v.nome || '').trim();
    const last = (v.sobrenome || '').trim();
    const full = [first, last].filter(Boolean).join(' ');
    const gender = (GENDER_TEXT[state.templateId] || {})[v.genero] || '';
    return templateStr
      .replace(/\{firstName\}/g, first)
      .replace(/\{lastName\}/g, last)
      .replace(/\{fullName\}/g, full)
      .replace(/\{gender\}/g, gender)
      .replace(/\{(\w+)\}/g, (m, key) => {
        // 1) valor direto de um campo (texto digitado pelo usuário)
        if (key in v && key !== 'genero') return (v[key] || '').trim();
        // 2) palavra avulsa conjugada por gênero (ex.: {welcome})
        const set = GENDER_WORDS[key];
        return set ? (set[v.genero] || set.neutro || '') : m;
      });
  };

  const resolveColor = (key) => {
    if (!key) return BRAND.textOnArt;
    if (key[0] === '#') return key;
    return BRAND[key] || key; // 'accent'|'primary'|'textOnArt' ou hex direto
  };

  // Desenha um slot de texto com auto-resize (largura E altura) + quebra de linha.
  const drawTextSlot = (c, slot) => {
    let text = resolveText(slot.text);
    if (!text) return;                       // nada digitado ainda
    if (slot.uppercase) text = text.toUpperCase();

    const fam = BRAND.font.family;
    const weight = slot.weight || 600;
    const align = slot.align || 'left';
    const maxWidth = slot.maxWidth || (tpl().canvas.w - slot.x - 40);
    const minSize = slot.minSize || Math.round((slot.size || 40) * 0.5);
    const ls = slot.letterSpacing || 0;

    c.save();
    c.fillStyle = resolveColor(slot.color);
    c.textAlign = align;
    c.textBaseline = 'alphabetic';
    if ('letterSpacing' in c) c.letterSpacing = ls + 'px'; // Chrome moderno

    const setFont = (size) => { c.font = `${weight} ${size}px "${fam}", system-ui, sans-serif`; };

    // Quebras de linha EXPLÍCITAS no texto (\n) viram parágrafos separados.
    const paras = text.split('\n');

    // Word-wrap de um parágrafo para uma dada fonte já ativa no contexto.
    // Quebra em ESPAÇOS; e se uma "palavra" sozinha não couber na largura
    // (ex.: "123456789..." sem espaço), quebra por CARACTERE — assim a fonte
    // NÃO precisa encolher só por causa de um token gigante.
    const wrapParas = () => {
      const out = [];
      for (const para of paras) {
        const words = para.split(' ');
        let line = '';
        for (const word of words) {
          // palavra que não cabe sozinha → quebra por caractere
          if (c.measureText(word).width > maxWidth) {
            if (line) { out.push(line); line = ''; }
            let chunk = '';
            for (const ch of word) {
              const t = chunk + ch;
              if (c.measureText(t).width > maxWidth && chunk) { out.push(chunk); chunk = ch; }
              else chunk = t;
            }
            line = chunk; // resto fica na linha p/ juntar a próxima palavra
            continue;
          }
          const test = line ? `${line} ${word}` : word;
          if (c.measureText(test).width > maxWidth && line) { out.push(line); line = word; }
          else line = test;
        }
        out.push(line);
      }
      return out;
    };

    // Ajuste de fonte: encolhe até caber na LARGURA e (se houver) na ALTURA.
    // O texto SEMPRE quebra linha (word-wrap). A largura é o piso 'minSize'
    // (estético); mas se ainda não couber na ALTURA, continuamos encolhendo
    // até um piso absoluto (hardFloor) — assim o texto NUNCA estoura a caixa.
    const hardFloor = 12;
    let size = slot.size || 40;
    let lines, lh;
    while (true) {
      setFont(size);
      lines = wrapParas();
      lh = size * (slot.lineHeight || 1.1);
      const widthOK = Math.max(...lines.map((l) => c.measureText(l).width)) <= maxWidth;
      const heightOK = !slot.maxHeight || (lines.length * lh) <= slot.maxHeight;
      if (widthOK && heightOK) break;            // coube: pronto
      if (size <= hardFloor) break;              // piso absoluto: para
      if (size <= minSize && (widthOK || !slot.maxHeight)) break; // piso estético (só se a altura já couber)
      size -= 1;
    }

    // Desenha as linhas centralizadas verticalmente em torno de slot.y.
    const topOffset = ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => c.fillText(ln, slot.x, slot.y - topOffset + i * lh));
    c.restore();
  };

  // Slot de OFERTA (kind:'offer') — duas tipografias na MESMA condição:
  //   parte ATÉ a palavra "por"  → fonte MÉDIA  (ex.: "De: R$249.900,00 por")
  //   parte APÓS a palavra "por" → fonte GRANDE (ex.: "R$209.900,00 à vista")
  // Ancorado pelo TOPO em slot.y. Cada parte é escalada independentemente para
  // caber na largura; \n no texto força nova linha (ex.: separar "à vista").
  const drawOfferSlot = (c, slot) => {
    const text = resolveText(slot.text);
    if (!text) return;

    const fam = BRAND.font.family;
    const x = slot.x;
    const maxWidth = slot.maxWidth || (tpl().canvas.w - slot.x - 40);
    const maxHeight = slot.maxHeight || 9999;
    const splitWord = slot.splitAfter || 'por';

    // Separa em "…por" (médio) e "resto" (grande). Sem "por": tudo grande.
    let smallText = '', bigText = '';
    const esc = splitWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = text.match(new RegExp('^([\\s\\S]*?\\b' + esc + '\\b)([\\s\\S]*)$', 'i'));
    if (m) { smallText = m[1].trim(); bigText = m[2].trim(); }
    else { bigText = text.trim(); }

    const smallSize0 = slot.sizeSmall || 30, bigSize0 = slot.size || 64;
    const smallWeight = slot.weightSmall || 500, bigWeight = slot.weight || 800;
    const slhF = slot.lineHeightSmall || 1.18, blhF = slot.lineHeight || 1.02;
    const gap0 = slot.gap != null ? slot.gap : 6;

    c.save();
    c.fillStyle = resolveColor(slot.color);
    c.textAlign = slot.align || 'left';
    c.textBaseline = 'alphabetic';
    if ('letterSpacing' in c) c.letterSpacing = '0px';

    const smallLines = smallText ? smallText.split('\n') : [];
    const bigLines = bigText ? bigText.split('\n') : [];

    // Escala cada parte para caber na LARGURA (independente uma da outra).
    c.font = `${smallWeight} ${smallSize0}px "${fam}", system-ui, sans-serif`;
    const smallNatW = smallLines.reduce((a, l) => Math.max(a, c.measureText(l).width), 0);
    c.font = `${bigWeight} ${bigSize0}px "${fam}", system-ui, sans-serif`;
    const bigNatW = bigLines.reduce((a, l) => Math.max(a, c.measureText(l).width), 0);

    let sScale = Math.min(1, maxWidth / Math.max(smallNatW, 1));
    let bScale = Math.min(1, maxWidth / Math.max(bigNatW, 1));

    // Se o bloco todo passar da ALTURA, encolhe as duas partes juntas.
    const totalH = () => smallLines.length * smallSize0 * sScale * slhF
                       + (smallLines.length ? gap0 : 0)
                       + bigLines.length * bigSize0 * bScale * blhF;
    if (totalH() > maxHeight) { const k = maxHeight / totalH(); sScale *= k; bScale *= k; }
    const floor = slot.minSize ? slot.minSize / bigSize0 : 0.4;
    if (bScale < floor) bScale = floor;

    const smallSize = smallSize0 * sScale, bigSize = bigSize0 * bScale;
    const slh = smallSize * slhF, blh = bigSize * blhF;

    let top = slot.y; // TOPO do bloco
    c.font = `${smallWeight} ${smallSize}px "${fam}", system-ui, sans-serif`;
    smallLines.forEach((ln) => { c.fillText(ln, x, top + smallSize * 0.82); top += slh; });
    if (smallLines.length) top += gap0;
    c.font = `${bigWeight} ${bigSize}px "${fam}", system-ui, sans-serif`;
    bigLines.forEach((ln) => { c.fillText(ln, x, top + bigSize * 0.80); top += blh; });

    c.restore();
  };

  // Desenha a imagem enviada CONTAIN (sem corte) dentro de imageZone, com um
  // painel de fundo opcional. Usado pelo template "comunicado" (gráfico).
  const drawImageInZone = (c) => {
    if (!state.photoImg) return;
    const z = tpl().imageZone;
    if (!z) return;
    const img = state.photoImg;

    // Painel de fundo (só aparece quando há imagem).
    if (z.bg) {
      c.save();
      c.fillStyle = z.bg;
      c.beginPath();
      const rad = z.radius || 0;
      if (rad > 0 && c.roundRect) c.roundRect(z.x, z.y, z.w, z.h, rad);
      else c.rect(z.x, z.y, z.w, z.h);
      c.fill();
      c.restore();
    }

    // Encaixe contain dentro da área (descontando o padding).
    const pad = z.padding || 0;
    const aw = z.w - pad * 2, ah = z.h - pad * 2;
    const scale = Math.min(aw / img.width, ah / img.height);
    const w = img.width * scale, h = img.height * scale;
    const dx = z.x + pad + (aw - w) / 2;
    const dy = z.y + pad + (ah - h) / 2;
    c.drawImage(img, dx, dy, w, h);
  };

  // QR ativo para o equipamento atual? (precisa de QRCODE, posição do layout e toggle)
  const qrActive = () => !!(QRCODE && hasTemplate() && tpl().qr && state.values && state.values.qrcode);

  // Desenha, no canto superior direito, o cabeçalho + o QR Code do SDR.
  // A POSIÇÃO (x/y/w) vem do layout do template (tpl().qr). Sem o arquivo
  // (assets/qrcode.png), mostra um placeholder tracejado.
  const drawQrWidget = (c) => {
    if (!QRCODE || !hasTemplate() || !tpl().qr) return;
    const pos = tpl().qr;
    const cx = pos.x + pos.w / 2;
    let top = pos.y;

    const H = QRCODE.header;
    if (H && H.text) {
      c.save();
      c.fillStyle = resolveColor(H.color || 'textDark');
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      if ('letterSpacing' in c) c.letterSpacing = (H.letterSpacing || 0) + 'px';
      const size = H.size || 17, lh = size * (H.lineHeight || 1.18);
      c.font = `${H.weight || 700} ${size}px "${BRAND.font.family}", system-ui, sans-serif`;
      const lines = String(H.text).split('\n');
      lines.forEach((ln, i) => c.fillText(ln, cx, top + size * 0.85 + i * lh));
      top += lines.length * lh + (H.gap != null ? H.gap : 10);
      c.restore();
    }

    const img = state.frames[QRCODE.url];
    if (img) {
      const w = pos.w, h = w * (img.height / img.width);
      c.drawImage(img, pos.x, top, w, h);
    } else {
      const w = pos.w, h = w; // placeholder quadrado
      c.save();
      c.setLineDash([8, 6]);
      c.strokeStyle = resolveColor('textDark');
      c.lineWidth = 2;
      c.strokeRect(pos.x, top, w, h);
      c.setLineDash([]);
      c.fillStyle = resolveColor('textDark');
      c.textAlign = 'center';
      c.font = '600 14px system-ui, sans-serif';
      c.fillText('QR Code do SDR', cx, top + h / 2 - 4);
      c.font = '400 11px system-ui, sans-serif';
      c.fillText('assets/qrcode.png', cx, top + h / 2 + 14);
      c.restore();
    }
  };

  // Render principal — desenha TUDO no canvas nativo do template.
  // scaleCtx/targetCanvas opcionais permitem exportar em outra resolução.
  const renderTo = (c, cw, ch) => {
    c.clearRect(0, 0, cw, ch);

    // Fundo sob o recorte (caso a foto não cubra todo o vazado).
    c.fillStyle = BRAND.revealBg;
    c.fillRect(0, 0, cw, ch);

    // 1) Foto recortada (atrás) — só em templates com photoHole.
    if (usesHole() && state.photoImg) { clampTransform(); drawPhotoInHole(c); }

    // 2) Arte (PNG) por cima — foto aparece pelo recorte transparente.
    const frame = state.frames[frameUrlFor()];
    if (frame) {
      c.drawImage(frame, 0, 0, cw, ch);
      // Cobre textos embutidos (coverBaked): copia faixa limpa do fundo por cima.
      (tpl().coverBaked || []).forEach((r) => {
        c.drawImage(frame, r.x, r.srcY, r.w, r.srcH, r.x, r.y, r.w, r.h);
      });
    } else {
      drawFallbackFrame(c, cw, ch); // enquanto o PNG não carrega/existe
    }

    // 3) Imagem/gráfico CONTAIN por cima da arte — templates com imageZone.
    if (usesOverlay()) drawImageInZone(c);

    // 4) Textos dinâmicos por cima de tudo.
    if (state.fontReady) {
      const noImg = usesOverlay() && !state.photoImg;  // comunicado sem imagem
      tpl().textSlots.forEach((slot) => {
        // Sem imagem: o texto expande para o espaço que seria do upload.
        const eff = (noImg && slot.altNoImage) ? { ...slot, ...slot.altNoImage } : slot;
        if (eff.kind === 'offer') drawOfferSlot(c, eff);
        else drawTextSlot(c, eff);
      });
    }

    // 5) QR Code do SDR (se ativado para este equipamento) — por cima de tudo.
    if (qrActive()) drawQrWidget(c);
  };

  const renderCanvas = () => {
    if (!hasTemplate()) {           // marca sem equipamento: preview neutro
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const { w, h } = tpl().canvas;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    renderTo(ctx, w, h);
  };

  // Moldura de emergência (se o PNG falhar). Mostra o recorte + dica.
  const drawFallbackFrame = (c, cw, ch) => {
    c.save();
    c.fillStyle = BRAND.primary;
    c.fillRect(0, 0, cw, ch);
    if (usesHole()) {
      // "fura" o recorte mostrando a foto/fundo
      c.save();
      c.globalCompositeOperation = 'destination-out';
      clipToHole(c);
      c.fillStyle = '#000';
      c.fillRect(0, 0, cw, ch);
      c.restore();
      // redesenha a foto no buraco (pois destination-out apagou)
      if (state.photoImg) drawPhotoInHole(c);
    }
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = '600 28px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('Arte do template não encontrada', cw / 2, ch - 60);
    c.restore();
  };

  // ------------------------------------------------------------------
  // UI: monta abas de template e campos dinâmicos
  // ------------------------------------------------------------------
  // Caixa de seleção de MARCA.
  const buildBrandSelect = () => {
    if (!brandSelect) return;
    brandSelect.innerHTML = '';
    BRANDS.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.dataset.base = b.label;
      opt.textContent = b.label;
      brandSelect.appendChild(opt);
    });
    brandSelect.addEventListener('change', (e) => selectBrand(e.target.value));
  };

  // Prefixa "✓ " nas marcas que já têm algum orçamento preenchido.
  const refreshBrandMarks = () => {
    if (!brandSelect) return;
    Array.from(brandSelect.options).forEach((opt) => {
      opt.textContent = (brandHasFilled(opt.value) ? '✓ ' : '') + opt.dataset.base;
    });
  };

  // Caixa de seleção de EQUIPAMENTO — só os da marca atual.
  const buildTemplateSelect = () => {
    templateSelect.innerHTML = '';
    templatesOfBrand(state.brandId).forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.dataset.base = `${t.emoji}  ${t.label}`;
      opt.textContent = opt.dataset.base;
      templateSelect.appendChild(opt);
    });
    templateSelect.addEventListener('change', (e) => selectTemplate(e.target.value));
  };

  // Prefixa "✓ " nos equipamentos já preenchidos (entram no PDF).
  const refreshSelectMarks = () => {
    Array.from(templateSelect.options).forEach((opt) => {
      opt.textContent = (isFilled(opt.value) ? '✓ ' : '') + opt.dataset.base;
    });
    refreshBrandMarks();
  };

  // Troca a MARCA: repopula os equipamentos e seleciona o 1º (ou mostra aviso
  // se a marca ainda não tiver equipamentos cadastrados).
  // preferId: ao restaurar a sessão, mantém o equipamento salvo desta marca
  // (em vez de cair sempre no primeiro). Ignorado se não pertencer à marca.
  const selectBrand = async (brandId, preferId = null) => {
    state.brandId = brandId;
    if (brandSelect) brandSelect.value = brandId;
    buildTemplateSelect();

    const temps = templatesOfBrand(brandId);
    const empty = temps.length === 0;
    if (noEquipMsg) noEquipMsg.classList.toggle('hidden', !empty);
    templateSelect.classList.toggle('hidden', empty);

    if (empty) {
      state.templateId = null;
      state.values = blankValues();
      showEmptyBrandUI();
      saveSession();
    } else {
      const pick = (preferId && TEMPLATES[preferId] && TEMPLATES[preferId].brand === brandId)
        ? preferId : temps[0].id;
      await selectTemplate(pick);
    }
  };

  // Esconde campos/preview quando a marca não tem equipamentos.
  const showEmptyBrandUI = () => {
    if (fieldsTitle) fieldsTitle.classList.add('hidden');
    dynamicFields.innerHTML = '';
    generoWrap.classList.add('hidden');
    if ($('qrWrap')) $('qrWrap').classList.add('hidden');
    if (uploadSection) uploadSection.classList.add('hidden');
    renderCanvas();
    updateDownloadState();
    refreshSelectMarks();
    renderPdfList();
  };

  const esc = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;');

  const buildFields = () => {
    const t = tpl();
    // Reexibe a seção de condições/QR (pode ter sido escondida por marca vazia).
    if (fieldsTitle) { fieldsTitle.classList.remove('hidden'); fieldsTitle.textContent = t.fieldsTitle || '3. Condições'; }
    if ($('qrWrap')) $('qrWrap').classList.remove('hidden');

    dynamicFields.innerHTML = '';
    const fields = t.fields.filter((f) => f !== 'genero');
    fields.forEach((key) => {
      const meta = FIELD_META[key];
      if (!meta) return;
      const wrap = document.createElement('div');
      if (meta.type === 'textarea') {
        wrap.innerHTML = `
          <label class="block text-sm font-medium text-slate-600 mb-1">${meta.label}</label>
          <textarea data-field="${key}" maxlength="${meta.maxlength || 320}" rows="${meta.rows || 4}"
                    placeholder="${esc(meta.placeholder)}"
                    class="field w-full rounded-lg px-3 py-2.5 text-slate-800 resize-y"></textarea>`;
      } else {
        wrap.innerHTML = `
          <label class="block text-sm font-medium text-slate-600 mb-1">${meta.label}</label>
          <input type="text" data-field="${key}" maxlength="${meta.maxlength || 40}"
                 placeholder="${esc(meta.placeholder)}"
                 class="field w-full rounded-lg px-3 py-2.5 text-slate-800" />`;
      }
      const input = wrap.querySelector('input, textarea');
      input.value = state.values[key] || '';
      input.addEventListener('input', (e) => {
        state.values[key] = e.target.value;
        renderCanvas();
        updateDownloadState();
        refreshSelectMarks();   // marca/desmarca o equipamento no seletor
        renderPdfList();        // atualiza a lista de orçamentos do PDF
        scheduleSave();         // salvamento automático (debounced)
      });
      dynamicFields.appendChild(wrap);
    });

    // Gênero (radios) só aparece se o template usa.
    const usesGenero = t.fields.includes('genero');
    generoWrap.classList.toggle('hidden', !usesGenero);
    if (usesGenero) buildGenero();

    // Seção de upload: some em templates sem foto/imagem; ajusta título/dica.
    if (uploadSection) uploadSection.classList.toggle('hidden', !usesUpload());
    if (uploadTitle) uploadTitle.textContent = t.uploadTitle || '3. Imagem';
    if (uploadHint) {
      uploadHint.textContent = t.uploadHint || '';
      uploadHint.classList.toggle('hidden', !t.uploadHint);
    }

    // Sincroniza o toggle de QR com o estado DESTE equipamento.
    if (qrToggle) qrToggle.checked = !!state.values.qrcode;
  };

  // Lista [{value,label}] de opções de gênero do template (default: global).
  const genderOptionsOf = (t) => t.genderOptions
    || Object.keys(GENERO_LABELS).map((g) => ({ value: g, label: GENERO_LABELS[g] }));

  const buildGenero = () => {
    const t = tpl();
    if (generoLabel) {
      generoLabel.innerHTML = `${t.genderLabel || 'Gênero'} `
        + `<span class="text-slate-400 font-normal">${t.genderHint || '(ajusta o texto automaticamente)'}</span>`;
    }
    generoOptions.innerHTML = '';
    genderOptionsOf(t).forEach(({ value: g, label: lbl }) => {
      const id = 'genero_' + g;
      const label = document.createElement('label');
      label.className = 'genero-pill';
      label.innerHTML = `
        <input type="radio" name="genero" id="${id}" value="${g}" class="sr-only" />
        <span>${lbl}</span>`;
      const radio = label.querySelector('input');
      radio.checked = state.values.genero === g;
      label.classList.toggle('is-active', radio.checked);
      radio.addEventListener('change', () => {
        state.values.genero = g;
        generoOptions.querySelectorAll('.genero-pill').forEach((p) => p.classList.remove('is-active'));
        label.classList.add('is-active');
        // O gênero pode trocar a ARTE (nascimento). Garante o PNG e re-render.
        ensureFrame(frameUrlFor()).then(renderCanvas);
        renderCanvas();
        saveSession();
      });
      generoOptions.appendChild(label);
    });
  };

  const syncSelectUI = () => {
    templateSelect.value = state.templateId;
  };

  const selectTemplate = async (id) => {
    if (!TEMPLATES[id]) return;
    state.templateId = id;
    // Aponta para os dados DESTE equipamento (em branco se ainda não preenchido).
    state.values = ensureData(id);

    // Trocar para um template sem upload: descarta a imagem anterior.
    if (!usesUpload(id) && state.photoImg) clearPhoto();

    syncSelectUI();
    buildFields();          // repopula os campos a partir de state.values
    // Controles de zoom só fazem sentido na foto recortada (photoHole).
    adjustControls.classList.toggle('hidden', !(usesHole(id) && state.photoImg));

    await ensureFrame(frameUrlFor(id));
    renderCanvas();
    updateDownloadState();
    refreshSelectMarks();
    renderPdfList();
    saveSession();   // lembra a última marca/equipamento selecionados
  };

  // ------------------------------------------------------------------
  // UPLOAD
  // ------------------------------------------------------------------
  const showFileError = (msg) => { fileError.textContent = msg; fileError.classList.remove('hidden'); };
  const hideFileError = () => fileError.classList.add('hidden');

  const acceptFile = async (file) => {
    hideFileError();
    if (!file) return;
    if (!UPLOAD.acceptedTypes.includes(file.type)) {
      showFileError('Formato não suportado. Use PNG, JPG ou WEBP.'); return;
    }
    if (file.size > UPLOAD.maxBytes) {
      showFileError('Arquivo muito grande. O limite é 10 MB.'); return;
    }
    try {
      const dataUrl = await readFileAsDataURL(file);
      const img = await loadImage(dataUrl);
      state.file = file;
      state.photoImg = img;
      resetTransform();
      previewThumb.src = dataUrl;
      previewName.textContent = file.name;
      dropzoneIdle.classList.add('hidden');
      dropzonePrev.classList.remove('hidden');
      dropzonePrev.classList.add('flex');
      // Zoom/pan só no modo foto-recorte (photoHole). Imagem contain não corta.
      adjustControls.classList.toggle('hidden', !usesHole());
      renderCanvas();
      updateDownloadState();
    } catch (e) {
      console.error(e);
      showFileError('Não foi possível ler a imagem. Tente outro arquivo.');
    }
  };

  const clearPhoto = () => {
    state.file = null;
    state.photoImg = null;
    fileInput.value = '';
    previewThumb.removeAttribute('src');
    previewName.textContent = '';
    dropzoneIdle.classList.remove('hidden');
    dropzonePrev.classList.add('hidden');
    dropzonePrev.classList.remove('flex');
    adjustControls.classList.add('hidden');
    resetTransform();
    renderCanvas();
    updateDownloadState();
  };

  // ------------------------------------------------------------------
  // DOWNLOAD
  // ------------------------------------------------------------------
  const updateDownloadState = () => {
    if (!hasTemplate()) { downloadBtn.disabled = true; return; }
    const t = tpl();
    let ok = true;
    if (t.requiresPhoto && !state.photoImg) ok = false;
    (t.requires || []).forEach((f) => {
      if (!(state.values[f] || '').trim()) ok = false;
    });
    downloadBtn.disabled = !ok;
  };

  const slug = (s) => (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

  const triggerBlobDownload = (blob, filename) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const doDownload = () => {
    // O canvas de preview já está na resolução nativa da arte, então o
    // download é WYSIWYG exato. Geramos o PNG direto dele.
    const nomeArq = `orcamento-${slug(state.templateId) || 'equipamento'}.png`;
    canvas.toBlob((blob) => {
      if (!blob) {
        alert('Não foi possível gerar a imagem. Recarregue a página (Ctrl+Shift+R) e tente de novo.');
        return;
      }
      triggerBlobDownload(blob, nomeArq);
    }, 'image/png');
  };

  // ------------------------------------------------------------------
  // PDF — vários equipamentos, 1 página cada
  // ------------------------------------------------------------------
  // Renderiza um equipamento (com SEUS dados) num canvas offscreen e devolve
  // o dataURL. Troca o "equipamento ativo" do estado temporariamente — o
  // motor de render (renderTo/tpl/resolveText) lê de state.templateId/values.
  const renderToDataURL = (id) => {
    const t = TEMPLATES[id];
    const { w, h } = t.canvas;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const octx = off.getContext('2d');

    const prevId = state.templateId, prevValues = state.values;
    state.templateId = id; state.values = ensureData(id);
    renderTo(octx, w, h);
    state.templateId = prevId; state.values = prevValues;

    return off.toDataURL('image/jpeg', 0.92);
  };

  // (Re)desenha a lista de orçamentos que entrarão no PDF + estado dos botões.
  const renderPdfList = () => {
    const ids = includedIds();
    if (pdfCount) pdfCount.textContent = String(ids.length);
    if (pdfEmpty) pdfEmpty.classList.toggle('hidden', ids.length > 0);
    if (generatePdfBtn) generatePdfBtn.disabled = ids.length === 0;

    if (!pdfList) return;
    pdfList.innerHTML = '';
    ids.forEach((id) => {
      const t = TEMPLATES[id];
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2';
      const marca = t.brandLabel ? `<span class="text-[11px] text-slate-400">${t.brandLabel}</span>` : '';
      row.innerHTML = `
        <span class="text-base shrink-0">${t.emoji}</span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm text-slate-700 truncate">${t.label}</span>
          ${marca}
        </span>
        <button type="button" data-remove="${id}"
          class="text-xs text-slate-400 hover:text-red-500 underline shrink-0">remover</button>`;
      row.querySelector('[data-remove]').addEventListener('click', () => removeFromPdf(id));
      pdfList.appendChild(row);
    });
  };

  // Remove um equipamento do PDF (limpa as condições dele).
  const removeFromPdf = (id) => {
    state.data[id] = blankValues();
    if (id === state.templateId) {
      buildFields();           // limpa os campos visíveis
      renderCanvas();
      updateDownloadState();
    }
    refreshSelectMarks();
    renderPdfList();
  };

  const generatePdf = async () => {
    const ids = includedIds();
    if (!ids.length) return;
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('Biblioteca de PDF não carregou. Verifique a conexão e recarregue a página.');
      return;
    }

    const prevLabel = generatePdfBtn.innerHTML;
    generatePdfBtn.disabled = true;
    generatePdfBtn.textContent = 'Gerando PDF...';

    try {
      // Garante que todas as artes estão carregadas antes de rasterizar.
      await Promise.all(ids.map((id) => ensureFrame(frameUrlFor(id))));

      const { jsPDF } = window.jspdf;
      let pdf = null;
      ids.forEach((id, i) => {
        const { w, h } = TEMPLATES[id].canvas;
        const orient = w >= h ? 'landscape' : 'portrait';
        const dataUrl = renderToDataURL(id);
        if (i === 0) pdf = new jsPDF({ orientation: orient, unit: 'px', format: [w, h] });
        else pdf.addPage([w, h], orient);
        pdf.addImage(dataUrl, 'JPEG', 0, 0, w, h);
      });
      pdf.save('orcamentos-contourline.pdf');
      resetAll(); // após exportar, limpa TUDO (todos os equipamentos e campos)
    } catch (e) {
      console.error(e);
      alert('Não foi possível gerar o PDF. Recarregue a página e tente de novo.');
    } finally {
      generatePdfBtn.innerHTML = prevLabel;
      renderPdfList(); // reabilita o botão conforme o estado
    }
  };

  // Zera o preenchimento de TODOS os equipamentos e atualiza a tela.
  const resetAll = () => {
    state.data = {};
    state.values = state.templateId ? ensureData(state.templateId) : blankValues();
    if (hasTemplate()) buildFields(); else dynamicFields.innerHTML = '';
    renderCanvas();       // preview sem condições
    updateDownloadState();
    refreshSelectMarks();  // remove os ✓ dos seletores (equip + marca)
    renderPdfList();       // esvazia a lista de orçamentos
  };

  // ------------------------------------------------------------------
  // PAN (Pointer Events: mouse + touch unificados)
  // ------------------------------------------------------------------
  let dragState = null;
  const canvasScaleFactor = () => {
    const rect = canvas.getBoundingClientRect();
    return rect.width > 0 ? tpl().canvas.w / rect.width : 1;
  };

  canvasFrame.addEventListener('pointerdown', (e) => {
    if (!state.photoImg) return;
    canvasFrame.setPointerCapture(e.pointerId);
    canvasFrame.classList.add('dragging');
    dragState = {
      pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      origOX: state.transform.offsetX, origOY: state.transform.offsetY,
      scale: canvasScaleFactor(),
    };
  });
  canvasFrame.addEventListener('pointermove', (e) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    state.transform.offsetX = dragState.origOX + (e.clientX - dragState.startX) * dragState.scale;
    state.transform.offsetY = dragState.origOY + (e.clientY - dragState.startY) * dragState.scale;
    renderCanvas();
  });
  const endDrag = (e) => {
    if (!dragState) return;
    if (canvasFrame.hasPointerCapture(e.pointerId)) canvasFrame.releasePointerCapture(e.pointerId);
    canvasFrame.classList.remove('dragging');
    dragState = null;
  };
  canvasFrame.addEventListener('pointerup', endDrag);
  canvasFrame.addEventListener('pointercancel', endDrag);

  // Zoom por scroll (bônus)
  canvasFrame.addEventListener('wheel', (e) => {
    if (!state.photoImg) return;
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.06 : 0.94;
    setZoom(state.transform.zoom * f);
  }, { passive: false });

  // ------------------------------------------------------------------
  // ZOOM (slider + botões)
  // ------------------------------------------------------------------
  const setZoom = (z) => {
    state.transform.zoom = Math.max(ZOOM.min, Math.min(ZOOM.max, z));
    if (zoomSlider) zoomSlider.value = String(state.transform.zoom);
    renderCanvas();
  };

  // ------------------------------------------------------------------
  // IMPORTAÇÃO DE CONDIÇÕES (Word .docx / .txt / .pdf)
  // ------------------------------------------------------------------
  // Lê um documento, quebra por blocos "EQUIPAMENTO:" e preenche as 4
  // condições de cada equipamento, casando o nome com o catálogo (config.js).

  // Escapa para uso seguro dentro de innerHTML (nomes vindos do documento).
  const escHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Decodifica as entidades XML básicas do texto extraído do Word.
  const decodeEntities = (s) => s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');   // por último, para não reprocessar

  // Converte o XML do Word em texto, preservando parágrafos e quebras de linha.
  const wordXmlToText = (xml) => decodeEntities(
    xml.replace(/<w:tab[^>]*\/?>/g, '\t')
       .replace(/<w:br[^>]*\/?>/g, '\n')
       .replace(/<\/w:p>/g, '\n')          // fim de parágrafo = nova linha
       .replace(/<[^>]+>/g, '')            // remove o restante das tags
  );

  const readDocx = async (file) => {
    if (typeof JSZip === 'undefined') throw new Error('a biblioteca de leitura .docx não carregou (sem internet?)');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entry = zip.file('word/document.xml');
    if (!entry) throw new Error('arquivo .docx inválido');
    return wordXmlToText(await entry.async('string'));
  };

  // pdf.js é pesado: só carrega quando o usuário realmente solta um PDF.
  let pdfjsPromise = null;
  const loadPdfJs = () => {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => {
        try {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        } catch (_) { /* sem worker: pdf.js usa fallback */ }
        resolve(window.pdfjsLib);
      };
      s.onerror = () => reject(new Error('não foi possível carregar o leitor de PDF'));
      document.head.appendChild(s);
    });
    return pdfjsPromise;
  };

  const readPdf = async (file) => {
    const pdfjsLib = await loadPdfJs();
    const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = '';
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const lines = [];
      let line = '', lastY = null;
      tc.items.forEach((it) => {
        const y = it.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 3) { lines.push(line); line = ''; }
        line += it.str;
        lastY = y;
      });
      if (line) lines.push(line);
      out += lines.join('\n') + '\n';
    }
    return out;
  };

  // Decide o leitor pela extensão (com fallback por MIME e, por fim, texto cru).
  const extractText = async (file) => {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.docx')) return readDocx(file);
    if (name.endsWith('.pdf'))  return readPdf(file);
    if (name.endsWith('.txt'))  return file.text();
    if ((file.type || '').includes('word')) return readDocx(file);
    if (file.type === 'application/pdf')     return readPdf(file);
    return file.text();
  };

  // Normaliza nomes para casar equipamento (sem acento, minúsculo, só alfanum).
  const normName = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // ----- Casamento TOLERANTE do nome do equipamento -----
  // Aceita erros de digitação, acentos, espaços, ordem trocada e
  // palavras a mais/menos (não precisa ser idêntico ao catálogo).

  // Distância de edição (Levenshtein) entre duas strings.
  const editDistance = (a, b) => {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const dp = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return dp[n];
  };

  // Similaridade 0..1 (1 = idêntico) baseada na distância de edição.
  const simRatio = (a, b) => {
    const L = Math.max(a.length, b.length);
    return L ? 1 - editDistance(a, b) / L : 1;
  };

  // Nota 0..1 de quão bem o nome lido casa com um rótulo do catálogo.
  const matchScore = (queryStr, queryToks, label) => {
    const lab = normName(label);
    if (!lab) return 0;
    if (lab === queryStr) return 1;                                   // idêntico
    let score = simRatio(queryStr, lab);                             // similaridade global
    // Um contém o outro (ex.: "Supreme Pro" dentro de "Supreme Pro + Unyque").
    if (queryStr.length >= 3 && (lab.includes(queryStr) || queryStr.includes(lab))) {
      score = Math.max(score, 0.88);
    }
    // Sobreposição de palavras (tolera ordem trocada e palavras a mais).
    const labToks = lab.split(' ').filter(Boolean);
    if (labToks.length) {
      const shared = labToks.filter((lt) =>
        queryToks.some((qt) => qt === lt || simRatio(qt, lt) >= 0.8)).length;
      score = Math.max(score, (shared / labToks.length) * 0.92);
    }
    return score;
  };

  const MATCH_THRESHOLD = 0.55;   // abaixo disso, consideramos "não reconhecido"

  // Melhor template para um nome + sua nota (independente do limiar).
  const bestTemplateFor = (name) => {
    const q = normName(name);
    if (!q) return { template: null, score: 0 };
    const qToks = q.split(' ').filter(Boolean);
    let best = null, bestScore = -1;
    Object.values(TEMPLATES).forEach((t) => {
      const s = matchScore(q, qToks, t.label);
      if (s > bestScore) { bestScore = s; best = t; }
    });
    return { template: best, score: bestScore };
  };

  // Casa o nome só se passar do limiar de tolerância.
  const findTemplateByName = (name) => {
    const { template, score } = bestTemplateFor(name);
    return score >= MATCH_THRESHOLD ? template : null;
  };

  // Dentro de UM bloco, lê "Condição 1:".."Condição 4:" e devolve {condicaoN}.
  const parseConds = (body) => {
    const re = /(?:condi[cç][aã]o|cond\.?)\s*0*([1-4])\s*:/gi;
    const found = [];
    let m;
    while ((m = re.exec(body)) !== null) found.push({ n: +m[1], at: m.index, after: re.lastIndex });
    const conds = {};
    found.forEach((f, i) => {
      const end = (i + 1 < found.length) ? found[i + 1].at : body.length;
      const val = body.slice(f.after, end)
        .split('\n')
        .filter((ln) => !/^\s*\(.*\)\s*$/.test(ln))   // descarta linhas-dica entre parênteses
        .join('\n').trim();
      conds['condicao' + f.n] = val;
    });
    return conds;
  };

  // Quebra o documento por "EQUIPAMENTO:" e lê as condições de cada bloco.
  const parseDocText = (text) => {
    const clean = String(text || '').replace(/\r\n?/g, '\n');
    const re = /EQUIPAMENTO\s*:\s*(.*)/gi;
    const marks = [];
    let m;
    while ((m = re.exec(clean)) !== null) marks.push({ at: m.index, after: re.lastIndex, name: m[1].trim() });
    return marks.map((mk, i) => {
      const end = (i + 1 < marks.length) ? marks[i + 1].at : clean.length;
      return { name: mk.name, conds: parseConds(clean.slice(mk.after, end)) };
    });
  };

  // Aplica os blocos lidos ao estado. Retorna o que casou, o que não casou
  // (com sugestão do mais parecido) e blocos ainda com o nome de exemplo.
  const applyImport = (blocks) => {
    const matched = [], skipped = [], placeholders = [];
    blocks.forEach((b) => {
      if (!b.name) return;
      if (/\[.*\]/.test(b.name)) { placeholders.push(b.name); return; }   // exemplo do modelo
      const { template, score } = bestTemplateFor(b.name);
      if (!template || score < MATCH_THRESHOLD) {
        skipped.push({ name: b.name, suggestion: template ? template.label : null });
        return;
      }
      const d = ensureData(template.id);
      ['condicao1', 'condicao2', 'condicao3', 'condicao4'].forEach((k) => {
        if (b.conds[k] != null) d[k] = b.conds[k];
      });
      matched.push({ id: template.id, label: template.label, brand: template.brand });
    });
    return { matched, skipped, placeholders };
  };

  const setImportStatus = (html, kind) => {
    if (!importStatus) return;
    const color = kind === 'error' ? 'text-red-600'
      : kind === 'ok' ? 'text-emerald-700' : 'text-slate-600';
    importStatus.className = 'mt-3 text-sm ' + color;
    importStatus.innerHTML = html;
    importStatus.classList.remove('hidden');
  };

  const acceptDoc = async (file) => {
    setImportStatus('Lendo o documento…', 'info');
    let text;
    try {
      text = await extractText(file);
    } catch (e) {
      setImportStatus('Não consegui ler este arquivo: ' + escHtml(e.message || 'formato não suportado')
        + '.<br>Dica: salve como <strong>.docx</strong> (Word) para leitura mais confiável.', 'error');
      return;
    }

    const blocks = parseDocText(text);
    if (!blocks.length) {
      setImportStatus('Não encontrei nenhum bloco <strong>EQUIPAMENTO:</strong> no documento. '
        + 'Use o modelo pelo link “baixar modelo” acima.', 'error');
      return;
    }

    const { matched, skipped, placeholders } = applyImport(blocks);
    saveSession();
    refreshSelectMarks();
    renderPdfList();

    if (matched.length) {
      // Mostra o primeiro equipamento preenchido no preview (troca marca+equip).
      await selectBrand(matched[0].brand, matched[0].id);
    } else {
      buildFields();
      renderCanvas();
    }

    let html = matched.length
      ? `<strong>${matched.length}</strong> equipamento(s) preenchido(s): `
        + matched.map((x) => escHtml(x.label)).join(', ') + '.'
      : 'Nenhum equipamento do documento foi reconhecido no catálogo.';
    if (skipped.length) {
      html += '<br><span class="text-amber-600">Não reconhecidos: '
        + skipped.map((s) => escHtml(s.name)
            + (s.suggestion ? ` (seria <strong>${escHtml(s.suggestion)}</strong>?)` : '')).join('; ')
        + '.</span>';
    }
    if (placeholders.length) {
      html += '<br><span class="text-amber-600">Há bloco com o nome de exemplo '
        + '“[escreva o nome do equipamento]”. Substitua pelo nome real do equipamento '
        + 'na linha <strong>EQUIPAMENTO:</strong>.</span>';
    }
    setImportStatus(html, matched.length ? 'ok' : 'error');
  };

  // ------------------------------------------------------------------
  // WIRING
  // ------------------------------------------------------------------
  if (docDropzone && docInput) {
    docDropzone.addEventListener('click', () => docInput.click());
    docDropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); docInput.click(); } });
    ['dragenter', 'dragover'].forEach((evt) => docDropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); docDropzone.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach((evt) => docDropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); docDropzone.classList.remove('dragover'); }));
    docDropzone.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) acceptDoc(f); });
    docInput.addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) acceptDoc(f); docInput.value = ''; });
  }

  dropzone.addEventListener('click', (e) => { if (e.target.closest('#clearPhoto')) return; fileInput.click(); });
  dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  ['dragenter', 'dragover'].forEach((evt) => dropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((evt) => dropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('dragover'); }));
  dropzone.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) acceptFile(f); });
  fileInput.addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) acceptFile(f); });
  clearPhotoBtn.addEventListener('click', (e) => { e.stopPropagation(); clearPhoto(); });

  zoomSlider.addEventListener('input', (e) => setZoom(parseFloat(e.target.value)));
  zoomInBtn.addEventListener('click', () => setZoom(state.transform.zoom + 0.15));
  zoomOutBtn.addEventListener('click', () => setZoom(state.transform.zoom - 0.15));
  centerBtn.addEventListener('click', () => { resetTransform(); renderCanvas(); });

  downloadBtn.addEventListener('click', doDownload);
  generatePdfBtn.addEventListener('click', generatePdf);
  if (qrToggle) qrToggle.addEventListener('change', (e) => {
    state.values.qrcode = e.target.checked;
    renderCanvas();
    saveSession();
  });

  // ------------------------------------------------------------------
  // INIT
  // ------------------------------------------------------------------
  adjustControls.classList.add('hidden');
  buildBrandSelect();
  // Preload de TODAS as artes em paralelo + o QR Code do SDR (se houver).
  Object.values(TEMPLATES).forEach((t) => frameUrlsOf(t).forEach((url) => ensureFrame(url)));
  if (QRCODE) ensureFrame(QRCODE.url).then(renderCanvas);
  // Seleciona a marca inicial → popula equipamentos e renderiza. Restaura o
  // equipamento salvo na sessão (preferId), ou o 1º da marca se não houver.
  selectBrand(state.brandId, state.templateId);
  ensureFont();
})();
