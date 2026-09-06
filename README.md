# Resonate

Um player de música **offline** para Android e iOS. Ele encontra o que já está no seu
aparelho, lê as tags dos arquivos, monta a biblioteca e toca — com controles nativos na
tela de bloqueio.

Sem streaming. Sem conta. Sem rede. Nenhum arquivo é movido ou renomeado.

**Expo SDK 57** · React Native 0.86 · React 19 · TypeScript strict · Reanimated 4

---

## Por que existe

Quase todo player de música hoje presume uma biblioteca na nuvem. O Resonate presume o
contrário: os arquivos são seus, estão no aparelho, e o app é só uma boa forma de ouvi-los.

Isso tem consequências de projeto que aparecem em todo o código. Não há capa vinda de um
catálogo — ela é extraída do próprio arquivo, ou gerada proceduralmente. Não há
"artistas parecidos" de um serviço de recomendação — a semelhança sai do gênero gravado
na tag. Cada uma dessas escolhas está registrada em [`docs/03-decisoes.md`](docs/03-decisoes.md).

## O que ele faz

**Biblioteca**
- Varredura com leitura de tags: ID3v2.3/2.4, Vorbis comment (FLAC/OGG) e MP4 `ilst`
- Capas extraídas do arquivo (`PICTURE` do FLAC, `APIC` do ID3, `covr` do MP4), com arte
  procedural determinística como reserva
- Duração lida do cabeçalho quando o sistema não a fornece
- Álbuns, artistas, faixas, pastas e listas
- Busca por faixa, álbum e artista, ignorando acento e caixa

**Reprodução**
- Fila editável, com reordenação por arraste
- Aleatório e repetição (nenhuma / tudo / uma faixa)
- Continuação automática ao fim da fila: pelo álbum, pelo artista, ou por gênero
- Controles nativos de tela de bloqueio, com capa e metadados
- Reprodução em segundo plano

**Now Playing**
- Três tratamentos visuais: Brasa, Vinil e Forma de onda
- Troca de faixa por gesto na capa, busca pela fita deslizante
- Letras sincronizadas de `.lrc` ou embutidas na tag, no comportamento do app Music —
  lista rolável com a linha do momento ancorada e toque para saltar
- Arrastar para baixo minimiza; arrastar o mini player para cima maximiza

**Listas**
- Criar, renomear, apagar, capa escolhida da galeria
- Adicionar por gesto: arrastar a faixa para a direita enfileira, para a esquerda abre o
  seletor de listas

**Interface**
- Transição no estilo do Music: a capa viaja da lista até a tela nova, o resto entra em fade
- Cabeçalho parallax na tela do artista
- Quatro cores de acento
- Dark fixo

## Rodando

O app usa módulos nativos de áudio e de biblioteca de mídia — **não roda no Expo Go**.

```sh
npm install
npx expo run:android   # ou: npx expo run:ios
```

Depois da primeira compilação, `npx expo start` basta.

> Ao criar ou renomear uma rota, rode `npx expo start` uma vez antes do `tsc`: os tipos de
> rota são gerados pelo Metro em `.expo/types/`, e sem isso a verificação usa a lista antiga.

## Verificando

```sh
npm run typecheck   # tsc --noEmit, strict
npm run lint        # inclui as regras do React Compiler
npm test            # 62 testes, em Node, sem emulador
```

Os testes cobrem o que dá para verificar sem aparelho e é fácil de quebrar em silêncio: o
leitor de tags nos quatro formatos, o cálculo de duração, o parser de `.lrc`, a busca, a
deduplicação de arquivos e a lógica de continuação da fila. Os buffers binários são
montados no próprio teste — não há fixtures no repositório.

## Como o código está organizado

```
src/
  app/          rotas (expo-router, file-based)
  components/   peças de interface
  lib/          tags, varredura, reprodução, estado, transições
  constants/    tokens do design
modules/
  live-activity/  módulo nativo iOS (Dynamic Island)
docs/           contexto, arquitetura, decisões
```

Estado em cinco contextos, sem biblioteca de gerenciamento: preferências, biblioteca,
listas, player e transição. A biblioteca vive em memória e é persistida em JSON.

## As partes interessantes

**O leitor de tags** não tem dependência nenhuma. Opera sobre `Uint8Array` e nunca lê o
arquivo inteiro — um FLAC pode ter dezenas de megabytes, dos quais alguns kilobytes são
metadados. Quando a tag declara o próprio tamanho, lê exatamente isso. Formatos não
cobertos caem num fallback que deriva artista, álbum e título do caminho do arquivo.
Detalhes em [`docs/04-tags-e-formatos.md`](docs/04-tags-e-formatos.md).

**As capas** são lidas com `seek` em vez de leitura sequencial, o que permite pular de
bloco em bloco. Isso resolve de graça o MP4 com `moov` no fim do arquivo, que o leitor de
tags não alcança.

**A arte procedural** é um hash FNV-1a de artista + álbum indexando uma paleta. O mesmo
álbum tem sempre a mesma capa, sem I/O e sem rede.

**As transições** são escritas à mão. As shared element transitions do Reanimated 4
continuam experimentais, exigem feature flag e têm problemas conhecidos de posicionamento
no iOS. A capa é medida na origem e animada até o próprio lugar de layout, com a
transformação inversa revertida — sem uma segunda cópia do elemento.

## Android e iOS

A pergunta "onde estão os arquivos?" tem respostas incompatíveis nas duas plataformas, e
uma interface única em `src/lib/sources.ts` isola isso. O resto do app é idêntico.

| | Android | iOS |
|---|---|---|
| Fonte | MediaStore, mais pastas concedidas por SAF | pasta Documents do app |
| Como adicionar | já estão no aparelho | importar, ou arrastar no app Arquivos |
| Permissão | `READ_MEDIA_AUDIO` | nenhuma |
| Duração | vem do MediaStore | derivada do cabeçalho |
| `.lrc` ao lado do arquivo | ilegível (só mídia) | legível |

No Android moderno não existe navegar o armazenamento livremente: pastas fora da mídia
indexada passam pelo seletor do sistema. Mais em [`docs/06-plataformas.md`](docs/06-plataformas.md).

## Limitações conhecidas

Registradas porque conhecer o limite vale mais que fingir que não existe:

- **iOS não foi testado.** O desenvolvimento ocorreu em Linux com emulador Android. O
  código de plataforma existe e compila no bundler, mas nenhum caminho iOS rodou em
  aparelho.
- **A Dynamic Island não foi compilada.** O módulo nativo em Swift está escrito, e o
  target do widget precisa ser criado no Xcode — os passos estão no
  [README do módulo](modules/live-activity/README.md). Exige Mac ou EAS Build.
- **A troca de faixa não é gapless.** `setActiveForLockScreen` existe só em `AudioPlayer`,
  não em `AudioPlaylist`, e sem os controles de mídia o Android encerra o áudio em segundo
  plano. A fila é própria, e trocar de faixa recarrega o player.
- **A notificação só oferece seek.** Próxima e anterior exigiriam controles que o
  `expo-audio` 57 ainda não expõe.
- **Sem gênero na tag, "parecidas" não tem o que sugerir.** É o único critério de
  semelhança possível offline.
- **A biblioteca inteira fica em memória**, num único JSON. Acima de umas 20 mil faixas
  isso pesa no boot, e o caminho é `expo-sqlite`.

Atalhos deliberados levam um comentário `ponytail:` no ponto exato do código, nomeando o
teto e a saída. Para listar: `grep -rn "ponytail:" src/`.

## Documentação

A pasta [`docs/`](docs/README.md) foi escrita para ser lida por pessoas e por RAG — cada
arquivo é temático e cada seção se sustenta sozinha.

| | |
|---|---|
| [01-contexto](docs/01-contexto.md) | o produto, o que faz, o que mudou em relação ao protótipo |
| [02-arquitetura](docs/02-arquitetura.md) | pastas, fluxo de dados, estado, persistência |
| [03-decisoes](docs/03-decisoes.md) | as decisões técnicas, com contexto e consequências |
| [04-tags-e-formatos](docs/04-tags-e-formatos.md) | o leitor de tags, formato por formato |
| [05-design-system](docs/05-design-system.md) | tokens, tipografia, e o que não sobreviveu ao React Native |
| [06-plataformas](docs/06-plataformas.md) | Android, iOS, permissões, roteiro de verificação |
| [07-roadmap-e-divida](docs/07-roadmap-e-divida.md) | ideias futuras e a dívida marcada no código |

O design nasceu de um protótipo em HTML/CSS entregue como
`Offline Music Player App-handoff/…/Resonate - Offline Player.dc.html`, que segue sendo a
fonte da verdade visual — os valores de tipografia, espaçamento e cor saem dos inline
styles dele.

## Licença

O arquivo `LICENSE` ainda é o MIT herdado do template do Expo, com a titularidade deles.
Se este repositório for publicado, vale substituí-lo pela sua própria licença.
