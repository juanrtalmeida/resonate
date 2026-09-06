/**
 * Transição no estilo do Music da Apple: a **capa** viaja do lugar onde foi tocada até o
 * lugar dela na tela nova, e o resto da tela aparece em fade em volta dela.
 *
 * A versão anterior escalava a tela inteira até o retângulo de origem. Com o mini player
 * — largo e baixo — isso espremia a tela; e mesmo com escala uniforme o efeito é de uma
 * janela crescendo, não de um objeto que se move. Quem se move aqui é só a capa.
 *
 * Feita à mão de propósito: as shared element transitions do Reanimated 4 continuam
 * marcadas como experimentais, exigem feature flag e têm problemas de posicionamento
 * vertical no iOS.
 *
 * Este arquivo escreve em shared values a partir de handlers e de worklets de gesto — o
 * contrato do Reanimated. A regra de imutabilidade do React Compiler não modela isso, e
 * suprimi-la linha a linha era instável: com uma escrita silenciada, ela passava a
 * apontar a seguinte.
 */
/* eslint-disable react-hooks/immutability */

import { useRouter } from 'expo-router';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { BackHandler, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  measure,
  runOnJS,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/** Retângulo de origem, em coordenadas de janela. */
export type Rect = { x: number; y: number; width: number; height: number; radius: number };

const OPEN = { duration: 420, easing: Easing.bezier(0.2, 0.9, 0.2, 1) };
const CLOSE = { duration: 300, easing: Easing.bezier(0.35, 0, 0.3, 1) };

/**
 * A origem vive num módulo, não em estado do React.
 *
 * Com um contexto, gravar a origem e navegar caíam no mesmo lote de atualização e a tela
 * nova montava lendo o valor antigo — quase sempre nulo, o que derrubava tudo no fallback
 * de fade. Uma variável de módulo já está escrita no primeiro render da tela nova.
 */
let pending: Rect | null = null;

function takeOrigin(): Rect | null {
  const rect = pending;
  pending = null;
  return rect;
}

/**
 * Mede o elemento que deve parecer viajar — a **capa**, não o cartão inteiro — e navega.
 */
export function useZoomLaunch(radius: number) {
  const ref = useRef<View>(null);

  const launch = useCallback(
    (go: () => void) => {
      const node = ref.current;
      if (!node) {
        pending = null;
        return go();
      }
      node.measureInWindow((x, y, width, height) => {
        pending = width > 0 && height > 0 ? { x, y, width, height, radius } : null;
        go();
      });
    },
    [radius]
  );

  return { ref, launch };
}

type Zoom = {
  progress: SharedValue<number>;
  from: Rect | null;
  close: () => void;
};

const Ctx = createContext<Zoom | null>(null);

/** Envolve a tela de destino. O fundo entra em fade; a capa é animada por `ZoomTarget`. */
export function ZoomScreen({
  children,
  background,
  style,
  onClosed,
  dismissable = false,
  edgeBack = false,
}: {
  children: ReactNode;
  /**
   * Cor de fundo da tela. Passada aqui, e não no `style`, porque ela precisa entrar e
   * sair em fade junto com o resto: um fundo sólido no container aparecia de uma vez ao
   * abrir e continuava opaco até a capa terminar de voltar.
   */
  background?: string;
  style?: ViewStyle;
  /** Chamado depois da saída; o padrão é voltar uma rota. */
  onClosed?: () => void;
  /** Permite arrastar para baixo para minimizar, como no Music. */
  dismissable?: boolean;
  /**
   * Arrastar da borda esquerda para a direita volta.
   *
   * Nas telas de lista o arrasto para baixo não serve: ele disputa com a rolagem, e
   * decidir entre um e outro exige saber a posição do scroll. A borda esquerda não
   * disputa com nada e é o gesto que o usuário já espera.
   */
  edgeBack?: boolean;
}) {
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const [from] = useState(takeOrigin);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, OPEN);
  }, [progress]);

  const finish = useCallback(() => {
    (onClosed ?? router.back)();
  }, [onClosed, router]);

  // Shared value, não ref: este guard é lido dentro dos worklets do gesto, que rodam na
  // thread de UI e não enxergam refs do JavaScript.
  const closing = useSharedValue(false);
  const close = useCallback(() => {
    if (closing.value) return;
    closing.value = true;
    progress.value = withTiming(0, CLOSE, (done) => {
      if (done) runOnJS(finish)();
    });
  }, [progress, closing, finish]);

  /**
   * O botão de voltar do Android fecha pela mesma animação. Sem isto ele desmontava a
   * tela de uma vez, e a capa sumia em vez de voltar para o lugar de onde saiu.
   */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]);

  /** Arrasto da borda esquerda. Mesmo `progress`, dirigido pela distância horizontal. */
  const edge = Gesture.Pan()
    .activeOffsetX([-9999, 12])
    .onUpdate((e) => {
      if (closing.value || e.translationX <= 0) return;
      progress.value = Math.max(0, 1 - e.translationX / (width * 0.6));
    })
    .onEnd((e) => {
      if (closing.value) return;
      const leave = e.translationX > width * 0.25 || e.velocityX > 800;
      if (!leave) {
        progress.value = withTiming(1, OPEN);
        return;
      }
      closing.value = true;
      progress.value = withTiming(0, CLOSE, (done) => {
        if (done) runOnJS(finish)();
      });
    });

  /**
   * Arrastar para baixo controla a animação com o dedo: o mesmo `progress` que a abertura
   * usa, agora dirigido pela distância percorrida. Soltar decide entre completar o
   * fechamento ou voltar ao topo.
   */
  const drag = Gesture.Pan()
    // Só reage a um movimento claramente vertical; desiste se o dedo for para os lados,
    // que é o gesto de trocar de faixa na capa.
    .activeOffsetY([-9999, 24])
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      if (closing.value || e.translationY <= 0) return;
      progress.value = Math.max(0, 1 - e.translationY / height);
    })
    .onEnd((e) => {
      if (closing.value) return;
      const leave = e.translationY > height * 0.2 || e.velocityY > 900;
      if (!leave) {
          progress.value = withTiming(1, OPEN);
        return;
      }
      closing.value = true;
      progress.value = withTiming(0, CLOSE, (done) => {
        if (done) runOnJS(finish)();
      });
    });

  // O fade NÃO envolve tudo: opacidade no container atingiria também a capa, e ela é
  // justamente o que deve permanecer sólido enquanto viaja. O fundo ganha a própria
  // camada esmaecível; o resto usa ZoomFade.
  const body = (
    <View style={[{ flex: 1 }, style]}>
      {background ? (
        <ZoomFade style={{ position: 'absolute', inset: 0, backgroundColor: background }} />
      ) : null}
      {children}
      {edgeBack ? (
        <GestureDetector gesture={edge}>
          {/* Acima da capa em voo, que usa zIndex 10. */}
          <View
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 24, zIndex: 20 }}
          />
        </GestureDetector>
      ) : null}
    </View>
  );

  return (
    <Ctx value={{ progress, from, close }}>
      {dismissable ? <GestureDetector gesture={drag}>{body}</GestureDetector> : body}
    </Ctx>
  );
}

/**
 * Esmaece o que não é a capa: aparece depois dela começar a viajar e some antes dela
 * chegar de volta, o que dá a impressão de que a capa carrega a tela consigo.
 */
export function ZoomFade({
  children,
  style,
  pointerEvents,
}: {
  children?: ReactNode;
  style?: ViewStyle;
  /** Repassado à View: a barra do topo precisa deixar a lista receber os toques. */
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}) {
  const zoom = use(Ctx);
  const progress = zoom?.progress;
  const from = zoom?.from ?? null;

  const fade = useAnimatedStyle(() => {
    if (!progress) return { opacity: 1 };
    return {
      opacity: from ? interpolate(progress.value, [0, 0.35, 1], [0, 0.15, 1]) : progress.value,
    };
  });

  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, fade]}>
      {children}
    </Animated.View>
  );
}

/**
 * Envolve a capa na tela de destino. Ela nasce no retângulo de origem e desliza até o
 * lugar que o layout lhe deu: a técnica é medir o destino e aplicar a transformação
 * inversa, animando-a até a identidade. Assim não existe uma segunda cópia da capa.
 */
export function ZoomTarget({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const zoom = use(Ctx);
  const ref = useAnimatedRef<View>();

  /**
   * Retângulo de destino, medido na thread de UI no primeiro frame em que a view já tem
   * layout — e guardado depois disso.
   *
   * Antes era `measureInWindow` mais `useState`: um pulo até o nativo e outro de volta,
   * seguidos de um re-render da tela inteira, tudo no meio da animação de entrada. Até a
   * medida chegar, este estilo não devolvia transformação nenhuma e a capa ficava parada
   * no lugar final; com a thread de JS ocupada montando a lista da tela nova, a medida
   * chegava tarde e a capa entrava de supetão perto do fim. Na thread de UI a medida sai
   * no frame seguinte e não acorda o React.
   */
  const to = useSharedValue<{ x: number; y: number; width: number; height: number } | null>(
    null
  );

  const from = zoom?.from ?? null;
  const progress = zoom?.progress;

  const flight = useAnimatedStyle(() => {
    if (!from || !progress) return { opacity: 1 };

    if (!to.value) {
      const m = measure(ref);
      // Null enquanto a view ainda não foi posicionada: tenta de novo no próximo frame.
      if (m && m.width > 0 && m.height > 0) {
        to.value = { x: m.pageX, y: m.pageY, width: m.width, height: m.height };
      }
    }
    const dest = to.value;
    if (!dest) return { opacity: 1 };

    const p = progress.value;
    const scale = from.width / dest.width;
    // Alinha os centros: a capa não muda de forma, só de tamanho e de lugar.
    const dx = from.x + from.width / 2 - (dest.x + dest.width / 2);
    const dy = from.y + from.height / 2 - (dest.y + dest.height / 2);
    return {
      opacity: 1,
      transform: [
        { translateX: interpolate(p, [0, 1], [dx, 0]) },
        { translateY: interpolate(p, [0, 1], [dy, 0]) },
        { scale: interpolate(p, [0, 1], [scale, 1]) },
      ],
    };
  });

  return (
    <Animated.View
      ref={ref}
      collapsable={false}
      // Acima do resto: enquanto viaja, a capa passa por cima do conteúdo da tela nova.
      style={[{ zIndex: 10 }, style, flight]}>
      {children}
    </Animated.View>
  );
}

/** Sai da tela com a animação inversa. Fora de um ZoomScreen, só volta a rota. */
export function useZoomClose(): () => void {
  const zoom = use(Ctx);
  const router = useRouter();
  return zoom?.close ?? (() => router.back());
}
