/**
 * Liga as teclas da triagem à lista de licitações.
 *
 * O fio condutor é fino de propósito: a decisão de qual ação cada tecla
 * representa — e as regras que impedem um atalho de disparar enquanto alguém
 * digita — vivem em `@/lib/teclado`, onde dá para testá-las sem DOM. O projeto
 * não tem biblioteca de teste de componente e o Vitest roda em ambiente `node`;
 * pôr lógica aqui seria pôr lógica onde ela não pode ser verificada.
 *
 * Se este arquivo crescer, é sinal de que há decisão no lugar errado.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { decidirAcaoTecla, limitarIndice, type AcaoTriagem } from "@/lib/teclado";

export interface OpcoesTriagem {
  tamanho: number;
  /** false desliga os atalhos — por exemplo enquanto a ajuda está aberta. */
  ativo: boolean;
  aoAgir: (acao: AcaoTriagem, indice: number) => void;
}

export function useTriagemTeclado({ tamanho, ativo, aoAgir }: OpcoesTriagem) {
  const [indice, setIndiceBruto] = useState(-1);

  // O ouvinte é registrado uma vez e fecha sobre o índice daquele render. O ref
  // é como ele lê o valor atual sem virar dependência do efeito.
  const indiceRef = useRef(indice);
  indiceRef.current = indice;

  // A lista muda de tamanho ao paginar ou filtrar; a seleção não pode ficar
  // apontando para um item que não existe mais.
  useEffect(() => {
    setIndiceBruto((atual) => (atual < 0 ? atual : limitarIndice(atual, tamanho)));
  }, [tamanho]);

  const setIndice = useCallback(
    (n: number) => setIndiceBruto(limitarIndice(n, tamanho)),
    [tamanho],
  );

  useEffect(() => {
    if (!ativo) return;

    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const acao = decidirAcaoTecla({
        key: e.key,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        alvoTag: (alvo?.tagName ?? "body").toLowerCase(),
        alvoEditavel: alvo?.isContentEditable === true,
      });
      if (!acao) return;
      e.preventDefault();

      if (acao.tipo === "mover") {
        setIndiceBruto((atual) => limitarIndice(atual < 0 ? 0 : atual + acao.delta, tamanho));
        return;
      }

      // `aoAgir` fica FORA do atualizador de estado: atualizador precisa ser
      // puro, e o React o chama duas vezes em StrictMode — o que classificaria
      // duas licitações com um toque só.
      aoAgir(acao, indiceRef.current);
    }

    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ativo, tamanho, aoAgir]);

  return { indice, setIndice };
}
