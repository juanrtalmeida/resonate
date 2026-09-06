---
projeto: Resonate
tipo: índice
atualizado: 2026-09-06
---

# Documentação do Resonate

Resonate é um player de música **offline** para Android e iOS, feito com Expo SDK 57.
Ele lê os arquivos de áudio que já estão no aparelho. Não há streaming, login nem rede.

Esta documentação foi escrita para ser consumida por pessoas e por RAG. Cada arquivo é
temático e cada seção é autocontida: um trecho isolado do meio de um arquivo ainda diz
de que projeto e de que assunto está falando.

## Mapa

| Arquivo | Assunto |
|---|---|
| [01-contexto.md](01-contexto.md) | O que é o produto, o que ele faz, o que do protótipo mudou |
| [02-arquitetura.md](02-arquitetura.md) | Estrutura de pastas, fluxo de dados, estado, persistência |
| [03-decisoes.md](03-decisoes.md) | Decisões técnicas com contexto e consequências (ADRs) |
| [04-tags-e-formatos.md](04-tags-e-formatos.md) | O leitor de tags: formatos, o que cobre, o que não cobre |
| [05-design-system.md](05-design-system.md) | Tokens, tipografia, e o que do design não sobreviveu ao React Native |
| [06-plataformas.md](06-plataformas.md) | Divergências entre Android e iOS |
| [07-roadmap-e-divida.md](07-roadmap-e-divida.md) | Ideias futuras e os atalhos deliberados marcados no código |

## Como rodar

O app usa módulos nativos (áudio, media library) — **não roda no Expo Go**.

```sh
npx expo run:android   # ou run:ios
```

Depois de criar ou renomear uma rota, rode `npx expo start` uma vez: os tipos de rota são
gerados pelo Metro em `.expo/types/`, e sem isso o `tsc` valida contra a lista antiga.

Verificações:

```sh
npx tsc --noEmit                  # tipos
npx expo lint                     # lint (inclui as regras do React Compiler)
npm test                          # parser de tags, LRC e busca
```

## Fonte da verdade do design

O protótipo em
`Offline Music Player App-handoff/offline-music-player-app/project/Resonate - Offline Player.dc.html`
é a fonte da verdade visual. Ele é um HTML/CSS/JS do Claude Design com todos os estados
das telas e os valores exatos de tipografia, espaçamento e cor nos inline styles.
