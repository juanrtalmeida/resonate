/**
 * Toque no destino que já está aberto: a lista dele volta ao topo.
 *
 * Registro de módulo, e não contexto: a barra inferior é um overlay sobre o `<Stack>`, e
 * as telas que rolam não são filhas dela — não há caminho de contexto entre as duas.
 * Mesma razão de `chrome-scroll.ts`.
 *
 * Por chave de destino, e não um handler só: o router mantém montada a tela anterior, e
 * com um único registro o último a montar respondia pela aba errada.
 */

import { useEffect } from 'react';

const handlers = new Map<string, () => void>();

/** A tela diz como voltar ao topo. Sai do registro ao desmontar. */
export function useTabTop(key: string, toTop: () => void) {
  useEffect(() => {
    handlers.set(key, toTop);
    return () => {
      // Só se ainda for o nosso: outra instância da mesma aba pode ter assumido.
      if (handlers.get(key) === toTop) handlers.delete(key);
    };
  }, [key, toTop]);
}

export function tabTop(key: string) {
  handlers.get(key)?.();
}
