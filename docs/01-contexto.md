---
projeto: Resonate
tipo: contexto
tags: [produto, escopo, fase-1, offline, expo]
atualizado: 2026-09-06
---

# Contexto do produto

## O que é o Resonate

Resonate é um player de música offline para Android e iOS. Ele varre o armazenamento do
aparelho, lê as tags dos arquivos de áudio encontrados, monta uma biblioteca por álbum e
artista e toca o áudio com controles nativos de tela de bloqueio.

Três coisas que o Resonate deliberadamente **não** faz:

- **não usa serviço de streaming de terceiro.** O padrão continua sendo arquivo local. O
  usuário pode conectar um servidor **dele** por OpenSubsonic — Navidrome, Airsonic, Gonic
  — e aí o acervo do servidor entra na mesma biblioteca dos arquivos, com os dois caminhos
  valendo juntos. Não há catálogo nosso, nem de ninguém, no meio. Ver `lib/subsonic.ts`;
- **não tem login nem conta nossa.** A credencial que existe é a do servidor do próprio
  usuário, guardada só no aparelho;
- não move, copia nem renomeia os arquivos do usuário (a única exceção é a importação
  no iOS, onde copiar para dentro do sandbox é a única forma de acessar o arquivo).

O app é dark fixo. Não há tema claro nem alternância.

## Origem

O repositório começou como o template starter do Expo SDK 57 renomeado — duas telas de
demonstração, nenhuma lógica de áudio. A fase 1 substituiu o template inteiro por um app
funcional, guiado por um protótipo de design completo entregue como um arquivo
`.dc.html` do Claude Design.

## Escopo da fase 1 (entregue)

Fluxo ponta a ponta, do primeiro boot ao áudio tocando com o aparelho bloqueado:

1. **Onboarding** — pede acesso, lista as pastas com áudio, o usuário liga e desliga cada uma.
2. **Varredura** — lê as tags de cada arquivo em lotes, mostrando progresso, contadores de
   álbuns/artistas/horas e o arquivo atual.
3. **Biblioteca** — abas Álbuns / Artistas / Faixas / Listas / Favoritos, grid de capas procedurais.
4. **Álbum** — capa hero, tocar, aleatório, curtir, lista de faixas.
5. **Now Playing** — três tratamentos visuais (Brasa, Vinil, Forma de onda), troca de faixa
   por gesto na capa, busca pela fita de seek.
6. **Letras** — aba no Now Playing, no comportamento do Music da Apple: a letra inteira
   rola, a linha do momento fica opaca e ancorada perto do topo, tocar numa linha salta
   para o trecho dela. Lê `.lrc` ao lado do arquivo e letra embutida na tag.
7. **Busca** — por faixa, álbum e artista, ignorando acento e caixa.
8. **Playlists** — criar, renomear, apagar, adicionar por toque longo em qualquer faixa.
9. **Pastas extras** — no Android, incluir pastas que o MediaStore não indexa, pelo
   seletor do sistema (SAF).
10. **Mini player + navegação** — overlay flutuante sobre as telas de biblioteca.
11. **Controles de tela de bloqueio** — nativos, via `expo-audio`.
12. **Ajustes** — tratamento do player, cor de acento, varrer de novo, apagar a biblioteca.

Persistência: a biblioteca, as preferências e a fila sobrevivem ao fechamento do app.

## O que do protótipo não foi construído como desenhado

- **A árvore de diretórios com checkboxes.** O protótipo navega `/storage/emulated/0` com
  migalhas de caminho. O Android moderno não permite isso: o acesso a pastas fora da
  mídia indexada passa obrigatoriamente pelo seletor do sistema. O app abre esse seletor
  e guarda a pasta concedida.
- **Tela de bloqueio e Dynamic Island.** Aquilo no protótipo é a *previsão* do que o
  sistema operacional mostra, não uma tela do app. Quem desenha é o SO.
- **A janela de cinco linhas das letras.** Substituída pelo comportamento do app Music da
  Apple, a pedido — ver D13 em `03-decisoes.md`.

## Premissas sobre os arquivos do usuário

A origem esperada dos arquivos é download de serviços que entregam FLAC com metadados
completos. Na prática isso significa que, no caso comum, os arquivos têm:

- tags Vorbis bem preenchidas (título, artista, álbum, número de faixa, artista do álbum);
- letra embutida na tag, ou um arquivo `.lrc` ao lado.

O leitor de tags foi construído para não depender disso: quando não há tag alguma, ele
deriva título, artista e álbum do caminho do arquivo.
