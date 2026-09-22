import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Info,
  Loader2,
  RefreshCw,
  Square,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { UFS } from "@/lib/types";
import type { SincronizacaoDTO } from "@/lib/dto";
import { dataBR, dataHoraBR, duracao, numero } from "@/lib/format";
import {
  useConfiguracoes,
  useModalidades,
  useSincronizacaoPNCP,
  useSincronizacoes,
} from "@/services/api";

export const Route = createFileRoute("/sincronizacao")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sincronização PNCP | 3AM Licitação" },
      {
        name: "description",
        content:
          "Importe e atualize licitações do PNCP no banco da 3AM, com acompanhamento de progresso em tempo real.",
      },
      { property: "og:title", content: "Sincronização PNCP | 3AM Licitação" },
      {
        property: "og:description",
        content: "Importação e atualização de licitações do PNCP.",
      },
    ],
  }),
  component: SincronizacaoPage,
});

const STATUS_TXT: Record<string, string> = {
  em_andamento: "Sincronização em andamento",
  concluido: "Concluída",
  concluido_com_erros: "Concluída com erros",
  parcial: "Parcial — retomável",
  falhou: "Falhou",
};

const COBERTURA_TXT: Record<string, string> = {
  nunca: "Nunca sincronizado",
  coletando: "Coletando",
  parcial: "Parcial — faltam segmentos",
  completo_no_escopo: "Completo no recorte consultado",
  falhou: "Falhou",
};

function saudePncp(job: SincronizacaoDTO | null) {
  const requisicoes = job?.api_requisicoes_total ?? 0;
  const sucessos = job?.api_requisicoes_sucesso ?? 0;
  const falhas =
    (job?.api_timeouts ?? 0) +
    (job?.api_erros_429 ?? 0) +
    (job?.api_erros_5xx ?? 0) +
    (job?.api_falhas_outros ?? 0);
  const latenciaMedia =
    requisicoes > 0 ? Math.round((job?.api_latencia_total_ms ?? 0) / requisicoes) : 0;
  const tentativas = job?.api_tentativas_total ?? 0;
  const taxaFalha = tentativas > 0 ? falhas / tentativas : 0;

  if (requisicoes === 0) return { estado: "sem dados", latenciaMedia, falhas };
  if ((job?.api_falhas_consecutivas ?? 0) >= 3 || sucessos === 0) {
    return { estado: "indisponível", latenciaMedia, falhas };
  }
  if (latenciaMedia >= 10_000 || taxaFalha >= 0.2) {
    return { estado: "lento", latenciaMedia, falhas };
  }
  return { estado: "normal", latenciaMedia, falhas };
}

function SincronizacaoPage() {
  const { data: config } = useConfiguracoes();
  const { data: modalidades } = useModalidades();
  const { data: historico } = useSincronizacoes(10);
  const {
    rodando,
    erro,
    status,
    iniciar,
    iniciarIncremental,
    segmentosIncremental,
    cobertura: coberturaIncremental,
    interromper,
  } = useSincronizacaoPNCP();

  const [ufs, setUfs] = useState<string[]>(["SP"]);
  const [mods, setMods] = useState<number[]>([]);
  const [horizonte, setHorizonte] = useState(30);
  const [personalizado, setPersonalizado] = useState(false);
  const [emEtapas, setEmEtapas] = useState(false);
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    if (!config) return;
    setUfs(config.ufs_coleta);
    setMods(config.modalidades_coleta);
    setHorizonte(config.horizonte_dias);
    if (![5, 15, 30].includes(config.horizonte_dias)) {
      setPersonalizado(true);
    }
  }, [config]);

  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(t);
  }, [rodando]);

  const progresso = status.data;
  const job = progresso?.job ?? null;
  const segmentos = progresso?.segmentos ?? null;
  const saude = saudePncp(job);

  const decorrido = job
    ? (job.finalizado_em ? Date.parse(job.finalizado_em) : agora) - Date.parse(job.inicio_em)
    : 0;

  const alternar = <T,>(lista: T[], item: T): T[] =>
    lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item];

  const alternarUf = (uf: string) =>
    setUfs((atuais) =>
      atuais.includes(uf) && atuais.length === 1 ? atuais : alternar(atuais, uf),
    );

  return (
    <AppShell
      titulo="Sincronização PNCP"
      descricao="Consulta a API pública do PNCP e grava no banco. Análise e filtros ficam em Licitações Salvas."
      acoes={
        rodando ? (
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 cursor-pointer"
            onClick={() => interromper(job?.id)}
          >
            <Square className="mr-1 size-3.5" /> Interromper
          </Button>
        ) : job?.status === "em_andamento" ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10 cursor-pointer"
              onClick={() => interromper(job?.id)}
            >
              <Square className="mr-1 size-3.5" /> Resetar Job
            </Button>
            <Button
              size="sm"
              onClick={() => iniciar({ ufs, modalidades: mods, horizonteDias: horizonte })}
            >
              <RefreshCw className="mr-1 size-3.5" /> Retomar Sincronização
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            onClick={() => iniciar({ ufs, modalidades: mods, horizonteDias: horizonte })}
          >
            <RefreshCw className="mr-1 size-3.5" /> Sincronizar PNCP
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {rodando ? (
                  <Loader2 className="size-4 animate-spin text-primary" />
                ) : job?.status === "falhou" ||
                  job?.status === "concluido_com_erros" ||
                  job?.status === "parcial" ? (
                  <AlertTriangle className="size-4 text-warning" />
                ) : (
                  <CheckCircle2 className="size-4 text-success" />
                )}
                <span className="text-sm font-semibold">
                  {job ? (STATUS_TXT[job.status] ?? job.status) : "Nunca sincronizado"}
                </span>
              </div>
              <span className="num text-xs text-muted-foreground">
                Fonte consultada em: {dataHoraBR(job?.fonte_observada_em ?? null)}
              </span>
            </div>

            {job && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Recorte: {job.descricao_escopo}
              </p>
            )}

            {job?.status === "em_andamento" && !rodando && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>
                    Há um ciclo de sincronização pausado ou mantido para retomada. Você pode retomar a coleta de onde parou ou cancelá-lo.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-warning/60 bg-warning/20 text-warning hover:bg-warning/30 text-xs shrink-0 cursor-pointer"
                    onClick={() => interromper(job.id)}
                  >
                    Resetar
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs shrink-0 cursor-pointer"
                    onClick={() => iniciar({ ufs, modalidades: mods, horizonteDias: horizonte })}
                  >
                    Retomar
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Cobertura: {COBERTURA_TXT[progresso?.cobertura ?? "nunca"]}
                </span>
                <span className="num">
                  {progresso?.percentual !== null && progresso?.percentual !== undefined
                    ? `${progresso.percentual}%`
                    : "indeterminado"}
                </span>
              </div>

              {progresso?.percentual !== null && progresso?.percentual !== undefined ? (
                <Progress value={progresso.percentual} className="mt-2 h-2" />
              ) : (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full w-1/3 rounded-full bg-primary",
                      rodando && "animate-pulse",
                    )}
                  />
                </div>
              )}

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="num">
                  Segmentos: {segmentos?.concluidos ?? 0} / {segmentos?.planejados ?? 0}
                  {segmentos?.falhados ? ` (${segmentos.falhados} com falha)` : ""}
                </span>
                <span className="num">
                  Páginas: {segmentos?.paginasAplicadas ?? 0}
                  {segmentos?.paginasEstimadas ? ` / ${segmentos.paginasEstimadas}` : " / —"}
                </span>
                <span className="num">
                  Registros consultados: {numero(job?.registros_consultados ?? 0)}
                </span>
                <span className="num">Tempo decorrido: {duracao(Math.max(0, decorrido))}</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Novas importadas", job?.total_novos ?? 0],
                ["Atualizadas", job?.total_atualizados ?? 0],
                ["Sem mudança", job?.total_ignorados ?? 0],
                ["Não admitidas", job?.total_nao_admitidos ?? 0],
              ].map(([label, v]) => (
                <div key={label as string} className="rounded-md border border-border p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p className="num mt-0.5 text-lg font-semibold">{numero(v as number)}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold">Saúde da API PNCP: {saude.estado}</span>
                <span className="num text-muted-foreground">
                  última resposta: {dataHoraBR(job?.api_ultima_resposta_em ?? null)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="num">
                  Requisições: {numero(job?.api_requisicoes_total ?? 0)} · sucessos:{" "}
                  {numero(job?.api_requisicoes_sucesso ?? 0)}
                </span>
                <span className="num">Latência média: {numero(saude.latenciaMedia)} ms</span>
                <span className="num">
                  Pior resposta: {numero(job?.api_latencia_max_ms ?? 0)} ms
                </span>
                <span className="num">
                  Timeouts: {numero(job?.api_timeouts ?? 0)} · 429:{" "}
                  {numero(job?.api_erros_429 ?? 0)} · 5xx: {numero(job?.api_erros_5xx ?? 0)}
                </span>
              </div>
              {saude.estado === "indisponível" && (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-warning">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  PNCP indisponível após falhas consecutivas. O checkpoint foi preservado e a
                  próxima rotina retomará a coleta.
                </p>
              )}
            </div>

            {(erro || job?.mensagem_erro) &&
              (() => {
                const msg = erro ?? job?.mensagem_erro ?? "";
                const isCooldown =
                  msg.includes("aguardando") ||
                  msg.includes("temporariamente") ||
                  msg.includes("cooldown");
                return isCooldown ? (
                  <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <Loader2 className="size-3 animate-spin" />
                      Aguardando cooldown da API
                    </p>
                    <p className="mt-1 text-muted-foreground">{msg}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      O sistema tentará novamente automaticamente em alguns segundos.
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    <p className="font-semibold">Erros da última sincronização</p>
                    <p className="mt-1">{msg}</p>
                  </div>
                );
              })()}

            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" />A coleta acontece em etapas curtas
              conduzidas por esta tela. Fechar a aba não apaga o que já foi gravado: a sincronização
              fica parcial e continua de onde parou na próxima execução.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card">
            <header className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Histórico de sincronizações</h2>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    {[
                      "Início",
                      "Duração",
                      "Status",
                      "Recorte",
                      "Consultados",
                      "Novas",
                      "Atualizadas",
                      "Sem mudança",
                      "Não admitidas",
                    ].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(historico ?? []).map((s) => (
                    <tr key={s.id} className="border-b border-border/60 last:border-0">
                      <td className="num px-3 py-2">{dataHoraBR(s.inicio_em)}</td>
                      <td className="num px-3 py-2">
                        {s.finalizado_em
                          ? duracao(Date.parse(s.finalizado_em) - Date.parse(s.inicio_em))
                          : "—"}
                      </td>
                      <td className="px-3 py-2">{STATUS_TXT[s.status] ?? s.status}</td>
                      <td className="max-w-[220px] truncate px-3 py-2" title={s.descricao_escopo}>
                        {s.descricao_escopo}
                      </td>
                      <td className="num px-3 py-2">{s.registros_consultados}</td>
                      <td className="num px-3 py-2">{s.total_novos}</td>
                      <td className="num px-3 py-2">{s.total_atualizados}</td>
                      <td className="num px-3 py-2">{s.total_ignorados}</td>
                      <td className="num px-3 py-2">{s.total_nao_admitidos}</td>
                    </tr>
                  ))}
                  {(historico ?? []).length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                        Nenhuma sincronização registrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border-2 border-primary/40 bg-gradient-to-br from-card via-card to-primary/5 p-4 shadow-xs relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="max-w-xl">
                <div className="flex items-center gap-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <History className="size-4 text-primary" /> Sincronização Rápida (Atualização
                    Incremental)
                  </h2>
                  <span className="bg-primary/20 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
                    ⚡ Em Segundos
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Busca apenas o que mudou na fonte desde a última coleta, sem recarregar o catálogo
                  inteiro. Esta rota oficial consulta apenas as alterações recentes e conclui em
                  poucos segundos.
                </p>
              </div>
              <Button
                size="sm"
                className="cursor-pointer font-medium shadow-xs"
                onClick={() => iniciarIncremental({})}
                disabled={rodando}
              >
                <RefreshCw className="mr-1.5 size-3.5" /> Buscar Mudanças Recentes
              </Button>
            </div>

            {coberturaIncremental.data && coberturaIncremental.data.particoes > 0 ? (
              <>
                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    [
                      "Atualizado até",
                      coberturaIncremental.data.fronteira_agregada
                        ? dataBR(coberturaIncremental.data.fronteira_agregada)
                        : "—",
                    ],
                    ["Partições", numero(coberturaIncremental.data.particoes)],
                    ["Sem cobertura", numero(coberturaIncremental.data.nunca_cobertas)],
                    ["Consultado em", dataHoraBR(coberturaIncremental.data.consultado_em)],
                  ].map(([rotulo, valor]) => (
                    <div key={rotulo}>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {rotulo}
                      </dt>
                      <dd className="num text-sm">{valor}</dd>
                    </div>
                  ))}
                </dl>

                {/* A fronteira agregada é o MÍNIMO entre as partições, não o
                    máximo: dizer "atualizado até" uma data que só vale para a
                    partição mais adiantada seria uma promessa falsa. */}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  &quot;Atualizado até&quot; é a partição mais atrasada
                  {coberturaIncremental.data.particao_mais_atrasada
                    ? ` (${coberturaIncremental.data.particao_mais_atrasada.uf || "Brasil"} · modalidade ${coberturaIncremental.data.particao_mais_atrasada.modalidade_id})`
                    : ""}
                  . O dia corrente nunca fecha enquanto está em andamento.
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Nenhuma partição percorrida ainda. O primeiro ciclo parte do início da carga
                inicial, para recuperar o que mudou durante ela.
              </p>
            )}

            {segmentosIncremental !== null && (
              <p className="num mt-2 text-[11px] text-muted-foreground">
                Último plano: {numero(segmentosIncremental)} janela(s) de atualização.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Recorte da consulta</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Busca contratações com recebimento de propostas aberto na API pública do PNCP.
          </p>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium">Período de encerramento (dias)</Label>
                <button
                  type="button"
                  onClick={() => setPersonalizado((v) => !v)}
                  className="text-[11px] text-primary hover:underline cursor-pointer"
                >
                  {personalizado ? "Usar botões rápidos" : "Personalizar dias"}
                </button>
              </div>

              {!personalizado ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { dias: 5, rotulo: "5 dias", tag: "Super rápido", sub: "Urgentes" },
                    { dias: 15, rotulo: "15 dias", tag: "Rápido", sub: "Próx. 2 semanas" },
                    { dias: 30, rotulo: "30 dias", tag: "Completo", sub: "Mês inteiro" },
                  ].map((opcao) => {
                    const ativo = horizonte === opcao.dias;
                    return (
                      <button
                        key={opcao.dias}
                        type="button"
                        onClick={() => setHorizonte(opcao.dias)}
                        className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all cursor-pointer ${
                          ativo
                            ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary shadow-xs"
                            : "border-border bg-card/60 hover:bg-accent/40 text-muted-foreground"
                        }`}
                      >
                        <span className="text-xs font-bold text-foreground">{opcao.rotulo}</span>
                        <span className="text-[10px] text-muted-foreground">{opcao.sub}</span>
                        <span
                          className={`mt-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                            ativo
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {opcao.tag}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={horizonte}
                    onChange={(e) =>
                      setHorizonte(Math.max(1, Math.min(365, Number(e.target.value) || 1)))
                    }
                    className="h-8 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Digite qualquer quantidade de dias entre 1 e 365.
                  </p>
                </div>
              )}

              <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
                <p>
                  ⚡ <strong className="text-foreground">Busca direta em etapa única:</strong> traz
                  diretamente as oportunidades encerrando até{" "}
                  <strong className="text-foreground">{horizonte} dias</strong> sem triplicar
                  requisições em 5, 15 e 30 dias. A busca fica até 3x mais rápida!
                </p>
              </div>

              <label className="flex items-center gap-2 pt-0.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                <Checkbox checked={emEtapas} onCheckedChange={(v) => setEmEtapas(Boolean(v))} />
                <span>
                  Dividir busca em etapas cumulativas (5, 15 e {horizonte} dias) — mais demorado
                </span>
              </label>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">UFs — ao menos uma é obrigatória</Label>
              <div className="grid max-h-44 grid-cols-4 gap-1 overflow-y-auto rounded-md border border-border p-2">
                {UFS.map((uf) => (
                  <label key={uf} className="flex items-center gap-1.5 text-[11px]">
                    <Checkbox checked={ufs.includes(uf)} onCheckedChange={() => alternarUf(uf)} />
                    {uf}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Cada UF marcada vira uma consulta separada; a fonte não aceita lista num único
                parâmetro.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">
                Modalidades {mods.length === 0 && "— nenhuma marcada significa todas"}
              </Label>
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {(modalidades ?? []).map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-[11px]">
                    <Checkbox
                      checked={mods.includes(m.id)}
                      onCheckedChange={() => setMods((v) => alternar(v, m.id))}
                    />
                    <span className="truncate">{m.nome}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Neste endpoint a modalidade é opcional: deixar tudo desmarcado traz todas e evita
                multiplicar consultas.
              </p>
            </div>

            <Button
              className="w-full cursor-pointer"
              onClick={() =>
                iniciar({
                  ufs,
                  modalidades: mods,
                  horizonteDias: horizonte,
                  emEtapas,
                  etapasHorizonteDias: emEtapas ? undefined : [horizonte],
                })
              }
              disabled={rodando}
            >
              {rodando ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 size-4" />
              )}
              {rodando ? "Sincronizando…" : `Sincronizar PNCP (${horizonte} dias)`}
            </Button>

            <p className="text-[11px] text-muted-foreground">
              Palavra-chave e faixa de valor não existem como filtro na fonte: tudo do recorte é
              importado e a seleção fina acontece em Licitações Salvas.
            </p>
          </div>
        </section>
      </div>
    </div>
  </AppShell>
);
}
