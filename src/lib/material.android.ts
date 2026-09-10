/**
 * As cores do Material 3 deste aparelho. Ver `material.ts` para o porquê da divisão.
 *
 * A paleta é **semeada pelo acento do usuário**, e não tirada do papel de parede.
 * `SchemeTonalSpot` é o mesmo algoritmo do Material You, então o que sai daqui é uma
 * paleta Material legítima — só que ancorada na cor que a pessoa escolheu no app, que é o
 * que mantém a barra do Resonate reconhecível como do Resonate. Tirar o `seedColor` da
 * chamada é o que traria as cores do papel de parede, e funciona: é uma linha.
 *
 * O esquema é cravado em escuro porque o app é escuro — `userInterfaceStyle: 'dark'` no
 * app.json. Sem isto, um aparelho em modo claro devolveria superfícies claras para
 * cartões que têm texto claro em cima.
 */

import { getMaterialColors } from '@expo/ui/jetpack-compose';
import { useMemo } from 'react';

import type { MaterialSurface } from './material';

export type { MaterialSurface } from './material';

/**
 * O Material 3 está disponível nesta execução do app.
 *
 * A pergunta parece boba num arquivo `.android.ts` — mas ela não é sobre o sistema, é
 * sobre o binário: `@expo/ui` traz módulo nativo, e um app instalado antes de a dependência
 * entrar não o tem. Sem esta checagem, ligar a interface nativa nesse app abriria uma tela
 * de Ajustes que estoura no primeiro render.
 *
 * Uma leitura de paleta é a sonda mais barata que existe para isso, e ela roda uma vez.
 */
export const MATERIAL_AVAILABLE: boolean = (() => {
  try {
    getMaterialColors({ scheme: 'dark' });
    return true;
  } catch {
    return false;
  }
})();

/**
 * `getMaterialColors` dentro de um `useMemo`, e não o `useMaterialColors` do pacote: o
 * hook chama o módulo nativo a cada render de quem o usa, sem memo nenhum, e quem usa
 * isto é a barra inferior — que está montada em toda tela do app. Uma leitura por troca de
 * acento é o que a paleta precisa.
 *
 * O `try` cobre o app que ainda não foi recompilado depois de `@expo/ui` entrar nas
 * dependências: sem o módulo nativo a chamada estoura, e uma barra que não pinta é melhor
 * que um app que não abre.
 */
export function useMaterialSurface(seed: string): MaterialSurface | null {
  return useMemo(() => {
    try {
      const colors = getMaterialColors({ seedColor: seed, scheme: 'dark' });
      return {
        surface: colors.surfaceContainer,
        raised: colors.surfaceContainerHigh,
        outline: colors.outlineVariant,
      };
    } catch {
      return null;
    }
  }, [seed]);
}
