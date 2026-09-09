/** node --test src/lib/history.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  boundsOf,
  byHour,
  byWeekday,
  keep,
  MIN_LISTEN,
  peakHour,
  compareMonths,
  monthOf,
  rolling,
  sameMonth,
  startOf,
  topAlbums,
  topArtists,
  topTracks,
  totals,
  type Play,
} from './history.ts';

/** Um instante local conhecido, para as contas por hora não dependerem do fuso. */
const at = (day: number, hour: number) => new Date(2026, 0, 4 + day, hour, 30).getTime();

let seq = 0;
const play = (over: Partial<Play> = {}): Play => ({
  at: at(0, 21),
  trackId: `t${++seq}`,
  albumId: 'a1',
  artist: 'Vela Norte',
  album: 'Casa Vazia',
  title: `Faixa ${seq}`,
  seconds: 200,
  ...over,
});

test('trinta segundos é o piso do que conta', () => {
  assert.equal(keep(MIN_LISTEN), true);
  assert.equal(keep(MIN_LISTEN - 0.1), false);
  assert.equal(keep(0), false);
});

test('os períodos recuam a partir de agora, e "all" não recua', () => {
  const now = at(0, 12);
  const day = 86_400_000;
  assert.equal(startOf('week', now), now - 7 * day);
  assert.equal(startOf('month', now), now - 30 * day);
  assert.equal(startOf('year', now), now - 365 * day);
  assert.equal(startOf('all', now), 0);
});

test('a janela corrida vai do recuo até agora', () => {
  const now = at(0, 12);
  const day = 86_400_000;
  assert.deepEqual(boundsOf(rolling('week'), now), { from: now - 7 * day, to: now });
  assert.deepEqual(boundsOf(rolling('all'), now), { from: 0, to: now });
});

test('meses escolhidos viram o intervalo do calendário local', () => {
  const b = boundsOf({ kind: 'months', from: { year: 2026, month: 7 }, to: { year: 2026, month: 7 } }, 0);
  assert.equal(new Date(b.from).getMonth(), 7);
  assert.equal(new Date(b.from).getDate(), 1);
  assert.equal(new Date(b.from).getHours(), 0);
  // Último instante de agosto: 31 às 23:59:59.999.
  assert.equal(new Date(b.to).getMonth(), 7);
  assert.equal(new Date(b.to).getDate(), 31);
  assert.equal(new Date(b.to + 1).getMonth(), 8);
});

test('fevereiro fecha no dia certo, bissexto ou não', () => {
  const leap = boundsOf({ kind: 'months', from: { year: 2028, month: 1 }, to: { year: 2028, month: 1 } }, 0);
  assert.equal(new Date(leap.to).getDate(), 29);
  const plain = boundsOf({ kind: 'months', from: { year: 2026, month: 1 }, to: { year: 2026, month: 1 } }, 0);
  assert.equal(new Date(plain.to).getDate(), 28);
});

test('um intervalo escolhido de trás para a frente vale igual', () => {
  const forward = boundsOf({ kind: 'months', from: { year: 2026, month: 5 }, to: { year: 2026, month: 8 } }, 0);
  const backward = boundsOf({ kind: 'months', from: { year: 2026, month: 8 }, to: { year: 2026, month: 5 } }, 0);
  assert.deepEqual(forward, backward);
});

test('o intervalo cruza o ano sem buraco', () => {
  const b = boundsOf({ kind: 'months', from: { year: 2025, month: 11 }, to: { year: 2026, month: 0 } }, 0);
  assert.equal(new Date(b.from).getFullYear(), 2025);
  assert.equal(new Date(b.from).getMonth(), 11);
  assert.equal(new Date(b.to).getFullYear(), 2026);
  assert.equal(new Date(b.to).getMonth(), 0);
});

test('comparação e identidade de meses', () => {
  assert.ok(compareMonths({ year: 2025, month: 11 }, { year: 2026, month: 0 }) < 0);
  assert.ok(compareMonths({ year: 2026, month: 3 }, { year: 2026, month: 1 }) > 0);
  assert.equal(compareMonths({ year: 2026, month: 3 }, { year: 2026, month: 3 }), 0);
  assert.equal(sameMonth({ year: 2026, month: 3 }, { year: 2026, month: 3 }), true);
  assert.equal(sameMonth({ year: 2026, month: 3 }, { year: 2025, month: 3 }), false);
});

test('monthOf devolve o mês local do instante', () => {
  assert.deepEqual(monthOf(at(0, 12)), { year: 2026, month: 0 });
});

test('totais contam distintos, não linhas', () => {
  const t = totals([
    play({ trackId: 'x', artist: 'A', albumId: 'a', seconds: 100 }),
    play({ trackId: 'x', artist: 'A', albumId: 'a', seconds: 100 }),
    play({ trackId: 'y', artist: 'B', albumId: 'b', seconds: 50 }),
  ]);
  assert.equal(t.seconds, 250);
  assert.equal(t.plays, 3);
  assert.equal(t.tracks, 2);
  assert.equal(t.artists, 2);
  assert.equal(t.albums, 2);
});

test('totais de um histórico vazio são zeros', () => {
  assert.deepEqual(totals([]), { seconds: 0, plays: 0, tracks: 0, artists: 0, albums: 0 });
});

test('o ranking é por tempo, não por número de escutas', () => {
  // Doze escutas curtas contra uma longa: quem ouviu mais tempo vence.
  const short = Array.from({ length: 12 }, () =>
    play({ artist: 'Curtas', albumId: 'c', seconds: 90 })
  );
  const long = play({ artist: 'Longa', albumId: 'l', seconds: 2000 });
  const [first, second] = topArtists([...short, long]);
  assert.equal(first.label, 'Longa');
  assert.equal(first.plays, 1);
  assert.equal(second.label, 'Curtas');
  assert.equal(second.plays, 12);
  assert.equal(second.seconds, 1080);
});

test('empate no tempo desempata por escutas e depois por rótulo', () => {
  const ranked = topArtists([
    play({ artist: 'Zeta', seconds: 100 }),
    play({ artist: 'Alfa', seconds: 50 }),
    play({ artist: 'Alfa', seconds: 50 }),
    play({ artist: 'Beta', seconds: 100 }),
  ]);
  // Alfa tem os mesmos 100 s com duas escutas: mais escutas vence o empate.
  assert.deepEqual(
    ranked.map((r) => r.label),
    ['Alfa', 'Beta', 'Zeta']
  );
});

test('álbum e faixa carregam o artista na segunda linha', () => {
  const rows = [play({ albumId: 'a1', album: 'Casa Vazia', artist: 'Vela Norte', trackId: 'k' })];
  assert.equal(topAlbums(rows)[0].sub, 'Vela Norte');
  assert.equal(topAlbums(rows)[0].label, 'Casa Vazia');
  assert.equal(topTracks(rows)[0].sub, 'Vela Norte');
  // Artista não repete o próprio nome embaixo.
  assert.equal(topArtists(rows)[0].sub, '');
});

test('o mesmo álbum com títulos iguais de artistas diferentes não se funde', () => {
  const ranked = topAlbums([
    play({ albumId: 'a', album: 'Interior', artist: 'Marisa', seconds: 100 }),
    play({ albumId: 'b', album: 'Interior', artist: 'Outro', seconds: 100 }),
  ]);
  assert.equal(ranked.length, 2);
});

test('distribuição por hora e por dia da semana', () => {
  const rows = [
    play({ at: at(0, 23), seconds: 300 }),
    play({ at: at(0, 23), seconds: 200 }),
    play({ at: at(1, 8), seconds: 100 }),
  ];
  const hours = byHour(rows);
  assert.equal(hours[23], 500);
  assert.equal(hours[8], 100);
  assert.equal(hours.reduce((a, b) => a + b, 0), 600);

  const days = byWeekday(rows);
  assert.equal(days[new Date(at(0, 23)).getDay()], 500);
  assert.equal(days[new Date(at(1, 8)).getDay()], 100);
});

test('o pico é a hora com mais tempo, e é null sem histórico', () => {
  assert.equal(peakHour([play({ at: at(0, 3), seconds: 400 }), play({ at: at(0, 19), seconds: 90 })]), 3);
  assert.equal(peakHour([]), null);
});
