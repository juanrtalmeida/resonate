/**
 * Corrigir metadados à mão.
 *
 * Acervo local tem tag errada: faixa sem título que vira o nome do arquivo, "Various
 * Artists" onde devia estar a banda, acento comido, artista escrito de três formas. Aqui
 * o usuário conserta o que a varredura leu.
 *
 * A correção fica no app, não no arquivo — ver `lib/edits.ts` para o porquê.
 *
 * Três alcances, um formulário:
 *
 *   faixa    título, artista, álbum, número e gênero de uma faixa
 *   álbum    álbum, artista e gênero de todas as faixas dele, de uma vez
 *   artista  o nome, em toda a biblioteca
 *
 * O contrato é o de `usePlaylistSheet` e `useItemMenu` — devolve o abridor e o elemento a
 * renderizar, então a tela que a usa precisa de duas linhas.
 */

import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { C, R, T, alpha } from '@/constants/theme';
import type { TrackEdit } from '@/lib/edits';
import { usePrefs } from '@/lib/prefs';
import type { Album, Track } from '@/lib/scan';
import { Body, Mono } from './text';
import { Sheet } from './sheet';

/** O que se pediu para editar. */
export type Editable =
  | { kind: 'track'; track: Track }
  | { kind: 'album'; album: Album; tracks: Track[] }
  | { kind: 'artist'; name: string; tracks: Track[] };

/** Um campo do formulário: a chave que ele grava e o rótulo que ele mostra. */
type Field = {
  key: 'title' | 'artist' | 'album' | 'trackNumber' | 'genre';
  label: string;
  value: string;
  /** Número de faixa é o único campo numérico. */
  numeric?: boolean;
};

function fieldsFor(item: Editable): Field[] {
  if (item.kind === 'artist') {
    return [{ key: 'artist', label: 'Nome do artista', value: item.name }];
  }
  if (item.kind === 'album') {
    const first = item.tracks[0];
    return [
      { key: 'album', label: 'Álbum', value: item.album.title },
      { key: 'artist', label: 'Artista', value: item.album.artist },
      { key: 'genre', label: 'Gênero', value: first?.genre ?? '' },
    ];
  }
  const t = item.track;
  return [
    { key: 'title', label: 'Título', value: t.title },
    { key: 'artist', label: 'Artista', value: t.artist },
    { key: 'album', label: 'Álbum', value: t.album },
    { key: 'trackNumber', label: 'Número', value: t.trackNumber?.toString() ?? '', numeric: true },
    { key: 'genre', label: 'Gênero', value: t.genre ?? '' },
  ];
}

const titleFor = (item: Editable) =>
  item.kind === 'track' ? 'Editar faixa' : item.kind === 'album' ? 'Editar álbum' : 'Editar artista';

/** Quantas faixas a correção alcança. Dito na folha: editar álbum mexe em todas elas. */
function reachOf(item: Editable): string | null {
  if (item.kind === 'track') return null;
  const n = item.tracks.length;
  return `A correção vale para ${n} ${n === 1 ? 'faixa' : 'faixas'}`;
}

export function useEditSheet() {
  const [item, setItem] = useState<Editable | null>(null);

  return {
    open: (next: Editable) => setItem(next),
    sheet: item ? <EditSheet item={item} onClose={() => setItem(null)} /> : null,
  };
}

/**
 * Componente à parte, e montado só quando há o que editar.
 *
 * Os campos nascem do item — `useState` com o valor inicial. Montar a folha sempre e
 * trocar o item dentro dela deixaria os campos com o texto do item anterior, porque
 * estado inicial só vale na montagem.
 */
function EditSheet({ item, onClose }: { item: Editable; onClose: () => void }) {
  const { accent, editTracks, renameArtist, clearEdits } = usePrefs();
  const fields = fieldsFor(item);
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, f.value]))
  );

  const dirty = fields.some((f) => (draft[f.key] ?? '') !== f.value);

  const save = () => {
    if (!dirty) return onClose();

    if (item.kind === 'artist') {
      const to = draft.artist?.trim();
      if (to) renameArtist(item.name, to);
      return onClose();
    }

    const patch: TrackEdit = {};
    for (const f of fields) {
      const value = (draft[f.key] ?? '').trim();
      if (value === f.value) continue;
      if (f.key === 'trackNumber') {
        const n = parseInt(value, 10);
        patch.trackNumber = Number.isFinite(n) ? n : null;
      } else if (f.key === 'genre') {
        // Gênero em branco é "esta faixa não tem gênero", e não a string vazia: é ele que
        // classifica podcast e alimenta os chips da biblioteca.
        patch.genre = value || null;
      } else if (value) {
        // Título, artista e álbum em branco não são apagáveis: a lista precisa de texto
        // para mostrar, e o vazio viraria uma linha sem nome nenhum.
        patch[f.key] = value;
      }
    }

    const ids = item.kind === 'album' ? item.tracks.map((t) => t.id) : [item.track.id];
    editTracks(ids, patch);
    onClose();
  };

  const reach = reachOf(item);

  return (
    <Sheet visible onClose={onClose} title={titleFor(item)}>
      {reach && (
        <Mono size={9.5} weight={500} tracking={0.16} caps color={T.t4} style={{ marginTop: 2 }}>
          {reach}
        </Mono>
      )}

      {fields.map((field, index) => (
        <View key={field.key} style={{ marginTop: index === 0 ? 14 : 12 }}>
          <Mono size={9.5} weight={500} tracking={0.16} caps color={T.t4}>
            {field.label}
          </Mono>
          <TextInput
            value={draft[field.key] ?? ''}
            onChangeText={(text) => setDraft((prev) => ({ ...prev, [field.key]: text }))}
            placeholder={field.value || '—'}
            placeholderTextColor={T.t34}
            selectionColor={accent}
            keyboardType={field.numeric ? 'number-pad' : 'default'}
            autoCapitalize={field.numeric ? 'none' : 'words'}
            style={{
              marginTop: 7,
              height: 46,
              paddingHorizontal: 14,
              borderRadius: R.r15,
              backgroundColor: C.card,
              borderWidth: 1,
              borderColor:
                (draft[field.key] ?? '') !== field.value ? alpha(accent, 0.5) : T.t07,
              color: T.full,
              fontFamily: 'FamiljenGrotesk_500Medium',
              fontSize: 15,
            }}
          />
        </View>
      ))}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 18 }}>
        {/* Voltar ao que a tag diz. Só onde há edição de faixa para desfazer: o renome de
            artista é uma regra à parte, e desfazê-lo é escrever o nome antigo de volta. */}
        {item.kind !== 'artist' && (
          <Pressable
            onPress={() => {
              clearEdits(item.kind === 'album' ? item.tracks.map((t) => t.id) : [item.track.id]);
              onClose();
            }}
            hitSlop={8}
            style={{ paddingVertical: 8 }}>
            <Body size={13} weight={600} color={T.t42}>
              Usar a tag
            </Body>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable onPress={onClose} hitSlop={8} style={{ paddingVertical: 8 }}>
          <Body size={13.5} weight={600} color={T.t5}>
            Cancelar
          </Body>
        </Pressable>
        <Pressable
          onPress={save}
          disabled={!dirty}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 18,
            borderRadius: R.r13,
            backgroundColor: dirty ? accent : T.t06,
          }}>
          <Body size={13.5} weight={600} color={dirty ? C.onAccent : T.t24}>
            Salvar
          </Body>
        </Pressable>
      </View>
    </Sheet>
  );
}
