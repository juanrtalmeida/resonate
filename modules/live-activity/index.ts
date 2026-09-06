/**
 * Live Activity do que está tocando: cartão na tela de bloqueio e Dynamic Island.
 *
 * Existe só no iOS 16.2+. No Android, em iOS anterior, ou quando o usuário desliga Live
 * Activities nos ajustes, tudo aqui não faz nada — o player não depende disto.
 *
 * `requireOptionalNativeModule` em vez de import direto: é o mesmo cuidado do
 * expo-media-library, e evita que um build sem o módulo derrube o app no boot.
 */

import { requireOptionalNativeModule } from 'expo-modules-core';

export type LiveActivityState = {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  isPlaying: boolean;
  /** Segundos decorridos no instante da publicação. */
  elapsed: number;
  /** Zero quando a duração ainda não é conhecida. */
  duration: number;
  /** `#RRGGBB`, para a ilha usar o acento do app. */
  accentHex: string;
  /**
   * Caminho da capa. A extensão não alcança o sandbox do app: sem um App Group
   * compartilhado o arquivo não abre e o widget cai no degradê do acento.
   */
  artworkPath?: string;
};

type Native = {
  isSupported: () => boolean;
  start: (state: LiveActivityState) => Promise<void>;
  update: (state: LiveActivityState) => Promise<void>;
  end: () => Promise<void>;
};

const native = requireOptionalNativeModule<Native>('LiveActivity');

export const isSupported = (): boolean => {
  try {
    return native?.isSupported() ?? false;
  } catch {
    return false;
  }
};

const quiet = (run: () => Promise<void> | undefined) => {
  try {
    void run()?.catch(() => {});
  } catch {
    // Uma atividade que não sobe não é motivo para interromper a reprodução.
  }
};

export const start = (state: LiveActivityState) => quiet(() => native?.start(state));
export const update = (state: LiveActivityState) => quiet(() => native?.update(state));
export const end = () => quiet(() => native?.end());
