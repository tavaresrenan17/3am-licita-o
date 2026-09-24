/**
 * PAINEL "OPORTUNIDADES" DO DASHBOARD.
 *
 * Quatro números que respondem "onde eu trabalho agora?" e um ranking de onde
 * ainda há o que disputar.
 *
 * Decisões de visualização:
 * - Os quatro indicadores são NÚMEROS, não gráficos. Cada um é uma manchete
 *   única: um gráfico de um valor só gasta espaço sem acrescentar leitura.
 * - O ranking de estados é barra horizontal, que é a forma para magnitude
 *   comparada entre identidades — e uma série só, portanto uma cor só. Um mapa
 *   decorativo (verde chapado, sem codificar valor) ficaria bonito e diria
 *   menos: a barra mostra a proporção que o mapa esconde.
 * - Cor entra por último e só nas marcas. Rótulo, valor e legenda usam tokens
 *   de texto; quem carrega identidade é a barra ao lado.
 * - Todo número abre exatamente a lista que foi contada. Indicador que não
 *   abre nada é enfeite.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { MetricasDTO } from "@/lib/dto";
import { diaBR, numero } from "@/lib/format";
import { UF_NOME } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Parâmetros aceitos por /licitacoes; o painel só monta recortes válidos. */
type BuscaLicitacoes = {
  uf?: string;
  criadas_de?: string;
  limite_ate?: string;
  apenas_abertas?: boolean;
  recomendadas?: boolean;
  ordenar?: "data_limite_proposta" | "valor_estimado" | "data_publicacao" | "score_aderencia";
  direcao?: "asc" | "desc";
};

function Indicador({
  rotulo,
  valor,
  ajuda,
  para,
  destaque,
  carregando,
}: {
  rotulo: string;
  valor: number | undefined;
  ajuda: string;
  para: BuscaLicitacoes;
  /** O indicador principal do cartão ganha superfície própria. */
  destaque?: boolean;
  carregando?: boolean;
}) {
  return (
    <div className={cn("rounded-lg p-4", destaque && "bg-muted/50")}>
      <p className="text-sm font-semibold text-foreground">{rotulo}</p>
      <p className="num mt-1.5 text-4xl font-bold leading-none tracking-tight">
        {carregando || valor === undefined ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          numero(valor)
        )}
      </p>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{ajuda}</p>
      <Link
        to="/licitacoes"
        search={para}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        Visualizar <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

function BarraEstado({
  uf,
  qtd,
  maximo,
  total,
}: {
  uf: string;
  qtd: number;
  maximo: number;
  total: number;
}) {
  // Proporcional ao maior do ranking, não ao total: com um estado dominante,
  // escalar pelo total deixaria todas as outras barras invisíveis.
  const largura = maximo > 0 ? Math.max((qtd / maximo) * 100, 2) : 0;
  const fatia = total > 0 ? (qtd / total) * 100 : 0;

  return (
    <Link
      to="/licitacoes"
      search={{ uf, apenas_abertas: true, ordenar: "data_limite_proposta", direcao: "asc" }}
      className="group grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40"
    >
      <span className="truncate text-xs font-medium text-foreground">{UF_NOME[uf] ?? uf}</span>

      {/* Marca fina, extremidade arredondada só na ponta do dado: a base fica
          reta, ancorada no eixo. */}
      <span className="h-2 w-full rounded-r-[4px] bg-muted" aria-hidden>
        <span
          className="block h-2 rounded-r-[4px] bg-primary transition-[width] duration-300"
          style={{ width: `${largura}%` }}
        />
      </span>

      <span className="num flex items-baseline gap-2 text-xs tabular-nums">
        <span className="w-10 text-right text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {fatia.toFixed(0)}%
        </span>
        <span className="w-12 text-right font-semibold">{numero(qtd)}</span>
      </span>
    </Link>
  );
}

export function PainelOportunidades({
  m,
  carregando,
}: {
  m: MetricasDTO | undefined;
  carregando: boolean;
}) {
  const estados = (m?.por_uf ?? []).slice(0, 6);
  const maximo = estados.reduce((acc, e) => Math.max(acc, e.qtd), 0);
  const totalAbertas = m?.abertas ?? 0;

  return (
    <section className="mb-4">
      <h2 className="mb-2 text-base font-semibold">Oportunidades</h2>

      <div className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-2">
          <Indicador
            destaque
            rotulo="Novas oportunidades do dia"
            valor={m?.novas_hoje}
            ajuda="Entraram no catálogo hoje, em qualquer situação."
            carregando={carregando}
            para={{ criadas_de: diaBR(), ordenar: "data_publicacao", direcao: "desc" }}
          />
          <Indicador
            rotulo="Vigentes"
            valor={m?.abertas}
            ajuda="Com recebimento de proposta aberto neste instante."
            carregando={carregando}
            para={{ apenas_abertas: true, ordenar: "data_limite_proposta", direcao: "asc" }}
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-2">
          <Indicador
            destaque
            rotulo="Encerrando até amanhã"
            valor={m?.encerrando_ate_amanha}
            ajuda="Prazo estourando: é aqui que a proposta precisa sair hoje."
            carregando={carregando}
            para={{
              apenas_abertas: true,
              limite_ate: diaBR(1),
              ordenar: "data_limite_proposta",
              direcao: "asc",
            }}
          />
          <Indicador
            rotulo="Alta aderência"
            valor={m?.recomendadas}
            ajuda="Score acima do mínimo configurado para construção civil."
            carregando={carregando}
            para={{ recomendadas: true, ordenar: "score_aderencia", direcao: "desc" }}
          />
        </div>

        <div className="flex flex-col rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">Licitações por estado</h3>
            <span className="text-[11px] text-muted-foreground">
              {carregando ? "carregando…" : `${numero(totalAbertas)} vigentes`}
            </span>
          </div>

          {estados.length === 0 ? (
            <p className="mt-6 text-xs text-muted-foreground">
              {carregando
                ? "Carregando distribuição…"
                : "Nenhuma licitação vigente no catálogo. Sincronize o PNCP para popular o painel."}
            </p>
          ) : (
            <>
              <div className="mt-3 flex-1 space-y-1">
                {estados.map((e) => (
                  <BarraEstado
                    key={e.uf}
                    uf={e.uf}
                    qtd={e.qtd}
                    maximo={maximo}
                    total={totalAbertas}
                  />
                ))}
              </div>

              <Link
                to="/licitacoes"
                search={{ apenas_abertas: true }}
                className="mt-3 inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
              >
                Ver mais <ArrowRight className="size-3" />
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
