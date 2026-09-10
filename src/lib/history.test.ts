/** node --test src/lib/history.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addMonths,
  boundsOf,
  byHour,
  byWeekday,
  compareDays,
  dayKey,
  dayOf,
  daysWithPlays,
  keep,
  MIN_LISTEN,
  monthGrid,
  monthLength,
  peakHour,
  compareMonths,
  monthOf,
  rolling,
  sameDay,
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

test('um dia escolhido cobre o dia inteiro do calendário local', () => {
  const d = { year: 2026, month: 7, day: 12 };
  const b = boundsOf({ kind: 'days', from: d, to: d }, 0);
  assert.equal(new Date(b.from).getMonth(), 7);
  assert.equal(new Date(b.from).getDate(), 12);
  assert.equal(new Date(b.from).getHours(), 0);
  assert.equal(new Date(b.from).getMinutes(), 0);
  // Último instante do dia 12: 23:59:59.999.
  assert.equal(new Date(b.to).getDate(), 12);
  assert.equal(new Date(b.to).getHours(), 23);
  assert.equal(new Date(b.to + 1).getDate(), 13);
});

test('dois dias escolhidos vão da meia-noite do primeiro ao fim do último', () => {
  const b = boundsOf(
    { kind: 'days', from: { year: 2026, month: 7, day: 12 }, to: { year: 2026, month: 7, day: 19 } },
    0
  );
  assert.equal(new Date(b.from).getDate(), 12);
  assert.equal(new Date(b.from).getHours(), 0);
  assert.equal(new Date(b.to).getDate(), 19);
  assert.equal(new Date(b.to + 1).getDate(), 20);
  // Oito dias inclusive, e não sete: as duas pontas contam.
  assert.equal(Math.round((b.to + 1 - b.from) / 86_400_000), 8);
});

test('o último dia do mês fecha na virada, e fevereiro respeita o bissexto', () => {
  const jan = { year: 2026, month: 0, day: 31 };
  const b = boundsOf({ kind: 'days', from: jan, to: jan }, 0);
  assert.equal(new Date(b.to + 1).getMonth(), 1);
  assert.equal(new Date(b.to + 1).getDate(), 1);

  const leap = { year: 2028, month: 1, day: 29 };
  const l = boundsOf({ kind: 'days', from: leap, to: leap }, 0);
  assert.equal(new Date(l.to).getDate(), 29);
  assert.equal(new Date(l.to + 1).getMonth(), 2);
});

test('um intervalo escolhido de trás para a frente vale igual', () => {
  const a = { year: 2026, month: 5, day: 3 };
  const b = { year: 2026, month: 8, day: 21 };
  assert.deepEqual(
    boundsOf({ kind: 'days', from: a, to: b }, 0),
    boundsOf({ kind: 'days', from: b, to: a }, 0)
  );
});

test('o intervalo cruza o ano sem buraco', () => {
  const b = boundsOf(
    {
      kind: 'days',
      from: { year: 2025, month: 11, day: 30 },
      to: { year: 2026, month: 0, day: 2 },
    },
    0
  );
  assert.equal(new Date(b.from).getFullYear(), 2025);
  assert.equal(new Date(b.from).getMonth(), 11);
  assert.equal(new Date(b.to).getFullYear(), 2026);
  assert.equal(new Date(b.to).getDate(), 2);
  assert.equal(Math.round((b.to + 1 - b.from) / 86_400_000), 4);
});

test('comparação e identidade de dias', () => {
  assert.ok(compareDays({ year: 2025, month: 11, day: 31 }, { year: 2026, month: 0, day: 1 }) < 0);
  assert.ok(compareDays({ year: 2026, month: 3, day: 2 }, { year: 2026, month: 3, day: 1 }) > 0);
  assert.equal(compareDays({ year: 2026, month: 3, day: 9 }, { year: 2026, month: 3, day: 9 }), 0);
  assert.equal(sameDay({ year: 2026, month: 3, day: 9 }, { year: 2026, month: 3, day: 9 }), true);
  assert.equal(sameDay({ year: 2026, month: 3, day: 9 }, { year: 2026, month: 2, day: 9 }), false);
});

test('comparação e identidade de meses', () => {
  assert.ok(compareMonths({ year: 2025, month: 11 }, { year: 2026, month: 0 }) < 0);
  assert.ok(compareMonths({ year: 2026, month: 3 }, { year: 2026, month: 1 }) > 0);
  assert.equal(compareMonths({ year: 2026, month: 3 }, { year: 2026, month: 3 }), 0);
  assert.equal(sameMonth({ year: 2026, month: 3 }, { year: 2026, month: 3 }), true);
  assert.equal(sameMonth({ year: 2026, month: 3 }, { year: 2025, month: 3 }), false);
});

test('monthOf e dayOf devolvem o mês e o dia locais do instante', () => {
  assert.deepEqual(monthOf(at(0, 12)), { year: 2026, month: 0 });
  assert.deepEqual(dayOf(at(0, 12)), { year: 2026, month: 0, day: 4 });
});

test('a chave do dia é zero-padded e ordena como o calendário', () => {
  assert.equal(dayKey({ year: 2026, month: 0, day: 4 }), '2026-01-04');
  assert.equal(dayKey({ year: 2026, month: 11, day: 25 }), '2026-12-25');
  const keys = [
    dayKey({ year: 2026, month: 9, day: 2 }),
    dayKey({ year: 2026, month: 1, day: 28 }),
    dayKey({ year: 2026, month: 1, day: 9 }),
  ].sort();
  assert.deepEqual(keys, ['2026-02-09', '2026-02-28', '2026-10-02']);
});

test('addMonths vira a folha sem mexer no dia, e atravessa o ano', () => {
  assert.deepEqual(addMonths({ year: 2026, month: 0 }, 1), { year: 2026, month: 1 });
  assert.deepEqual(addMonths({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
  assert.deepEqual(addMonths({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
  assert.deepEqual(addMonths({ year: 2026, month: 5 }, -18), { year: 2024, month: 11 });
});

test('o tamanho do mês cobre 30, 31 e os dois fevereiros', () => {
  assert.equal(monthLength({ year: 2026, month: 0 }), 31);
  assert.equal(monthLength({ year: 2026, month: 3 }), 30);
  assert.equal(monthLength({ year: 2026, month: 1 }), 28);
  assert.equal(monthLength({ year: 2028, month: 1 }), 29);
});

test('a grade do mês alinha o dia 1º debaixo do dia da semana dele', () => {
  const m = { year: 2026, month: 1 }; // 1º de fevereiro de 2026 é domingo
  const cells = monthGrid(m);
  assert.equal(new Date(2026, 1, 1).getDay(), 0);
  assert.equal(cells[0]?.day, 1);
  assert.equal(cells.length, 28);

  // Março de 2026 começa no domingo também; janeiro começa numa quinta.
  const jan = monthGrid({ year: 2026, month: 0 });
  const lead = new Date(2026, 0, 1).getDay();
  assert.equal(lead, 4);
  assert.deepEqual(jan.slice(0, lead), [null, null, null, null]);
  assert.equal(jan[lead]?.day, 1);
  assert.equal(jan.length, lead + 31);
  assert.equal(jan[jan.length - 1]?.day, 31);
});

test('os dias com escuta saem do próprio histórico', () => {
  const days = daysWithPlays([
    play({ at: at(0, 21) }),
    play({ at: at(0, 3) }),
    play({ at: at(2, 15) }),
  ]);
  assert.equal(days.size, 2);
  assert.ok(days.has(dayKey(dayOf(at(0, 21)))));
  assert.ok(days.has(dayKey(dayOf(at(2, 15)))));
  assert.equal(days.has(dayKey(dayOf(at(1, 12)))), false);
  assert.equal(daysWithPlays([]).size, 0);
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
