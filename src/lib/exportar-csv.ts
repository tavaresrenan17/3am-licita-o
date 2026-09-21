import type { LicitacaoDTO } from "@/lib/dto";
import { brl, dataBR, dataHoraBR, diasRestantes } from "@/lib/format";
import { STATUS_INTERNO_LABEL } from "@/lib/types";

function escaparCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return '""';
  const texto = String(valor).replace(/"/g, '""').replace(/\r?\n/g, " ");
  return `"${texto}"`;
}

export function exportarLicitacoesCsv(
  itens: LicitacaoDTO[],
  nomeArquivo = "licitacoes-3am.csv",
) {
  if (itens.length === 0) return;

  const cabecalhos = [
    "PNCP ID",
    "Órgão",
    "CNPJ Órgão",
    "Município",
    "UF",
    "Objeto",
    "Valor Estimado (R$)",
    "Modalidade",
    "Categoria",
    "Publicação",
    "Limite Proposta",
    "Dias Restantes",
    "Status PNCP",
    "Status Interno",
    "Prioridade",
    "Score Aderência",
    "Total Documentos",
    "Link PNCP",
  ];

  const linhas = itens.map((item) => {
    const dias = item.data_limite_proposta
      ? diasRestantes(item.data_limite_proposta)
      : null;

    const diasTexto =
      dias === null ? "Sem prazo" : dias < 0 ? "Encerrada" : String(dias);

    return [
      escaparCsv(item.pncp_id),
      escaparCsv(item.orgao),
      escaparCsv(item.cnpj_orgao),
      escaparCsv(item.municipio ?? ""),
      escaparCsv(item.uf ?? ""),
      escaparCsv(item.objeto ?? ""),
      escaparCsv(item.valor_estimado ? brl(item.valor_estimado) : "Não divulgado"),
      escaparCsv(item.modalidade ?? ""),
      escaparCsv(item.categoria ?? ""),
      escaparCsv(dataBR(item.data_publicacao)),
      escaparCsv(dataHoraBR(item.data_limite_proposta)),
      escaparCsv(diasTexto),
      escaparCsv(item.status_pncp ?? ""),
      escaparCsv(STATUS_INTERNO_LABEL[item.status_interno] ?? item.status_interno),
      escaparCsv(item.prioridade ? "Sim" : "Não"),
      escaparCsv(item.score_aderencia ?? 0),
      escaparCsv(item.documentos_total ?? 0),
      escaparCsv(item.url_pncp ?? ""),
    ].join(";");
  });

  // BOM UTF-8 (\uFEFF) para garantir abertura correta com acentos no Excel Windows
  const conteudoCsv = "\uFEFF" + [cabecalhos.join(";"), ...linhas].join("\r\n");

  const blob = new Blob([conteudoCsv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", nomeArquivo);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
