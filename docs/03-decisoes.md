---
projeto: Resonate
tipo: decisões-arquiteturais
tags: [adr, decisoes, expo-audio, reanimated, tags, transicoes]
atualizado: 2026-09-06
---

# Decisões técnicas do Resonate

Resonate é o player de música offline descrito em `01-contexto.md`. Cada decisão abaixo
registra o contexto que a forçou, o que foi decidido, o que isso custou e o sinal que
indicaria revisitá-la.

---

## D1 — Um `AudioPlayer` com fila própria, não `useAudioPlaylist`

**Contexto.** O plano original previa `useAudioPlaylist` do `expo-audio`, que já traz
`next()`, `previous()`, `skipTo()` e reprodução gapless. Ao ler os tipos do SDK 57
(`node_modules/expo-audio/build/AudioModule.types.d.ts`) ficou claro que
`setActiveForLockScreen`, `updateLockScreenMetadata` e `clearLockScreenControls` existem
**apenas** na classe `AudioPlayer`. A classe `AudioPlaylist` não os tem.

No Android, sem controles de mídia registrados o sistema encerra a reprodução em segundo
plano depois de poucos minutos. Os controles não são um enfeite: são o que mantém o áudio
vivo.

**Decisão.** Um único `AudioPlayer` e uma fila própria (`Track[]` + índice) no
`PlayerProvider`. Trocar de faixa é `player.replace(uri)`.

**Consequências.** A troca de faixa não é gapless — há um instante de recarga entre uma
faixa e a seguinte. Em compensação, os controles de tela de bloqueio funcionam e a
reprodução em segundo plano sobrevive.

**Revisitar quando.** `AudioPlaylist` ganhar controles de tela de bloqueio.

---

## D2 — Controles do sistema só aparecem no primeiro play

**Contexto.** O app restaura a fila da sessão anterior no boot, carregada e pausada.
Chamar `setActiveForLockScreen(true, …)` nessa restauração publicaria uma notificação de
mídia assim que o app abre, com nada tocando — e no Android isso aciona o serviço de
primeiro plano à toa.

**Decisão.** `PlayerProvider` guarda um flag `lockActive`. A primeira reprodução chama
`setActiveForLockScreen`; as trocas de faixa seguintes chamam `updateLockScreenMetadata`.
A restauração da fila não ativa nada.

**Consequências.** A notificação de mídia aparece exatamente quando o áudio começa.

---

## D3 — Leitor de tags próprio, sem dependência

**Contexto.** Nenhuma biblioteca de leitura de tags do ecossistema React Native é
mantida de forma confiável, e as que existem carregam o arquivo inteiro na memória. Um
FLAC pode ter dezenas de megabytes, dos quais alguns kilobytes são metadados.

**Decisão.** `src/lib/tags.ts`, sem dependências, operando sobre `Uint8Array`. Cobre
ID3v2.3 e 2.4, Vorbis comment (FLAC e OGG) e MP4 `ilst`. O I/O fica fora do módulo, em
`scan.readTags`, que usa `File.open(FileMode.ReadOnly)` e `FileHandle.readBytes()` para
ler só o cabeçalho. Detalhes em `04-tags-e-formatos.md`.

**Consequências.** O módulo é puro e testável em Node (`node --test src/lib/tags.test.ts`,
18 casos sobre buffers montados à mão — sem fixtures binários no repositório). Formatos
raros não cobertos caem no fallback pelo caminho do arquivo, nunca em erro.

---

## D4 — Duração lida do cabeçalho, além do MediaStore

**Contexto.** No Android o `expo-media-library` entrega a duração de graça. No iOS não há
equivalente: a fonte é a pasta Documents do app e o sistema não indexa nada. Uma lista de
faixas em que toda duração é `--:--` é uma lista pela metade.

**Decisão.** `tags.parseDuration()` deriva a duração dos mesmos bytes de cabeçalho já
lidos: FLAC pelo `STREAMINFO`, WAV pelo `byteRate` e o tamanho do bloco `data`, MP4 pelo
`mvhd`, MP3 pelo cabeçalho Xing/Info quando existe e por bitrate constante quando não.

**Consequências.** Escopo além do plano original, justificado por ser a diferença entre
uma lista utilizável e uma lista vazia no iOS. OGG e Opus continuam sem duração, porque
exigiriam ler a última página do arquivo para pegar o `granulepos` final.

---

## D5 — Transição de zoom escrita à mão

**Contexto.** O pedido foi reproduzir a transição do app Music da Apple: a tela nasce do
retângulo do elemento tocado e cresce até ocupar tudo; ao voltar, encolhe de volta.

Duas alternativas prontas foram descartadas por fato verificado, não por preferência:

- `react-native-screens` 4.26 não expõe transição de zoom: `StackAnimationTypes` é
  `'default' | 'fade' | 'fade_from_bottom' | 'flip' | 'none' | 'simple_push' |
  'slide_from_bottom' | 'slide_from_right' | 'slide_from_left' | 'ios_from_right' |
  'ios_from_left'`.
- As shared element transitions do Reanimated 4 (`sharedTransitionTag`) continuam
  documentadas como experimentais e "não recomendadas para produção", exigem feature flag
  e têm problemas conhecidos de posicionamento vertical no iOS.

**Decisão.** `src/lib/zoom.tsx`. `useZoomLaunch(radius)` devolve um `ref` e um `launch`:
antes de navegar, `measureInWindow` grava o retângulo do elemento no `ZoomProvider`.
A tela de destino se envolve em `<ZoomScreen>`, que interpola `translateX`, `translateY`,
`scaleX`, `scaleY` e `borderRadius` daquele retângulo até a tela inteira, com
`transformOrigin: 'top left'`. `useZoomClose()` faz o caminho inverso e só então chama
`router.back()`.

As rotas envolvidas usam `presentation: 'transparentModal'` (para a tela de baixo
continuar visível enquanto a caixa cresce) e `animation: 'none'` (para o stack não
competir com a animação própria).

Aplicada em dois lugares, os mesmos do app da Apple: capa do álbum → tela do álbum, e
mini player → Now Playing.

**Consequências.** A escala não é uniforme, então o conteúdo distorce durante a
transição; isso é mascarado por um fade no conteúdo interno nos primeiros 45% da
animação. O encolhimento acontece pelo botão de voltar do app. O gesto de deslizar do
sistema e o botão físico do Android saem sem encolher — são caminhos secundários.
Sem retângulo de origem (deep link, elemento não medido), a tela entra com um fade curto.

---

## D6 — Chrome como overlay, não como tab bar do router

**Contexto.** No protótipo o mini player e a navegação em pílula são uma peça só,
flutuando sobre o conteúdo, com um gradiente de máscara no topo.

**Decisão.** `src/components/chrome.tsx` é um `View` absoluto irmão do `<Stack>` no
layout raiz. Ele lê `usePathname()` e decide se aparece.

**Consequências.** Fidelidade ao design e nenhuma remontagem de árvore ao trocar de aba.
Em troca, o espaço que ele ocupa não é conhecido pelo router: as listas reservam
`CHROME_HEIGHT` (168) mais o inset inferior no `paddingBottom`.

---

## D7 — Sem biblioteca de gradiente

**Contexto.** O design é construído sobre gradientes: as capas são dois `radial-gradient`
empilhados, e há gradientes de máscara em várias bordas.

**Decisão.** `experimental_backgroundImage` do React Native 0.86, com a mesma sintaxe CSS
que o protótipo usa. Nenhuma dependência de gradiente.

**Consequências.** O parser do RN
(`react-native/Libraries/StyleSheet/processBackgroundImage.js`) aceita apenas
`linear-gradient` e `radial-gradient`. Não aceita `conic-gradient`, `repeating-linear-gradient`
nem `repeating-radial-gradient`, e não existe `mask-image`. O que isso custou está
listado em `05-design-system.md`.

---

## D8 — `react-native-svg` adicionado

**Contexto.** Os ícones do protótipo são paths SVG desenhados à mão. Nem
`@expo/vector-icons` nem `react-native-svg` estavam instalados.

**Decisão.** Instalar `react-native-svg` e copiar os paths do protótipo para
`src/components/icons.tsx`.

**Consequências.** Uma dependência a mais. A alternativa — desenhar com `View` — cobre
play, pause e as barras do equalizador, mas não coração, aleatório nem os raios do ícone
de ajustes, e produz triângulos sem suavização em tamanhos grandes. Copiar 18 paths já
prontos é o menor diff.

---

## D9 — Uma implementação de fontes, com ramo por plataforma

**Contexto.** Android e iOS descobrem áudio de formas completamente diferentes
(ver `06-plataformas.md`). O plano previa `sources.android.ts` e `sources.ios.ts`.

**Decisão.** Um único `src/lib/sources.ts` com `Platform.OS === 'android'` nas duas
funções que divergem.

**Consequências.** Os dois caminhos são verificados pelo `tsc` (arquivos com sufixo de
plataforma só teriam o padrão checado) e há menos arquivos. Ambos os módulos nativos
existem nas duas plataformas, então o import não quebra em nenhuma.

---

## D10 — Biblioteca em JSON, não em banco

**Contexto.** O índice precisa sobreviver ao fechamento do app e ser lido no boot para
decidir a rota inicial.

**Decisão.** Um `library.json` em `Paths.document`, lido de forma síncrona
(`file.textSync()`) no inicializador de estado do `LibraryProvider`.

**Consequências.** A biblioteca inteira fica em memória e o boot lê tudo de uma vez.
Funciona bem em bibliotecas de tamanho normal. Acima de cerca de 20 mil faixas isso passa
a doer — o caminho é `expo-sqlite`. Está marcado no código com um comentário `ponytail:`.

---

## D11 — Letras: detecção no índice, texto sob demanda

**Contexto.** Espera-se que os arquivos tenham letra embutida na tag ou um `.lrc` ao lado
(ver `01-contexto.md`). Guardar todas as letras no índice inflaria `library.json`.

**Decisão.** A varredura grava apenas `hasLyrics: boolean` por faixa. O texto é buscado
por `scan.readLyrics(track)` no momento de exibir — o `.lrc` ao lado tem prioridade sobre
a tag embutida, porque só ele carrega os tempos de sincronia.

**Consequências.** O índice fica pequeno e a interface de letras da fase 2 não vai exigir
uma nova varredura de toda a biblioteca. O selo "LRC" da lista de faixas, que estava no
protótipo, já funciona.

---

## D12 — Testes fora do `tsconfig` do app

**Contexto.** `src/lib/tags.test.ts` roda em Node (`node --test`, com type stripping
nativo). O `tsconfig` do Expo usa `customConditions: ["react-native"]`, o que impede o
`@types/node` de resolver, e o teste importa `node:test` e `node:assert`.

**Decisão.** `"exclude": ["node_modules", "android", "ios", "**/*.test.ts"]` no
`tsconfig.json`.

**Consequências.** O teste não é verificado pelo `tsc`, mas é executado — se a lógica
quebrar, ele falha, que é o que importa.

---

## D13 — A aba de letras segue o Music da Apple, não o protótipo

**Contexto.** O protótipo desenha as letras como uma janela fixa de cinco linhas
centralizadas na tela: a atual grande no meio, duas acima e duas abaixo esmaecidas, com
uma barra que preenche conforme a linha passa. Na revisão, esse tratamento foi
considerado inferior ao do app Music da Apple, que foi pedido no lugar.

**Decisão.** `src/components/lyrics.tsx` implementa o comportamento do Music:

- a letra inteira fica numa lista rolável, não numa janela de cinco linhas;
- a linha do momento é **ancorada a 32% do topo**, não centralizada — no Music ela sobe
  até cerca de um terço da tela e as seguintes esperam abaixo;
- a rolagem é automática e suave, e todas as linhas usam a **mesma cor e o mesmo
  tamanho**: quem separa a linha atual das outras é a opacidade (1 contra 0,3) e uma
  escala sutil;
- tipografia grande e pesada (28 px, Bricolage 800);
- tocar numa linha salta para o instante dela;
- rolar com o dedo **suspende a rolagem automática por 4 s**, para o app não brigar com
  o usuário.

O `paddingTop` e o `paddingBottom` do conteúdo valem a fração da âncora, senão a primeira
e a última linha nunca alcançariam a posição de destaque.

**Consequências.** Com a letra aberta, o título grande do Now Playing sai de cena para
dar espaço a ela; a fita de seek e o transporte continuam. Letra sem carimbos de tempo —
o caso da tag embutida — vira texto contínuo, sem linha destacada.

---

## D14 — Busca linear sobre a biblioteca em memória

**Contexto.** A biblioteca inteira já está em memória (ver D10). A busca precisa cobrir
título de faixa, título de álbum e nome de artista.

**Decisão.** `src/lib/search.ts` faz uma varredura linear por consulta, com teto de 20
resultados por seção. A normalização (`fold`) baixa a caixa e remove diacríticos, para
"Kō" casar com "ko" e "Órion" com "orion".

`String.prototype.normalize` depende do ICU, que nem toda build do Hermes traz, então a
função tem um fallback para apenas minúsculas dentro de um `try`.

**Consequências.** Nenhum índice invertido para manter em sincronia com a varredura. São
milhares de itens, não milhões: a varredura por tecla digitada é imperceptível. Se a
biblioteca migrar para `expo-sqlite` (D10), a busca vai junto, como consulta.

---

## D15 — Pastas extras pelo seletor do sistema, não por uma árvore própria

**Contexto.** O protótipo desenha um navegador de diretórios: árvore de `/storage/emulated/0`,
migalhas de caminho, checkbox por pasta. No Android moderno isso não existe mais para um
app comum — o acesso a arquivos fora da mídia indexada passa obrigatoriamente pelo
Storage Access Framework, e quem desenha a árvore é o sistema.

**Decisão.** `sources.pickFolder()` chama `Directory.pickDirectoryAsync()`, que abre o
seletor nativo. A URI concedida é guardada em `prefs.granted` e a varredura percorre
essas pastas recursivamente, além do que o MediaStore já indexou, sem duplicar URIs.

Uma verificação que destravou isso: `FileMode.ReadOnly` **funciona** com URIs `content://`
do SAF — a restrição documentada é só para `FileMode.ReadWrite`. Ou seja, o leitor de tags
lê normalmente arquivos vindos do SAF.

**Consequências.** O usuário vê o seletor do sistema em vez da árvore do protótipo — menos
bonito, e o único caminho correto. Se o Android não persistir a concessão entre sessões, a
pasta deixa de ser lida na varredura seguinte e some da biblioteca sem erro; está marcado
com um comentário `ponytail:`.

---

## D16 — Playlists fora do `library.json`

**Contexto.** A biblioteca é derivada da varredura: varrer de novo reescreve o arquivo
inteiro. Playlists são criadas pelo usuário e não podem ser perdidas nesse processo.

**Decisão.** `playlists.json` separado, com o próprio provider. As listas guardam URIs de
faixas; ao abrir uma lista, as faixas que não existem mais na biblioteca simplesmente não
aparecem, sem erro e sem apagar a entrada.

**Consequências.** Varrer de novo preserva as listas. Uma faixa movida de pasta muda de
URI e sai das listas — o preço de usar a URI como identidade (ver `02-arquitetura.md`).

Adicionar faixas é por **toque longo** em qualquer lista de faixas do app. O hook
`usePlaylistSheet()` embrulha o estado e o elemento da folha, para as quatro telas que
listam faixas não repetirem a mesma plumbagem.

---

## D17 — Módulo nativo opcional se verifica antes de importar o pacote

**Contexto.** Em Expo Go, ou num development build feito antes de `expo-media-library`
entrar no projeto, o app não abria: `Cannot find native module 'ExpoMediaLibraryNext'`,
com o rastro apontando para o carregamento do layout raiz.

Duas tentativas não resolveram, e a razão é a mesma nas duas: o pacote chama
`requireNativeModule('ExpoMediaLibraryNext')` no **topo** de um dos seus arquivos.

1. Trocar o import estático por `await import(...)` tirou o pacote do caminho do boot, mas
   ele continuava estourando quando a varredura o carregava.
2. Envolver o `import()` num `try/catch` também não bastou: o pacote carrega o suficiente
   para devolver um objeto pela metade, com `requestPermissionsAsync` valendo `undefined`
   — o sintoma virou `TypeError: undefined is not a function`, sem nada lançado para o
   `catch` pegar.

**Decisão.** Verificar o módulo nativo **antes** de tocar no JS do pacote:

```ts
async function mediaLibrary() {
  if (Platform.OS !== 'android') return null;
  if (!requireOptionalNativeModule('ExpoMediaLibraryNext')) return null;
  return import('expo-media-library');
}
```

`requireOptionalNativeModule` vem de `expo-modules-core`, devolve `null` em vez de lançar
e não avalia o pacote.

**Consequências.** `ensureAccess()` passou a devolver `'ok' | 'denied' | 'unavailable'`, e
o onboarding mostra uma mensagem explicando que falta o development build, em vez de o app
não abrir. No Android sem o módulo, as pastas concedidas por SAF continuam sendo lidas,
porque passam pelo `expo-file-system`.

Uma armadilha na troca do tipo: o chamador fazia `if (!(await ensureAccess()))`, e
`'denied'` é *truthy* — o `tsc` aceitou a mudança sem reclamar e a recusa de permissão
teria parado de ser detectada em silêncio.

**Regra geral.** Qualquer pacote com módulo nativo que não esteja em todas as plataformas
ou em todos os builds entra por `requireOptionalNativeModule` primeiro, nunca por import
direto.
