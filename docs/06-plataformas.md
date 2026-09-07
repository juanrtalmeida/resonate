---
projeto: Resonate
tipo: referência-técnica
tags: [android, ios, permissoes, medialibrary, saf, sandbox, app-json, build]
atualizado: 2026-09-06
---

# Android e iOS no Resonate

Resonate é o player de música offline descrito em `01-contexto.md`. Ele roda nas duas
plataformas, mas a pergunta "onde estão os arquivos de música?" tem respostas
incompatíveis em cada uma. Todo o resto do app é idêntico.

## A divergência central

O protótipo assume o modelo Android: navegar `/storage/emulated/0`, cartão SD, notificação
Material. iOS é sandboxed e não tem árvore de arquivos navegável. Além disso, o
`expo-media-library` no iOS trabalha sobre `PHAsset`, a biblioteca de Fotos — onde áudio
praticamente não existe.

| | Android | iOS |
|---|---|---|
| Fonte dos arquivos | `expo-media-library` (MediaStore) | pasta Documents do app |
| Como o usuário adiciona | já estão no aparelho | importa pelo app ou arrasta no Files |
| Permissão | `READ_MEDIA_AUDIO` | nenhuma |
| Onboarding mostra | lista de pastas com contagem + "Procurar no armazenamento…" | botão "Importar arquivos" + o que já foi importado |
| Letra em `.lrc` ao lado | não legível (só mídia) | legível |
| Duração das faixas | vem do MediaStore | derivada do cabeçalho do arquivo |

Uma interface única em `src/lib/sources.ts` isola isso:

```ts
listAudioFiles(refresh?, granted?): Promise<AudioFile[]>  // { uri, name, folder, duration }
foldersOf(files): Folder[]                                // agrupa por diretório pai
ensureAccess(): Promise<boolean>
importFiles(): Promise<number>                            // só faz sentido no iOS
pickFolder(): Promise<string | null>                      // SAF, só faz sentido no Android
canBrowseFolders: boolean                                 // true no Android
```

## Android

`new Query().eq(AssetField.MEDIA_TYPE, MediaType.AUDIO).exe()` devolve os assets; cada um
responde `getInfo()` com `uri`, `filename` e `duration`. As "pastas" do onboarding saem
de agrupar os `uri` pelo diretório pai, sem SAF nenhum.

`getInfo()` é uma travessia da ponte nativa por arquivo. Num aparelho cheio a listagem
leva alguns segundos, então ela roda em lotes de 100 e o resultado é cacheado entre o
onboarding e a varredura. O onboarding força a releitura (`listAudioFiles(true, granted)`).

### Teclado e edge-to-edge

`android:windowSoftInputMode="adjustResize"` está no manifesto e não vale mais nada: o
build mira o SDK 35+, onde o edge-to-edge é obrigatório e a janela deixa de encolher
quando o teclado sobe. Vale igual para a janela de `Modal` — o React Native lê
`statusBarTranslucent` e `navigationBarTranslucent` como ligados quando a flag está on,
então não há prop que traga o encolhimento de volta.

Quem cobre o buraco é `useKeyboardOverlap()` (`src/lib/keyboard.ts`): devolve quanto do
fundo da tela o teclado ocupa, já normalizado entre as plataformas — o evento do Android
desconta a barra de navegação, o do iOS não. Toda tela que junta campo e listagem reserva
esse espaço no `paddingBottom`, e a `Sheet` sobe com mola por esse tanto.

### Pastas fora da mídia indexada

O MediaStore não indexa tudo. Para incluir uma pasta que ele ignora, o onboarding oferece
"Procurar no armazenamento…", que abre o seletor do sistema
(`Directory.pickDirectoryAsync()`). A pasta concedida fica em `prefs.granted` e é
percorrida recursivamente a cada varredura, além do MediaStore.

Não existe navegar `/storage/emulated/0` como o protótipo desenha: no Android moderno
esse acesso passa obrigatoriamente pelo SAF, e quem desenha a árvore é o sistema.

**URIs `content://` são seguras.** `FileMode.ReadOnly` funciona com elas — a restrição
documentada no `expo-file-system` vale só para `FileMode.ReadWrite`. Então o leitor de
tags lê tanto arquivos do SAF quanto do MediaStore, venha a URI como `file://` ou
`content://`.

## iOS

A pasta Documents do app é exposta ao app Arquivos por `UIFileSharingEnabled` e
`LSSupportsOpeningDocumentsInPlace` — é o que VLC e Doppler fazem. A varredura é
`new Directory(Paths.document).list()` recursivo, filtrando por extensão.

`importFiles()` usa `File.pickFileAsync({ multipleFiles: true, mimeTypes: ['audio/*'] })`
e **copia** o que foi escolhido para Documents. Copiar é necessário: arquivos fora do
sandbox não continuam acessíveis depois que o seletor fecha.

## Configuração (`app.json`)

```jsonc
{
  "userInterfaceStyle": "dark",          // o app é dark fixo
  "backgroundColor": "#0B0A09",
  "ios": {
    "infoPlist": {
      "UIFileSharingEnabled": true,
      "LSSupportsOpeningDocumentsInPlace": true
    }
  },
  "plugins": [
    ["expo-audio", {
      "enableBackgroundPlayback": true,
      "enableBackgroundRecording": false,
      "recordAudioAndroid": false,       // um player não grava
      "microphonePermission": false      // e não pede microfone no iOS
    }],
    ["expo-media-library", {
      "granularPermissions": ["audio"],  // só READ_MEDIA_AUDIO no manifesto
      "photosPermission": false,         // sem pedir acesso a Fotos no iOS
      "savePhotosPermission": false,
      "isAccessMediaLocationEnabled": false
    }]
  ],
  "experiments": { "typedRoutes": true, "reactCompiler": true }
}
```

`granularPermissions: ["audio"]` faz o plugin escrever `READ_MEDIA_AUDIO` no manifesto —
não é preciso declarar a permissão à mão em `android.permissions`.

## Permissões em tempo de execução

- **Android, acesso a áudio**: `requestPermissionsAsync(false, ['audio'])`, pedido no
  onboarding. Negado, a tela oferece tentar de novo.
- **Android, notificações**: `requestNotificationPermissionsAsync()`, pedido na montagem
  do `PlayerProvider`. Sem `POST_NOTIFICATIONS` o Android não mostra os controles de
  mídia — e sem os controles, encerra a reprodução em segundo plano.
- **iOS**: nenhuma. A pasta Documents é do próprio app.

## Sessão de áudio

Configurada uma vez, na montagem do `PlayerProvider`:

```ts
setAudioModeAsync({
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: 'doNotMix',
});
```

## Build

Módulos nativos exigem development build. `npx expo run:android` ou `npx expo run:ios`.
Expo Go não tem `expo-audio` nem `expo-media-library`.

## Roteiro de verificação no aparelho

O que só se confirma com arquivos reais:

1. **Android**: colocar arquivos `.mp3`, `.flac` e `.m4a` em
   `/sdcard/Music/<Artista>/<Álbum>/`, abrir o app, conceder o acesso, conferir que o
   onboarding lista `Music` com a contagem certa, varrer, e verificar que os títulos vêm
   das tags e não dos nomes de arquivo.
2. **iOS**: arrastar os mesmos arquivos para a pasta Resonate no app Arquivos e conferir
   que a varredura os encontra, com duração.
3. Tocar uma faixa, bloquear o aparelho, conferir que os controles do sistema aparecem com
   título, artista e álbum, e que o áudio continua por mais de três minutos em segundo
   plano — essa é a regressão específica do Android.
4. Trocar de faixa por gesto na capa, buscar pela fita, alternar os três tratamentos e as
   quatro cores de acento em Ajustes.
5. Abrir um álbum pela grade e o Now Playing pelo mini player, conferindo que as duas
   telas crescem do elemento tocado e encolhem de volta pelo botão de voltar.
6. Matar e reabrir o app: vai direto para a biblioteca, sem varrer de novo, e a fila
   continua onde parou.
7. Segurar uma faixa, criar uma lista, conferir que ela sobrevive a uma nova varredura.
8. **Android**: usar "Procurar no armazenamento…" numa pasta fora de `Music/`, varrer e
   conferir que as faixas dali entram — e que continuam entrando depois de reabrir o app
   (é aqui que se vê se a concessão do SAF persiste).
