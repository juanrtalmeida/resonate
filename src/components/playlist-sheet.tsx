/**
 * Folha para jogar faixas numa lista. Aparece no toque longo de uma faixa e no botão do
 * Now Playing.
 *
 * A listagem mostra a capa de cada lista e diz quando a faixa já está lá dentro: sem
 * isso, escolher uma lista era ler quatro nomes iguais em cinza e torcer.
 */

import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { C, R, T, alpha } from '@/constants/theme';
import { artworkFor } from '@/lib/artwork';
import { useLibrary } from '@/lib/library';
import { usePlayer } from '@/lib/player';
import { usePlaylists } from '@/lib/playlists';
import { usePrefs, useT } from '@/lib/prefs';
import { AlbumArt } from './album-art';
import { Check, Plus, Queue } from './icons';
import { Sheet, SheetRow } from './sheet';
import { Body, Mono } from './text';

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
  const { accent } = usePrefs();
  const t = useT();
  const { playlists, create, addTracks } = usePlaylists();
  const { track, enqueueNext, enqueueLast } = usePlayer();
  const { trackById } = useLibrary();
  const [name, setName] = useState('');

  const picked = trackIds.map(trackById).filter((item) => !!item);

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
    <Sheet
      visible={visible}
      onClose={onClose}
      title={
        trackIds.length === 1
          ? t('sheet.add')
          : t('sheet.addTracks', { tracks: t('count.tracks', { n: trackIds.length }) })
      }>
      {/* Fila primeiro: é a ação mais frequente e não exige escolher nada. */}
      {track && picked.length > 0 && (
        <Animated.View
          entering={FadeInDown.duration(240)}
          style={{ flexDirection: 'row', gap: 9, marginTop: 14 }}>
          <QueueAction
            label={t('menu.playNext')}
            accent={accent}
            onPress={() => {
              enqueueNext(picked);
              onClose();
            }}
          />
          <QueueAction
            label={t('menu.playLast')}
            accent={accent}
            onPress={() => {
              enqueueLast(picked);
              onClose();
            }}
          />
        </Animated.View>
      )}

      <Animated.View
        entering={FadeInDown.duration(240).delay(40)}
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
          borderColor: name.trim() ? alpha(accent, 0.5) : T.t07,
        }}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('sheet.newPlaylistName')}
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
            {t('common.create')}
          </Body>
        </Pressable>
      </Animated.View>

      {playlists.length > 0 && (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ marginTop: 10 }}
          contentContainerStyle={{ paddingBottom: 4 }}>
          {playlists.map((playlist, index) => {
            const inside = trackIds.every((id) => playlist.trackIds.includes(id));
            return (
              <SheetRow key={playlist.id} index={index} onPress={() => put(playlist.id)}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 8,
                  }}>
                  <AlbumArt
                    art={artworkFor(playlist.name, 'lista')}
                    size={46}
                    radius={13}
                    detail="ring"
                    cover={playlist.cover ?? null}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body size={15} weight={600} tracking={-0.01} numberOfLines={1}>
                      {playlist.name}
                    </Body>
                    <Mono size={10.5} color={T.t4} style={{ marginTop: 3 }}>
                      {playlist.trackIds.length} FAIXAS
                    </Mono>
                  </View>
                  {/* Um alvo redondo em vez de um "+" solto: diz onde tocar e mostra
                      quando não há mais nada a fazer nesta lista. */}
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: inside ? alpha(accent, 0.16) : T.t06,
                      borderWidth: 1,
                      borderColor: inside ? alpha(accent, 0.4) : T.t07,
                    }}>
                    {inside ? (
                      <Check size={15} color={accent} />
                    ) : (
                      <Plus size={15} color={T.t72} />
                    )}
                  </View>
                </View>
              </SheetRow>
            );
          })}
        </ScrollView>
      )}
    </Sheet>
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
        backgroundColor: alpha(accent, 0.08),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}>
      <Queue size={15} color={accent} />
      <Body size={13} weight={600} color={T.full}>
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
