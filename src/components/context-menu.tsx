/**
 * O menu do toque longo: o item em destaque, o fundo apagado, e as ações embaixo.
 *
 * Uma peça só para faixa, álbum, artista e lista. O cabeçalho tem a mesma forma nos
 * quatro — capa, título, subtítulo —, e o que muda é a lista de ações, que `useItemMenu`
 * monta por tipo. Repetir o menu por tela era repetir a apresentação quatro vezes para
 * variar duas linhas.
 *
 * O item aparece centrado, e não ancorado no dedo. Ancorar exige medir a origem, decidir
 * de que lado o menu cabe e lidar com o item em cima ou embaixo da tela; centrado, o
 * destaque é o próprio contraste com o fundo apagado — que é o que o gesto precisa dizer.
 *
 * Ação destrutiva não abre um segundo diálogo: a lista se troca pela confirmação no mesmo
 * lugar, dizendo quantos arquivos são. Um modal sobre um modal, no Android, é uma janela
 * sobre outra janela.
 */

import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, R, T, alpha } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { useLibrary } from '@/lib/library';
import { usePlayer } from '@/lib/player';
import { usePlaylists, type Playlist } from '@/lib/playlists';
import { usePrefs } from '@/lib/prefs';
import { removeFromDevice } from '@/lib/remove';
import { canShareToStories } from '@/lib/share';
import type { Album, Track } from '@/lib/scan';
import { AlbumArt } from './album-art';
import {
  Close,
  Heart,
  Instagram,
  Play,
  Plus,
  Queue,
  Share as ShareIcon,
  Shuffle,
  Trash,
} from './icons';
import { usePlaylistSheet } from './playlist-sheet';
import { useShareCard, type Shareable } from './share-card';
import { Body, Display, Mono } from './text';

export type MenuAction = {
  label: string;
  icon: ReactNode;
  /** Fica no acento e passa pela confirmação antes de correr. */
  destructive?: boolean;
  /** Pergunta da confirmação. Obrigatória quando `destructive`. */
  confirm?: string;
  /** A linha que diz o que a ação faz de irreversível. Obrigatória quando `destructive`. */
  warning?: string;
  onPress: () => void;
};

type Header = {
  title: string;
  subtitle: string;
  /** Terceira linha, em mono. Contagens e nomes de arquivo. */
  detail?: string;
  art: ReturnType<typeof artworkFor>;
  cover: string | null;
  /** Artista aparece em círculo, como no resto do app. */
  round?: boolean;
};

export function ContextMenu({
  visible,
  header,
  actions,
  onClose,
}: {
  visible: boolean;
  header: Header | null;
  actions: MenuAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { accent } = usePrefs();
  const [confirming, setConfirming] = useState<MenuAction | null>(null);

  const close = () => {
    setConfirming(null);
    onClose();
  };

  const fire = (action: MenuAction) => {
    if (action.destructive) {
      setConfirming(action);
      return;
    }
    action.onPress();
    close();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      {/* O fundo apagado é o destaque: ele é o que separa o item do resto da tela. */}
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(120)}
        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(6,5,4,.96)' }}>
        <Pressable style={{ flex: 1 }} onPress={close} />
      </Animated.View>

      {header && (
        <View
          pointerEvents="box-none"
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: 26,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}>
          {/*
            Um X, e não só o toque no fundo. O fundo fecha desde sempre, mas ele exige
            acertar as beiradas — e com a lista de ações ocupando o meio da tela, sobra
            pouca beirada para acertar.
          */}
          <Animated.View
            entering={FadeIn.duration(200).delay(80)}
            style={{ position: 'absolute', top: insets.top + 10, right: 22 }}>
            <Pressable
              onPress={close}
              hitSlop={12}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: T.t08,
                borderWidth: 1,
                borderColor: T.t1,
              }}>
              <Close size={16} color={T.t72} />
            </Pressable>
          </Animated.View>
          <Animated.View entering={FadeInDown.duration(260)} style={{ alignItems: 'center' }}>
            <AlbumArt
              art={header.art}
              size={132}
              radius={header.round ? 66 : 24}
              detail="ring"
              cover={header.cover}
            />
            <Display
              size={21}
              tracking={-0.03}
              align="center"
              numberOfLines={2}
              style={{ marginTop: 18 }}>
              {header.title}
            </Display>
            <Body
              size={13}
              color={T.t62}
              align="center"
              numberOfLines={1}
              style={{ marginTop: 6 }}>
              {header.subtitle}
            </Body>
            {header.detail ? (
              <Mono
                size={10}
                weight={500}
                tracking={0.14}
                caps
                color={T.t4}
                align="center"
                numberOfLines={1}
                style={{ marginTop: 9 }}>
                {header.detail}
              </Mono>
            ) : null}
          </Animated.View>

          {confirming ? (
            <Animated.View
              entering={FadeInDown.duration(200)}
              style={{
                marginTop: 26,
                padding: 18,
                borderRadius: R.r21,
                backgroundColor: C.card,
                borderWidth: 1,
                borderColor: alpha(accent, 0.35),
              }}>
              <Body size={14} weight={500} align="center" color={T.full}>
                {confirming.confirm}
              </Body>
              <Body size={12} color={T.t5} align="center" style={{ marginTop: 8 }}>
                {confirming.warning}
              </Body>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <Pressable
                  onPress={() => setConfirming(null)}
                  style={{
                    flex: 1,
                    height: 46,
                    borderRadius: R.r15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: T.t12,
                  }}>
                  <Body size={13.5} weight={600} color={T.t72}>
                    Cancelar
                  </Body>
                </Pressable>
                <Pressable
                  onPress={() => {
                    confirming.onPress();
                    close();
                  }}
                  style={{
                    flex: 1,
                    height: 46,
                    borderRadius: R.r15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: accent,
                  }}>
                  <Body size={13.5} weight={600} color={C.onAccent}>
                    Apagar
                  </Body>
                </Pressable>
              </View>
            </Animated.View>
          ) : (
            <ScrollView
              style={{ marginTop: 26, flexGrow: 0 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                borderRadius: R.r21,
                backgroundColor: C.card,
                borderWidth: 1,
                borderColor: T.t07,
                overflow: 'hidden',
              }}>
              {actions.map((action, index) => (
                <Row
                  key={action.label}
                  action={action}
                  accent={accent}
                  first={index === 0}
                  index={index}
                  onPress={() => fire(action)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </Modal>
  );
}

function Row({
  action,
  accent,
  first,
  index,
  onPress,
}: {
  action: MenuAction;
  accent: string;
  first: boolean;
  index: number;
  onPress: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(220).delay(60 + index * 30)}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 18,
          height: 54,
          borderTopWidth: first ? 0 : 1,
          borderTopColor: T.t06,
          backgroundColor: pressed ? T.t06 : 'transparent',
        })}>
        {action.icon}
        <Body size={14} weight={500} color={action.destructive ? accent : T.full}>
          {action.label}
        </Body>
      </Pressable>
    </Animated.View>
  );
}

/** O que o toque longo pode abrir. */
export type MenuItem =
  | { kind: 'track'; track: Track }
  | { kind: 'album'; album: Album }
  | { kind: 'artist'; name: string; albums: Album[] }
  | { kind: 'playlist'; playlist: Playlist };

/**
 * Estado e ações do menu, para a tela só precisar de duas linhas.
 *
 * Devolve o abridor e os elementos a renderizar, no mesmo contrato de
 * `usePlaylistSheet` — que ele reusa, porque "adicionar a uma lista" é uma das ações.
 */
export function useItemMenu() {
  const [item, setItem] = useState<MenuItem | null>(null);
  const { share, card } = useShareCard();

  const { tracksOf, trackById, albumById, removeTracks } = useLibrary();
  const { play, enqueueNext, enqueueLast } = usePlayer();
  const { remove: removePlaylist } = usePlaylists();
  const { toggleLike, isLiked, toggleAlbumLike, isAlbumLiked } = usePrefs();
  const { open: openPlaylists, sheet } = usePlaylistSheet();

  /** As faixas do item, na ordem em que ele as toca. */
  const tracksOfItem = (menu: MenuItem): Track[] => {
    if (menu.kind === 'track') return [menu.track];
    if (menu.kind === 'album') return tracksOf(menu.album);
    if (menu.kind === 'artist') return menu.albums.flatMap(tracksOf);
    return menu.playlist.trackIds.map(trackById).filter((t) => !!t);
  };

  /** A faixa não guarda capa; ela é do álbum. Sem isto o menu mostrava a arte procedural
      de uma faixa cujo álbum tem capa de verdade — e a lista, ao lado, mostrava a capa. */
  const coverOf = (menu: MenuItem) =>
    menu.kind === 'track' ? (albumById(menu.track.albumId)?.cover ?? null) : null;

  const header = item ? headerFor(item, tracksOfItem(item).length, coverOf(item)) : null;
  const actions = item ? actionsFor(item) : [];

  function actionsFor(menu: MenuItem): MenuAction[] {
    const tracks = tracksOfItem(menu);
    const ids = tracks.map((t) => t.id);

    const list: MenuAction[] = [
      {
        label: tracks.length === 1 ? 'Tocar' : 'Tocar tudo',
        icon: <Play size={16} color={T.t72} />,
        onPress: () => play(tracks, 0),
      },
    ];

    if (tracks.length > 1) {
      list.push({
        label: 'Embaralhar',
        icon: <Shuffle size={17} color={T.t72} />,
        onPress: () => play(shuffled(tracks), 0),
      });
    }

    list.push(
      {
        label: 'Tocar em seguida',
        icon: <Queue size={17} color={T.t72} />,
        onPress: () => enqueueNext(tracks),
      },
      {
        label: 'No fim da fila',
        icon: <Queue size={17} color={T.t72} />,
        onPress: () => enqueueLast(tracks),
      }
    );

    // Curtir só onde existe uma curtida: faixa e álbum têm; artista e lista não.
    if (menu.kind === 'track') {
      list.push({
        label: isLiked(menu.track.id) ? 'Descurtir' : 'Curtir',
        icon: <Heart size={16} color={T.t72} filled={isLiked(menu.track.id)} />,
        onPress: () => toggleLike(menu.track.id),
      });
    }
    if (menu.kind === 'album') {
      list.push({
        label: isAlbumLiked(menu.album.id) ? 'Descurtir' : 'Curtir',
        icon: <Heart size={16} color={T.t72} filled={isAlbumLiked(menu.album.id)} />,
        onPress: () => toggleAlbumLike(menu.album.id),
      });
    }

    // Jogar uma lista dentro de outra lista não é o gesto de ninguém.
    if (menu.kind !== 'playlist' && ids.length) {
      list.push({
        label: 'Adicionar a uma lista',
        icon: <Plus size={17} color={T.t72} />,
        onPress: () => openPlaylists(ids),
      });
    }

    /*
      Dois destinos, duas linhas — e nenhuma tela no meio. A folha do sistema alcança
      tudo; o Stories é o atalho que dispensa escolher na folha, e por isso vale uma
      linha própria.
    */
    list.push({
      label: 'Compartilhar',
      icon: <ShareIcon size={16} color={T.t72} />,
      onPress: () => share(shareableFor(menu, tracks.length, coverOf(menu)), 'sheet'),
    });
    if (canShareToStories) {
      list.push({
        label: 'Stories',
        icon: <Instagram size={16} color={T.t72} />,
        onPress: () => share(shareableFor(menu, tracks.length, coverOf(menu)), 'stories'),
      });
    }

    if (menu.kind === 'playlist') {
      list.push({
        label: 'Apagar esta lista',
        icon: <Trash size={16} color={T.full} />,
        destructive: true,
        confirm: `Apagar “${menu.playlist.name}”?`,
        // A lista é só um registro nosso: os arquivos dela continuam no aparelho.
        warning: 'A lista sai do app. As faixas continuam no aparelho.',
        onPress: () => removePlaylist(menu.playlist.id),
      });
    } else if (tracks.length) {
      list.push({
        label:
          tracks.length === 1
            ? 'Remover do dispositivo'
            : `Remover ${tracks.length} arquivos do dispositivo`,
        icon: <Trash size={16} color={T.full} />,
        destructive: true,
        confirm:
          tracks.length === 1
            ? `Apagar “${tracks[0].title}” do aparelho?`
            : `Apagar ${tracks.length} arquivos do aparelho?`,
        warning:
          tracks.length === 1
            ? 'Isto apaga o arquivo do aparelho e não tem volta.'
            : 'Isto apaga os arquivos do aparelho e não tem volta.',
        onPress: () => {
          void removeFromDevice(tracks).then(({ removed }) => {
            if (removed.length) removeTracks(removed);
          });
        },
      });
    }

    return list;
  }

  return {
    open: (next: MenuItem) => setItem(next),
    menu: (
      <>
        <ContextMenu
          visible={item !== null}
          header={header}
          actions={actions}
          onClose={() => setItem(null)}
        />
        {card}
        {sheet}
      </>
    ),
  };
}

function headerFor(item: MenuItem, count: number, trackCover: string | null): Header {
  if (item.kind === 'track') {
    return {
      title: item.track.title,
      subtitle: item.track.artist,
      detail: item.track.album,
      art: artworkFor(item.track.artist, item.track.album),
      cover: trackCover,
    };
  }
  if (item.kind === 'album') {
    return {
      title: item.album.title,
      subtitle: item.album.artist,
      detail: `${count} ${count === 1 ? 'faixa' : 'faixas'}`,
      art: artworkFor(item.album.artist, item.album.title),
      cover: item.album.cover,
    };
  }
  if (item.kind === 'artist') {
    return {
      title: item.name,
      subtitle: `${item.albums.length} ${item.albums.length === 1 ? 'álbum' : 'álbuns'}`,
      detail: `${count} ${count === 1 ? 'faixa' : 'faixas'}`,
      art: artworkFor(item.name, item.albums[0]?.title ?? ''),
      cover: item.albums.find((a) => a.cover)?.cover ?? null,
      round: true,
    };
  }
  return {
    title: item.playlist.name,
    subtitle: `${count} ${count === 1 ? 'faixa' : 'faixas'}`,
    art: artworkFor(item.playlist.name, 'lista'),
    cover: item.playlist.cover ?? null,
  };
}

function shareableFor(item: MenuItem, count: number, trackCover: string | null): Shareable {
  const header = headerFor(item, count, trackCover);
  return {
    title: header.title,
    subtitle: header.subtitle,
    detail: header.detail,
    cover: header.cover,
    art: header.art,
  };
}

/** Embaralha sem mutar, como nas telas de álbum e de lista. */
function shuffled<T>(items: T[]): T[] {
  return items
    .map((item) => ({ item, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}
