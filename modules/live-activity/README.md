# live-activity

Live Activity do Resonate: o cartão de "tocando agora" na tela de bloqueio do iOS e as
três formas da Dynamic Island.

Só existe no **iOS 16.2+**. No Android e em iOS anterior, toda a API é no-op — o player
não depende dela para nada.

## O que já está pronto

| Arquivo | Papel |
|---|---|
| `index.ts` | API em TypeScript, com no-op fora do iOS |
| `ios/LiveActivityModule.swift` | ponte com o ActivityKit (criar, atualizar, encerrar) |
| `ios/ResonateActivityAttributes.swift` | contrato de dados, compartilhado app ↔ widget |
| `ios/ResonateLiveActivity.swift` | o desenho: cartão e as formas da ilha |
| `plugin/withLiveActivity.js` | `NSSupportsLiveActivities` no Info.plist |

## O passo que exige o Xcode

A extensão de widget precisa ser um **target** do projeto iOS, e criar um target novo
significa reescrever o `.pbxproj`. Não automatizei isso: um script errado corrompe o
projeto de um jeito difícil de desfazer, e este é um passo feito uma única vez.

Depois de `npx expo prebuild -p ios`, no Xcode:

1. **File → New → Target… → Widget Extension**. Nome: `ResonateWidget`. Desmarque
   "Include Live Activity" (o código já existe) e "Include Configuration App Intent".
2. No target novo, defina o **deployment target em iOS 16.2**.
3. Adicione ao target `ResonateWidget` os arquivos:
   - `ResonateLiveActivity.swift`
   - `ResonateActivityAttributes.swift`
4. `ResonateActivityAttributes.swift` precisa estar em **ambos** os targets — o app e o
   widget. Marque as duas caixas em *Target Membership*; sem isso o ActivityKit não
   consegue serializar o estado entre os dois lados.
5. No arquivo `ResonateWidgetBundle.swift` que o Xcode gerou, declare o widget:

   ```swift
   @main
   struct ResonateWidgetBundle: WidgetBundle {
     var body: some Widget { ResonateLiveActivity() }
   }
   ```

Depois disso, `npx expo run:ios` (ou EAS Build) compila os dois targets juntos.

## Capa na ilha

A extensão roda em outro processo e **não alcança o sandbox do app**, então o caminho da
capa que o app envia não abre do lado do widget. Hoje o widget cai num degradê na cor de
acento — a mesma linguagem das capas procedurais do app.

Para mostrar a capa real, os dois targets precisam de um **App Group** compartilhado, e
as capas passariam a ser gravadas no container do grupo em vez de em `Documents/`. É uma
mudança contida, mas mexe em onde a varredura escreve.

## Progresso contínuo

O estado é publicado em eventos — começar, pausar, retomar, trocar de faixa — e não a
cada quadro. Live Activities têm orçamento de atualizações, e atualizar a 5 Hz o
esgotaria em minutos.

Como consequência, a barra fica parada entre eventos. A forma correta de ter progresso
contínuo sem gastar atualizações é o `ProgressView(timerInterval:)` do SwiftUI, que anima
sozinho a partir de um intervalo de datas. Isso troca `elapsed`/`duration` no
`ContentState` por um par de `Date`, e é a evolução natural desta primeira versão.
