import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Dimensions, FlatList, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, {
  FadeInLeft,
  FadeInRight,
  FadeOutLeft,
  FadeOutRight,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/album-art';
import { LibraryIcon, Search } from '@/components/icons';
import { EmptyState } from '@/components/empty-state';
import { SectionLabel } from '@/components/section-label';
import { Body, Display, Mono } from '@/components/text';
import { TrackRow } from '@/components/track-row';
import { C, CHROME_HEIGHT, PADDING, R, T, alpha } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { useLibrary } from '@/lib/library';
import { chromeScroll } from '@/lib/chrome-scroll';
import { usePlayer } from '@/lib/player';
import { usePlaylistSheet } from '@/components/playlist-sheet';
import { usePlaylists } from '@/lib/playlists';
import { usePrefs } from '@/lib/prefs';
import { useZoomLaunch } from '@/lib/zoom';
import type { Album, Track } from '@/lib/scan';

const TABS = [
  { key: 'albums', label: 'Álbuns' },
  { key: 'artists', label: 'Artistas' },
  { key: 'tracks', label: 'Faixas' },
  { key: 'playlists', label: 'Listas' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const NO_TRACKS: Track[] = [];
const NO_ALBUMS: Album[] = [];

const GAP = 14;

export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { library, artists } = useLibrary();
  const { accent } = usePrefs();
  const { play, enqueueLast } = usePlayer();
  const { playlists } = usePlaylists();
  const { open, sheet } = usePlaylistSheet();
  const [naming, setNaming] = useState(false);
  const { tab: raw } = useLocalSearchParams<{ tab?: string }>();

  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : 'albums';

  // A lista nova entra do lado para onde a aba andou; a velha sai para o outro.
  // Decidido no toque, não no render: a direção é da interação, e a aba chega pela URL
  // sem dizer de onde veio.
  const index = TABS.findIndex((t) => t.key === tab);
  const [forward, setForward] = useState(true);
  const pickTab = (key: TabKey) => {
    setForward(TABS.findIndex((t) => t.key === key) >= index);
    router.setParams({ tab: key });
  };
  const width = Dimensions.get('window').width;
  const cell = (width - PADDING * 2 - GAP) / 2;

  const tracks = library?.tracks ?? NO_TRACKS;
  const albums = library?.albums ?? NO_ALBUMS;
  const totalSeconds = useMemo(
    () => tracks.reduce((n, t) => n + (t.duration ?? 0), 0),
    [tracks]
  );

  const header = (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
        }}>
        <View style={{ flex: 1 }}>
          <Display size={33} tracking={-0.035}>
            Sua biblioteca
          </Display>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.ok }} />
            <Body size={12.5} color={T.t42}>
              {tracks.length} faixas · {albums.length} álbuns · {Math.round(totalSeconds / 3600)} h
            </Body>
          </View>
        </View>
        <Pressable
          onPress={() => router.push('/search')}
          hitSlop={8}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: T.t12,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Search />
        </Pressable>
      </View>

      <Tabs current={tab} onPick={pickTab} />

      {tab === 'albums' && albums.length > 0 && <Fresh albums={albums.slice(0, 8)} />}

      {tab === 'albums' && (
        <SectionLabel title="Todos os álbuns" trailing={`${albums.length} álbuns`} />
      )}

      {tab === 'playlists' && (
        <Pressable
          onPress={() => setNaming(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginTop: 22,
            paddingVertical: 13,
            paddingHorizontal: 15,
            borderRadius: R.r15,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: alpha(accent, 0.4),
          }}>
          <Body size={18} color={accent}>
            +
          </Body>
          <Body size={13.5} weight={500} color={T.t72} style={{ flex: 1 }}>
            Nova lista
          </Body>
        </Pressable>
      )}
    </View>
  );

  const bottom = CHROME_HEIGHT + insets.bottom;

  /**
   * Um `content` em vez de um `return` por aba: o Modal de nova lista vivia só no ramo
   * de Faixas, então tocar em "Nova lista" na aba Listas marcava o estado sem montar o
   * Modal — ele só aparecia ao trocar de aba.
   */
  let content: ReactNode;

  if (tab === 'albums') {
    content = (
      <FlatList
        {...chromeScroll}
        key="albums"
        data={albums}
        keyExtractor={(a) => a.id}
        numColumns={2}
        ListHeaderComponent={header}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: bottom,
          paddingHorizontal: PADDING,
          gap: 16,
        }}
        ListEmptyComponent={
          <EmptyState icon={<LibraryIcon size={30} color={T.full} />} title="Biblioteca vazia">
            Nenhum álbum por aqui ainda. Varra o aparelho de novo em Ajustes.
          </EmptyState>
        }
        renderItem={({ item }) => (
          <AlbumCell album={item} size={cell} count={item.trackIds.length} />
        )}
      />
    );
  }

  if (tab === 'playlists') {
    content = (
      <FlatList
        {...chromeScroll}
        key="playlists"
        data={playlists}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState icon={<LibraryIcon size={30} color={T.full} />} title="Nenhuma lista ainda">
            Segure uma faixa em qualquer tela para criar a primeira.
          </EmptyState>
        }
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: bottom,
          paddingHorizontal: PADDING,
        }}
        renderItem={({ item }) => (
          <GroupRow
            title={item.name}
            subtitle={`${item.trackIds.length} ${item.trackIds.length === 1 ? 'faixa' : 'faixas'}`}
            art={artworkFor(item.name, 'lista')}
            cover={item.cover ?? null}
            onPress={() => router.push(`/playlist/${item.id}`)}
          />
        )}
      />
    );
  }

  if (tab === 'artists') {
    content = (
      <FlatList
        {...chromeScroll}
        key="artists"
        data={artists}
        keyExtractor={(a) => a.name}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState icon={<LibraryIcon size={30} color={T.full} />} title="Nenhum artista">
            A varredura não encontrou nada com metadados de artista.
          </EmptyState>
        }
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: bottom,
          paddingHorizontal: PADDING,
        }}
        renderItem={({ item }) => <ArtistRow artist={item} />}
      />
    );
  }

  if (!content) {
    content = (
      <FlatList
        {...chromeScroll}
        key="tracks"
        data={tracks}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState icon={<LibraryIcon size={30} color={T.full} />} title="Nenhuma faixa">
            Varra o aparelho de novo em Ajustes para procurar música.
          </EmptyState>
        }
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: bottom,
          paddingHorizontal: PADDING,
        }}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            position={index + 1}
            accent={accent}
            onPress={() => play(tracks, index)}
            onLongPress={() => open([item.id])}
            onQueue={() => enqueueLast([item])}
            onPlaylist={() => open([item.id])}
          />
        )}
      />
    );
  }

  return (
    <>
      <Animated.View
        key={tab}
        entering={(forward ? FadeInRight : FadeInLeft).duration(240)}
        exiting={(forward ? FadeOutLeft : FadeOutRight).duration(140)}
        style={{ flex: 1 }}>
        {content}
      </Animated.View>
      {sheet}
      <NewPlaylist visible={naming} onClose={() => setNaming(false)} />
    </>
  );
}

/** Criação direta de lista, sem precisar de uma faixa para começar. */
function NewPlaylist({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { accent } = usePrefs();
  const { create } = usePlaylists();
  const [name, setName] = useState('');

  const confirm = () => {
    if (!name.trim()) return;
    create(name);
    setName('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(6,5,4,.6)' }} onPress={onClose} />
      <View
        style={{
          position: 'absolute',
          left: PADDING,
          right: PADDING,
          top: '34%',
          backgroundColor: C.surface,
          borderRadius: R.r21,
          borderWidth: 1,
          borderColor: T.t1,
          padding: 20,
        }}>
        <Display size={20} tracking={-0.03}>
          Nova lista
        </Display>
        <TextInput
          value={name}
          onChangeText={setName}
          autoFocus
          placeholder="Nome da lista"
          placeholderTextColor={T.t34}
          selectionColor={accent}
          returnKeyType="done"
          onSubmitEditing={confirm}
          style={{
            marginTop: 14,
            height: 46,
            paddingHorizontal: 14,
            borderRadius: R.r13,
            backgroundColor: C.card,
            borderWidth: 1,
            borderColor: name.trim() ? T.t14 : T.t07,
            color: T.full,
            fontFamily: 'FamiljenGrotesk_500Medium',
            fontSize: 15,
          }}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 16 }}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Body size={13.5} weight={600} color={T.t5}>
              Cancelar
            </Body>
          </Pressable>
          <Pressable onPress={confirm} disabled={!name.trim()} hitSlop={8}>
            <Body size={13.5} weight={600} color={name.trim() ? accent : T.t24}>
              Criar
            </Body>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Tabs({ current, onPick }: { current: TabKey; onPick: (k: TabKey) => void }) {
  const { accent } = usePrefs();

  // A largura do traço só se sabe depois do layout: são quatro fatias iguais da linha.
  const [width, setWidth] = useState(0);
  const slot = width / TABS.length;
  const at = TABS.findIndex((t) => t.key === current);
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(at * slot, { damping: 20, stiffness: 190 }) }],
  }));

  return (
    <View style={{ marginTop: 22, marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: R.r13, padding: 4 }}>
        {TABS.map((t) => {
          const active = t.key === current;
          return (
            <Pressable
              key={t.key}
              onPress={() => onPick(t.key)}
              style={{
                flex: 1,
                height: 34,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? '#252019' : 'transparent',
              }}>
              <Body size={12.5} weight={600} color={active ? T.full : T.t42}>
                {t.label}
              </Body>
            </Pressable>
          );
        })}
      </View>
      {/* Um traço fino no acento marca a aba, como a pílula do design. Ele corre até a
          aba nova: quatro traços acendendo e apagando não diziam de onde para onde. */}
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: 2, marginTop: 6 }}>
        {width > 0 && (
          <Animated.View style={[{ width: slot, height: 2, paddingHorizontal: 6 }, slide]}>
            <View style={{ flex: 1, borderRadius: 1, backgroundColor: accent }} />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

function Fresh({ albums }: { albums: Album[] }) {
  return (
    <View style={{ marginTop: 24 }}>
      <SectionLabel title="Recém-encontrados" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -PADDING }}
        contentContainerStyle={{ gap: 12, paddingHorizontal: PADDING }}>
        {albums.map((album) => (
          <FreshCell key={album.id} album={album} />
        ))}
      </ScrollView>
    </View>
  );
}

function FreshCell({ album }: { album: Album }) {
  const router = useRouter();
  const art = artworkFor(album.artist, album.title);
  const { ref, launch } = useZoomLaunch(R.r15);

  return (
    <Pressable
      onPress={() => launch(() => router.push(`/album/${album.id}`))}
      style={{ width: 112 }}>
      <View ref={ref} collapsable={false}>
        <AlbumArt art={art} size={112} radius={R.r15} detail="ring" cover={album.cover} />
        <View
          style={{
            position: 'absolute',
            top: 7,
            right: 7,
            paddingHorizontal: 6,
            paddingVertical: 3,
            borderRadius: 6,
            backgroundColor: 'rgba(10,9,8,.62)',
          }}>
          <Mono size={8.5} weight={500} tracking={0.08} color={T.full}>
            NOVO
          </Mono>
        </View>
      </View>
      <Body size={12.5} weight={600} numberOfLines={1} style={{ marginTop: 8 }}>
        {album.title}
      </Body>
      <Body size={11} color={T.t42} numberOfLines={1}>
        {album.artist}
      </Body>
    </Pressable>
  );
}

function AlbumCell({ album, size, count }: { album: Album; size: number; count: number }) {
  const router = useRouter();
  const art = artworkFor(album.artist, album.title);
  // A capa é o retângulo de onde a tela do álbum cresce.
  const { ref, launch } = useZoomLaunch(R.r17);

  return (
    <Pressable
      onPress={() => launch(() => router.push(`/album/${album.id}`))}
      style={{ width: size }}>
      <View ref={ref} collapsable={false}>
        <AlbumArt art={art} size={size} radius={R.r17} cover={album.cover} scrim />
      </View>
      <Body size={13.5} weight={600} tracking={-0.01} numberOfLines={1} style={{ marginTop: 9 }}>
        {album.title}
      </Body>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <Body size={11.5} color="rgba(246,241,234,.44)" numberOfLines={1} style={{ flexShrink: 1 }}>
          {album.artist}
        </Body>
        <Body size={11.5} color={T.t24}>
          ·
        </Body>
        <Body size={11.5} color={T.t3}>
          {count}
        </Body>
      </View>
    </Pressable>
  );
}

/** Linha de artista: a capa redonda é a origem do zoom para a tela dele. */
function ArtistRow({ artist }: { artist: ReturnType<typeof useLibrary>['artists'][number] }) {
  const router = useRouter();
  const { ref, launch } = useZoomLaunch(26);
  const cover = artist.albums.find((a) => a.cover)?.cover ?? null;

  return (
    <Pressable
      onPress={() =>
        launch(() => router.push(`/artist/${encodeURIComponent(artist.name)}`))
      }
      style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 10 }}>
      <View ref={ref} collapsable={false}>
        <AlbumArt
          art={artworkFor(artist.name, artist.albums[0]?.title ?? '')}
          size={52}
          radius={26}
          detail="ring"
          cover={cover}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body size={14.5} weight={600} tracking={-0.01} numberOfLines={1}>
          {artist.name}
        </Body>
        <Body size={11.5} color={T.t42} style={{ marginTop: 2 }}>
          {artist.albums.length} {artist.albums.length === 1 ? 'álbum' : 'álbuns'}
        </Body>
      </View>
    </Pressable>
  );
}

function GroupRow({
  title,
  subtitle,
  mono,
  art,
  cover,
  round = false,
  onPress,
}: {
  title: string;
  subtitle: string;
  mono?: string;
  art: ReturnType<typeof artworkFor>;
  /** Capa real, quando o álbum tem uma embutida. */
  cover?: string | null;
  /** Artista aparece em círculo; álbum e pasta, em quadrado. */
  round?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 10,
      }}>
      <AlbumArt art={art} size={52} radius={round ? 26 : 14} detail="ring" cover={cover} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body size={14.5} weight={600} tracking={-0.01} numberOfLines={1}>
          {title}
        </Body>
        {mono ? (
          <Mono size={10.5} color="rgba(246,241,234,.38)" numberOfLines={1} style={{ marginTop: 2 }}>
            {mono}
          </Mono>
        ) : null}
        <Body size={11.5} color={T.t42} style={{ marginTop: 2 }}>
          {subtitle}
        </Body>
      </View>
    </Pressable>
  );
}
