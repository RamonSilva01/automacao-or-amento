/* =====================================================================
 *  GERADOR DE ORÇAMENTOS — CONTOURLINE
 *  config.js — TUDO que o time comercial/designer ajusta vive AQUI.
 *  O app.js não precisa ser tocado para mudar marca, layouts ou posições.
 *
 *  Carregado como script global antes do app.js (sem build step),
 *  expõe window.APP_CONFIG.
 *
 *  >>> Coordenadas calibradas em cima das artes reais (1096×776, landscape).
 *  >>> Ajuste fino: mude o número, salve e veja no preview ao vivo.
 *
 *  ESTRUTURA:
 *    - Cada EQUIPAMENTO é um "template" com sua própria arte (frameUrl).
 *      O usuário escolhe na CAIXA DE SELEÇÃO (dropdown) no topo.
 *    - Cada template tem 4 CONDIÇÕES (caixas de texto) renderizadas na
 *      coluna direita da arte (área limpa ao lado do equipamento):
 *        condicao1 → OFERTA PRINCIPAL (fonte maior e mais destacada)
 *        condicao2 → condição "OU" (corpo)
 *        condicao3 → outra condição "OU" (corpo)
 *        condicao4 → parcelamento / observações (corpo, menor)
 * ===================================================================== */
(function () {
  'use strict';

  /* -------------------------------------------------------------------
   * 1) IDENTIDADE VISUAL DA MARCA  (cores reais extraídas das artes)
   * ------------------------------------------------------------------- */
  const BRAND = {
    primary:    '#004285', // azul royal Contourline (botões/UI)
    accent:     '#0073BC', // azul do logo (destaques na UI)
    textOnArt:  '#FFFFFF', // cor de textos sobre fundos ESCUROS
    textDark:   '#27496D', // navy das CONDIÇÕES (sobre o painel claro à direita)
    revealBg:   '#0A2C5E', // fundo de emergência

    font: {
      family:   'Poppins',
      weights:  '400;500;600;700;800',
      useLocal: false,
      localUrl: 'assets/fonts/marca.woff2',
    },
  };

  /* -------------------------------------------------------------------
   * 2) PERFIS DE LAYOUT (cada família de arte tem tamanho + posições)
   * -------------------------------------------------------------------
   * Existem 2 famílias de arte:
   *   - 'wide'  → 1280×720 (INNOVE, Cynosure/Lutronic, Lumenis... widescreen)
   *   - 'blue'  → 1123×793 (CONTOURLINE MED, layout azul Contourline)
   *
   * Cada perfil define: canvas (tamanho), slots (posições das 4 condições)
   * e qr (posição do QR Code). Cada MARCA aponta para um perfil (campo
   * `layout`). A condição 1 é a OFERTA (kind:'offer'): parte até "por" em
   * fonte média, parte depois do "por" em fonte grande.
   *
   * Para mover/ajustar: mude x / y / size / maxHeight no perfil certo.
   */
  // --- Perfil WIDE (1280×720) — coluna de texto começa em x≈648 ---
  const SLOTS_WIDE = [
    { id: 'cond1', kind: 'offer', text: '{condicao1}', splitAfter: 'por',
      x: 648, y: 292, maxWidth: 545, maxHeight: 158, align: 'left', color: 'textDark',
      sizeSmall: 30, weightSmall: 500, lineHeightSmall: 1.18,
      size: 66, weight: 800, lineHeight: 1.02, gap: 4, minSize: 34 },
    { id: 'cond2', text: '{condicao2}', x: 648, y: 442, maxWidth: 545,
      maxHeight: 64, align: 'left', weight: 500, size: 28, color: 'textDark', lineHeight: 1.2, minSize: 18 },
    { id: 'cond3', text: '{condicao3}', x: 648, y: 516, maxWidth: 545,
      maxHeight: 80, align: 'left', weight: 500, size: 28, color: 'textDark', lineHeight: 1.2, minSize: 18 },
    { id: 'cond4', text: '{condicao4}', x: 648, y: 612, maxWidth: 545,
      maxHeight: 150, align: 'left', weight: 500, size: 24, color: 'textDark', lineHeight: 1.25, minSize: 16 },
  ];

  // --- Perfil BLUE (1123×793) — coluna de texto começa em x≈590 ---
  const SLOTS_BLUE = [
    { id: 'cond1', kind: 'offer', text: '{condicao1}', splitAfter: 'por',
      x: 590, y: 300, maxWidth: 495, maxHeight: 160, align: 'left', color: 'textDark',
      sizeSmall: 30, weightSmall: 500, lineHeightSmall: 1.18,
      size: 66, weight: 800, lineHeight: 1.02, gap: 4, minSize: 34 },
    { id: 'cond2', text: '{condicao2}', x: 590, y: 486, maxWidth: 495,
      maxHeight: 64, align: 'left', weight: 500, size: 27, color: 'textDark', lineHeight: 1.2, minSize: 18 },
    { id: 'cond3', text: '{condicao3}', x: 590, y: 560, maxWidth: 495,
      maxHeight: 80, align: 'left', weight: 500, size: 27, color: 'textDark', lineHeight: 1.2, minSize: 18 },
    { id: 'cond4', text: '{condicao4}', x: 590, y: 652, maxWidth: 495,
      maxHeight: 120, align: 'left', weight: 500, size: 23, color: 'textDark', lineHeight: 1.25, minSize: 16 },
  ];

  const LAYOUTS = {
    wide: { canvas: { w: 1280, h: 720 }, slots: SLOTS_WIDE, qr: { x: 1068, y: 28, w: 172 } },
    blue: { canvas: { w: 1123, h: 793 }, slots: SLOTS_BLUE, qr: { x: 940, y: 32, w: 158 } },
  };

  /* -------------------------------------------------------------------
   * 3) MARCAS e EQUIPAMENTOS (templates) — padrão 1280×720, área direita limpa.
   * -------------------------------------------------------------------
   * O usuário escolhe primeiro a MARCA e depois o EQUIPAMENTO. Cada marca é
   * uma PASTA dentro de assets/ (o campo `folder`), e cada equipamento aponta
   * para um arquivo dentro dessa pasta (`file`).
   *
   * >>> PARA ADICIONAR UM EQUIPAMENTO A UMA MARCA:
   *   1. Salve a arte em assets/<PASTA-DA-MARCA>/ (1280×720, área direita limpa).
   *   2. Acrescente UMA linha em `equipamentos` da marca: { id, label, file }.
   *      Ele aparece sozinho na caixa de seleção, com as mesmas condições e QR.
   *
   * >>> PARA ADICIONAR UMA MARCA NOVA:
   *   1. Crie a pasta assets/<NOME-DA-MARCA>/.
   *   2. Acrescente um bloco { id, label, folder, equipamentos:[...] } abaixo.
   *
   * Obs.: `folder` deve ser EXATAMENTE o nome da pasta (com espaços, se houver).
   */
  const MARCAS = [
    {
      id: 'innove', label: 'INNOVE', folder: 'INNOVE', layout: 'wide',
      equipamentos: [
        { id: 'hipro',         label: 'HIPRO (INNOVE)',   file: 'HIPRO-INNOVE.jpg' },
        { id: 'duet',          label: 'DUET',             file: 'Duet.jpg' },
        { id: 'europlasma',    label: 'EuroPlasma',       file: 'Europlasma.jpg' },
        { id: 'focuskin',      label: 'Focuskin',         file: 'Focuskin.jpg' },
        { id: 'hiproFocuskin', label: 'HIPRO + Focuskin', file: 'Hipro+Focuskin.jpg' },
        { id: 'hivePro',       label: 'HIVE Pro',         file: 'HivePro.jpg' },
        { id: 'multishape',    label: 'MultiShape',       file: 'Multishape.jpg' },
        { id: 'skinpulse',     label: 'Skinpulse',        file: 'Skinpulse.jpg' },
        { id: 'xtonus',        label: 'XTONUS',           file: 'Xtonus.jpg' },
      ],
    },
    {
      id: 'contourlineMed', label: 'CONTOURLINE MED', folder: 'CONTOURLINE MED', layout: 'blue',
      equipamentos: [
        { id: 'hiproMed',         label: 'HIPRO MED',           file: 'HiproMed.jpg' },
        { id: 'supremePro',       label: 'Supreme Pro',         file: 'SupremePro.jpg' },
        { id: 'supremeProUnyque', label: 'Supreme Pro + Unyque', file: 'SupremePRO + Unyque.jpg' },
        { id: 'unyquePro',        label: 'Unyque Pro',          file: 'UnyquePro.jpg' },
        { id: 'unyqueProEnygma',  label: 'Unyque Pro + Enygma', file: 'UnyquePro+Enygma.jpg' },
      ],
    },
    {
      id: 'cynosureLutronic', label: 'CYNOSURE LUTRONIC', folder: 'CYNOSURE LUTRONIC', layout: 'wide',
      equipamentos: [
        { id: 'xerf',  label: 'XERF',  file: 'Xerf.jpg' },
        { id: 'eco2',  label: 'Eco2',  file: 'Eco2.jpg' },
        { id: 'ultra', label: 'Ultra', file: 'Ultra.jpg' },
      ],
    },
    { id: 'indiba', label: 'INDIBA', folder: 'INDIBA', layout: 'wide', equipamentos: [] },
    {
      id: 'lumenis', label: 'LUMENIS', folder: 'LUMENIS', layout: 'wide',
      equipamentos: [
        { id: 'trilift',          label: 'triLift',             file: 'Trilift.jpg' },
        { id: 'folix',            label: 'Folix',               file: 'Folix.jpg' },
        { id: 'nuera',            label: 'Nuera',               file: 'Nuera.jpg' },
        { id: 'stellar22',        label: 'Stellar 22',          file: 'Stellar 22.jpg' },
        { id: 'stellar22Completo', label: 'Stellar 22 - Completo', file: 'Stellar 22 - Completo.jpg' },
        { id: 'ultrapulse',       label: 'UltraPulse',          file: 'Ultrapulse.jpg' },
      ],
    },
    {
      id: 'visbody', label: 'VISBODY', folder: 'VISBODY', layout: 'wide',
      equipamentos: [
        { id: 'creator600', label: 'Creator 600', file: 'Creator600.jpg' },
        { id: 'm30',        label: 'M30',         file: 'M30.jpg' },
        { id: 's30',        label: 'S30',         file: 'S30.jpg' },
      ],
    },
  ];

  // Monta a lista de marcas (p/ o seletor) e os templates (chave única
  // marca__equipamento). Cada template usa o PERFIL de layout da sua marca
  // (canvas + slots + posição do QR).
  const BRANDS = MARCAS.map((m) => ({ id: m.id, label: m.label }));
  const TEMPLATES = {};
  MARCAS.forEach((m) => {
    const L = LAYOUTS[m.layout] || LAYOUTS.wide;
    m.equipamentos.forEach((e) => {
      const tid = m.id + '__' + e.id;
      TEMPLATES[tid] = {
        id: tid,
        brand: m.id,
        brandLabel: m.label,
        label: e.label,
        emoji: '🔹',
        canvas: L.canvas,
        frameUrl: 'assets/' + m.folder + '/' + e.file,
        fields: ['condicao1', 'condicao2', 'condicao3', 'condicao4'],
        requires: ['condicao1'],
        requiresPhoto: false,
        fieldsTitle: '3. Condições da oferta',
        textSlots: L.slots,
        qr: L.qr,             // posição do QR para este layout
      };
    });
  });

  // Primeira marca com equipamentos vira o padrão inicial.
  const FIRST_BRAND = (MARCAS.find((m) => m.equipamentos.length) || MARCAS[0]);
  const DEFAULT_BRAND = FIRST_BRAND.id;
  const DEFAULT_TEMPLATE = FIRST_BRAND.equipamentos.length
    ? FIRST_BRAND.id + '__' + FIRST_BRAND.equipamentos[0].id : null;

  /* -------------------------------------------------------------------
   * 4) METADADOS DOS CAMPOS (a UI monta os inputs a partir daqui)
   * -------------------------------------------------------------------
   * type: 'text' (padrão) | 'textarea'. Todas as condições são textarea.
   */
  const FIELD_META = {
    condicao1: { label: 'Condição 1 — Oferta principal (destaque)', type: 'textarea', rows: 2, maxlength: 90,
                 placeholder: 'Ex.: De R$428.900,00 por\nR$249.900,00 à vista' },
    condicao2: { label: 'Condição 2', type: 'textarea', rows: 2, maxlength: 120,
                 placeholder: 'Ex.: Ou 20x no Cartão de Crédito (sem juros)' },
    condicao3: { label: 'Condição 3', type: 'textarea', rows: 2, maxlength: 140,
                 placeholder: 'Ex.: Ou entrada de R$40.000,00 + 18 boletos de R$11.661,11 s/ juros' },
    condicao4: { label: 'Condição 4 — Parcelamento / observações', type: 'textarea', rows: 3, maxlength: 220,
                 placeholder: 'Ex.: Condições com parcelamento em até 48x! Sujeitas à análise de crédito, podendo sofrer alterações conforme avaliação financeira.' },
  };

  /* Lógica de gênero NÃO é usada neste projeto, mas o app.js espera as
   * chaves existirem. Mantemos vazias para o motor seguir funcionando. */
  const GENDER_TEXT  = {};
  const GENDER_WORDS = {};
  const GENERO_LABELS = {};

  /* -------------------------------------------------------------------
   * 5) QR CODE DO SDR (ativável por equipamento)
   * -------------------------------------------------------------------
   * Quando ligado, desenha no CANTO SUPERIOR DIREITO da arte o cabeçalho
   * + o QR Code do SDR. Aparece no preview e no PDF.
   *
   * >>> Coloque o QR (exatamente o da arte) em `assets/qrcode.png`.
   *     Enquanto o arquivo não existir, o app mostra um placeholder.
   *
   * A POSIÇÃO do QR (x/y/w) é definida POR LAYOUT (LAYOUTS[*].qr), pois cada
   * família de arte tem tamanho diferente. Aqui ficam só a imagem e o
   * cabeçalho (texto acima do QR). header.text usa '\n' p/ quebrar linha;
   * defina header: null se o PNG já trouxer o texto embutido.
   */
  const QRCODE = {
    url: 'assets/qrcode.png',
    header: {
      text: 'ENTRE EM CONTATO\nATRAVÉS DO QR CODE',
      size: 18, weight: 700, color: 'textDark', lineHeight: 1.18, gap: 10,
    },
  };

  const ZOOM = { min: 1.0, max: 3.0, step: 0.01 };

  const UPLOAD = {
    maxBytes: 10 * 1024 * 1024,
    acceptedTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
  };

  window.APP_CONFIG = {
    BRAND,
    GENDER_TEXT,
    GENDER_WORDS,
    GENERO_LABELS,
    BRANDS,
    TEMPLATES,
    FIELD_META,
    QRCODE,
    ZOOM,
    UPLOAD,
    DEFAULT_BRAND,
    DEFAULT_TEMPLATE,
  };
})();
