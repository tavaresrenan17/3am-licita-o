import { Activity, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EstadoApiPncp, SondaApiPncpDTO } from "@/lib/dto";
import { dataHoraBR, numero } from "@/lib/format";
import { useStatusApiPncp } from "@/services/api";

const ESTADO: Record<EstadoApiPncp, { rotulo: string; cor: string; ponto: string }> = {
  online: {
    rotulo: "ONLINE",
    cor: "border-success/40 bg-success/10 text-success",
    ponto: "bg-success",
  },
  lenta: {
    rotulo: "LENTA",
    cor: "border-warning/40 bg-warning/10 text-warning",
    ponto: "bg-warning",
  },
  instavel: {
    rotulo: "INSTÁVEL",
    cor: "border-warning/40 bg-warning/10 text-warning",
    ponto: "bg-warning",
  },
  fora_do_ar: {
    rotulo: "FORA DO AR",
    cor: "border-destructive/40 bg-destructive/10 text-destructive",
    ponto: "bg-destructive",
  },
};

const latencia = (ms: number) =>
  ms < 1000
    ? `${numero(ms)} ms`
    : `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;

function Servico({
  nome,
  uso,
  sonda,
  verificando,
}: {
  nome: string;
  uso: string;
  sonda: SondaApiPncpDTO | undefined;
  verificando: boolean;
}) {
  const estilo = sonda ? ESTADO[sonda.estado] : null;
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold">{nome}</p>
        <p className="text-[11px] text-muted-foreground">{uso}</p>
        {sonda && (
          <p className="num mt-1.5 text-[11px] text-muted-foreground">
            {sonda.detalhe} · {latencia(sonda.latenciaMs)}
            {sonda.httpStatus ? ` · HTTP ${sonda.httpStatus}` : ""}
          </p>
        )}
      </div>
      {estilo ? (
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide",
            estilo.cor,
          )}
        >
          <span className="relative flex size-2">
            {sonda?.estado === "online" && (
              <span
                className={cn(
                  "absolute inline-flex size-full animate-ping rounded-full opacity-60",
                  estilo.ponto,
                )}
              />
            )}
            <span className={cn("relative inline-flex size-2 rounded-full", estilo.ponto)} />
          </span>
          {estilo.rotulo}
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
          {verificando && <Loader2 className="size-3 animate-spin" />}
          {verificando ? "VERIFICANDO" : "SEM DADOS"}
        </span>
      )}
    </div>
  );
}

/** Pausada enquanto a coleta roda, para não disputar com ela o limite de rajada do PNCP. */
export function StatusApiPncp({ pausado }: { pausado: boolean }) {
  const { data, error, isFetching, refetch } = useStatusApiPncp(pausado);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Activity className="size-4 text-primary" /> Status da API PNCP
          </h2>
          <p className="num mt-0.5 text-[11px] text-muted-foreground">
            {pausado
              ? "Sonda pausada durante a coleta — a saúde medida pela própria coleta está abaixo."
              : data
                ? `Verificado em ${dataHoraBR(data.verificadoEm)} · nova verificação a cada 2 min`
                : "Verificação ao vivo, a cada 2 min"}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="cursor-pointer"
          onClick={() => refetch()}
          disabled={isFetching || pausado}
        >
          <RefreshCw className={cn("mr-1 size-3.5", isFetching && "animate-spin")} />
          {isFetching ? "Verificando…" : "Verificar agora"}
        </Button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Servico
          nome="API de Consulta"
          uso="Listagens usadas pela sincronização"
          sonda={data?.consulta}
          verificando={isFetching}
        />
        <Servico
          nome="API de Integração"
          uso="Documentos e itens das licitações"
          sonda={data?.integracao}
          verificando={isFetching}
        />
      </div>

      {error && (
        <p className="mt-2 text-[11px] text-destructive">
          Não foi possível executar a verificação: {error.message}
        </p>
      )}
    </section>
  );
}
