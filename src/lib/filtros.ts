/**
 * O vocabulário dos filtros, descrito como dado.
 *
 * Antes disto, o painel e os chips eram markup solto dentro de um arquivo de
 * 886 linhas, e acrescentar um filtro exigia editar três lugares. O resultado
 * medido: nove dos vinte filtros que o backend aceita nunca chegaram à tela, e
 * sete deles já eram aceitos pela URL — o Dashboard abria recortes que o
 * usuário não conseguia ver nem alterar.
 *
 * Com a descrição centralizada, acrescentar um filtro é acrescentar uma linha,
 * e o teste de cobertura falha se alguém esquecer.
 */
import { brl, dataBR, diaBR } from "./format";
import {
  STATUS_INTERNO_LABEL,
  filtrosVazios,
  type FiltrosLicitacoes,
  type OrdenacaoCampo,
  type StatusInterno,
} from "./types";

export type GrupoFiltro = "prazo" | "documentos" | "fluxo" | "local" | "valor";

export interface DefinicaoFiltro {
  chave: keyof FiltrosLicitacoes;
  rotulo: string;
  grupo: GrupoFiltro;
  /**
   * "booleano" é liga/desliga. "tri" tem três estados — sim, não e
   * indiferente — porque `prioridade` viaja como "", "sim" ou "nao", e
   * indiferente não é o mesmo que não.
   */
  tipo: "texto" | "data" | "moeda" | "booleano" | "opcoes" | "tri";
  /** Como o chip de filtro ativo descreve o valor escolhido. */
  descrever: (valor: string | boolean) => string;
}

/**
 * Filtros que o servidor impõe e a tela não deve oferecer.
 *
 * `apenas_abertas` é forçado `true` em toda requisição por
 * `buscarLicitacoesFn`, com o comentário de que a API nunca devolve licitação
 * encerrada. Um controle aqui daria ao usuário a impressão de que ele pode
 * desligar algo que não pode.
 */
export const SEM_CONTROLE: ReadonlySet<keyof FiltrosLicitacoes> = new Set(["apenas_abertas"]);

export const DEFINICOES: readonly DefinicaoFiltro[] = [
  // --- busca
  {
    chave: "palavra_chave",
    rotulo: "Busca",
    grupo: "local",
    tipo: "texto",
    descrever: (v) => `Busca: ${v}`,
  },

  // --- local
  { chave: "uf", rotulo: "UF", grupo: "local", tipo: "opcoes", descrever: (v) => String(v) },
  {
    chave: "municipio",
    rotulo: "Município",
    grupo: "local",
    tipo: "opcoes",
    descrever: (v) => String(v),
  },
  { chave: "orgao", rotulo: "Órgão", grupo: "local", tipo: "opcoes", descrever: (v) => String(v) },

  // --- prazo
  {
    chave: "limite_de",
    rotulo: "Encerra a partir de",
    grupo: "prazo",
    tipo: "data",
    descrever: (v) => `Encerra a partir de ${dataBR(String(v))}`,
  },
  {
    chave: "limite_ate",
    rotulo: "Encerra até",
    grupo: "prazo",
    tipo: "data",
    descrever: (v) => `Encerra até ${dataBR(String(v))}`,
  },
  {
    chave: "publicacao_de",
    rotulo: "Publicada de",
    grupo: "prazo",
    tipo: "data",
    descrever: (v) => `Publicadas desde ${dataBR(String(v))}`,
  },
  {
    chave: "publicacao_ate",
    rotulo: "Publicada até",
    grupo: "prazo",
    tipo: "data",
    descrever: (v) => `Publicadas até ${dataBR(String(v))}`,
  },
  {
    chave: "criadas_de",
    rotulo: "No catálogo desde",
    grupo: "prazo",
    tipo: "data",
    descrever: (v) => `No catálogo desde ${dataBR(String(v))}`,
  },

  // --- documentos
  {
    chave: "com_edital",
    rotulo: "Com edital",
    grupo: "documentos",
    tipo: "booleano",
    descrever: () => "Com edital",
  },
  {
    chave: "com_projeto",
    rotulo: "Com projeto",
    grupo: "documentos",
    tipo: "booleano",
    descrever: () => "Com projeto",
  },
  {
    chave: "com_orcamento",
    rotulo: "Com orçamento",
    grupo: "documentos",
    tipo: "booleano",
    descrever: () => "Com orçamento",
  },

  // --- meu fluxo
  {
    chave: "status_interno",
    rotulo: "Status interno",
    grupo: "fluxo",
    tipo: "opcoes",
    descrever: (v) => `Status: ${STATUS_INTERNO_LABEL[v as StatusInterno] || v}`,
  },
  {
    chave: "recomendadas",
    rotulo: "Só recomendadas",
    grupo: "fluxo",
    tipo: "booleano",
    descrever: () => "Recomendadas",
  },
  {
    chave: "nao_analisadas",
    rotulo: "Só não analisadas",
    grupo: "fluxo",
    tipo: "booleano",
    descrever: () => "Não analisadas",
  },
  {
    chave: "prioridade",
    rotulo: "Prioridade",
    grupo: "fluxo",
    tipo: "tri",
    descrever: (v) =>
      v === "sim" ? "Prioritárias" : v === "nao" ? "Não prioritárias" : "Qualquer prioridade",
  },

  // --- valor e classificação
  {
    chave: "valor_min",
    rotulo: "Valor mínimo",
    grupo: "valor",
    tipo: "moeda",
    descrever: (v) => `A partir de ${brl(v as string)}`,
  },
  {
    chave: "valor_max",
    rotulo: "Valor máximo",
    grupo: "valor",
    tipo: "moeda",
    descrever: (v) => `Até ${brl(v as string)}`,
  },
  {
    chave: "modalidade",
    rotulo: "Modalidade",
    grupo: "valor",
    tipo: "opcoes",
    descrever: (v) => String(v),
  },
  {
    chave: "categoria",
    rotulo: "Categoria",
    grupo: "valor",
    tipo: "opcoes",
    descrever: (v) => String(v),
  },
];

export function definicoesDoGrupo(grupo: GrupoFiltro): DefinicaoFiltro[] {
  return DEFINICOES.filter((d) => d.grupo === grupo);
}

/**
 * Atalho de prazo: "o que encerra nos próximos N dias".
 *
 * Quem caça licitação pensa em "o que fecha essa semana", e não em duas datas
 * no formato ISO.
 *
 * Usa `diaBR` de `./format`, e não `Date` local: aquela função já resolve o
 * fuso de São Paulo, e o comentário dela explica por que isso importa — perto
 * da meia-noite o dia em UTC já virou e o da equipe não. Reimplementar aqui
 * reintroduziria um bug que o projeto já consertou.
 */
export function presetPrazo(
  dias: number,
  agora: Date = new Date(),
): { limite_de: string; limite_ate: string } {
  return { limite_de: diaBR(0, agora), limite_ate: diaBR(dias, agora) };
}

/**
 * Quantos filtros o usuário escolheu, contados a partir das DEFINIÇÕES.
 *
 * Era uma lista escrita à mão de oito campos, e por isso os nove filtros novos
 * mais `categoria` não contavam: chegar do Dashboard com
 * `?recomendadas=true&categoria=Obras` e marcar "Com edital" dava quatro
 * filtros ativos e contador zero — e o contador é quem decide se o botão
 * "Limpar filtros" existe. É a mesma classe de bug que este trabalho veio
 * consertar, sobrevivendo dentro da correção.
 *
 * `ufBase` é o recorte inicial do catálogo (SP): ele não é escolha do usuário
 * e não conta, mas trocar de UF conta.
 */
export function contarFiltrosAtivos(filtros: FiltrosLicitacoes, ufBase: string): number {
  let total = 0;
  for (const def of DEFINICOES) {
    const valor = filtros[def.chave];
    if (valor === "" || valor === false || valor === undefined) continue;
    if (def.chave === "uf" && valor === ufBase) continue;
    total += 1;
  }
  return total;
}

/** O que um link de busca pode carregar: os filtros mais a ordenação. */
export interface BuscaLink extends Partial<
  Record<keyof FiltrosLicitacoes, string | boolean | undefined>
> {
  ordenar?: OrdenacaoCampo | undefined;
  direcao?: "asc" | "desc" | undefined;
}

/**
 * Monta os parâmetros do link "copiar link desta busca".
 *
 * Percorre `filtrosVazios`, que é a forma autoritativa de `FiltrosLicitacoes`,
 * e não uma lista paralela — a versão anterior serializava tudo mas o schema
 * da rota só conhecia seis chaves e o zod descarta chave desconhecida sem
 * erro, então onze filtros (a começar pela palavra-chave, que dá nome ao
 * botão) sumiam em silêncio e quem recebia o link via outra lista.
 *
 * Fica de fora só o que é vazio: filtro não escolhido não vira parâmetro.
 * Um `uf` vazio também não viaja, e quem recebe o link cai no recorte inicial
 * do catálogo — a mesma invariante que "Limpar filtros" aplica.
 */
export function paramsDaBusca(
  filtros: FiltrosLicitacoes,
  ordenar?: OrdenacaoCampo,
  direcao?: "asc" | "desc",
): URLSearchParams {
  const params = new URLSearchParams();
  for (const chave of Object.keys(filtrosVazios) as (keyof FiltrosLicitacoes)[]) {
    const valor = filtros[chave];
    if (valor === "" || valor === false || valor === undefined) continue;
    params.set(chave, String(valor));
  }
  if (ordenar) params.set("ordenar", ordenar);
  if (direcao) params.set("direcao", direcao);
  return params;
}

/**
 * A volta: semeia o estado dos filtros com o que chegou pela URL.
 *
 * Aceita booleano tanto como `true` quanto como a string `"true"`, porque o
 * roteador faz `JSON.parse` de cada parâmetro e o resultado depende do que
 * estava escrito — `com_edital=true` chega booleano, mas um link montado à
 * mão chega string, e as duas coisas têm de significar o mesmo.
 */
export function filtrosDaBusca(busca: BuscaLink, ufPadrao: string): FiltrosLicitacoes {
  const saida = { ...filtrosVazios };
  for (const chave of Object.keys(filtrosVazios) as (keyof FiltrosLicitacoes)[]) {
    const recebido = busca[chave];
    if (recebido === undefined || recebido === null || recebido === "") continue;
    if (typeof filtrosVazios[chave] === "boolean") {
      (saida[chave] as boolean) = recebido === true || recebido === "true";
    } else {
      (saida[chave] as string) = String(recebido);
    }
  }
  if (!saida.uf) saida.uf = ufPadrao;
  return saida;
}
