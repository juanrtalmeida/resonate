/**
 * Nivelamento de volume por ReplayGain.
 *
 * O incômodo que isto resolve: numa biblioteca de arquivos baixados convivem masterizações
 * de épocas diferentes, e a mão vai ao volume a cada troca de álbum. O streaming resolveu
 * isso há quinze anos; player de arquivo local, quase nunca.
 *
 * ReplayGain não é um efeito — é um **número que já está na tag**, medido por quem
 * codificou o arquivo, dizendo quantos decibéis somar para aquela faixa soar na mesma
 * altura percebida que as outras. A premissa do projeto favorece: `01-contexto.md` diz que
 * a origem esperada é FLAC de serviços de download com metadados completos, e é justamente
 * esse arquivo que vem com `REPLAYGAIN_*` preenchido.
 *
 * Aplicar é mexer no volume da reprodução, não filtrar o sinal — então, ao contrário do
 * equalizador (ver `docs/07-roadmap-e-divida.md`), **não depende de trocar o motor de
 * áudio**. É `player.volume`, que o `expo-audio` já oferece.
 *
 * Puro e testado, como `sleep.ts` e `history.ts`: é uma conta que decide o volume de tudo
 * o que se ouve, e errar o sinal do expoente deixaria o app quase mudo sem erro nenhum.
 */

/** O que o usuário escolhe em Ajustes. */
export type Leveling = 'off' | 'track' | 'album';

export const LEVELINGS: Leveling[] = ['off', 'album', 'track'];

/** Os ganhos que a tag declarou, em decibéis. `null` quando o arquivo não traz. */
export type Gain = {
  track: number | null;
  album: number | null;
};

export const NO_GAIN: Gain = { track: null, album: null };

/**
 * O valor de uma tag `REPLAYGAIN_*` em decibéis.
 *
 * O formato do padrão é `"-7.53 dB"`, mas na prática aparece sem a unidade, com `+`
 * explícito, com vírgula decimal em arquivo gerado por ferramenta localizada, e com espaço
 * a mais. Tudo isso é o mesmo número, e recusar por causa da formatação seria desligar o
 * nivelamento em arquivos que trazem a informação.
 *
 * Devolve `null` para o que não é número — inclusive para `"0.00 dB"`? **Não**: zero é uma
 * medida válida e significa "esta faixa já está na referência". Só texto sem número é null.
 */
export function parseGain(value: string | null | undefined): number | null {
  if (!value) return null;
  // Sinal, o número, e o que vier depois (a unidade) ignorado.
  const match = /^([+-]?)\s*(\d+(?:[.,]\d+)?)/.exec(value.trim());
  if (!match) return null;
  const magnitude = Number(match[2].replace(',', '.'));
  if (!Number.isFinite(magnitude)) return null;
  return match[1] === '-' ? -magnitude : magnitude;
}

/**
 * Quanto o volume da reprodução deve valer, de 0 a 1.
 *
 * ## O teto de 1.0, e por que ele não é um problema
 *
 * `expo-audio` aceita volume de 0 a 1, então **ganho positivo não pode ser aplicado** — não
 * há para onde subir a partir do volume cheio. Na prática isso quase não acontece:
 * ReplayGain normaliza *para baixo*, contra uma referência conservadora, e a esmagadora
 * maioria dos valores é negativa. O que vem positivo é faixa gravada muito baixa, e ali o
 * app fica no volume cheio — o mesmo que ele fazia antes de existir nivelamento. Nunca
 * soa *pior* que sem a função.
 *
 * ## Álbum antes de faixa
 *
 * No modo `album` o ganho do álbum é o certo, e o da faixa é o desempate quando o arquivo
 * não traz o do álbum. É a escolha que preserva a dinâmica *dentro* do disco: nivelar
 * faixa por faixa achata a passagem baixa que o artista quis baixa, e num disco conceitual
 * ou ao vivo isso é destruir a intenção. Faixa por faixa serve para escuta embaralhada,
 * que é o outro modo.
 *
 * ## Sem tag
 *
 * Volume cheio. O arquivo não disse nada, e inventar um ganho seria pior que não nivelar.
 */
export function gainVolume(gain: Gain, mode: Leveling): number {
  if (mode === 'off') return 1;
  const db = mode === 'album' ? (gain.album ?? gain.track) : (gain.track ?? gain.album);
  if (db == null) return 1;
  return dbToVolume(db);
}

/**
 * Decibéis para fator linear de amplitude: `10^(dB/20)`.
 *
 * Vinte, e não dez: decibel de **amplitude** usa 20, e volume é amplitude. Com 10 o efeito
 * sai ao quadrado — −6 dB viraria 0,25 em vez de 0,5, e a biblioteca inteira soaria
 * abafada. É o erro que este módulo existe para ter um teste em cima.
 *
 * O piso de 0.05 é uma rede: uma tag corrompida com `-60 dB` deixaria a faixa inaudível, e
 * "o app não toca" é pior que "o app toca baixo".
 */
export function dbToVolume(db: number): number {
  const linear = Math.pow(10, db / 20);
  return Math.min(1, Math.max(0.05, linear));
}
