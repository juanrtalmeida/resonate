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
import { useNativeUI } from '@/lib/native-ui';
import { usePrefs, useT } from '@/lib/prefs';
import type { Translate } from '@/lib/i18n';
import { useEditSheet, type Editable } from './edit-sheet';
import { spokenOf, type SpokenMarks } from '@/lib/spoken';
import { removeFromDevice } from '@/lib/remove';
import { isRemote } from '@/lib/subsonic';
import { canShareToStories } from '@/lib/share';
import type { Album, Track } from '@/lib/scan';
import { AlbumArt } from './album-art';
import {
  Book,
  Close,
  Disc,
  Heart,
  Instagram,
  Mic,
  Pencil,
  Play,
  Plus,
  Queue,
  Share as ShareIcon,
  Shuffle,
  Trash,
} from './icons';
import { Panel, useEntering } from './panel';
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
  const t = useT();
  const native = useNativeUI();
  const [confirming, setConfirming] = useState<MenuAction | null>(null);

  /*
    Quando o material desta tela pode pedir vidro.

    Duas camadas aqui começam apagadas: a janela do Modal, que entra em fade nativo, e cada
    bloco com `entering={FadeIn…}`. Opacidade zero num ancestral não deixa o vidro
    translúcido — deixa sem efeito nenhum —, então o material espera o tempo da entrada
    mais lenta (200 ms com 80 de espera, o X do canto). Um valor só para os três: passado o
    limiar, nenhuma das camadas está mais em zero. Ver `useEntering`.
  */
  const entered = useEntering(200, 80);

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
      {/*
        O fundo apagado é o destaque: ele é o que separa o item do resto da tela.

        Com a interface nativa ele **abre**: 96% de preto é quase opaco, e material sobre
        opaco não é material — não há nada atrás para refratar nem para o Material tingir.
        Em 62% a tela de baixo aparece o suficiente para o vidro ter o que fazer, e o menu
        continua sendo o que se lê primeiro.
      */}
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(120)}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: native ? 'rgba(6,5,4,.62)' : 'rgba(6,5,4,.96)',
        }}>
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
            <Confirm
              action={confirming}
              accent={accent}
              t={t}
              onCancel={() => setConfirming(null)}
              onConfirm={() => {
                confirming.onPress();
                close();
              }}
            />
          ) : (
            <ScrollView
              style={{ marginTop: 26, flexGrow: 0 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                borderRadius: R.r21,
                overflow: 'hidden',
              }}>
              {/*
                O material da lista fica **dentro** do contêiner de conteúdo, e não como
                fundo do ScrollView: absoluto ali ele mede a altura do conteúdo, então
                acompanha a lista quando ela rola em vez de ficar parado atrás dela.
              */}
              <Panel
                fade={entered}
                style={{ borderRadius: R.r21 }}
                fallback={{ background: C.card, border: T.t07 }}
              />
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

          {/*
            Um X, e não só o toque no fundo. O fundo fecha desde sempre, mas ele exige
            acertar as beiradas — e com a lista de ações ocupando o meio da tela, sobra
            pouca beirada para acertar.

            **Último filho**, e é isto que o faz funcionar. Ele era o primeiro, e irmão
            posterior pinta em cima: o bloco da capa é uma View sem handler nenhum, mas em
            React Native ela ainda é o alvo do toque — a busca para no topo do que cobre o
            ponto e sobe pela cadeia de responders, nunca desce para o irmão de baixo.
            Enquanto o menu era curto o X ficava livre; com a lista mais alta o bloco do
            meio passou a cobrir o círculo dele, e o toque morria ali. Por último, o X
            pinta acima de tudo e recebe o toque em qualquer tamanho de menu.
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
              }}>
              <Panel
                interactive
                fade={entered}
                style={{ borderRadius: 19 }}
                fallback={{ background: T.t08, border: T.t1 }}
              />
              <Close size={16} color={T.t72} />
            </Pressable>
          </Animated.View>
        </View>
      )}
    </Modal>
  );
}

/**
 * A confirmação de uma ação destrutiva, no lugar da lista.
 *
 * Componente próprio por causa do material: ele entra com `FadeInDown`, ou seja de
 * opacidade zero, e o vidro precisa de um `fade` que **comece quando este cartão nasce** —
 * não quando o menu nasceu. Vivendo aqui, o `useEntering` monta com ele.
 */
function Confirm({
  action,
  accent,
  t,
  onCancel,
  onConfirm,
}: {
  action: MenuAction;
  accent: string;
  t: Translate;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const entered = useEntering(200);

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      style={{
        marginTop: 26,
        padding: 18,
        borderRadius: R.r21,
        // A borda no acento fica: ela é o aviso de que este cartão pergunta antes de
        // destruir, e vale nos três materiais.
        borderWidth: 1,
        borderColor: alpha(accent, 0.35),
      }}>
      <Panel fade={entered} style={{ borderRadius: R.r21 }} fallback={{ background: C.card }} />
      <Body size={14} weight={500} align="center" color={T.full}>
        {action.confirm}
      </Body>
      <Body size={12} color={T.t5} align="center" style={{ marginTop: 8 }}>
        {action.warning}
      </Body>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <Pressable
          onPress={onCancel}
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
            {t('common.cancel')}
          </Body>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          style={{
            flex: 1,
            height: 46,
            borderRadius: R.r15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accent,
          }}>
          <Body size={13.5} weight={600} color={C.onAccent}>
            {t('common.delete')}
          </Body>
        </Pressable>
      </View>
    </Animated.View>
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
  const { toggleLike, isLiked, toggleAlbumLike, isAlbumLiked, spoken, setSpoken } = usePrefs();
  const t = useT();
  const { open: openPlaylists, sheet } = usePlaylistSheet();
  const { open: openEditor, sheet: editor } = useEditSheet();

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

  const header = item ? headerFor(item, tracksOfItem(item).length, coverOf(item), t) : null;
  const actions = item ? actionsFor(item) : [];

  function actionsFor(menu: MenuItem): MenuAction[] {
    const tracks = tracksOfItem(menu);
    const ids = tracks.map((t) => t.id);

    const list: MenuAction[] = [
      {
        label: t(tracks.length === 1 ? 'menu.play' : 'menu.playAll'),
        icon: <Play size={16} color={T.t72} />,
        onPress: () => play(tracks, 0),
      },
    ];

    if (tracks.length > 1) {
      list.push({
        label: t('menu.shuffle'),
        icon: <Shuffle size={17} color={T.t72} />,
        onPress: () => play(shuffled(tracks), 0),
      });
    }

    list.push(
      {
        label: t('menu.playNext'),
        icon: <Queue size={17} color={T.t72} />,
        onPress: () => enqueueNext(tracks),
      },
      {
        label: t('menu.playLast'),
        icon: <Queue size={17} color={T.t72} />,
        onPress: () => enqueueLast(tracks),
      }
    );

    // Curtir só onde existe uma curtida: faixa e álbum têm; artista e lista não.
    if (menu.kind === 'track') {
      list.push({
        label: t(isLiked(menu.track.id) ? 'menu.unlike' : 'menu.like'),
        icon: <Heart size={16} color={T.t72} filled={isLiked(menu.track.id)} />,
        onPress: () => toggleLike(menu.track.id),
      });
    }
    if (menu.kind === 'album') {
      list.push({
        label: t(isAlbumLiked(menu.album.id) ? 'menu.unlike' : 'menu.like'),
        icon: <Heart size={16} color={T.t72} filled={isAlbumLiked(menu.album.id)} />,
        onPress: () => toggleAlbumLike(menu.album.id),
      });
    }

    /*
      Corrigir os metadados.

      Vale para faixa, álbum e artista, e o alcance é o do item que foi segurado: no álbum
      a correção entra em todas as faixas dele, no artista ela renomeia a biblioteca
      inteira. Lista fica fora — o nome dela já se edita onde ela vive, e ela não tem tag
      nenhuma para corrigir.
    */
    if (menu.kind !== 'playlist' && tracks.length) {
      const target: Editable =
        menu.kind === 'track'
          ? { kind: 'track', track: menu.track }
          : menu.kind === 'album'
            ? { kind: 'album', album: menu.album, tracks }
            : { kind: 'artist', name: menu.name, tracks };
      list.push({
        label: t('menu.edit'),
        icon: <Pencil size={16} color={T.t72} />,
        onPress: () => openEditor(target),
      });
    }

    /*
      Reclassificar o álbum.

      A classificação automática — tag de gênero, e depois duração — acerta a maioria e
      erra em silêncio: um set de duas horas cai em Podcasts, um audiolivro etiquetado
      como "Spoken" pode não cair em nada. Aqui o usuário desempata, e por álbum, que é o
      programa ou o livro inteiro. Ver `lib/spoken.ts`.

      As duas linhas são sempre as duas classificações que o álbum *não* tem: nada de
      oferecer "tratar como podcast" no que já é podcast.
    */
    if (menu.kind === 'album' && tracks.length) {
      const now = spokenOf(tracks[0], spoken);
      const as = (kind: SpokenMarks[string], label: string, icon: ReactNode) => ({
        label,
        icon,
        onPress: () => setSpoken(menu.album.id, kind),
      });
      if (now !== 'podcast') {
        list.push(as('podcast', t('menu.asPodcast'), <Mic size={16} color={T.t72} />));
      }
      if (now !== 'audiobook') {
        list.push(as('audiobook', t('menu.asAudiobook'), <Book size={16} color={T.t72} />));
      }
      if (now !== null) {
        list.push(as('music', t('menu.asMusic'), <Disc color={T.t72} />));
      }
    }

    // Jogar uma lista dentro de outra lista não é o gesto de ninguém.
    if (menu.kind !== 'playlist' && ids.length) {
      list.push({
        label: t('menu.addToPlaylist'),
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
      label: t('menu.share'),
      icon: <ShareIcon size={16} color={T.t72} />,
      onPress: () => share(shareableFor(menu, tracks.length, coverOf(menu), t), 'sheet'),
    });
    if (canShareToStories) {
      list.push({
        label: t('menu.stories'),
        icon: <Instagram size={16} color={T.t72} />,
        onPress: () => share(shareableFor(menu, tracks.length, coverOf(menu), t), 'stories'),
      });
    }

    if (menu.kind === 'playlist') {
      list.push({
        label: t('menu.deletePlaylist'),
        icon: <Trash size={16} color={T.full} />,
        destructive: true,
        confirm: t('menu.deletePlaylist.confirm', { name: menu.playlist.name }),
        // A lista é só um registro nosso: os arquivos dela continuam no aparelho.
        warning: t('menu.deletePlaylist.warning'),
        onPress: () => removePlaylist(menu.playlist.id),
      });
    } else {
      /*
        Só o que é arquivo neste aparelho.

        Faixa de servidor não tem arquivo para apagar, e o Subsonic não tem endpoint que
        apague nada — oferecer "remover do aparelho" nela prometeria o que o app não pode
        cumprir. Num álbum misto a ação continua aparecendo, contando apenas as locais, que
        é o número que o diálogo precisa dizer para não mentir. `removeFromDevice` recusa
        as remotas de qualquer forma; isto é para o menu não oferecer. Ver `lib/remove.ts`.
      */
      const local = tracks.filter((track) => !isRemote(track.id));
      if (local.length) {
        list.push({
          label:
            local.length === 1
              ? t('menu.removeFile')
              : t('menu.removeFiles', { n: local.length }),
          icon: <Trash size={16} color={T.full} />,
          destructive: true,
          confirm:
            local.length === 1
              ? t('menu.removeFile.confirm', { title: local[0].title })
              : t('menu.removeFiles.confirm', { n: local.length }),
          warning: t(
            local.length === 1 ? 'menu.removeFile.warning' : 'menu.removeFiles.warning'
          ),
          onPress: () => {
            void removeFromDevice(local).then(({ removed }) => {
              if (removed.length) removeTracks(removed);
            });
          },
        });
      }
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
        {editor}
      </>
    ),
  };
}

/**
 * O cabeçalho do menu.
 *
 * Recebe o `t` em vez de chamar `useT`: é função pura, chamada de dentro do render de
 * `useItemMenu`, e hook não roda fora de componente.
 */
function headerFor(
  item: MenuItem,
  count: number,
  trackCover: string | null,
  t: Translate
): Header {
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
      detail: t('count.tracks', { n: count }),
      art: artworkFor(item.album.artist, item.album.title),
      cover: item.album.cover,
    };
  }
  if (item.kind === 'artist') {
    return {
      title: item.name,
      subtitle: t('count.albums', { n: item.albums.length }),
      detail: t('count.tracks', { n: count }),
      art: artworkFor(item.name, item.albums[0]?.title ?? ''),
      cover: item.albums.find((a) => a.cover)?.cover ?? null,
      round: true,
    };
  }
  return {
    title: item.playlist.name,
    subtitle: t('count.tracks', { n: count }),
    art: artworkFor(item.playlist.name, 'lista'),
    cover: item.playlist.cover ?? null,
  };
}

function shareableFor(
  item: MenuItem,
  count: number,
  trackCover: string | null,
  t: Translate
): Shareable {
  const header = headerFor(item, count, trackCover, t);
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
