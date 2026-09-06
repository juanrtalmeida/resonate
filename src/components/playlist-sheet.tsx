/**
 * Folha para jogar faixas numa lista. Aparece no toque longo de uma faixa e no botão do
 * Now Playing. Um Modal do próprio React Native — o design não pede nada mais elaborado.
 */

import { useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, R, T, alpha } from '@/constants/theme';
import { useLibrary } from '@/lib/library';
import { usePlayer } from '@/lib/player';
import { usePlaylists } from '@/lib/playlists';
import { usePrefs } from '@/lib/prefs';
import { Body, Display, Mono } from './text';

export function PlaylistSheet({
  visible,
  trackIds,
  onClose,
}: {
  visible: boolean;
  /** As faixas a adicionar. Uma no toque longo, o álbum inteiro no botão do álbum. */
  trackIds: string[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { accent } = usePrefs();
  const { playlists, create, addTracks } = usePlaylists();
  const { track, enqueueNext, enqueueLast } = usePlayer();
  const { trackById } = useLibrary();
  const [name, setName] = useState('');

  const picked = trackIds.map(trackById).filter((t) => !!t);

  const put = (id: string) => {
    addTracks(id, trackIds);
    setName('');
    onClose();
  };

  const createAndPut = () => {
    if (!name.trim()) return;
    put(create(name).id);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(6,5,4,.6)' }} onPress={onClose} />
      <View
        style={{
          backgroundColor: C.surface,
          borderTopLeftRadius: R.r26,
          borderTopRightRadius: R.r26,
          borderTopWidth: 1,
          borderColor: T.t1,
          paddingTop: 18,
          paddingBottom: Math.max(insets.bottom, 16) + 12,
          paddingHorizontal: 22,
          maxHeight: '76%',
        }}>
        <View
          style={{
            width: 38,
            height: 4,
            borderRadius: 2,
            backgroundColor: T.t18,
            alignSelf: 'center',
            marginBottom: 16,
          }}
        />
        <Display size={22} tracking={-0.03}>
          {trackIds.length === 1 ? 'Adicionar' : `Adicionar ${trackIds.length} faixas`}
        </Display>

        {/* Fila primeiro: é a ação mais frequente e não exige escolher nada. */}
        {track && picked.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 9, marginTop: 14 }}>
            <QueueAction
              label="Tocar em seguida"
              accent={accent}
              onPress={() => {
                enqueueNext(picked);
                onClose();
              }}
            />
            <QueueAction
              label="No fim da fila"
              accent={accent}
              onPress={() => {
                enqueueLast(picked);
                onClose();
              }}
            />
          </View>
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginTop: 16,
            paddingHorizontal: 14,
            height: 48,
            borderRadius: R.r15,
            backgroundColor: C.card,
            borderWidth: 1,
            borderColor: name.trim() ? T.t14 : T.t07,
          }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nome de uma lista nova"
            placeholderTextColor={T.t34}
            selectionColor={accent}
            returnKeyType="done"
            onSubmitEditing={createAndPut}
            style={{
              flex: 1,
              color: T.full,
              fontFamily: 'FamiljenGrotesk_500Medium',
              fontSize: 15,
              padding: 0,
            }}
          />
          <Pressable onPress={createAndPut} disabled={!name.trim()} hitSlop={8}>
            <Body size={13} weight={600} color={name.trim() ? accent : T.t24}>
              Criar
            </Body>
          </Pressable>
        </View>

        {playlists.length > 0 && (
          <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 8 }}>
            {playlists.map((playlist) => (
              <Pressable
                key={playlist.id}
                onPress={() => put(playlist.id)}
                style={{ paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Body size={15} weight={600} tracking={-0.01} numberOfLines={1}>
                    {playlist.name}
                  </Body>
                  <Mono size={10.5} color={T.t4} style={{ marginTop: 2 }}>
                    {playlist.trackIds.length} FAIXAS
                  </Mono>
                </View>
                <Body size={20} color={accent}>
                  +
                </Body>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function QueueAction({
  label,
  accent,
  onPress,
}: {
  label: string;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 13,
        borderRadius: R.r15,
        borderWidth: 1,
        borderColor: alpha(accent, 0.45),
        alignItems: 'center',
      }}>
      <Body size={13} weight={600} color={T.t72}>
        {label}
      </Body>
    </Pressable>
  );
}

/**
 * Evita repetir estado de folha em cada tela que lista faixas: devolve o abridor e o
 * elemento a renderizar.
 */
export function usePlaylistSheet() {
  const [tracks, setTracks] = useState<string[] | null>(null);
  return {
    open: (trackIds: string[]) => setTracks(trackIds),
    sheet: (
      <PlaylistSheet
        visible={tracks !== null}
        trackIds={tracks ?? []}
        onClose={() => setTracks(null)}
      />
    ),
  };
}
