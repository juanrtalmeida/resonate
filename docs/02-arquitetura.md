---
projeto: Resonate
tipo: arquitetura
tags: [estrutura, estado, contextos, persistencia, rotas, expo-router]
atualizado: 2026-09-06
---

# Arquitetura do Resonate

Resonate é o player de música offline descrito em `01-contexto.md`. Este arquivo descreve
como o código está organizado e como os dados fluem por ele.

## Versões

Expo SDK `57.0.20`, React Native `0.86.3`, React `19.2.3`, expo-router `57.0.19`,
expo-audio `57.0.4`, expo-file-system `57.0.6`, expo-media-library `57.0.4`,
react-native-reanimated `4.5.1`, react-native-gesture-handler `2.32`,
react-native-svg `15.15.4`, TypeScript `6.0.3` em modo `strict`.

O React Compiler está ligado (`experiments.reactCompiler` em `app.json`), o que faz o
lint aplicar as regras de pureza e imutabilidade do compilador ao código-fonte.

## Estrutura de pastas

```
src/
  app/                    rotas do expo-router (file-based)
    _layout.tsx           fontes, providers, <Stack>, <Chrome/> flutuante
    index.tsx             boot: redireciona para /onboarding ou /library
    onboarding.tsx        escolha das fontes de música
    scan.tsx              progresso da varredura
    folders.tsx           pastas com música, e as faixas de cada uma
    library.tsx           abas Álbuns/Artistas/Faixas/Listas/Favoritos
    album/[id].tsx        capa hero, transporte, lista de faixas
    player.tsx            Now Playing, com a aba de letras
    playlist/[id].tsx     faixas da lista, renomear, apagar
    search.tsx            busca por faixa, álbum e artista
    settings.tsx          tratamento, acento, gerenciar biblioteca
  components/
    album-art.tsx         capa procedural em gradientes
    chrome.tsx            mini player + navegação em pílula
    eq-bars.tsx           barras de equalizador animadas
    icons.tsx             ícones SVG copiados do protótipo
    lyrics.tsx            letra rolante com a linha do momento ancorada
    player-visuals.tsx    fita de seek, forma de onda, vinil
    playlist-sheet.tsx    folha para jogar faixas numa lista
    section-label.tsx     rótulo de seção com filete
    text.tsx              Display / Body / Mono
    track-row.tsx         linha de faixa
  lib/
    artwork.ts            hash determinístico → cores, rotação, iniciais, forma de onda
    keyboard.ts           altura que o teclado cobre (o Android não encolhe mais a janela)
    library.tsx           LibraryProvider: biblioteca em memória
    lrc.ts                parser de LRC e localização da linha atual
    lrc.test.ts           testes do parser
    player.tsx            PlayerProvider: fila e reprodução sobre expo-audio
    playlists.tsx         PlaylistsProvider: listas do usuário
    prefs.tsx             PrefsProvider: acento, tratamento, curtidas, fontes
    scan.ts               varredura, agrupamento, persistência, leitura de letras
    search.ts             filtro sobre a biblioteca em memória
    search.test.ts        testes da busca
    sources.ts            de onde vêm os arquivos, por plataforma
    tags.ts               leitor de tags e de duração (puro, sem I/O)
    tags.test.ts          testes do leitor (node --test)
    zoom.tsx              transição de zoom entre telas
  constants/theme.ts      tokens do design
```

## Rotas e navegação

O roteamento é file-based (expo-router) com `typedRoutes` ligado. Rotas:
`/`, `/onboarding`, `/scan`, `/library`, `/album/[id]`, `/folders`, `/player`,
`/playlist/[id]`, `/search`, `/settings`.

O layout raiz declara `export const unstable_settings = { initialRouteName: 'index' }`.
Sem isso o React Navigation adota como rota inicial o primeiro `<Stack.Screen>` declarado
— que é `album/[id]`, e o app abre em "Álbum não encontrado".

Os tipos de rota são gerados pelo Metro em `.expo/types/router.d.ts`. Depois de criar ou
renomear uma rota é preciso rodar `npx expo start` uma vez, senão o `tsc` valida os
caminhos contra a lista antiga.

A aba ativa da biblioteca é um parâmetro de busca
(`/library?tab=albums|artists|tracks|playlists`), não uma rota. "Pastas" tem tela própria
(`/folders`), porque um item da navegação que só troca a aba de outra tela parece quebrado.

`/album/[id]` e `/player` são declaradas com `presentation: 'transparentModal'` e
`animation: 'none'`, porque fazem a própria transição de zoom (ver `03-decisoes.md`).

O **Chrome** (mini player + navegação) não é uma tab bar do router: é um overlay
absoluto irmão do `<Stack>`, dentro do layout raiz. Ele decide sozinho se aparece,
olhando o `pathname`. Isso reproduz o protótipo, onde os dois flutuam sobre a tela como
uma peça só, e evita que o router remonte a árvore ao trocar de aba.

Quatro caminhos são **abas**: `/library`, `/search`, `/folders`, `/settings`. Álbum,
artista e lista são **detalhes** empilhados sobre uma aba, e não acendem destino nenhum:
`baseOf()` em `chrome.tsx` devolve null para eles, e a pílula mantém a última aba de
verdade (`lastBase`, num módulo, porque a Chrome tem duas instâncias que se alternam —
ver `overModal`). Sem isso, abrir um artista vindo da Busca acendia Biblioteca.

## Estado

Cinco contextos, sem biblioteca de gerenciamento de estado. Aninhados nesta ordem em
`src/app/_layout.tsx`:

```
PrefsProvider → LibraryProvider → PlaylistsProvider → PlayerProvider → ZoomProvider
  → <Stack> + <Chrome/>
```

A ordem importa: `PlayerProvider` lê a biblioteca para remapear a fila salva em faixas.

| Contexto | O que guarda | Onde persiste |
|---|---|---|
| `PrefsProvider` | acento, tratamento do player, curtidas, pastas escolhidas | `prefs.json` |
| `LibraryProvider` | faixas, álbuns, artistas, pastas | `library.json` |
| `PlaylistsProvider` | listas do usuário | `playlists.json` |
| `PlayerProvider` | fila, índice atual, se está tocando | `queue.json` |
| `ZoomProvider` | retângulo de origem da última navegação | — (só em memória) |

Os arquivos JSON ficam em `Paths.document` (a pasta Documents do app). Letras escolhidas
à mão vão para `Paths.document/lyrics/`, nomeadas pelo hash da URI da faixa.

## Fluxo de dados da varredura

```
sources.listAudioFiles()      lista { uri, name, folder, duration }
        ↓
scan.scan(pastas, onProgress) lote de 40, cedendo o thread entre lotes
        ↓  para cada arquivo
scan.readTags(uri)            abre o arquivo, lê só o cabeçalho, fecha
        ↓
tags.parseTags(bytes, uri)    ID3 / Vorbis / MP4, com fallback pelo caminho
tags.parseDuration(bytes)     FLAC / WAV / MP4 / MP3
        ↓
agrupamento por (albumArtist ?? artist) + album, faixas ordenadas por trackNumber
        ↓
LibraryProvider.replace(lib)  grava library.json e atualiza o estado
```

A varredura cede o thread (`await new Promise(r => setTimeout(r, 0))`) a cada lote de 40
arquivos. Sem isso a tela de progresso congela até o fim.

## Fluxo de reprodução

`PlayerProvider` mantém um único `AudioPlayer` do `expo-audio` e uma fila própria
(`Track[]` + índice). Trocar de faixa é `player.replace(uri)`.

- `useAudioPlayerStatus` alimenta o tempo decorrido, exposto pelo hook `useElapsed()`.
  Só os componentes que precisam do tempo o chamam, porque ele re-renderiza a 5 Hz.
- O booleano `playing` vem de um listener de `playbackStatusUpdate` guardado em estado,
  então só re-renderiza quando de fato muda.
- `didJustFinish` avança para a próxima faixa; a fila é circular.
- A posição é gravada em `queue.json` a cada 5 s, e só quando o segundo inteiro muda.

## Identificadores

- **Faixa**: a própria URI do arquivo. É única por construção. Um hash de 32 bits não é —
  com alguns milhares de faixas a chance de colisão não é desprezível, e uma colisão
  faria duas faixas dividirem a mesma entrada.
- **Álbum**: um hash FNV-1a curto em base 36, porque ele entra na URL da rota
  `/album/[id]`. Colisões são desempatadas com um sufixo numérico no momento da varredura.

## Índice enxuto por decisão

`library.json` guarda o **índice**, não o conteúdo. A letra de uma faixa não entra ali:
milhares de letras inflariam o arquivo e o boot com ele. O índice guarda apenas
`hasLyrics: boolean`, e `scan.readLyrics(track)` busca o texto sob demanda, na hora de
mostrar. Uma leitura de um arquivo é barata; carregar todas no boot não é.
