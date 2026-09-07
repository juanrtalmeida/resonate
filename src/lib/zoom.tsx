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

/**
 * Como devolver a origem à tela depois do voo.
 *
 * Enquanto a capa viaja, o elemento de onde ela saiu tem de sumir: com ele no lugar, o
 * que se vê no fim é uma imagem pousando em cima de outra igual, e não uma voltando para
 * casa. Quem esconde é o próprio `useZoomLaunch`; quem devolve é a tela de destino, no
 * quadro em que a animação termina.
 */
let pendingRelease: (() => void) | null = null;

function takeOrigin(): Rect | null {
  const rect = pending;
  pending = null;
  return rect;
}

function takeRelease(): (() => void) | null {
  const release = pendingRelease;
  pendingRelease = null;
  return release;
}

/**
 * Mede o elemento que deve parecer viajar — a **capa**, não o cartão inteiro — e navega.
 */
export function useZoomLaunch(radius: number) {
  const ref = useRef<View>(null);
  const [hidden, setHidden] = useState(false);

  const launch = useCallback(
    (go: () => void) => {
      const node = ref.current;
      if (!node) {
        pending = null;
        pendingRelease = null;
        return go();
      }
      node.measureInWindow((x, y, width, height) => {
        const measured = width > 0 && height > 0;
        pending = measured ? { x, y, width, height, radius } : null;
        if (measured) {
          setHidden(true);
          pendingRelease = () => setHidden(false);
        } else {
          pendingRelease = null;
        }
        go();
      });
    },
    [radius]
  );

  // `style` vai no mesmo elemento do `ref`: é ele que sai de cena enquanto a capa voa.
  return { ref, launch, style: hidden ? HIDDEN : undefined };
}

const HIDDEN = { opacity: 0 } as const;

type Zoom = {
  progress: SharedValue<number>;
  from: Rect | null;
  close: () => void;
  /**
   * Contador de invalidação da medida de destino. Sobe quando o fechamento começa, e é
   * o sinal para o ZoomTarget medir de novo onde ele está *agora*.
   */
  stale: SharedValue<number>;
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
  const [release] = useState(takeRelease);
  const progress = useSharedValue(0);
  const stale = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, OPEN);
  }, [progress]);

  const finish = useCallback(() => {
    // A origem volta no mesmo quadro em que a capa chega nela.
    release?.();
    (onClosed ?? router.back)();
  }, [onClosed, router, release]);

  // Rede de segurança: sair por qualquer outro caminho não pode deixar a origem apagada.
  useEffect(() => () => release?.(), [release]);

  // Shared value, não ref: este guard é lido dentro dos worklets do gesto, que rodam na
  // thread de UI e não enxergam refs do JavaScript.
  const closing = useSharedValue(false);
  const close = useCallback(() => {
    if (closing.value) return;
    closing.value = true;
    // Mede de novo antes de descer: entre abrir e fechar a lista rolou, o parallax andou,
    // e a capa precisa voltar do lugar onde ela está agora.
    stale.value += 1;
    progress.value = withTiming(0, CLOSE, (done) => {
      if (done) runOnJS(finish)();
    });
  }, [progress, closing, finish, stale]);

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
    .onBegin(() => {
      stale.value += 1;
    })
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
    .onBegin(() => {
      stale.value += 1;
    })
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
    <Ctx value={{ progress, from, close, stale }}>
      {dismissable ? <GestureDetector gesture={drag}>{body}</GestureDetector> : body}
    </Ctx>
  );
}

/**
 * Esmaece o que não é a capa: aparece depois dela começar a viajar e some antes dela
 * chegar de volta, o que dá a impressão de que a capa carrega a tela consigo.
 *
 * A curva vai a zero na metade do percurso, não perto do fim. Saindo, isso descobre a
 * tela de trás enquanto a capa ainda está voando — a última metade da animação é só a
 * capa voltando para o lugar dela, sobre a tela anterior já visível. Com o fundo
 * segurando opacidade até os 85%, a tela de baixo aparecia de uma vez no fim e a
 * animação parecia ter travado antes de terminar.
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
      opacity: from ? interpolate(progress.value, [0, 0.5, 1], [0, 0, 1]) : progress.value,
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
  radius = 0,
}: {
  children: ReactNode;
  style?: ViewStyle;
  /**
   * Cantos que a capa tem aqui, no destino. A origem traz os dela em `from.radius`, e a
   * forma é interpolada entre as duas: sem isto, a bolinha do artista virava um quadrado
   * no primeiro quadro do voo, e voltava quadrada para o lugar de uma bola.
   */
  radius?: number;
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
  const stale = zoom?.stale;
  /** Qual invalidação já foi atendida. */
  const seen = useSharedValue(0);

  const flight = useAnimatedStyle(() => {
    if (!from || !progress) return { opacity: 1 };

    // O destino não fica parado: a lista rola, o hero do artista tem parallax. Quando o
    // fechamento pede, a medida é refeita — e é refeita com a tela ainda aberta, quando a
    // transformação é a identidade e o que se mede é o lugar de verdade.
    if (stale && seen.value !== stale.value) {
      seen.value = stale.value;
      to.value = null;
    }

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
    // Alinha os centros: a capa muda de tamanho, de lugar e de forma.
    const dx = from.x + from.width / 2 - (dest.x + dest.width / 2);
    const dy = from.y + from.height / 2 - (dest.y + dest.height / 2);
    return {
      opacity: 1,
      // Dividido pela escala porque o raio é desenhado antes de a view ser escalada:
      // para *parecer* o raio da origem, o valor aqui precisa ser maior na mesma medida.
      borderRadius: interpolate(p, [0, 1], [from.radius / scale, radius]),
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
      // `overflow: hidden` é o que faz o raio animado recortar o que está dentro.
      style={[{ zIndex: 10, overflow: 'hidden' }, style, flight]}>
      {children}
    </Animated.View>
  );
}

/**
 * O progresso da tela em volta, para quem precisa desfazer um efeito próprio enquanto ela
 * fecha — o parallax do hero do artista, por exemplo, que senão voa distorcido.
 */
export function useZoomProgress(): SharedValue<number> | null {
  return use(Ctx)?.progress ?? null;
}

/** Sai da tela com a animação inversa. Fora de um ZoomScreen, só volta a rota. */
export function useZoomClose(): () => void {
  const zoom = use(Ctx);
  const router = useRouter();
  return zoom?.close ?? (() => router.back());
}
