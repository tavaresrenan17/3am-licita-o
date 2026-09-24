import type { AnaliseLicitacaoDTO } from "../../lib/dto";
import { ehFormatoAtual, type AnaliseResultado } from "./contrato";

export type EstadoApresentacao =
  "nunca" | "processando" | "pronta" | "parcial" | "desatualizada" | "indisponivel" | "erro";

export interface ModeloApresentacaoAnalise {
  estadoVisual: EstadoApresentacao;
  tituloEstado: string;
  descricaoEstado: string;
  badgeVariante: "default" | "secondary" | "destructive" | "outline";
  rotuloBotaoAcao: string;
  permiteRegenerar: boolean;
  carregando: boolean;
  /** Quanto do roteiro o edital respondeu; só no formato atual. */
  completude?: CompletudeAnalise;
}

export interface CompletudeAnalise {
  camposPreenchidos: number;
  camposTotal: number;
  /** Campos e documentos cuja frase citada foi achada no texto do edital. */
  trechosConfirmados: number;
  documentosHabilitacao: number;
}

/**
 * Sem veredito, o que a tela mostra no topo é o quanto a análise achou:
 * medido em 24/09/2026, as análises v2 preenchiam 19 a 23 dos 51 campos.
 */
export function calcularCompletude(resultado: AnaliseResultado): CompletudeAnalise {
  const campos = [resultado.prazosContatos, resultado.requisitosOperacionais].flatMap((parte) =>
    Object.values(parte).flatMap((secao) => Object.values(secao)),
  );
  const preenchidos = campos.filter((campo) => campo !== null);
  const documentos = Object.values(resultado.habilitacao).flat();
  return {
    camposPreenchidos: preenchidos.length,
    camposTotal: campos.length,
    trechosConfirmados: [...preenchidos, ...documentos].filter((item) => item?.confirmado).length,
    documentosHabilitacao: documentos.length,
  };
}

export function formatarApresentacaoAnalise(
  analise: AnaliseLicitacaoDTO | null | undefined,
): ModeloApresentacaoAnalise {
  if (!analise || analise.estado === "nunca") {
    return {
      estadoVisual: "nunca",
      tituloEstado: "Nenhuma análise gerada",
      descricaoEstado:
        "Clique no botão abaixo para analisar o edital, anexos e termos da licitação com inteligência artificial.",
      badgeVariante: "outline",
      rotuloBotaoAcao: "Gerar análise com IA",
      permiteRegenerar: false,
      carregando: false,
    };
  }

  if (analise.cobertura?.estado === "indisponivel") {
    return {
      estadoVisual: "indisponivel",
      tituloEstado: "Documentos sem texto legível",
      descricaoEstado:
        "Os arquivos anexos desta licitação ainda não possuem camada de texto extraída ou estão indisponíveis.",
      badgeVariante: "outline",
      rotuloBotaoAcao: "Tentar novamente",
      permiteRegenerar: true,
      carregando: false,
    };
  }

  if (analise.estado === "processando") {
    return {
      estadoVisual: "processando",
      tituloEstado: "Analisando com IA...",
      descricaoEstado:
        "Lendo editais e termos de referência e extraindo prazos, contatos, habilitação e requisitos operacionais. Costuma levar de 1 a 2 minutos.",
      badgeVariante: "secondary",
      rotuloBotaoAcao: "Processando...",
      permiteRegenerar: false,
      carregando: true,
    };
  }

  if (analise.estado === "erro") {
    return {
      estadoVisual: "erro",
      tituloEstado: "Falha na análise",
      descricaoEstado:
        analise.erro ?? "Ocorreu um erro durante a leitura ou síntese dos documentos.",
      badgeVariante: "destructive",
      rotuloBotaoAcao: "Tentar novamente",
      permiteRegenerar: true,
      carregando: false,
    };
  }

  if (analise.resultado && !ehFormatoAtual(analise.resultado)) {
    return {
      estadoVisual: "desatualizada",
      tituloEstado: "Análise no formato antigo",
      descricaoEstado:
        "Gerada no formato anterior, com veredito de participação e sem os itens do PNCP. Refaça para ver o resumo com números, os itens e a situação do certame.",
      badgeVariante: "secondary",
      rotuloBotaoAcao: "Refazer análise",
      permiteRegenerar: true,
      carregando: false,
    };
  }

  const estadoVisual: EstadoApresentacao =
    analise.cobertura?.estado === "parcial" ? "parcial" : "pronta";

  return {
    estadoVisual,
    tituloEstado: "Análise concluída",
    descricaoEstado:
      estadoVisual === "parcial"
        ? "Análise gerada com cobertura parcial: alguns anexos não tinham texto completo."
        : "Análise completa dos documentos e editais disponíveis.",
    badgeVariante: estadoVisual === "parcial" ? "secondary" : "default",
    rotuloBotaoAcao: "Análise salva na licitação",
    permiteRegenerar: false,
    carregando: false,
    ...(ehFormatoAtual(analise.resultado)
      ? { completude: calcularCompletude(analise.resultado) }
      : {}),
  };
}
