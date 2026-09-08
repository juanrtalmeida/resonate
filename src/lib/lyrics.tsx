/**
 * A letra de uma faixa, lida uma vez e guardada.
 *
 * Existe para o painel de letras abrir com a letra já na mão. Antes a leitura começava
 * quando o painel abria: `readLyrics` é I/O de arquivo, e até resolver a tela ficava em
 * branco — era a demora que se via ao tocar na aba.
 *
 * O cache é de módulo, não de contexto: a letra de uma faixa não muda enquanto o app
 * está aberto, e quem a pede de novo (reabrir o painel, voltar para a faixa) não deve
 * pagar o disco outra vez.
 */

import { useEffect, useState } from 'react';

import { parseLrc, type Lyrics } from './lrc';
import { readLyrics, type Track } from './scan';

/** Letra vazia: o painel sabe distinguir "ainda não sei" de "não tem". */
export const EMPTY_LYRICS: Lyrics = { lines: [], synced: false };

const cache = new Map<string, Lyrics>();

/**
 * Devolve a letra, ou null enquanto ela não é conhecida.
 *
 * Chamada em dois lugares de propósito: no Now Playing, que a aquece enquanto o usuário
 * olha a capa, e no painel, que na maioria das vezes já a encontra pronta.
 *
 * Aceita null porque o Now Playing a chama antes de saber se há faixa: hook não pode
 * ficar atrás de um `return` antecipado.
 */
export function useLyrics(track: Track | null): Lyrics | null {
  /*
    O que se sabe sem tocar no disco, derivado no render: o cache, ou "esta faixa não tem
    letra". Estado só para o que vem do disco — o resto sair de um `setState` em efeito era
    um render a mais por faixa, e o lint tem razão em reclamar.
  */
  const known = !track
    ? EMPTY_LYRICS
    : (cache.get(track.id) ?? (track.hasLyrics ? null : EMPTY_LYRICS));
  const [loaded, setLoaded] = useState<{ id: string; lyrics: Lyrics } | null>(null);

  useEffect(() => {
    if (known || !track) return;
    let alive = true;
    readLyrics(track).then((raw) => {
      const parsed = parseLrc(raw ?? '');
      cache.set(track.id, parsed);
      if (alive) setLoaded({ id: track.id, lyrics: parsed });
    });
    return () => {
      alive = false;
    };
  }, [track, known]);

  // O id vem junto: trocar de faixa no meio de uma leitura não pode mostrar a letra da
  // faixa anterior.
  if (known) return known;
  return loaded && track && loaded.id === track.id ? loaded.lyrics : null;
}

/** Depois de importar um `.lrc`: o que estava guardado não vale mais. */
export function forgetLyrics(trackId: string): void {
  cache.delete(trackId);
}
