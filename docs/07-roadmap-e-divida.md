---
projeto: Resonate
tipo: roadmap
tags: [roadmap, divida-tecnica, ponytail, pendencias, ideias]
atualizado: 2026-09-09
---

# Roadmap e dívida do Resonate

Resonate é o player de música offline descrito em `01-contexto.md`. Este arquivo registra
o que sobrou de ideia e os atalhos deliberados que o código carrega.

## O que foi entregue depois da fase 2

As quatro ideias que estavam listadas aqui saíram, junto de uma migração de
armazenamento:

- **Reordenar faixas dentro de uma lista.** No modo de edição da lista, com o mesmo
  pegador de arraste da fila — a `QueueRow` é literalmente a mesma linha. Ver
  `lib/playlists.tsx` (`moveTrack`) e `app/playlist/[id].tsx`.
- **Fila visível e editável.** Já existia desde a fase 2, dentro do próprio Now Playing.
- **Temporizador de desligar.** Cinco a sessenta minutos, ou fim da faixa, com
  esmaecimento de oito segundos antes da pausa. `lib/sleep.ts` é puro e testado; quem
  conta os minutos é o `PlayerProvider`.
- **Estatísticas de escuta.** Um destino da barra inferior (`app/stats.tsx`) sobre a
  tabela `plays` do banco. `lib/history.ts` é a agregação, pura e testada.
- **A biblioteca saiu do JSON e foi para o SQLite** (`lib/db.ts`).

## O que entrou nesta rodada

- **A interface do aparelho, por escolha do usuário.** Um flag em Ajustes troca as
  superfícies do app pelas do sistema: Liquid Glass no iOS (`expo-glass-effect`) e Material
  3 no Android (`@expo/ui`, Jetpack Compose). A barra inferior troca de material e a tela de
  Ajustes é substituída por um `Form` nativo. Duas peças seguem sendo nossas dentro dele,
  hospedadas por `RNHostView`: o seletor de acento — não existe seletor de cor de duas
  faixas no SwiftUI nem no Material — e o botão de apagar a biblioteca, porque o vermelho
  de ação destrutiva não é um estilo de botão que o sistema ofereça. Ver a seção da
  interface nativa em `05-design-system.md`.
- **Streaming do próprio usuário, por OpenSubsonic.** O acervo do servidor entra no **mesmo
  índice** da biblioteca local, então busca, Escuta, listas e menu de contexto valem para os
  dois sem código novo nessas telas. A costura é `absolute()` em `lib/storage.ts`, a única
  função que traduz identidade em localização — o player não sabe que streaming existe.
  `lib/merge.ts` é o que impede uma varredura de apagar o acervo remoto, e vice-versa.
- **Nivelamento de volume (ReplayGain).** `lib/gain.ts`, puro e testado. As tags já
  passavam pelo leitor e eram descartadas; agora entram no índice e no volume da
  reprodução, multiplicadas pelo esmaecimento do sleep timer. Não dependeu de trocar o
  motor de áudio.
- **Listas inteligentes.** `lib/smart.ts`: nunca ouvidas, mais tocadas, esquecidas, desta
  semana. Chips na aba de Faixas, compondo com o filtro de gênero. Tornam acionáveis os
  dados que a tela de Escuta só mostrava.
- **Cópia da própria escuta.** `lib/backup.ts` (puro) e `lib/backup-io.ts`: um arquivo com
  curtidas, contagens, progresso, listas e histórico. Restaurar **une** em vez de
  substituir, e importar duas vezes não dobra o histórico. A senha do servidor fica fora.
- **Busca dentro das letras.** Índice próprio no banco, populado pela varredura — que já
  lia a letra e a jogava fora, então indexar não custou I/O. A letra continua fora do
  índice da biblioteca, que é o que D11 protege.
- **Escolha de período em Escuta por dois dias**, em vez de por mês.
- **Migração de coluna no banco.** `addColumn` por `PRAGMA table_info`, que resolveu a
  dívida "esquema sem versão" para o caso aditivo. Versionar de verdade só no dia em que
  uma coluna existente mudar de tipo ou de significado.

## O que ficou para depois

- **As telas consultarem o banco em vez de receberem a lista pronta.** A biblioteca está
  em SQLite, mas continua materializada em memória no boot; ver o `ponytail:` em
  `loadLibrary`. É a metade que falta da migração, e é ela que tira o teto das ~20 mil
  faixas.
- **Varredura incremental.** O banco já permite: comparar `mtime` e reler só o que mudou,
  em vez de reler o acervo inteiro a cada varredura. Hoje toda varredura é completa.
- **Equalizador.** Tentado duas vezes nesta rodada, não entregue. Ver abaixo.

## O equalizador, e por que ele ainda não existe

Equalizar é filtrar o sinal, e filtrar exige estar no caminho do som. O `expo-audio` não
oferece nem uma coisa nem outra: não expõe a sessão de áudio do ExoPlayer que embrulha, e
não tem grafo onde entrar.

**Primeira tentativa — módulo nativo no Android.** `android.media.audiofx.Equalizer` sobre
a sessão `0`, a mistura de saída do aparelho. Funciona onde o fabricante deixa, e o preço
é alto: equaliza o som de *todos* os apps, boa parte do Android 9+ recusa, e no iOS não há
equivalente. Escrito e descartado.

**Segunda tentativa — trocar o motor por `react-native-audio-api`.** Com a reprodução num
grafo Web Audio nosso, cada banda vira um `BiquadFilterNode` no caminho do sinal: mesmo
DSP nas duas plataformas e nada dependendo do fabricante. A biblioteca compila com o SDK
57 e a RN 0.86, o app sobe, a biblioteca carrega, a fila restaura e o `play()` muda o
estado — **mas a posição não avança**. Não é o grafo: desligando o roteamento o sintoma
continua igual.

O que **não** foi descartado antes de reverter, e é por onde recomeçar:

1. **O arquivo de teste era FLAC.** Se o binário pré-compilado vier sem FFmpeg, ou sem
   FLAC, o sintoma é exatamente este — o container abre, a posição é reportada uma vez, e
   nenhuma amostra decodifica. **Testar com MP3 e M4A é o primeiro passo.**
2. **`babel.config.js` e `metro.config.js` não existem neste projeto.** A biblioteca usa um
   runtime de worklets próprio; vale conferir se ela pede alguma configuração que os
   padrões do Expo não cobrem.
3. **`AVAudioEngine` no Simulador do iOS.** É o motor dela, e é instável ali; o
   `expo-audio` usa `AVPlayer`, que funciona. Pode ser que só num aparelho real se veja a
   verdade.

O trabalho está escrito e foi revertido para não deixar o app sem tocar música. Refazê-lo
é reaplicar cinco arquivos — `lib/player.tsx`, `lib/audio-graph.ts`, `lib/eq.ts`,
`lib/eq.test.ts` e `components/equalizer.tsx`.

O que a troca traria junto, além do equalizador: **próxima e anterior na notificação**,
registradas aqui como impossíveis com o `expo-audio` 57.

## Dívida deliberada marcada no código

Todo atalho consciente tem um comentário `ponytail:` no ponto exato, nomeando o teto e o
caminho de saída. Para listar: `grep -rn "ponytail:" src/`.

| Onde | Atalho | Quando trocar |
|---|---|---|
| `lib/player.tsx` | troca de faixa por `replace()` não é gapless | quando `AudioPlaylist` ganhar controles de tela de bloqueio |
| `lib/player.tsx` | notificação só com seek, sem próxima/anterior | quando `expo-audio` expuser esses controles |
| `lib/db.ts` | biblioteca materializada em memória | acima de ~20 mil faixas, as telas consultam o banco |
| `lib/db.ts` | esquema com `CREATE TABLE IF NOT EXISTS`, sem versão | no dia em que uma coluna existente mudar |
| `lib/sources.ts` | um `getInfo()` por arquivo no Android | se a listagem inicial ficar lenta demais |
| `lib/tags.ts` | APE, WMA e ID3v2.2 não cobertos | se aparecerem arquivos desses formatos |
| `lib/tags.ts` | OGG com cabeçalho de comentários em várias páginas | se houver arquivos assim na prática |
| `lib/tags.ts` | duração de OGG e Opus não é lida | exige ler a última página do arquivo |
| `lib/artwork.ts` | forma de onda procedural, não o áudio real | só com PCM real, que no Android custa `RECORD_AUDIO` |
| `lib/tags.ts` | ReplayGain não é lido de MP4 (átomo freeform `----`) | se aparecer M4A com ReplayGain; o iTunes usa `iTunNORM` |
| `lib/db.ts` | busca de letra por `LIKE`, sem índice | com muitos milhares de letras; o caminho é FTS5 |
| `lib/scan.ts` | só a letra **embutida** é indexada, não o `.lrc` ao lado | custaria um read por faixa na varredura |
| `lib/subsonic.ts` | sem download para offline; sem letra do servidor | quando streaming provar o valor no uso |
| `components/album-art.tsx` | riscas diagonais da capa removidas | se o RN passar a parsear `repeating-linear-gradient` |
| `components/player-visuals.tsx` | barras da fita não pulsam junto ao cursor | se houver folga de desempenho |
| `components/player-visuals.tsx` | esmaecimento da fita cobre o brilho nas pontas | se o RN ganhar `mask-image` |
| `components/lyrics.tsx` | todas as linhas montadas, sem virtualização | se aparecer letra com centenas de linhas |
| `lib/lrc.ts` | busca linear pela linha atual | são dezenas de linhas; binária custaria clareza |
| `lib/sources.ts` | concessão do SAF pode não persistir entre sessões | se a pasta sumir da biblioteca ao reabrir |

## Limitações conhecidas, não marcadas como dívida

- **Encolhimento da transição só pelo botão de voltar.** O gesto de deslizar do sistema e
  o botão físico do Android saem sem animar. Interceptar o gesto exigiria travar a
  navegação nativa, o que traz mais problemas do que resolve.
- **Sem tema claro.** É uma decisão de produto, não uma pendência.
- **`.lrc` ao lado do arquivo não é legível no Android.** `READ_MEDIA_AUDIO` dá acesso a
  arquivos de mídia, não a arquivos comuns. Ali a letra embutida na tag é a única fonte.
  `lrcFile()` trata a falha em silêncio.
- **O histórico de escuta não distingue quem ouviu.** Um aparelho, um histórico. Não há
  conta, e não vai haver.
- **Os módulos pré-compilados do Expo não linkam num build de simulador em Debug.** Com
  `EXPO_USE_PRECOMPILED_MODULES` ligado — que é o padrão do SDK 57 —, o `ExpoModulesCore`
  e o `ExpoModulesWorklets` entram como frameworks dinâmicos compilados contra um
  `React.framework`, e esse framework só existe quando o CocoaPods encontra os artefatos
  pré-compilados do React Native. Quando ele não os encontra (`[ReactNativeCore] No
  prebuilt artifacts found`), a RN é compilada da fonte, o `React.framework` não existe, e
  o app instala mas morre no `dyld` antes do primeiro render:
  `Library not loaded: @rpath/React.framework/React`.

  O contorno é compilar os módulos do Expo da fonte também, o que casa as duas metades:

  ```sh
  cd ios && EXPO_USE_PRECOMPILED_MODULES=0 pod install
  npx expo run:ios
  ```

  É por isso que os podspecs de `modules/story-share` e `modules/audio-route` pedem iOS
  16.4 e não os 15.1 do template: compilado da fonte, o `ExpoModulesCore` exige 16.4, e o
  app já mira 16.4 de qualquer jeito. Para gravar a escolha no projeto em vez de repetir a
  variável, `ios.usePrecompiledModules: false` no `expo-build-properties` do app.json.

## Pendências de validação

Nada disso roda sem um development build e arquivos reais. O roteiro está em
`06-plataformas.md`. Dois itens de maior risco:

- **O formato das URIs do MediaStore no Android** (`file://` vs `content://`), descrito lá.
- **Nada do que entrou nesta rodada foi visto no Android.** Varredura, banco, histórico,
  temporizador e reordenação de listas foram exercitados só no Simulador do iOS.
