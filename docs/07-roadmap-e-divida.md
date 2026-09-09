---
projeto: Resonate
tipo: roadmap
tags: [roadmap, divida-tecnica, ponytail, pendencias, ideias]
atualizado: 2026-09-08
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

## Pendências de validação

Nada disso roda sem um development build e arquivos reais. O roteiro está em
`06-plataformas.md`. Dois itens de maior risco:

- **O formato das URIs do MediaStore no Android** (`file://` vs `content://`), descrito lá.
- **Nada do que entrou nesta rodada foi visto no Android.** Varredura, banco, histórico,
  temporizador e reordenação de listas foram exercitados só no Simulador do iOS.
