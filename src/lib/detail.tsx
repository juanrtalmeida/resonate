/**
 * Álbum e artista, como camadas — e não como rotas.
 *
 * Eram telas do router com `presentation: 'transparentModal'`, que no Android é uma
 * **janela nativa própria** acima da janela do root. Consequência: a barra inferior do
 * root não alcançava por cima delas, e cada uma tinha de renderizar a própria
 * `<Chrome overModal />`. Duas posições diferentes na árvore são duas instâncias, então a
 * cada abrir e fechar o mini player inteiro desmontava de um lado e remontava do outro —
 * medido com uma sonda de quadros: **547 ms de thread de JS travada** depois de fechar, e
 * o toque desse vão era perdido.
 *
 * Como camadas dentro do layout raiz elas ficam na mesma janela, empilhadas por ordem
 * entre o `<Stack>` e a `<Chrome>`. Uma barra só, montada uma vez; a tela de baixo
 * continua visível atrás, que é de onde a transição de zoom vive; e não há troca de
 * instância para custar nada.
 *
 * O preço é deixarem de ser rotas: não há link direto para um álbum, e o botão voltar do
 * Android é atendido pelo `ZoomScreen` de cada camada (ele já registrava um handler para
 * fechar com a animação em vez de desmontar seco).
 *
 * Uma pilha, e não um só: a tela de álbum abre o artista, e a do artista abre álbuns.
 *
 * O Now Playing entrou aqui pelo mesmo caminho, e por um motivo que só apareceu ao medir:
 * `transparentModal` no Android desenha **dentro** do `<Stack>` do router, que é o primeiro
 * irmão do layout. As camadas vêm depois e cobrem tudo o que está no Stack — inclusive o
 * player. Tocar no mini player com um álbum aberto de fato abria o player, e a camada do
 * álbum ficava por cima dele. Como camada, a ordem passa a ser nossa: Stack, álbum/artista,
 * barra, player.
 */

import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';

import { chromeExpand } from './chrome-scroll';

export type Detail = { kind: 'album'; id: string } | { kind: 'artist'; name: string };

type DetailApi = {
  /** Da base para o topo. Vazia quando nenhuma camada está aberta. */
  stack: Detail[];
  openAlbum: (id: string) => void;
  openArtist: (name: string) => void;
  /** Fecha a camada do topo. */
  close: () => void;
  /** Fecha tudo o que está por cima: as camadas e o player. Sem voo de volta. */
  closeAll: () => void;
  /** O Now Playing. Camada única, e acima da barra. */
  playerOpen: boolean;
  openPlayer: () => void;
  closePlayer: () => void;
};

const Ctx = createContext<DetailApi | null>(null);

export function DetailProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Detail[]>([]);
  const [playerOpen, setPlayerOpen] = useState(false);

  /*
    `chromeExpand` no abrir e no fechar.

    Enquanto eram rotas, quem fazia isso era o efeito da `Chrome` sobre o `pathname`. Como
    camadas o pathname não muda, e sem isto a barra ficava recolhida ao entrar num álbum
    depois de ter rolado a biblioteca.
  */
  const push = useCallback((next: Detail) => {
    chromeExpand();
    setStack((current) => [...current, next]);
  }, []);

  const api = useMemo<DetailApi>(
    () => ({
      stack,
      openAlbum: (id) => push({ kind: 'album', id }),
      openArtist: (name) => push({ kind: 'artist', name }),
      close: () => {
        chromeExpand();
        setStack((current) => current.slice(0, -1));
      },
      /*
        Sair de tudo de uma vez, sem voo de volta.

        É o toque no destino que já está aberto: "me tira daqui". O voo de fechamento mora
        dentro de cada `ZoomScreen` e leva a capa de volta ao retângulo de onde ela saiu —
        aqui não há para onde voar, porque a tela de baixo pode ser outra aba inteira. Um
        corte é honesto: o destino já está desenhado embaixo.
      */
      closeAll: () => {
        chromeExpand();
        setPlayerOpen(false);
        setStack((current) => (current.length ? [] : current));
      },
      playerOpen,
      openPlayer: () => setPlayerOpen(true),
      closePlayer: () => setPlayerOpen(false),
    }),
    [stack, push, playerOpen]
  );

  return <Ctx value={api}>{children}</Ctx>;
}

export function useDetail(): DetailApi {
  const api = use(Ctx);
  if (!api) throw new Error('useDetail fora de DetailProvider');
  return api;
}
