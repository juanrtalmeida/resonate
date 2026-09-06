---
projeto: Resonate
tipo: referência-técnica
tags: [tags, id3, vorbis, flac, mp4, duracao, metadados, parser]
atualizado: 2026-09-06
---

# Leitor de tags e de duração

Resonate é o player de música offline descrito em `01-contexto.md`. Este arquivo descreve
`src/lib/tags.ts` — o módulo que transforma os primeiros bytes de um arquivo de áudio em
metadados — e o `src/lib/scan.ts`, que faz o I/O em volta dele.

## Divisão de responsabilidades

`tags.ts` é **puro**: recebe `Uint8Array` e devolve objetos. Não importa nada do Expo.
É por isso que roda em Node e é testável sem emulador.

`scan.ts` faz o I/O: abre o arquivo, decide quantos bytes ler, fecha o handle.

## Quanto se lê de cada arquivo

Nunca o arquivo inteiro. `scan.readTags(uri)`:

1. abre com `File.open(FileMode.ReadOnly)`;
2. lê 10 bytes e verifica a assinatura `ID3`;
3. se for ID3, a própria tag declara o tamanho (um inteiro *synchsafe* no cabeçalho) —
   lê exatamente isso;
4. se não for, lê até 256 KB;
5. fecha o handle no `finally`.

Qualquer falha (arquivo removido, permissão negada, URI `content://` sem acesso direto)
cai no fallback pelo caminho, nunca em exceção propagada.

## Formatos cobertos

### ID3v2.3 e ID3v2.4 (`.mp3`)

Quadros lidos: `TIT2` (título), `TPE1` (artista), `TALB` (álbum), `TPE2` (artista do
álbum), `TRCK` (número da faixa), `USLT` (letra).

Detalhes que importam:

- O tamanho do quadro é *synchsafe* em 2.4 e um inteiro big-endian comum em 2.3. Tratar
  os dois igual corrompe a leitura de qualquer tag maior que 128 bytes.
- Os quatro encodings são suportados: `0` ISO-8859-1, `1` UTF-16 com BOM, `2` UTF-16BE,
  `3` UTF-8. Os decodificadores são escritos à mão, sem depender de `TextDecoder`.
- `USLT` não é um quadro de texto simples: depois do byte de encoding vêm 3 bytes de
  idioma e um descritor terminado em NUL. Pular o descritor é obrigatório — sem isso ele
  apareceria colado no início da letra. O terminador tem dois bytes nos encodings UTF-16.
- O cabeçalho estendido, quando presente, é pulado.

### Vorbis comment (`.flac`, `.ogg`)

FLAC: assinatura `fLaC`, depois blocos de metadados; o bloco de tipo 4 é o
`VORBIS_COMMENT`. Chaves lidas: `TITLE`, `ARTIST`, `ALBUM`, `ALBUMARTIST`
(e `ALBUM ARTIST`), `TRACKNUMBER`, `LYRICS`, `UNSYNCEDLYRICS`, `SYNCEDLYRICS`.

OGG: em vez de reconstruir a paginação do contêiner, o parser procura a assinatura do
cabeçalho de comentários (`\x03vorbis` ou `OpusTags`) dentro dos bytes já lidos e parseia
o bloco a partir dali. O cabeçalho de comentários cabe na primeira ou segunda página em
praticamente todo arquivo real.

### MP4 `ilst` (`.m4a`, `.mp4`)

Percorre a árvore de átomos `moov → udta → meta → ilst`. Chaves lidas: `©nam`, `©ART`,
`©alb`, `aART`, `©lyr` e `trkn`.

Detalhes que importam:

- `meta` é um *full atom*: tem 4 bytes de versão e flags antes dos filhos. Não pular
  esses 4 bytes faz a travessia perder todos os itens.
- Cada item de `ilst` contém um átomo `data` interno, com versão, flags e locale antes do
  conteúdo — 24 bytes de deslocamento no total.
- Os nomes de átomo são bytes crus, não UTF-8: `©nam` é `0xA9 n a m`, quatro bytes.
- `trkn` é binário: dois bytes reservados, depois o número da faixa em big-endian.
- Se o átomo `moov` estiver no fim do arquivo (comum em MP4 não otimizados), ele não
  estará nos 256 KB lidos e a faixa cai no fallback.

### Fallback pelo caminho do arquivo

Usado quando não há tag, quando o formato não é coberto ou quando o arquivo não pôde ser
lido. `fromPath(uri)`:

- extrai um número de faixa de um prefixo numérico no nome (`02 Titulo.mp3` → 2);
- reconhece o padrão `Artista - Titulo` no nome do arquivo;
- usa a pasta pai como álbum e a pasta avó como artista, **exceto** quando a pasta pai é
  genérica. A lista de genéricas inclui `music`, `download`, `documents`, `media`,
  `audio`, `sdcard`, `storage`, `emulated` e `0`. Sem esse filtro,
  `/storage/emulated/0/Music/x.mp3` produziria o artista "0".
- quando nada dá, usa "Artista desconhecido" e "Álbum desconhecido".

## Duração

`tags.parseDuration(bytes, fileSize)` deriva a duração dos mesmos bytes já lidos:

| Formato | Origem |
|---|---|
| FLAC | `STREAMINFO`: taxa de amostragem (20 bits) e total de amostras (36 bits) |
| WAV | `byteRate` do bloco `fmt ` e o tamanho do bloco `data` |
| MP4 | `mvhd`, versões 0 (32 bits) e 1 (64 bits) |
| MP3 | cabeçalho Xing/Info quando existe (exato até em VBR); senão bitrate constante |
| OGG / Opus | **não coberto** |

O total de amostras do FLAC tem 36 bits e não cabe num inteiro de 32: os 4 bits altos
entram por multiplicação (`× 2^32`), não por deslocamento.

No Android a duração do MediaStore tem prioridade sobre a do cabeçalho, por ser mais
confiável.

## O que não é coberto

APE, WMA, ID3v2.2, duração de OGG e Opus, e MP4 com `moov` no fim do arquivo. Todos caem
no fallback pelo caminho — sem erro, com metadados piores.

## Testes

`node --test src/lib/tags.test.ts` — 18 casos. Os buffers de teste são montados à mão no
próprio arquivo de teste (nenhum binário no repositório): ID3v2.3 e 2.4 com padding,
`USLT` com descritor, Vorbis comment em FLAC e em OGG, `ilst` de MP4 com `trkn`, os
quatro caminhos de duração e os casos de fallback.
