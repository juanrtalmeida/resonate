/**
 * Colapso da barra inferior por rolagem.
 *
 * O estado vive num shared value de módulo, não num contexto: a Chrome é um overlay
 * sobre o <Stack>, então as telas que rolam não são filhas dela e não há caminho de
 * contexto entre as duas.
 */

import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { makeMutable, withTiming } from 'react-native-reanimated';

/** 0 = barra inteira, 1 = só o item ativo e o player. */
export const chromeCollapsed = makeMutable(0);

/**
 * Quanto da barra se vê. 1 no normal, 0 com o Now Playing aberto.
 *
 * A barra fica **montada** enquanto o player está aberto, e é isso que resolve duas
 * coisas na saída: ela já está no lugar quando a capa pousa nela, e a capa de origem
 * continua escondida — `useZoomLaunch` guarda esse "escondido" em estado de componente,
 * então desmontar a barra ao abrir o player a devolvia visível, e o voo terminava
 * pousando em cima de uma capa idêntica.
 *
 * Montada não pode significar visível: no Android a barra desenha *por cima* da tela do
 * player, e mini player e player inteiro apareciam juntos. Quem apaga é esta opacidade,
 * dirigida pelo progresso do zoom do player — ela dissolve na entrada e volta exatamente
 * no ritmo em que a capa encolhe de volta para a pílula.
 */
export const chromeReveal = makeMutable(1);

/** O alvo, guardado à parte: `chromeCollapsed` no meio da animação vale 0.37. */
const target = makeMutable(0);
const lastY = makeMutable(0);

/** Perto do topo a barra volta inteira: não há o que economizar ali. */
const TOP = 12;
/** Rolagem mínima para trocar de estado. Sem isso o tremor do dedo pisca a barra. */
const STEP = 6;

/**
 * Worklet de propósito: a tela do artista já roda um handler de rolagem na thread de UI
 * para o parallax, e é ali que ela chama isto.
 */
export function chromeScrollTo(y: number) {
  'worklet';
  const dy = y - lastY.value;
  lastY.value = y;
  const next = y <= TOP ? 0 : dy > STEP ? 1 : dy < -STEP ? 0 : target.value;
  if (next === target.value) return;
  target.value = next;
  chromeCollapsed.value = withTiming(next, { duration: 260 });
}

/**
 * Barra inteira **agora**, sem animação.
 *
 * Usado antes de medir a origem de um voo de zoom. Recolhida, a barra abre um disco de 40
 * à esquerda do player e a capa mora 52 px mais à direita; medir naquele estado e pousar
 * depois de a barra ter aberto errava o alvo por esses 52 px. Assentar antes de medir faz
 * a origem já ser a posição final.
 */
export function chromeSettle() {
  target.value = 0;
  lastY.value = 0;
  chromeCollapsed.value = 0;
}

/** Barra inteira de novo — ao trocar de tela, ou quando o usuário toca no item ativo. */
export function chromeExpand() {
  target.value = 0;
  lastY.value = 0;
  chromeCollapsed.value = withTiming(0, { duration: 200 });
}

/** Última altura de conteúdo vista, para reconhecer quando ele encolhe. */
const lastContent = makeMutable(0);

/**
 * O conteúdo da lista mudou de tamanho.
 *
 * Encolher devolve a barra inteira. Recolher é gesto de rolagem, e uma tela que deixou de
 * ter o que rolar não tem como desfazer o gesto: era o que sumia com a barra para sempre
 * ao limpar uma busca — os resultados iam embora, sobrava o estado vazio, e não havia mais
 * rolagem nenhuma para pedir a barra de volta.
 *
 * Só no encolher. Lista virtualizada **cresce** enquanto se rola, e expandir a cada
 * crescimento anularia o recolhimento no meio de qualquer rolagem longa.
 */
export function chromeContent(height: number) {
  const before = lastContent.value;
  lastContent.value = height;
  if (height < before) chromeExpand();
}

/** Props de qualquer lista vertical: `<FlatList {...chromeScroll} />`. */
export const chromeScroll = {
  /*
    Quanto a lista mantém montado, medido em alturas de tela.

    O padrão do FlatList é 21 — dez telas acima da visível e dez abaixo. Com linha de
    faixa de 54 px são umas trezentas `TrackRow` montadas, e cada uma tem um
    `GestureDetector` nativo, dois shared values e um `useConfirm`. Isso não pesa enquanto
    se rola, porque nada muda; pesa na hora de trocar o conteúdo da lista, que desmonta
    todas de uma vez. Era a demora ao sair da aba de Faixas.

    Cinco é a tela visível mais duas de cada lado: rolagem rápida continua encontrando
    linha pronta, e o que se desmonta ao trocar de aba é um quarto do que era.

    Aqui, e não na tela da biblioteca: cada lista do app é feita da mesma linha caríssima,
    e todas passam por estas props. As duas valem só para lista virtualizada — os
    `ScrollView` que também usam este objeto as ignoram. `initialNumToRender` fica no
    padrão de propósito: baixá-lo atrasaria o primeiro quadro de toda lista para ganhar
    numa troca de aba que ainda não aconteceu.
  */
  windowSize: 5,
  maxToRenderPerBatch: 8,
  // 30 Hz basta para decidir mostrar ou esconder; 60 acordava a thread de JS o dobro.
  scrollEventThrottle: 32,
  // A barra de rolagem do sistema não combina com nada aqui, e some das listas todas de
  // uma vez porque todas passam por estas props.
  showsVerticalScrollIndicator: false,
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    chromeScrollTo(e.nativeEvent.contentOffset.y),
  onContentSizeChange: (_width: number, height: number) => chromeContent(height),
};
