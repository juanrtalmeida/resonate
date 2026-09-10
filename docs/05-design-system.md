---
projeto: Resonate
tipo: design-system
tags: [tokens, tipografia, cores, gradientes, animacoes, capa-procedural, ui-nativa]
atualizado: 2026-09-09
---

# Design system do Resonate

Resonate é o player de música offline descrito em `01-contexto.md`. O design é dark fixo.
A fonte da verdade visual é o protótipo em
`Offline Music Player App-handoff/offline-music-player-app/project/Resonate - Offline Player.dc.html`,
onde cada valor de tipografia, espaçamento e cor está nos inline styles.

Os tokens vivem em `src/constants/theme.ts`.

## Marca — Nought

O logo é tipográfico e não tem símbolo separado: o **"o"** da palavra `resonate` é um disco
vazado com um núcleo vivo, e esse "o" isolado é o ícone do app. Sempre minúsculo, sempre
Bricolage Grotesque 800, `letter-spacing -0.04em`.

`src/components/logo.tsx` exporta os dois usos:

- `Wordmark` — o logotipo. `size` dirige tudo por proporção (anel `0.66em`, traço `0.12em`,
  núcleo `0.2em`, deslocado `0.055em` para alinhar à altura-x e não à baseline). `animated`
  pulsa o núcleo, e só deve ser ligado quando há áudio tocando.
- `Mark` — o "o" sozinho, para o que não é texto. O desenho **muda com o tamanho**, não só
  a escala: ≥24 traço 8 e núcleo 7; 16–23 traço 10 e núcleo 6; ≤15 só o anel, traço 13 —
  abaixo disso o núcleo empasta contra ele. A tabela vive em `reduction()`, e o gerador de
  ícones usa os mesmos números.

As cores da marca não são novas — ember é `ACCENTS[0]`, gold é `ACCENTS[1]`, cream é
`T.full`, ink é `C.onAccent`. Por isso não existe arquivo de tokens à parte. **A marca não
segue o acento escolhido em Ajustes**: o anel é sempre ember.

Em monocromia, anel e núcleo assumem a mesma tinta (ink sobre claro, cream sobre escuro);
o núcleo em gold só existe na versão colorida. A monocromia serve o ícone temático do
Android (`android-icon-monochrome.png`), que o sistema tinge por conta dele.

A pulsação respeita "reduzir movimento" por `ReduceMotion.System` do Reanimated, sem
listener nosso.

**Uma marca só, em todo lugar.** Ícone do app, splash, favicon e logotipo mostram a mesma
coisa: anel ember, núcleo gold, sobre o gradiente escuro quente. O ícone era ink sobre
gradiente ember — uma segunda marca, que fazia o app na gaveta não parecer o app que abria.

### Ícone é quadrado cheio, opaco, sem canto

`icon.png` desenhava os próprios cantos arredondados e deixava alfa fora deles. Errado nas
duas plataformas, e a origem de dois defeitos visíveis:

- **borda branca nas quinas** — o iOS aplica a máscara dele sobre o que a gente entrega, e
  o transparente de fora do nosso canto, composto contra branco, aparecia como quatro
  falhas claras;
- **arte que não chega na borda** — o raio usado era 0,285 do lado, em arco circular,
  contra ~0,2237 num squircle contínuo da Apple. O nosso canto ficava *dentro* da máscara
  do sistema.

A regra é entregar o quadrado inteiro e deixar a máscara para o sistema. Os alvos com fundo
saem em PNG **color type 2** (RGB, sem canal alfa) — que é também o que a App Store exige
de um ícone de app. Só quem é desenhado sobre outra coisa mantém alfa: `splash-icon.png`
(vai sobre o `backgroundColor` do app.json) e o foreground do adaptive icon do Android (vai
sobre o background dele, que é outro PNG). `adaptiveIcon.backgroundColor` acompanha o fundo
escuro (`#12100E`), e não o ember.

Os PNGs de ícone saem de `scripts/brand-icons.py` — encoder PNG em zlib puro, porque a
marca são dois círculos e um gradiente, e um rasterizador de SVG seria uma dependência
para desenhar isso. Rodar de novo depois de mexer nas cores da marca.

### A abertura

A splash nativa é uma imagem parada, e trocá-la pelo app era um corte seco.
`components/splash.tsx` cobre esse corte: ele desenha **a mesma marca, no mesmo tamanho,
sobre o mesmo fundo** — `Mark` em 126, que é `imageWidth: 140` do app.json vezes os 90% que
o PNG dá ao símbolo — e a partir dali a marca cresce, esmaece e revela o app.

O `Mark` em vez do PNG porque o PNG é bitmap e embaça ao crescer até cobrir a tela; a
geometria dos dois é a mesma, então a troca não se vê. `SplashScreen.setOptions({ fade })`
dá 220 ms de fade à saída da nativa, e `hideAsync` corre num efeito — depois do commit —
para a nossa camada já estar pintada quando a nativa sai.

`/brand` é a folha de especificação viva: logotipo em três tamanhos, símbolo em 64/24/16/12,
os dois ícones e o teste em monocromia. Sem entrada na navegação, de propósito.

## Cores

```
bg      #0B0A09    fundo da aplicação
surface #0E0C0B    fundo das telas
card    #141110    cartões e caixas
raised  #171412    linhas de lista elevadas
art     #241E1A    fundo neutro de capa
text    #F6F1EA    texto, usado nas opacidades .72 .62 .55 .5 .46 .42 .4 .34 .3 .24 .18 .14 .12 .1 .08 .07 .06
onAccent #12100E   texto sobre o acento
ok      #5FBF7E    indicador de biblioteca pronta
```

Acento, escolhido em Ajustes: `#F2653A` (padrão), `#E8B44A`, `#5FBFA8`, `#8A6BD1`.

`danger #E5484D` fica **fora** da paleta de acentos: o acento é escolha do usuário e pode
ser o laranja, e aí um botão de apagar no acento não se distinguiria de um botão comum.
Perigo não é tema. Toda ação destrutiva usa este vermelho e passa por confirmação — no
menu do toque longo e em Ajustes ela troca o próprio botão em vez de abrir um diálogo,
para a decisão ficar onde o dedo já está.
O acento é lido do `PrefsProvider`, nunca escrito direto num componente.

Raios: 9, 13, 15, 17, 21, 26.

## Tipografia

Três vozes, expostas como componentes em `src/components/text.tsx`:

| Componente | Fonte | Uso |
|---|---|---|
| `Display` | Bricolage Grotesque 700 / 800 | títulos, números grandes |
| `Body` | Familjen Grotesk 400 / 500 / 600 | corpo, rótulos de interface |
| `Mono` | DM Mono 400 / 500 | rótulos em caixa alta, caminhos, tempos |

O protótipo especifica `letter-spacing` em `em`; o React Native só aceita pixels. Cada
componente recebe `tracking` em `em` e converte pelo próprio `size`. É por isso que os
componentes pedem `size` explícito em vez de terem variantes nomeadas: a escala de tipos
do design é contínua (13.5, 14.5, 22, 27, 29, 33, 38, 56), não uma escala de degraus.

## Capa procedural

O design nunca usa arte embutida no arquivo. `src/lib/artwork.ts` gera a capa a partir de
um hash FNV-1a de `artista + álbum`:

- o hash indexa uma paleta de 8 trios de cor `(a, b, c)`, copiada do protótipo;
- os bits seguintes dão uma rotação em `[-60, 60]` para o anel;
- as iniciais são as primeiras letras das palavras do artista, mais dois dígitos.

Determinístico, offline, sem I/O. O mesmo álbum tem sempre a mesma capa.

`AlbumArt` empilha: dois `radial-gradient` sobre a cor `c`, um anel branco rotacionado,
uma linha horizontal e as iniciais. Um `scrim` opcional escurece o rodapé no grid.

A mesma semente alimenta `waveform(seed, n)`, que produz a forma de onda por soma de
senoides. Ela é **decorativa**: extrair PCM real exigiria `useAudioSampleListener`, que no
Android pede permissão de `RECORD_AUDIO` — inaceitável num player de música. A busca por
toque é exata de qualquer forma, porque é calculada por posição, não pela onda.

## O que do design não sobreviveu ao React Native

O parser de `experimental_backgroundImage` do RN 0.86
(`react-native/Libraries/StyleSheet/processBackgroundImage.js`) aceita apenas
`linear-gradient` e `radial-gradient`. Cada substituição abaixo está marcada com um
comentário `ponytail:` no ponto do código.

| No protótipo | No app | Onde |
|---|---|---|
| `repeating-linear-gradient` — riscas diagonais a 5% de branco na capa | removido | `components/album-art.tsx` |
| `repeating-radial-gradient` — sulcos do vinil | 7 anéis com borda de 1 px | `components/player-visuals.tsx` |
| `conic-gradient` — blob girando no onboarding | dois `radial-gradient` sobrepostos | `app/onboarding.tsx` |
| `conic-gradient` — arco girando no botão de varredura | um anel com só um lado colorido, rotacionando | `app/onboarding.tsx` |
| `mask-image` — esmaecimento nas pontas da fita de seek | duas faixas na cor do fundo | `components/player-visuals.tsx` |
| `filter: blur()` em `View` | gradientes mais difusos | onboarding e telas de brilho |

Uma divergência deliberada, não uma limitação: a aba de letras não segue a janela de
cinco linhas do protótipo. Ela reproduz o comportamento do app Music da Apple — lista
inteira rolável com a linha do momento ancorada perto do topo. O porquê está em D13, no
`03-decisoes.md`.

Uma simplificação de custo, não de capacidade: no protótipo, as barras da fita de seek
próximas ao cursor pulsam individualmente. Seriam 96 estilos animados simultâneos para um
brilho; a fita já desliza, e o pulso saiu.

## Molas — a pegadinha do `mass`

No Reanimated 4 o padrão do `withSpring` é o `GentleSpringConfig`, que traz **`mass: 4`**.
Um config só com `damping` e `stiffness` herda essa massa, e a razão de amortecimento sai
pela metade do pretendido: `{damping: 32, stiffness: 220}` dá ζ = 0,54, não 1,08 — 14% de
overshoot medido no traço das abas.

**Escreva `mass` sempre.** Quem quer "chega e para" precisa de ζ ≥ 1: `damping ≥ 2·√(k·m)`.
Os springs que repicam de propósito (arraste da faixa, o visto do enfileirar, o knob dos
ajustes) ficaram com a massa herdada — foi assim que foram aprovados.

## Alturas de barra amarradas ao contêiner

A fita de seek e a forma de onda desenham barras a partir de `waveform()`, que devolve
0,14..1. As duas tinham a altura em números soltos — `9 + h*52` numa fita de 58, `10 + h*82`
numa caixa de 84 — e a barra mais alta passava do contêiner: cortada em cima e embaixo.
Agora as duas derivam da própria altura (`RIBBON_H`, `WAVE_H`), então não há como estourar.

## Animações

Todas em Reanimated 4.

### A regra: `transform` e `opacity`, nunca layout

Reanimated escreve as duas por um caminho direto na view, sem passar pelo React. Largura,
altura, margem, `maxWidth` e afins vão por outro caminho: cada mudança de valor obriga uma
passada de layout na sub-árvore. Num toque isso não se sente; numa animação são até 60
passadas de layout por segundo, e elas caem justamente nos momentos disputados — durante a
rolagem, no meio de uma transição de tela, enquanto uma lista monta linhas.

Onde a propriedade de layout foi trocada:

| Era | Virou | Onde |
|---|---|---|
| `height` + `marginTop` da pílula de navegação | `translateY` da moldura inteira | `chrome.tsx` (`Reveal`) |
| `width: '%'` da barra de progresso | `scaleX` com `transformOrigin: 'left'` | `chrome.tsx` (`MiniPlayer`) |
| `width` da janela da forma de onda | par de `translateX` (janela desliza, conteúdo se ancora) | `player-visuals.tsx` |
| `artSize` trocado de 286 para 92 num render | `scale` com margem negativa compensando | `screens/player.tsx` |

A margem negativa é o preço de usar `scale`: escala não mexe no layout, então o espaço que
a peça deixa de ocupar não volta sozinho. Uma margem proporcional devolve exatamente o que
a escala liberou — e ela é a **única** propriedade de layout animada nesses casos, uma vez
por transição, em vez de a cada quadro.

O que sobrou de layout animado, de propósito: o rótulo da pílula de navegação (`maxWidth`
de 0 a 78) — a largura dele empurra a pílula, e não há transform que faça isso sem medir o
texto.

### Rolagem não acorda o JavaScript

`useChromeScroll()` (`lib/chrome-scroll.ts`) devolve as props de toda lista vertical, e o
`onScroll` dela é um `useAnimatedScrollHandler` — worklet, thread de UI. Era um callback de
JavaScript limitado a 30 Hz para não acordar a thread sessenta vezes por segundo; trinta
também é acordar, e cada evento disputava com o que a lista estivesse renderizando. Como
worklet o custo por evento deixou de existir, e o `scrollEventThrottle` voltou a 16.

Exige `Animated.FlatList` / `Animated.ScrollView`: numa lista comum o handler de worklet não
é reconhecido e o recolhimento simplesmente não acontece.

### Toque

`components/press.tsx`:

- **`Press`** — o `Pressable` de todo controle. Afunda `sink` (0,06 por padrão) em 90 ms
  lineares e volta com mola `{damping: 26, mass: 1, stiffness: 380}`, ζ ≈ 0,67. `nudge`
  empurra na horizontal, para "anterior" e "próxima" dizerem o sentido da viagem. `disabled`
  apaga animando até `dim`, em vez de trocar de opacidade num quadro.
- **`Beat`** — pulso disparado por *mudança de estado*, não por toque: o coração que
  acendeu, o modo que ligou. O `Press` cobre o dedo; o `Beat`, o resultado, que chega depois
  porque passa pelo provider e volta como prop.

### Padrões

- **Barras de equalizador** (`eq-bars.tsx`): `withRepeat(withTiming(...), -1, true)` em
  `scaleY` com `transformOrigin: 'bottom'`. Cada barra nasce num ponto diferente do ciclo,
  o que reproduz o `animation-delay` negativo do protótipo. Ao pausar elas **assentam** num
  piso comum (`REST`), e não congelam onde o quadro as pegou.
- **Capa respirando** (mini player, Brasa): `scale` 1 → 1.045 em 2,6 s, alternando.
- **Vinil**: rotação contínua de 7 s; pausar deixa o disco onde está, como um toca-discos
  de verdade — por `cancelAnimation`, sem o qual o `withRepeat` seguia girando para sempre
  com o áudio parado. O braço vai de −22° a 0° ao dar play.
- **Gesto na capa** (Now Playing): `Gesture.Pan()` do gesture-handler; mais de 56 px para
  os lados troca de faixa, com a rotação proporcional (`dragX * 0.02`) do protótipo.
- **Navegação em pílula**: só o item ativo abre o rótulo, com `maxWidth` animado de 0 a 78.
- **Transição entre telas**: zoom a partir do elemento tocado — ver D5 em `03-decisoes.md`.
- **Abas com realce deslizante**: arte/letra no topo do player, e os quatro modos de
  continuação na fila. Uma peça só que viaja por `translateX`, com a cor do rótulo saindo da
  distância até ela — assim o realce atravessa em vez de apagar de um lado e acender do
  outro. O passo vem do `onLayout` quando a fileira é `flex: 1` em N.

### Sair e entrar sem desmontar

Três componentes, três respostas para "este bloco tem de sair":

| | O que faz com o espaço | Onde |
|---|---|---|
| `Fade` | **guarda** o lugar | troca arte↔letra: o rodapé não pode se mover |
| `Collapse` | **devolve** o lugar, medindo a altura real | abrir a fila: a lista quer os pixels |
| `Stage` | mantém os dois painéis montados e cruza opacidade | arte e letra convivem na mesma caixa |

Nenhum deles é `{condição && <bloco/>}`. Desmontar tira o bloco da tela de um quadro para o
outro e faz tudo abaixo dele saltar — e no caso da letra e da capa, remontar recarregava a
imagem, zerava o vinil e reconstruía a letra linha por linha.

`Collapse` mede por `onLayout` porque o título grande tem uma ou duas linhas conforme o nome
da faixa: um número cravado erraria por uma linha inteira justamente nas faixas de nome
longo.

### Reduzir movimento

Toda animação ambiente — a que corre sozinha, sem o usuário pedir — leva
`reduceMotion: ReduceMotion.System`: pulsação da marca, respiro da capa, giro do vinil,
brilho do player, anel do play, barras do equalizador, respiro das silhuetas, os dois giros
do onboarding, e a abertura da splash. O Reanimated entrega o valor final de imediato
quando a preferência do aparelho está ligada, sem listener nosso.

O que responde a gesto — arrastar, afundar, deslizar uma aba — não leva: ali o movimento
*é* a resposta ao que o usuário fez.

## Ícones

`src/components/icons.tsx`, com os paths copiados do protótipo, renderizados por
`react-native-svg`. Os ícones do app (launcher, splash, favicon) são anéis concêntricos no
acento sobre o fundo escuro, gerados por script.

## A interface nativa, quando o usuário a prefere

Um flag em Ajustes — `nativeUI` nas preferências — troca as superfícies do app pelas do
sistema. Ligado, o iOS desenha **Liquid Glass** de verdade (`expo-glass-effect`, que é o
`UIVisualEffectView`) e o Android desenha **Material 3** de verdade (`@expo/ui`, que é
Jetpack Compose). Desligado, vale tudo o que está escrito acima.

Por que existe: o desenho deste arquivo é o app, e é uma escolha forte — dark fixo, fontes
próprias, cartões desenhados à mão. Quem prefere que o player pareça com o resto do
aparelho não deveria ter de trocar de player.

O que a decisão vale, em três peças:

- **`lib/native-ui.ts`** responde "isto vale agora?", que são duas perguntas separadas: o
  usuário pediu, e o aparelho sabe fazer. O vidro pede iOS 26 **e** um binário compilado
  com o SDK 26 (`isLiquidGlassAvailable`) **e** a API respondendo no sistema
  (`isGlassEffectAPIAvailable` — algumas betas anunciam o desenho sem trazer a API, e
  chamar o vidro lá derruba o app). A preferência é guardada mesmo onde nada disso vale.
- **`components/panel.tsx`** é o fundo de qualquer cartão, nos três desenhos. É sempre uma
  camada absoluta *atrás* dos filhos, nunca um contêiner: é o que deixa a pílula de
  navegação e o mini player trocarem de material sem que o layout deles mude uma linha.
  `interactive` liga o vidro que se deforma sob o dedo — vale para botão e pílula, não para
  folha nem barra.
- **`screens/settings-native.tsx`** é a tela de Ajustes escrita de novo em `@expo/ui` — um
  `Form` do SwiftUI, uma lista do Material. A rota (`app/settings.tsx`) só escolhe entre
  ela e a desenhada; o desvio fica no alto porque as duas têm hooks próprios.

Onde o material entra: a pílula de navegação e o cartão do mini player, a tela de Ajustes
inteira, a folha de baixo (`components/sheet.tsx`, e com ela as folhas de lista e de
edição), o menu do toque longo, e no Now Playing as pílulas de ação, o botão de fechar, as
duas fileiras de abas e os chips do temporizador.

Onde ele **não** entra, e é decisão: o botão de tocar, a opção escolhida de um par e o
realce de uma aba seguem no acento. O acento é a resposta a "o que está valendo agora", e
vidro em cima dele apagaria justamente essa resposta.

Três armadilhas que valem registro:

- **Opacidade zero mata o vidro.** Não o deixa translúcido: o efeito simplesmente não
  renderiza, e um ancestral apagado conta. É o problema central de estender o vidro para
  além da barra, porque quase tudo neste app entra esmaecendo — a barra apaga quando o Now
  Playing abre, a folha sobe numa janela de Modal que entra em fade nativo, o Now Playing
  inteiro nasce de um `ZoomFade` em zero, e cada bloco do menu tem o seu `entering`. Então
  `Panel` recebe em `fade` a opacidade que o pai está aplicando e só pede o vidro depois de
  ela sair do zero — o contorno que a documentação do `expo-glass-effect` indica. Quem tem
  um valor de verdade para dar passa esse: `chromeReveal` na barra, o progresso da folha,
  `useZoomFade` no player. Quem entra por animação de layout, cujo valor mora dentro do
  Reanimated e não se lê de fora, passa `useEntering(duração)` — que não copia a curva,
  só sabe quando ela deixou de ser zero.

- **Material sobre opaco não é material.** O fundo do menu do toque longo era 96% de preto:
  o vidro não teria nada para refratar nem o Material o que tingir. Com a interface nativa
  ele abre para 62%, e a tela de baixo aparece o suficiente para o material existir.
- **O véu do pé da tela sai.** O gradiente que escurece o fundo atrás da barra existe para
  dar contraste ao que nós desenhamos; debaixo de vidro ele é o contrário do que se quer —
  o vidro mostraria o nosso degradê em vez da lista que rola.

E uma escolha de cor: no Android a paleta Material é semeada pelo **acento do usuário**
(`SchemeTonalSpot`, o algoritmo do Material You), não pelo papel de parede. Assim a barra
segue sendo reconhecível como do Resonate. Trocar para as cores do papel de parede é tirar
o `seedColor` de `lib/material.android.ts` — uma linha.
