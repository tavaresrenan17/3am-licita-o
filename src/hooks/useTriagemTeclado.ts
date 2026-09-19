/**
 * Liga as teclas da triagem à lista de licitações.
 *
 * O fio condutor é fino de propósito: a decisão de qual ação cada tecla
 * representa — e as regras que impedem um atalho de disparar enquanto alguém
 * digita ou está com o foco num botão — vivem em `@/lib/teclado`, onde dá para
 * testá-las sem DOM. O projeto não tem biblioteca de teste de componente e o
 * Vitest roda em ambiente `node`; pôr lógica aqui seria pôr lógica onde ela
 * não pode ser verificada.
 *
 * Se este arquivo crescer, é sinal de que há decisão no lugar errado.
 */
import { useEffect, useRef, useState } from "react";
import { avancaApos, decidirAcaoTecla, limitarIndice, type AcaoTriagem } from "@/lib/teclado";

export interface OpcoesTriagem {
  tamanho: number;
  /**
   * false desliga os atalhos por completo. É a proteção por CONTEXTO, e existe
   * ao lado da proteção por FOCO de `decidirAcaoTecla`: com um diálogo aberto,
   * o foco pode estar em qualquer lugar da camada modal — inclusive no `body`,
   * que é inerte — e nenhuma tecla pode classificar uma licitação que o
   * usuário nem enxerga.
   */
  ativo: boolean;
  /**
   * Mantém o ouvinte de pé processando SÓ a ação de ajuda. É o que permite o
   * `?` fechar o painel que o `?` abriu: desligar o ouvinte inteiro deixaria
   * a segunda batida sem destino, e o painel só fecharia no mouse.
   */
  somenteAjuda?: boolean;
  /**
   * Identidade do recorte exibido. Quando ela muda — outra página, outro
   * filtro, outra ordenação — a seleção volta para "nada selecionado": o mesmo
   * índice sobre outra lista aponta para uma licitação que o usuário nunca viu,
   * e o `i` seguinte marcaria a errada.
   */
  chaveLista: string;
  aoAgir: (acao: AcaoTriagem, indice: number) => void;
}

export function useTriagemTeclado({
  tamanho,
  ativo,
  somenteAjuda = false,
  chaveLista,
  aoAgir,
}: OpcoesTriagem) {
  const [indice, setIndiceBruto] = useState(-1);

  // O ouvinte é registrado uma vez e fecha sobre o índice daquele render. O ref
  // é como ele lê o valor atual sem virar dependência do efeito.
  const indiceRef = useRef(indice);
  indiceRef.current = indice;

  // Trocar de página ou de filtro sem trocar a contagem mantinha o índice
  // apontando para outra licitação. Zerar é a única resposta honesta.
  useEffect(() => {
    setIndiceBruto(-1);
  }, [chaveLista]);

  // A lista também muda de tamanho sem mudar de recorte — uma classificação
  // que tira o item do filtro atual, por exemplo; a seleção não pode ficar
  // apontando para um item que não existe mais.
  useEffect(() => {
    setIndiceBruto((atual) => (atual < 0 ? atual : limitarIndice(atual, tamanho)));
  }, [tamanho]);

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
        alvoRole: (alvo?.getAttribute?.("role") ?? "").toLowerCase(),
        alvoEditavel: alvo?.isContentEditable === true,
      });
      if (!acao) return;
      if (somenteAjuda && acao.tipo !== "ajuda") return;
      e.preventDefault();

      if (acao.tipo === "mover") {
        setIndiceBruto((atual) => limitarIndice(atual < 0 ? 0 : atual + acao.delta, tamanho));
        return;
      }

      // `aoAgir` fica FORA do atualizador de estado: atualizador precisa ser
      // puro, e o React o chama duas vezes em StrictMode — o que classificaria
      // duas licitações com um toque só.
      const atual = indiceRef.current;
      aoAgir(acao, atual);

      // Sem seleção não há o que classificar nem para onde avançar.
      if (atual >= 0 && avancaApos(acao)) {
        setIndiceBruto((i) => limitarIndice(i + 1, tamanho));
      }
    }

    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ativo, somenteAjuda, tamanho, aoAgir]);

  return { indice };
}
