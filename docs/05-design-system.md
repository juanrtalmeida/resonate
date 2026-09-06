---
projeto: Resonate
tipo: design-system
tags: [tokens, tipografia, cores, gradientes, animacoes, capa-procedural]
atualizado: 2026-09-06
---

# Design system do Resonate

Resonate é o player de música offline descrito em `01-contexto.md`. O design é dark fixo.
A fonte da verdade visual é o protótipo em
`Offline Music Player App-handoff/offline-music-player-app/project/Resonate - Offline Player.dc.html`,
onde cada valor de tipografia, espaçamento e cor está nos inline styles.

Os tokens vivem em `src/constants/theme.ts`.

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

## Animações

Todas em Reanimated 4. Padrões usados:

- **Barras de equalizador** (`eq-bars.tsx`): `withRepeat(withTiming(...), -1, true)` em
  `scaleY` com `transformOrigin: 'bottom'`. Cada barra nasce num ponto diferente do ciclo,
  o que reproduz o `animation-delay` negativo do protótipo. Param quando a reprodução para.
- **Capa respirando** (mini player, Brasa): `scale` 1 → 1.045 em 2,6 s, alternando.
- **Vinil**: rotação contínua de 7 s; pausar deixa o disco onde está, como um toca-discos
  de verdade. O braço vai de −22° a 0° ao dar play.
- **Gesto na capa** (Now Playing): `Gesture.Pan()` do gesture-handler; mais de 56 px para
  os lados troca de faixa, com a rotação proporcional (`dragX * 0.02`) do protótipo.
- **Navegação em pílula**: só o item ativo abre o rótulo, com `maxWidth` animado de 0 a 78.
- **Transição entre telas**: zoom a partir do elemento tocado — ver D5 em `03-decisoes.md`.

## Ícones

`src/components/icons.tsx`, com os paths copiados do protótipo, renderizados por
`react-native-svg`. Os ícones do app (launcher, splash, favicon) são anéis concêntricos no
acento sobre o fundo escuro, gerados por script.
