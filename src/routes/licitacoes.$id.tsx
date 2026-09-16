import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  ExternalLink,
  FileText,
  History,
  Info,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ScoreBadge, StatusPncpBadge } from "@/components/data-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  SITUACAO_TEMPORAL_LABEL,
  STATUS_INTERNO_LABEL,
  type StatusInterno,
  type TipoDocumento,
} from "@/lib/types";
import { brl, dataBR, dataHoraBR, diasRestantes } from "@/lib/format";
import { useAtualizarInterno, useLicitacao } from "@/services/api";

export const Route = createFileRoute("/licitacoes/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Detalhe da licitação | 3AM Licitação" },
      {
        name: "description",
        content:
          "Dados completos da licitação, documentos vinculados, status interno e observações da equipe.",
      },
      { property: "og:title", content: "Detalhe da licitação | 3AM Licitação" },
      {
        property: "og:description",
        content: "Ficha completa da oportunidade e seus documentos.",
      },
    ],
  }),
  component: DetalheLicitacao,
});

const GRUPOS: { tipo: TipoDocumento; label: string }[] = [
  { tipo: "edital", label: "Edital" },
  { tipo: "projeto", label: "Projetos" },
  { tipo: "orcamento", label: "Orçamentos" },
  { tipo: "anexo", label: "Anexos" },
  { tipo: "outro", label: "Outros" },
];

function DetalheLicitacao() {
  const { id } = Route.useParams();
  const { data, isLoading } = useLicitacao(id);
  const atualizar = useAtualizarInterno();
  const [obs, setObs] = useState("");

  const licitacao = data?.licitacao;

  useEffect(() => {
    setObs(licitacao?.observacoes ?? "");
  }, [licitacao?.id, licitacao?.observacoes]);

  if (isLoading) {
    return <AppShell titulo="Carregando…">{null}</AppShell>;
  }

  if (!data || !licitacao) {
    return (
      <AppShell titulo="Licitação não encontrada">
        <EmptyState
          titulo="Registro não encontrado no banco"
          descricao="A licitação pode ter sido removida. Volte para a lista de licitações salvas."
          acao={
            <Button asChild size="sm" className="mt-2">
              <Link to="/licitacoes">Voltar para Licitações Salvas</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  const dias = licitacao.data_limite_proposta
    ? diasRestantes(licitacao.data_limite_proposta)
    : null;

  const campos: [string, string][] = [
    ["Número de controle PNCP", licitacao.pncp_id],
    ["Órgão contratante", licitacao.orgao],
    ["CNPJ do órgão", licitacao.cnpj_orgao],
    ["Unidade administrativa", licitacao.unidade_nome ?? "—"],
    ["Município / UF", `${licitacao.municipio ?? "—"} / ${licitacao.uf ?? "—"}`],
    ["Modalidade", licitacao.modalidade ?? "—"],
    ["Categoria (classificação local)", licitacao.categoria],
    ["Processo", licitacao.processo ?? "—"],
    ["Registro de preços (SRP)", licitacao.srp === null ? "—" : licitacao.srp ? "Sim" : "Não"],
    ["Valor estimado", brl(licitacao.valor_estimado)],
    ["Data de publicação", dataBR(licitacao.data_publicacao)],
    ["Abertura da proposta", dataHoraBR(licitacao.data_abertura_proposta)],
    [
      "Limite da proposta",
      `${dataHoraBR(licitacao.data_limite_proposta)}${
        dias === null ? "" : ` (${dias < 0 ? "encerrada" : `${dias} dias`})`
      }`,
    ],
    ["Situação no PNCP", licitacao.status_pncp ?? "—"],
    ["Atualização na fonte", dataHoraBR(licitacao.data_atualizacao_global)],
    ["Sincronizada em", dataHoraBR(licitacao.synced_at)],
  ];

  const salvarStatus = (v: StatusInterno) => {
    atualizar.mutate(
      {
        id: licitacao.id,
        statusInterno: v,
        historico: `Status interno: ${STATUS_INTERNO_LABEL[v]}`,
      },
      { onSuccess: () => toast.success("Status atualizado.") },
    );
  };

  return (
    <AppShell
      titulo="Detalhe da licitação"
      descricao={`${licitacao.orgao} · ${licitacao.municipio ?? "—"}/${licitacao.uf ?? "—"}`}
      acoes={
        <>
          <Button asChild variant="outline" size="sm">
            <Link to="/licitacoes">
              <ArrowLeft className="mr-1 size-3.5" /> Voltar
            </Link>
          </Button>
          <Button
            size="sm"
            variant={licitacao.prioridade ? "default" : "outline"}
            disabled={atualizar.isPending}
            onClick={() =>
              atualizar.mutate({
                id: licitacao.id,
                prioridade: !licitacao.prioridade,
                historico: licitacao.prioridade
                  ? "Prioridade removida"
                  : "Marcada como prioritária",
              })
            }
          >
            <Star className={cn("mr-1 size-3.5", licitacao.prioridade && "fill-current")} />
            {licitacao.prioridade ? "Prioritária" : "Marcar prioridade"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPncpBadge status={licitacao.status_pncp ?? "—"} />
              {/* Sem data, ou com abertura depois do encerramento, o estado é
                  desconhecido — e dizer "fechada" ali seria inventar certeza
                  sobre o que a fonte não informou (D06). */}
              <span
                className={cn(
                  "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                  licitacao.situacao_temporal === "aberta"
                    ? "border-success/40 text-success"
                    : licitacao.situacao_temporal === "indeterminada" ||
                        licitacao.situacao_temporal === "inconsistente"
                      ? "border-warning/40 text-warning"
                      : "border-border text-muted-foreground",
                )}
              >
                {SITUACAO_TEMPORAL_LABEL[licitacao.situacao_temporal] ??
                  licitacao.situacao_temporal}
              </span>
              <ScoreBadge score={licitacao.score_aderencia} />
              <span className="text-[11px] text-muted-foreground">
                aderência à construção civil
              </span>
            </div>

            <h2 className="mt-3 flex items-center gap-1.5 text-sm font-semibold">
              <FileText className="size-4 text-primary" /> Objeto
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">{licitacao.objeto}</p>

            {licitacao.informacao_complementar && (
              <p className="mt-2 whitespace-pre-line border-l-2 border-border pl-3 text-xs text-muted-foreground">
                {licitacao.informacao_complementar}
              </p>
            )}

            <dl className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {campos.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                  <dd className="num text-sm">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 flex flex-wrap gap-4">
              {licitacao.url_pncp && (
                <a
                  href={licitacao.url_pncp}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" /> Abrir publicação no PNCP
                </a>
              )}
              {licitacao.link_sistema_origem && (
                <a
                  href={licitacao.link_sistema_origem}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" /> Sistema de origem
                </a>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Building2 className="size-4 text-primary" /> Documentos vinculados
              </h2>
              <span className="num text-xs text-muted-foreground">
                {data.licitacao.documentos_total} arquivos
                {data.documentosColetadoEm && ` · ${dataBR(data.documentosColetadoEm)}`}
              </span>
            </header>

            <div className="divide-y divide-border">
              {GRUPOS.map(({ tipo, label }) => {
                const docs = data.documentos.filter((d) => d.tipo_documento === tipo);
                if (docs.length === 0) return null;
                return (
                  <div key={tipo} className="px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {label}
                    </p>
                    <ul className="mt-1.5 space-y-1.5">
                      {docs.map((d) => (
                        <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                          <a
                            href={d.url ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              "flex min-w-0 items-center gap-1.5 hover:text-primary",
                              !d.ativo && "text-muted-foreground line-through",
                            )}
                            // O tipo é classificação nossa: 55% dos documentos
                            // chegam como "Outros Documentos" e são separados
                            // pelo nome do arquivo. Mostrar o rótulo original
                            // deixa a inferência conferível.
                            title={
                              d.tipo_documento_pncp
                                ? `PNCP: ${d.tipo_documento_pncp}`
                                : "Tipo não declarado pelo PNCP"
                            }
                          >
                            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{d.nome || "(sem título)"}</span>
                          </a>
                          <span className="num shrink-0 text-[11px] text-muted-foreground">
                            {!d.ativo && <span className="mr-1.5">retirado</span>}
                            {dataBR(d.data_publicacao)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}

              {/* "Sem documento" e "ainda não coletado" são coisas diferentes, e
                  a tela precisa dizer qual das duas é. Quem responde é o estado
                  da coleta, nunca a contagem de linhas. */}
              {data.documentosEstado !== "completo" && (
                <div className="flex items-start gap-2 px-4 py-6 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  <p>
                    {data.documentosEstado === "coletando" ? (
                      <>Coleta de documentos em andamento para esta licitação.</>
                    ) : data.documentosEstado === "erro" ? (
                      <>
                        Não foi possível coletar os documentos desta licitação
                        {data.documentosErro ? `: ${data.documentosErro}` : "."} Você pode consultar
                        os anexos diretamente na publicação oficial do PNCP.
                      </>
                    ) : (
                      <>
                        Os documentos não foram copiados para o catálogo. Consulte os anexos na
                        publicação oficial do PNCP.
                      </>
                    )}
                  </p>
                </div>
              )}

              {data.documentosEstado === "completo" && data.documentos.length === 0 && (
                <div className="flex items-start gap-2 px-4 py-6 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  <p>
                    O PNCP não publicou nenhum documento para esta licitação
                    {data.documentosColetadoEm
                      ? ` (consultado em ${dataBR(data.documentosColetadoEm)})`
                      : ""}
                    . Aqui isso é uma ausência confirmada na fonte, não coleta pendente.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-3">
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Análise interna</h2>
            <div className="mt-3 space-y-1.5">
              <Label className="text-[11px]">Status interno</Label>
              <Select
                value={licitacao.status_interno}
                onValueChange={(v) => salvarStatus(v as StatusInterno)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_INTERNO_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-3 space-y-1.5">
              <Label className="text-[11px]">Observações internas da equipe</Label>
              <Textarea
                rows={7}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Anotações sobre viabilidade, acervo técnico, prazos, concorrência…"
              />
              <Button
                size="sm"
                className="w-full"
                disabled={atualizar.isPending}
                onClick={() =>
                  atualizar.mutate(
                    { id: licitacao.id, observacoes: obs, historico: "Observações atualizadas" },
                    { onSuccess: () => toast.success("Observações salvas.") },
                  )
                }
              >
                Salvar observações
              </Button>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <History className="size-4 text-primary" /> Histórico de alterações
            </h2>
            <ul className="mt-3 space-y-2.5">
              {data.historico.map((h) => (
                <li key={h.id} className="border-l-2 border-border pl-2.5">
                  <p className="text-xs">{h.texto}</p>
                  <p className="num text-[10px] text-muted-foreground">
                    {dataHoraBR(h.em)} · {h.origem === "pncp" ? "sincronização" : "equipe"}
                  </p>
                </li>
              ))}
              {data.historico.length === 0 && (
                <li className="text-xs text-muted-foreground">Sem alterações registradas.</li>
              )}
            </ul>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <CalendarClock className="size-4 text-primary" /> Registro no banco
            </h2>
            <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <li className="num">Atualizado: {dataHoraBR(licitacao.updated_at)}</li>
              <li className="num">Sincronizado: {dataHoraBR(licitacao.synced_at)}</li>
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
