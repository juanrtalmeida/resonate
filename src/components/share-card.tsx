/**
 * O card de compartilhamento, e o gancho que o captura sem pôr nada na frente do usuário.
 *
 * Não existe tela de pré-visualização: pedir para compartilhar já compartilha. A versão
 * anterior mostrava o card numa folha com dois botões, e era um toque a mais para dizer
 * a mesma coisa que o menu já tinha dito.
 *
 * A folha existia por um motivo técnico, que continua valendo: capturar antes de a capa
 * carregar sai com a arte procedural no lugar dela. Resolvido sem UI — o card é montado
 * *fora da tela* e a captura só dispara quando o layout terminou **e** a capa chegou
 * (ou falhou). `onCoverSettled` no AlbumArt é o segundo sinal.
 *
 * O card mora sempre em 360x640 de layout — proporção de Stories. Fora da tela, e não
 * escondido por opacidade: no Android um `opacity: 0` sai transparente na captura.
 */

import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import { R, T, alpha } from '@/constants/theme';
import { artGradient, type Artwork } from '@/lib/artwork';
import { usePrefs } from '@/lib/prefs';
import { CARD_HEIGHT, CARD_WIDTH, shareCard, type ShareTarget } from '@/lib/share';
import { AlbumArt } from './album-art';
import { Wordmark } from './logo';
import { Body, Display, Mono } from './text';

/** Recuo do card até a caixa, e da caixa até o conteúdo dela. */
const MARGIN = 26;
const INSET = 20;

/** O que está sendo compartilhado. */
export type Shareable = {
  title: string;
  subtitle: string;
  /** Terceira linha, em mono. O álbum de uma faixa, a contagem de uma lista. */
  detail?: string;
  cover: string | null;
  art: Artwork;
};

/**
 * Devolve o disparador e o elemento a renderizar, no mesmo contrato de `usePlaylistSheet`
 * e `useItemMenu`.
 *
 * `share()` é o fim do caminho: quem chama não precisa saber que existe uma View sendo
 * montada e capturada no meio.
 */
export function useShareCard() {
  const { accent } = usePrefs();
  const [job, setJob] = useState<{ item: Shareable; target: ShareTarget } | null>(null);
  const card = useRef<View>(null);
  const sticker = useRef<View>(null);
  const busy = useRef(false);

  const fire = useCallback(async (item: Shareable, target: ShareTarget) => {
    // Trava síncrona: dois `onReady` no mesmo quadro capturariam duas vezes.
    if (busy.current) return;
    busy.current = true;
    try {
      await shareCard({
        card,
        sticker,
        target,
        title: item.title,
        // O gradiente do Stories sai das mesmas duas cores do fundo do card: a clara da
        // arte em cima, a escura embaixo. Assim a etiqueta pousa sobre o que já era o
        // fundo dela.
        top: item.art.a,
        bottom: item.art.c,
      });
    } finally {
      busy.current = false;
      setJob(null);
    }
  }, []);

  return {
    share: (item: Shareable, target: ShareTarget) => {
      if (!busy.current) setJob({ item, target });
    },
    card: job ? (
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: -CARD_WIDTH * 2, top: 0 }}>
        <ShareCard
          ref={card}
          stickerRef={sticker}
          item={job.item}
          accent={accent}
          onReady={() => void fire(job.item, job.target)}
        />
      </View>
    ) : null,
  };
}

/**
 * O card em si. Tamanho fixo de propósito: é um arquivo, não uma tela, e nada aqui pode
 * depender da largura do aparelho de quem compartilha.
 */
function ShareCard({
  ref,
  stickerRef,
  item,
  accent,
  onReady,
}: {
  ref: React.RefObject<View | null>;
  /**
   * A caixa, para o Stories capturar só ela.
   *
   * Não é uma segunda árvore: é a mesma caixa que o card mostra. Capturada sozinha, o que
   * está fora dos cantos arredondados sai transparente — que é exatamente o que uma
   * etiqueta precisa ser.
   */
  stickerRef: React.RefObject<View | null>;
  item: Shareable;
  accent: string;
  /** Chamado uma vez, quando o card está pronto para ser capturado. */
  onReady: () => void;
}) {
  const art = item.art;
  /** A capa mede pela caixa, não pelo card: é ela que manda no recuo interno. */
  const cover = CARD_WIDTH - 2 * MARGIN - 2 * INSET;

  /*
    Dois sinais, e a captura espera os dois: o layout, porque uma View sem medida sai em
    branco, e a capa, porque sem ela sai a arte procedural. Refs e não estado — nada disto
    precisa de um novo render.
  */
  const laid = useRef(false);
  const covered = useRef(!item.cover);
  const fired = useRef(false);
  const check = () => {
    if (fired.current || !laid.current || !covered.current) return;
    fired.current = true;
    onReady();
  };

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={() => {
        laid.current = true;
        check();
      }}
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: art.c,
        paddingHorizontal: MARGIN,
        justifyContent: 'center',
      }}>
      {/* A mesma linguagem de gradiente das capas, no tamanho do card. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.62,
          experimental_backgroundImage: artGradient(art),
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          inset: 0,
          experimental_backgroundImage:
            `radial-gradient(120% 62% at 50% 0%, ${alpha(accent, 0.3)} 0%, transparent 60%),` +
            `linear-gradient(180deg, transparent 38%, ${alpha('#0B0A09', 0.72)} 100%)`,
        }}
      />

      {/*
        Uma caixa só, e tudo dentro dela — logotipo incluído.

        Antes a assinatura ficava absoluta no pé do card, a meia tela da capa: lida como
        uma coisa solta, não como a assinatura daquele bloco. Aqui capa, nome e marca são
        um objeto, e o gradiente do fundo é o que sobra em volta.
      */}
      <View
        ref={stickerRef}
        collapsable={false}
        style={{
          alignItems: 'center',
          padding: INSET,
          borderRadius: R.r26,
          backgroundColor: alpha('#0B0A09', 0.42),
          borderWidth: 1,
          borderColor: T.t08,
        }}>
        <AlbumArt
          art={art}
          size={cover}
          radius={22}
          cover={item.cover}
          onCoverSettled={() => {
            covered.current = true;
            check();
          }}
        />
        <Display
          size={23}
          tracking={-0.035}
          align="center"
          numberOfLines={2}
          style={{ marginTop: 20 }}>
          {item.title}
        </Display>
        <Body
          size={13.5}
          weight={500}
          color={T.t72}
          align="center"
          numberOfLines={1}
          style={{ marginTop: 5 }}>
          {item.subtitle}
        </Body>
        {item.detail ? (
          <Mono
            size={9}
            weight={500}
            tracking={0.16}
            caps
            color={T.t42}
            align="center"
            numberOfLines={1}
            style={{ marginTop: 9 }}>
            {item.detail}
          </Mono>
        ) : null}

        {/* Assinatura: o logotipo, e não o nome escrito — é o card que sai do app. Um
            respiro maior que o das linhas de cima, senão ele lê como mais um metadado. */}
        <View style={{ marginTop: 20 }}>
          <Wordmark size={16} />
        </View>
      </View>
    </View>
  );
}
