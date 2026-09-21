import type { AnaliseLicitacaoDTO } from "../../lib/dto";

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
  vereditoFormatado?: {
    texto: string;
    cor: string;
    varianteBadge: "default" | "secondary" | "destructive" | "outline";
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
        "Lendo editais, projetos, termos de referência e sintetizando conclusões. Isso pode levar até 60 segundos.",
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

  const veredito = analise.resultado?.veredito;
  let vereditoFormatado: {
    texto: string;
    cor: string;
    varianteBadge: "default" | "secondary" | "destructive" | "outline";
  } = {
    texto: "Em análise",
    cor: "text-muted-foreground",
    varianteBadge: "outline",
  };

  if (veredito === "favoravel") {
    vereditoFormatado = {
      texto: "Favorável para participação",
      cor: "text-emerald-600 dark:text-emerald-400",
      varianteBadge: "default",
    };
  } else if (veredito === "atencao") {
    vereditoFormatado = {
      texto: "Requer atenção / ressalvas",
      cor: "text-amber-600 dark:text-amber-400",
      varianteBadge: "secondary",
    };
  } else if (veredito === "desfavoravel") {
    vereditoFormatado = {
      texto: "Desfavorável / Alto risco",
      cor: "text-rose-600 dark:text-rose-400",
      varianteBadge: "destructive",
    };
  } else if (veredito === "insuficiente") {
    vereditoFormatado = {
      texto: "Informações insuficientes",
      cor: "text-slate-500",
      varianteBadge: "outline",
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
    vereditoFormatado,
  };
}
