import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Layers,
  MapPin,
  Scale,
} from "lucide-react";
import type { DocumentoLicitacao } from "@/lib/types";
import { dataBR, dataHoraBR, diasRestantes } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Calcula aproximadamente 3 dias úteis anteriores a uma data (Art. 164, Lei 14.133/2021).
 */
export function calcularPrazoImpugnacao(dataLimiteIso: string | null): Date | null {
  if (!dataLimiteIso) return null;
  const data = new Date(dataLimiteIso);
  if (isNaN(data.getTime())) return null;

  let diasUteisParaVoltar = 3;
  const cursor = new Date(data);

  while (diasUteisParaVoltar > 0) {
    cursor.setDate(cursor.getDate() - 1);
    const diaSemana = cursor.getDay();
    // 0 = Domingo, 6 = Sábado
    if (diaSemana !== 0 && diaSemana !== 6) {
      diasUteisParaVoltar--;
    }
  }

  // Define horário de expediente final comum (18h)
  cursor.setHours(18, 0, 0, 0);
  return cursor;
}

export function CronogramaLegal({
  dataPublicacao,
  dataLimite,
  dataAbertura,
}: {
  dataPublicacao: string | null;
  dataLimite: string | null;
  dataAbertura: string | null;
}) {
  const prazoImpugnacao = calcularPrazoImpugnacao(dataLimite || dataAbertura);
  const diasAteLimite = dataLimite ? diasRestantes(dataLimite) : null;

  const agora = new Date();
  const impugnacaoExpirada = prazoImpugnacao ? agora > prazoImpugnacao : false;

  return (
    <section className="rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Scale className="size-4 text-primary" />
          <span>Cronograma Legal & Prazos Críticos (Lei 14.133/2021)</span>
        </h3>
        <span className="text-[11px] font-medium text-muted-foreground">
          Art. 164 da Nova Lei de Licitações
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {/* Marco 1: Publicação */}
        <div className="flex flex-col justify-between rounded-lg border border-border/60 bg-muted/20 p-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="size-3.5 text-muted-foreground" />
              <span>Publicação do Edital</span>
            </div>
            <p className="num mt-1 text-sm font-semibold text-foreground">
              {dataBR(dataPublicacao)}
            </p>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Disponibilização do edital nos canais oficiais
          </p>
        </div>

        {/* Marco 2: Impugnação e Esclarecimentos (D-3 úteis) */}
        <div
          className={cn(
            "flex flex-col justify-between rounded-lg border p-3 transition-colors",
            impugnacaoExpirada
              ? "border-muted-foreground/30 bg-muted/20 text-muted-foreground"
              : "border-warning/40 bg-warning/10 text-foreground",
          )}
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <AlertTriangle
                  className={cn(
                    "size-3.5",
                    impugnacaoExpirada ? "text-muted-foreground" : "text-warning",
                  )}
                />
                <span className={impugnacaoExpirada ? "text-muted-foreground" : "text-warning"}>
                  Limite de Impugnação
                </span>
              </div>
              <span
                className={cn(
                  "num text-[10px] font-bold rounded px-1.5 py-0.5",
                  impugnacaoExpirada
                    ? "bg-muted text-muted-foreground"
                    : "bg-warning/25 text-warning",
                )}
              >
                {impugnacaoExpirada ? "Expirado" : "D-3 úteis"}
              </span>
            </div>
            <p className="num mt-1 text-sm font-semibold">
              {prazoImpugnacao ? dataHoraBR(prazoImpugnacao.toISOString()) : "—"}
            </p>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Prazo final para protocolar pedidos de esclarecimento ou impugnar cláusulas restritivas.
          </p>
        </div>

        {/* Marco 3: Limite da Proposta */}
        <div
          className={cn(
            "flex flex-col justify-between rounded-lg border p-3 transition-colors",
            diasAteLimite !== null && diasAteLimite <= 3 && diasAteLimite >= 0
              ? "border-destructive/40 bg-destructive/10"
              : "border-border/60 bg-muted/20",
          )}
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                <CalendarClock className="size-3.5 text-primary" />
                <span>Envio de Proposta</span>
              </div>
              {diasAteLimite !== null && (
                <span
                  className={cn(
                    "num text-[10px] font-bold rounded px-1.5 py-0.5",
                    diasAteLimite <= 3 && diasAteLimite >= 0
                      ? "bg-destructive/20 text-destructive"
                      : "bg-primary/15 text-primary",
                  )}
                >
                  {diasAteLimite < 0
                    ? "Encerrada"
                    : diasAteLimite === 0
                      ? "Hoje!"
                      : `${diasAteLimite} dias`}
                </span>
              )}
            </div>
            <p className="num mt-1 text-sm font-semibold text-foreground">
              {dataHoraBR(dataLimite)}
            </p>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Abertura da sessão pública e disputa de lances
          </p>
        </div>
      </div>

      {/* Alerta de Visita Técnica */}
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-2.5 text-xs text-muted-foreground">
        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="leading-snug">
          <strong className="font-semibold text-foreground">Atenção à Vistoria Prévia:</strong>{" "}
          Verifique nas peças do edital se a visita técnica é obrigatória ou se o órgão admite
          declaração formal assinada pelo responsável técnico substituindo a vistoria presencial.
        </p>
      </div>
    </section>
  );
}

export function ChecklistDocumental({
  documentos,
  documentosEstado,
  urlPncp,
}: {
  documentos: DocumentoLicitacao[];
  documentosEstado: string;
  urlPncp?: string | null;
}) {
  const normalizar = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const nomes = documentos.map((d) => normalizar(d.nome || ""));
  const tipos = new Set(documentos.map((d) => d.tipo_documento));

  const temEdital =
    tipos.has("edital") ||
    nomes.some((n) => n.includes("edital") || n.includes("aviso") || n.includes("minuta"));

  const temPlanilha =
    tipos.has("orcamento") ||
    nomes.some(
      (n) =>
        n.includes("planilha") ||
        n.includes("orcamento") ||
        n.includes("bdi") ||
        n.includes("quantitativo") ||
        n.includes("sinapi") ||
        n.includes("cronograma"),
    );

  const temProjetos =
    tipos.has("projeto") ||
    nomes.some(
      (n) =>
        n.includes("projeto") ||
        n.includes("planta") ||
        n.includes("arquitet") ||
        n.includes("estrutur") ||
        n.includes("eletric") ||
        n.includes("hidraul") ||
        n.includes(".dwg"),
    );

  const temMemorial = nomes.some(
    (n) =>
      n.includes("memorial") ||
      n.includes("especificacao") ||
      n.includes("termo de referencia") ||
      n.includes("caderno de encargo"),
  );

  const itens = [
    {
      titulo: "Edital e Minuta Contratual",
      descricao: "Regras do certame, habilitação e critérios de julgamento",
      presente: temEdital,
      icon: FileText,
    },
    {
      titulo: "Planilha Orçamentária & BDI",
      descricao: "Composição de custos unitários e quantitativos de engenharia",
      presente: temPlanilha,
      icon: FileSpreadsheet,
    },
    {
      titulo: "Projetos Básicos / Executivos",
      descricao: "Plantas de arquitetura, cálculo estrutural e instalações",
      presente: temProjetos,
      icon: Layers,
    },
    {
      titulo: "Memorial Descritivo & TR",
      descricao: "Especificações técnicas de materiais e métodos de execução",
      presente: temMemorial,
      icon: FileCheck2,
    },
  ];

  const prontos = itens.filter((i) => i.presente).length;

  return (
    <section className="rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileCheck2 className="size-4 text-primary" />
            <span>Prontidão Documental para Orçamento de Obras</span>
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Checklist das 4 peças técnicas essenciais para elaboração da proposta
          </p>
        </div>
        <span
          className={cn(
            "num text-xs font-bold rounded-md px-2 py-0.5",
            prontos === 4
              ? "bg-success/20 text-success"
              : prontos >= 2
                ? "bg-warning/20 text-warning"
                : "bg-muted text-muted-foreground",
          )}
        >
          {prontos} de 4 peças identificadas
        </span>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {itens.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.titulo}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
                item.presente
                  ? "border-success/30 bg-success/5"
                  : "border-border/60 bg-muted/15 opacity-75",
              )}
            >
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md border",
                  item.presente
                    ? "border-success/40 bg-success/15 text-success"
                    : "border-border bg-muted/40 text-muted-foreground",
                )}
              >
                <Icon className="size-3.5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {item.titulo}
                  </p>
                  {item.presente ? (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-success">
                      <CheckCircle2 className="size-3" /> Disponível
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                      <AlertCircle className="size-3" /> Não localizado
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  {item.descricao}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {documentos.length === 0 && urlPncp && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-info/30 bg-info/5 p-2.5 text-xs text-info">
          <span>Os anexos ainda não foram coletados no banco local.</span>
          <a
            href={urlPncp}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline shrink-0 hover:text-foreground"
          >
            Abrir Anexos no PNCP Oficial &rarr;
          </a>
        </div>
      )}
    </section>
  );
}
