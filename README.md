# Resonate

Player de música **offline** para Android e iOS. Lê os arquivos de áudio que já estão no
aparelho, monta a biblioteca a partir das tags e toca com controles nativos de tela de
bloqueio. Sem streaming, sem login, sem rede.

Expo SDK 57 · React Native 0.86 · TypeScript strict.

## Rodar

O app usa módulos nativos de áudio e de biblioteca de mídia — **não roda no Expo Go**.

```sh
npm install
npx expo run:android   # ou: npx expo run:ios
```

## Verificar

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # inclui as regras do React Compiler
npm test            # parser de tags e de duração, em Node
```

## Estrutura

```
src/app/         rotas (expo-router, file-based)
src/components/  peças de interface
src/lib/         tags, varredura, reprodução, estado, transições
src/constants/   tokens do design
docs/            contexto, arquitetura, decisões
```

## Documentação

A pasta [`docs/`](docs/README.md) traz o contexto do produto, a arquitetura, o registro de
decisões técnicas com o porquê de cada uma, a referência do leitor de tags, o design
system e as diferenças entre Android e iOS.

O design é dark fixo. A fonte da verdade visual é o protótipo em
`Offline Music Player App-handoff/offline-music-player-app/project/Resonate - Offline Player.dc.html`.
