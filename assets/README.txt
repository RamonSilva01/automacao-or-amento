ASSETS — ARTES DOS COMUNICADOS (Contourline RH)
================================================

Arquivos esperados (1080 x 1080, PNG com TRANSPARÊNCIA no recorte da foto):

  aniversario.png    → comunicado de Aniversário
  promocao.png       → comunicado de Promoção
  contratacao.png    → comunicado de Nova Contratação

O recorte (círculo onde a foto aparece) deve ser TRANSPARENTE (alpha = 0).
A foto do colaborador é desenhada ATRÁS e aparece através desse recorte.

Recortes calibrados atualmente (em config.js → photoHole):
  - aniversario / promocao : círculo centro (291, 540), raio 237
  - contratacao            : círculo centro (268, 614), raio 122 (dentro do crachá)


IMPORTANTE — ZONA DE TEXTO EM BRANCO
------------------------------------
O app RENDERIZA os textos dinâmicos por cima da arte (para conjugar gênero
e inserir o nome digitado). Por isso, a arte NÃO deve conter os textos:

  - aniversario.png : remover apenas o "NOME" (pode manter "PARABÉNS!" e o
                      parágrafo e "FELIZ ANIVERSÁRIO!", que são fixos).
  - promocao.png    : remover "PROMOVIDO!", "NOME" e "CARGO"
                      (manter "Parabéns pela promoção!", que é fixo).
  - contratacao.png : remover "CONTRATADO!", "NOME", "CARGO".
                      O rodapé ("Parabéns ... à nossa equipe!") NÃO precisa ser
                      removido: o app o COBRE automaticamente (config.js →
                      contratacao.coverBaked) e renderiza a frase conjugando o gênero:
                        masculino → "Parabéns e seja bem-vindo à nossa equipe!"
                        feminino  → "Parabéns e seja bem-vinda à nossa equipe!"
                        neutro    → "Parabéns e boas-vindas à nossa equipe!"
                      (Se um dia limpar o rodapé na arte, o coverBaked continua
                       inofensivo — copia fundo limpo sobre fundo limpo.)

[OK em 2026-06-02] As artes já foram substituídas pelas versões com a zona
de texto LIMPA (só os textos fixos: "PARABÉNS!", parágrafos e rodapés). O app
renderiza headline (com gênero) + NOME + CARGO por cima, sem duplicação.


AJUSTE FINO DE POSIÇÃO/TAMANHO
------------------------------
Tudo é configurável em ../config.js (TEMPLATES[...].textSlots e photoHole).
Mude o número, salve, recarregue a página e veja no preview ao vivo.

  x, y          → posição do texto (px do canvas 1080)
  align         → 'left' | 'center' | 'right'
  size/minSize  → tamanho da fonte (encolhe sozinho até minSize p/ caber)
  maxWidth      → largura máxima antes de encolher/quebrar linha
  uppercase     → CAIXA ALTA
  color         → 'textOnArt' | 'accent' | 'primary' | '#hex'


FONTE
-----
Padrão: Poppins (Google Fonts, já incluída no index.html).
Se a Contourline usa outra fonte, troque em config.js (BRAND.font.family)
E na URL do Google Fonts no index.html. Para fonte própria (.woff2),
coloque em assets/fonts/ e me avise para ligar o @font-face.
