---
projeto: Resonate
tipo: roadmap
tags: [roadmap, divida-tecnica, ponytail, pendencias, ideias]
atualizado: 2026-09-06
---

# Roadmap e dívida do Resonate

Resonate é o player de música offline descrito em `01-contexto.md`. Tudo o que estava
planejado — fase 1 e fase 2 — está entregue. Este arquivo registra o que sobrou de ideia
e os atalhos deliberados que o código carrega.

## O que ficou para depois

Nenhum item do plano original está pendente. O que resta é ideia, não dívida:

- **Reordenar faixas dentro de uma lista.** Hoje elas ficam na ordem em que foram
  adicionadas.
- **Fila visível e editável.** O app tem fila; não há tela para ver ou reordenar.
- **Equalizador**, **temporizador de desligar**, **estatísticas de escuta.**

## Dívida deliberada marcada no código

Todo atalho consciente tem um comentário `ponytail:` no ponto exato, nomeando o teto e o
caminho de saída. Para listar: `grep -rn "ponytail:" src/`.

| Onde | Atalho | Quando trocar |
|---|---|---|
| `lib/player.tsx` | troca de faixa por `replace()` não é gapless | quando `AudioPlaylist` ganhar controles de tela de bloqueio |
| `lib/player.tsx` | notificação só com seek, sem próxima/anterior | quando `expo-audio` expuser esses controles |
| `lib/scan.ts` | biblioteca inteira em memória, num JSON só | acima de ~20 mil faixas, migrar para `expo-sqlite` |
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
- **Não dá para escolher um `.lrc` avulso** para uma faixa sem letra. O protótipo desenha
  o botão; implementá-lo exige decidir onde guardar o arquivo e como associá-lo à faixa.

## Pendências de validação

Nada disso roda sem um development build e arquivos reais. O roteiro está em
`06-plataformas.md`. O item de maior risco é o formato das URIs do MediaStore no Android
(`file://` vs `content://`), descrito lá.
