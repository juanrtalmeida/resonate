/**
 * O card de compartilhamento e a folha que o mostra antes de sair.
 *
 * A pré-visualização existe por dois motivos, e o segundo é técnico: o usuário vê
 * exatamente o arquivo que vai sair, e a captura só acontece com o card montado e a capa
 * já carregada. Capturar uma View fora da tela funciona, mas depender de a imagem ter
 * chegado é o tipo de corrida que falha no aparelho de outra pessoa.
 *
 * O card mora sempre em 360x640 de layout — proporção de Stories. A folha o encolhe com
 * `transform: scale`, que não mexe no layout: a captura continua saindo do tamanho
 * inteiro, e daí para 1080x1920.
 */

import { useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { C, R, T, alpha } from '@/constants/theme';
import { artGradient, type Artwork } from '@/lib/artwork';
import { usePrefs } from '@/lib/prefs';
import { CARD_HEIGHT, CARD_WIDTH, canShareToStories, shareCard } from '@/lib/share';
import { AlbumArt } from './album-art';
import { Instagram, Share as ShareIcon } from './icons';
import { Wordmark } from './logo';
import { Sheet } from './sheet';
import { Body, Display, Mono } from './text';

/** O que está sendo compartilhado. A etiqueta do topo do card sai daqui. */
export type Shareable = {
  /** "Faixa", "Álbum", "Artista", "Lista" — em caixa alta no card. */
  kind: string;
  title: string;
  subtitle: string;
  /** Terceira linha, em mono. O álbum de uma faixa, a contagem de uma lista. */
  detail?: string;
  cover: string | null;
  art: Artwork;
};

export function ShareSheet({
  visible,
  item,
  onClose,
}: {
  visible: boolean;
  item: Shareable | null;
  onClose: () => void;
}) {
  const { accent } = usePrefs();
  const card = useRef<View>(null);
  const [sending, setSending] = useState(false);

  const send = async (target: 'sheet' | 'stories') => {
    if (sending) return;
    setSending(true);
    try {
      await shareCard(card, target, `${item?.title ?? ''}`);
    } finally {
      setSending(false);
      onClose();
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Compartilhar">
      {item && (
        <>
          <Preview>
            <ShareCard ref={card} item={item} accent={accent} />
          </Preview>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            {canShareToStories && (
              <Action
                label="Stories"
                accent={accent}
                filled
                disabled={sending}
                onPress={() => void send('stories')}>
                <Instagram size={17} color={C.onAccent} />
              </Action>
            )}
            <Action
              label="Compartilhar"
              accent={accent}
              disabled={sending}
              onPress={() => void send('sheet')}>
              <ShareIcon size={17} color={T.full} />
            </Action>
          </View>
        </>
      )}
    </Sheet>
  );
}

/**
 * Encolhe o card para caber na folha sem mudar o layout dele.
 *
 * A escala sai do menor dos dois limites, e não só da largura: um card 9:16 escalado pela
 * largura da folha fica com 562 de altura, e aí o cabeçalho da folha mais os botões
 * passavam do teto de 82% — os botões ficavam cortados fora da tela. `ROOM` é o que a
 * folha gasta em volta da pré-visualização.
 *
 * A altura da moldura é a do card já escalado; senão sobraria o vão dos 640 originais.
 */
const ROOM = 210;

function Preview({ children }: { children: React.ReactNode }) {
  const { height: screen } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const room = Math.max(160, screen * 0.82 - ROOM);
  const scale =
    width > 0 ? Math.min(1, width / CARD_WIDTH, room / CARD_HEIGHT) : 0;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ marginTop: 16, alignItems: 'center' }}>
      {scale > 0 && (
        <View
          style={{
            width: CARD_WIDTH * scale,
            height: CARD_HEIGHT * scale,
            borderRadius: R.r21,
            overflow: 'hidden',
          }}>
          <View style={{ transform: [{ scale }], transformOrigin: 'top left' }}>{children}</View>
        </View>
      )}
    </View>
  );
}

function Action({
  label,
  accent,
  filled = false,
  disabled,
  onPress,
  children,
}: {
  label: string;
  accent: string;
  filled?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        height: 50,
        borderRadius: R.r15,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: filled ? accent : alpha(accent, 0.08),
        borderWidth: filled ? 0 : 1,
        borderColor: alpha(accent, 0.45),
      }}>
      {children}
      <Body size={13.5} weight={600} color={filled ? C.onAccent : T.full}>
        {label}
      </Body>
    </Pressable>
  );
}

/**
 * O card em si. Tamanho fixo de propósito: é um arquivo, não uma tela, e nada aqui pode
 * depender da largura do aparelho de quem compartilha.
 */
function ShareCard({
  ref,
  item,
  accent,
}: {
  ref: React.RefObject<View | null>;
  item: Shareable;
  accent: string;
}) {
  const art = item.art;
  const cover = Math.round(CARD_WIDTH * 0.68);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: art.c,
        paddingHorizontal: 34,
        paddingTop: 54,
        paddingBottom: 38,
        justifyContent: 'space-between',
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

      <View style={{ alignItems: 'center' }}>
        <Mono size={9.5} weight={500} tracking={0.2} caps color={T.t62}>
          {item.kind}
        </Mono>
      </View>

      <View style={{ alignItems: 'center' }}>
        <AlbumArt art={art} size={cover} radius={26} cover={item.cover} />
        <Display size={27} tracking={-0.035} align="center" numberOfLines={2} style={{ marginTop: 30 }}>
          {item.title}
        </Display>
        <Body
          size={15}
          weight={500}
          color={T.t72}
          align="center"
          numberOfLines={1}
          style={{ marginTop: 9 }}>
          {item.subtitle}
        </Body>
        {item.detail ? (
          <Mono
            size={9.5}
            weight={500}
            tracking={0.16}
            caps
            color={T.t42}
            align="center"
            numberOfLines={1}
            style={{ marginTop: 13 }}>
            {item.detail}
          </Mono>
        ) : null}
      </View>

      {/* Assinatura: o logotipo, e não o nome escrito — é o card que sai do app. */}
      <View style={{ alignItems: 'center' }}>
        <Wordmark size={19} />
      </View>
    </View>
  );
}
