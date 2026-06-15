# Gerador de Orçamentos — Contourline

SPA estática (**HTML + Vanilla JS + Tailwind via CDN**) para o time comercial
gerar **artes de orçamento dos equipamentos** Contourline / **INNOVE**
(layouts widescreen **1280×720**) com as **condições especiais de promoção**
e o **QR Code do SDR** opcional, prontas para enviar ao cliente ou no WhatsApp.

Todo o processamento é **100% client-side** (HTML5 Canvas): nada é enviado
para servidor. Derivado do gerador de comunicados do RH (mesmo motor).

## Funcionalidades

- **Seleção em dois níveis**: primeiro a **Marca**, depois o **Equipamento**
  daquela marca. Cada marca é uma **pasta** em `assets/`. Marcas sem
  equipamentos cadastrados mostram um aviso (em vez de quebrar).
- **4 caixas de texto (condições)** renderizadas na coluna direita da arte:
  - **Condição 1 — Oferta principal**: fonte **maior e mais destacada**
    (ex.: *De R$428.900,00 por R$249.900,00 à vista*).
  - **Condição 2 e 3**: condições "Ou..." (corpo).
  - **Condição 4**: parcelamento / observações (corpo menor).
- **Ajuste automático de texto**: a fonte encolhe para caber na largura **e na
  altura** da faixa de cada condição (textos longos não estouram).
- **Preview ao vivo WYSIWYG** — o que aparece é exatamente o que é exportado.
- **Preenchimento por equipamento**: cada layout guarda as **próprias**
  condições. Ao trocar de equipamento no seletor, os campos zeram (ou
  restauram, se você voltar a um já preenchido). Equipamentos preenchidos
  ganham um **✓** no seletor.
- **QR Code do SDR (opcional)**: um botão ativa/desativa o QR no canto superior
  direito da arte (cabeçalho + QR). É **por equipamento** e entra no PDF. O QR
  vem de `assets/qrcode.png` (enquanto não existir, aparece um placeholder).
- **Exportação em PDF**: monte vários orçamentos (um por equipamento) e gere
  **um único PDF** — uma página por layout, com suas respectivas condições.
  Após exportar, **o app limpa tudo** automaticamente. Também dá para baixar só
  o layout atual em PNG.

## Estrutura

```text
index.html        → markup + UI (Tailwind via CDN)
config.js         → MARCAS + equipamentos (templates) + condições + QR  ← edite aqui
app.js            → motor: render no canvas, fit de texto, PDF, QR
assets/
  INOVVE/                → pasta da marca (1 por marca)
    HIPRO-INNOVE.jpg     → arte do equipamento (1280×720, área direita limpa)
    Duet.jpg  ...        → demais equipamentos da marca
  CONTOURLIME MED/  CYNOSURE LUTRONIC/  INDIBA/  LUMENIS/  VISBODY/  → outras marcas
  qrcode.png             → QR Code do SDR (aparece quando o toggle liga)
  README.txt             → instruções das artes
```

> **Toda customização (cores, fonte, textos, posições das condições) vive em
> `config.js`.** O `app.js` não precisa ser tocado para ajustes do dia a dia.

### Onde ficam as posições das condições

No `config.js`, em `CONDITION_SLOTS`. Cada condição tem:
`x`, `y` (âncora), `maxWidth`, `maxHeight` (faixa), `size`/`minSize` (fonte),
`weight` (peso) e `color`. As coordenadas são em px do canvas **1280×720**.
A **Condição 1** (`kind:'offer'`) tem duas tipografias: a parte até a palavra
`por` em tamanho médio e a oferta (depois do `por`) em tamanho grande.
As posições são compartilhadas pelos equipamentos; se um layout precisar de
posições diferentes, copie o array dentro daquele template e ajuste só nele.

A posição do **QR Code** vive em `config.js → QRCODE` (`x`, `y`, `w` e o
`header`). Coloque o QR final em `assets/qrcode.png`.

### Adicionar marca ou equipamento

Tudo é dirigido pela lista `MARCAS` em `config.js`:

- **Novo equipamento numa marca**: salve a arte em `assets/<PASTA-DA-MARCA>/`
  (**1280×720**, coluna direita limpa) e adicione uma linha
  `{ id, label, file }` em `equipamentos` daquela marca.
- **Nova marca**: crie a pasta `assets/<NOME-DA-MARCA>/` e adicione um bloco
  `{ id, label, folder, equipamentos: [...] }`. O `folder` deve ser **exatamente**
  o nome da pasta (com espaços, se houver).

Ambos aparecem sozinhos nos seletores.

## Como rodar

Por causa do carregamento dos JPEGs, sirva via um servidor estático
(abrir via `file://` pode bloquear o canvas):

```bash
# Python 3
python -m http.server 5173
# ou Node
npx serve .
```

Acesse `http://localhost:5173`.

## Fluxo de uso

1. Escolhe o **equipamento** na caixa de seleção.
2. Preenche as **4 condições** da oferta (a 1ª é a principal/destaque). Basta a
   **Condição 1** estar preenchida para o equipamento entrar no PDF.
3. (Opcional) Liga o **QR Code do SDR**.
4. Para incluir outro orçamento, **troca o equipamento** no seletor e preenche
   as condições dele — o anterior fica guardado.
5. A lista **"Orçamentos no PDF"** mostra todos os equipamentos incluídos (dá
   para remover qualquer um).
6. Clica em **Gerar PDF** → um PDF com uma página por equipamento. Após exportar,
   tudo é limpo. (Ou **Baixar só este layout (PNG)** para exportar só o atual.)

> O PDF é gerado no navegador com [jsPDF](https://github.com/parallax/jsPDF)
> (carregado via CDN). Cada página é a arte do equipamento + suas condições
> (+ QR, se ligado), na resolução nativa (1280×720), em paisagem.
