/**
 * Auxiliares só de formatação/apresentação do LicitacaoCard.
 *
 * Ficam fora do componente para não competir por espaço com o JSX e para dar
 * pra testar isoladamente se um dia isso ganhar teste unitário. Nada aqui
 * decide layout — só transforma dado do DTO em texto ou classe Tailwind.
 */
import type { LicitacaoDTO } from "@/lib/dto";
import type { StatusInterno } from "@/lib/types";

/**
 * Título do card: modalidade + processo + unidade, na ordem em que uma
 * pessoa de licitação reconhece o processo de cabeça.
 *
 * O DTO não guarda um "número curto" separado de `processo`, então não dá
 * pra reproduzir literalmente algo como "PE 2026012000395/2026" sem inventar
 * dado. Usamos os três campos que existem, unidos por "·", e caímos para o
 * nome do órgão só quando os três faltam (registro malformado).
 */
export function montarTituloLicitacao(l: LicitacaoDTO): string {
  const limpo = (v: string | null | undefined) => {
    const t = v?.trim();
    return t && t.toLowerCase() !== "null" ? t : null;
  };
  const partes = [limpo(l.modalidade), limpo(l.processo), limpo(l.unidade_nome)].filter(
    (p): p is string => Boolean(p),
  );
  return partes.length > 0 ? partes.join(" · ") : l.orgao;
}

/**
 * Data + hora no padrão "22/09/2026 às 10:30", com a mesma defesa contra
 * `RangeError` que `dataBR` já tem: entram sempre datas de coluna
 * `timestamptz`, mas essa função roda dentro do render de uma lista inteira
 * de cards — uma data estranha não pode derrubar a página toda.
 */
export function dataHoraExtenso(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  const data = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${data} às ${hora}`;
}

/**
 * Chip de urgência do prazo (dias restantes até `data_limite_proposta`).
 * Mesmos limiares (2 / 5 / 15 dias) que a versão anterior do card já usava,
 * só que reexpressos em tokens semânticos — nada de tom "-400" pensado pra
 * fundo escuro.
 */
export function urgenciaInfo(dias: number | null): { label: string; classes: string } {
  const neutro = "border-border bg-muted text-muted-foreground";
  if (dias === null) return { label: "Sem prazo", classes: neutro };
  if (dias < 0) return { label: "Encerrada", classes: neutro };
  if (dias === 0) {
    return {
      label: "Encerra hoje",
      classes: "border-destructive/40 bg-destructive/10 text-destructive",
    };
  }
  if (dias <= 2) {
    return {
      label: `Encerra em ${dias}d`,
      classes: "border-destructive/40 bg-destructive/10 text-destructive",
    };
  }
  if (dias <= 5) {
    return {
      label: `Encerra em ${dias}d`,
      classes: "border-warning/40 bg-warning/10 text-warning",
    };
  }
  if (dias <= 15) {
    return {
      label: `Encerra em ${dias}d`,
      classes: "border-primary/40 bg-primary/10 text-primary",
    };
  }
  return {
    label: `Encerra em ${dias}d`,
    classes: "border-border bg-muted/60 text-muted-foreground",
  };
}

/** Tom do ícone de status interno (olho) na esquerda do card. */
export const STATUS_ICON_TOM: Record<StatusInterno, string> = {
  nova: "border-info/40 bg-info/10 text-info",
  em_analise: "border-warning/40 bg-warning/10 text-warning",
  interessante: "border-success/40 bg-success/10 text-success",
  descartada: "border-border bg-muted text-muted-foreground",
  proposta_enviada: "border-primary/40 bg-primary/10 text-primary",
};
