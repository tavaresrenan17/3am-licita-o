import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  Info,
  MessageSquarePlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { EmptyState, StatusInternoBadge, StatusPncpBadge } from "@/components/data-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  CATEGORIAS,
  STATUS_INTERNO_LABEL,
  filtrosVazios,
  type FiltrosLicitacoes,
  type OrdenacaoCampo,
  type StatusInterno,
} from "@/lib/types";
import { brl, dataBR, diaBR, diasRestantes, numero } from "@/lib/format";
import {
  useAtualizarInterno,
  useConfiguracoes,
  useLicitacoes,
  useModalidades,
  useOpcoesFiltros,
} from "@/services/api";

/**
 * Filtros que podem chegar pela URL.
 *
 * Servem para o Dashboard abrir esta tela já recortada: um número que a equipe
 * leu no painel tem de abrir exatamente a lista que foi contada, senão o card
 * vira enfeite. São a semente do estado inicial — mexer nos filtros aqui não
 * reescreve a URL, e é de propósito: a barra continua sendo o link que trouxe
 * você, não um espelho de cada clique.
 */
const buscaSchema = z.object({
  uf: z.string().length(2).optional(),
  categoria: z.string().optional(),
  criadas_de: z.string().optional(),
  limite_ate: z.string().optional(),
  apenas_abertas: z.boolean().optional(),
  recomendadas: z.boolean().optional(),
  nao_analisadas: z.boolean().optional(),
  ordenar: z
    .enum(["data_limite_proposta", "valor_estimado", "data_publicacao", "score_aderencia"])
    .optional(),
  direcao: z.enum(["asc", "desc"]).optional(),
});

export const Route = createFileRoute("/licitacoes/")({
  ssr: false,
  validateSearch: buscaSchema,
  head: () => ({
    meta: [
      { title: "Licitações Salvas | 3AM Licitação" },
      {
        name: "description",
        content:
          "Pesquise, filtre e classifique as licitações de construção civil já salvas no banco da 3AM.",
      },
      { property: "og:title", content: "Licitações Salvas | 3AM Licitação" },
      {
        property: "og:description",
        content: "Análise e priorização de oportunidades salvas no banco.",
      },
    ],
  }),
  component: LicitacoesSalvas,
});

const COLUNAS: { key: string; label: string }[] = [
  { key: "orgao", label: "Órgão" },
  { key: "local", label: "Município / UF" },
  { key: "objeto", label: "Objeto" },
  { key: "valor", label: "Valor estimado" },
  { key: "publicacao", label: "Publicação" },
  { key: "limite", label: "Limite proposta" },
  { key: "modalidade", label: "Modalidade" },
  { key: "status_pncp", label: "Status PNCP" },
  { key: "status_interno", label: "Status interno" },
  { key: "categoria", label: "Categoria" },
  { key: "docs", label: "Docs" },
];

// O catálogo começa por São Paulo. Aplicar esse recorte antes da primeira
// consulta evita buscar e contar registros antigos de outros estados.
const UF_INICIAL = "SP";

interface ComboFiltroProps {
  label: string;
  value: string;
  placeholder?: string;
  options: string[];
  renderOption?: (value: string) => string;
  onChange: (value: string) => void;
}

function ComboFiltro({
  label,
  value,
  placeholder,
  options,
  renderOption,
  onChange,
}: ComboFiltroProps) {
  const display = (v: string) => (renderOption ? renderOption(v) : v);
  const [aberto, setAberto] = useState(false);
  const [query, setQuery] = useState(value === "" ? "" : display(value));
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const filtradas = useMemo(() => {
    const q = normalizar(query);
    if (!q) return options;
    return options.filter((o) => normalizar(display(o)).includes(q));
  }, [query, options, renderOption]);

  useEffect(() => {
    setQuery(value === "" ? "" : display(value));
  }, [value, renderOption]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selecionar = (v: string) => {
    onChange(v);
    setQuery(display(v));
    setAberto(false);
  };

  const limpar = () => {
    onChange("");
    setQuery("");
    setAberto(false);
  };

  return (
    <div ref={containerRef} className="relative space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <div className="relative">
        <Input
          value={query}
          placeholder={placeholder || "Todos"}
          onChange={(e) => {
            setQuery(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          className="pr-7"
        />
        {query && (
          <button
            type="button"
            onClick={limpar}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpar filtro"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {aberto && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              limpar();
            }}
            className="w-full px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
          >
            Todos
          </button>
          {filtradas.map((o) => (
            <button
              key={o}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selecionar(o);
              }}
              className={cn(
                "w-full px-2.5 py-1.5 text-left text-xs hover:bg-accent",
                value === o ? "bg-accent text-accent-foreground" : "text-foreground",
              )}
            >
              {display(o)}
            </button>
          ))}
          {filtradas.length === 0 && (
            <div className="px-2.5 py-1.5 text-xs text-muted-foreground">
              Nenhuma opção encontrada
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LicitacoesSalvas() {
  const navigate = useNavigate();
  const { data: config } = useConfiguracoes();
  const { data: opcoes } = useOpcoesFiltros();
  const { data: modalidades } = useModalidades();
  const atualizar = useAtualizarInterno();

  const busca = Route.useSearch();

  const [filtros, setFiltros] = useState<FiltrosLicitacoes>(() => ({
    ...filtrosVazios,
    uf: busca.uf ?? UF_INICIAL,
    ...(busca.categoria ? { categoria: busca.categoria } : {}),
    ...(busca.criadas_de ? { criadas_de: busca.criadas_de } : {}),
    ...(busca.limite_ate ? { limite_ate: busca.limite_ate } : {}),
    ...(busca.apenas_abertas ? { apenas_abertas: true } : {}),
    ...(busca.recomendadas ? { recomendadas: true } : {}),
    ...(busca.nao_analisadas ? { nao_analisadas: true } : {}),
  }));
  const [termo, setTermo] = useState("");
  const [ordenarPor, setOrdenarPor] = useState<OrdenacaoCampo>(
    busca.ordenar ?? "data_limite_proposta",
  );
  const [direcao, setDirecao] = useState<"asc" | "desc">(busca.direcao ?? "asc");
  const [pagina, setPagina] = useState(1);
  const [obsAberta, setObsAberta] = useState<string | null>(null);
  const [obsTexto, setObsTexto] = useState("");

  // Digitar não dispara uma consulta por tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltros((f) => (f.palavra_chave === termo ? f : { ...f, palavra_chave: termo }));
      setPagina(1);
    }, 350);
    return () => clearTimeout(t);
  }, [termo]);

  const itensPorPagina = config?.itens_por_pagina ?? 25;
  const scoreMinimo = config?.score_minimo_recomendado ?? 60;
  const colunas = config?.colunas_visiveis ?? COLUNAS.map((c) => c.key);
  const visivel = (k: string) => colunas.includes(k);

  const consulta = useLicitacoes({
    filtros,
    ordenarPor,
    direcao,
    pagina,
    itensPorPagina,
  });

  const itens = consulta.data?.itens ?? [];
  const total = consulta.data?.total ?? 0;
  const totalPaginas = consulta.data?.totalPaginas ?? 1;

  const set = <K extends keyof FiltrosLicitacoes>(k: K, v: FiltrosLicitacoes[K]) => {
    setFiltros((f) => ({ ...f, [k]: v }));
    setPagina(1);
  };

  const ordenar = (campo: OrdenacaoCampo) => {
    if (campo === ordenarPor) setDirecao(direcao === "asc" ? "desc" : "asc");
    else {
      setOrdenarPor(campo);
      setDirecao(campo === "data_limite_proposta" ? "asc" : "desc");
    }
    setPagina(1);
  };

  const setStatus = (id: string, status: StatusInterno) => {
    atualizar.mutate(
      {
        id,
        statusInterno: status,
        historico: `Status interno: ${STATUS_INTERNO_LABEL[status]}`,
      },
      {
        onSuccess: () =>
          toast.success(`Marcada como ${STATUS_INTERNO_LABEL[status].toLowerCase()}.`),
      },
    );
  };

  const togglePrioridade = (id: string, atual: boolean) => {
    atualizar.mutate({
      id,
      prioridade: !atual,
      historico: atual ? "Prioridade removida" : "Marcada como prioritária",
    });
  };

  const salvarObs = () => {
    if (!obsAberta) return;
    const atualItem = itens.find((x) => x.id === obsAberta);
    const texto = [atualItem?.observacoes, obsTexto].filter(Boolean).join("\n");
    atualizar.mutate(
      { id: obsAberta, observacoes: texto, historico: "Observação interna adicionada" },
      {
        onSuccess: () => {
          setObsAberta(null);
          setObsTexto("");
          toast.success("Observação salva.");
        },
      },
    );
  };

  const filtrosAtivos = Object.entries(filtros).filter(([chave, v]) => {
    // `apenas_abertas` é uma regra fixa do catálogo, não uma escolha do usuário.
    if (chave === "apenas_abertas") return false;
    return typeof v === "boolean" ? v : v !== "";
  }).length;

  const limparTudo = () => {
    // Limpa as escolhas do usuário, preservando as invariantes do catálogo:
    // escopo inicial em SP e somente oportunidades abertas com prazo.
    setFiltros({ ...filtrosVazios, uf: UF_INICIAL });
    setTermo("");
    setPagina(1);
  };

  const SortHead = ({ campo, label }: { campo: OrdenacaoCampo; label: string }) => (
    <button
      onClick={() => ordenar(campo)}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {label}
      {ordenarPor === campo &&
        (direcao === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
    </button>
  );

  return (
    <AppShell
      titulo="Licitações Salvas"
      descricao="Consulta somente ao banco de dados da aplicação — nenhuma requisição ao PNCP."
      acoes={
        <>
          <span className="num text-xs text-muted-foreground">
            {numero(total)} {total === 1 ? "registro" : "registros"}
            {consulta.isFetching && " · atualizando…"}
          </span>
          {filtrosAtivos > 0 && (
            <Button variant="outline" size="sm" onClick={limparTudo}>
              <X className="mr-1 size-3.5" /> Limpar filtros ({filtrosAtivos})
            </Button>
          )}
        </>
      }
    >
      <section className="rounded-lg border border-border bg-card p-3.5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Filter className="size-3.5" /> Filtros aplicados no banco, sobre todo o catálogo
        </div>

        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[11px]">Palavra-chave no objeto ou órgão</Label>
            <Input
              placeholder="ex.: pavimentação, escola"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
            />
          </div>

          <ComboFiltro
            label="UF"
            value={filtros.uf}
            options={opcoes?.["ufs"] ?? []}
            onChange={(v) => set("uf", v)}
          />
          <ComboFiltro
            label="Município"
            value={filtros.municipio}
            options={opcoes?.["municipios"] ?? []}
            onChange={(v) => set("municipio", v)}
          />
          <ComboFiltro
            label="Órgão"
            value={filtros.orgao}
            options={opcoes?.["orgaos"] ?? []}
            onChange={(v) => set("orgao", v)}
          />
          <ComboFiltro
            label="Modalidade"
            value={filtros.modalidade}
            options={(modalidades ?? []).map((m) => m.nome)}
            onChange={(v) => set("modalidade", v)}
          />
          <ComboFiltro
            label="Categoria"
            value={filtros.categoria}
            options={opcoes?.["categorias"] ?? CATEGORIAS}
            onChange={(v) => set("categoria", v)}
          />
          <ComboFiltro
            label="Status interno"
            value={filtros.status_interno}
            options={Object.keys(STATUS_INTERNO_LABEL) as StatusInterno[]}
            renderOption={(k) => STATUS_INTERNO_LABEL[k as StatusInterno]}
            onChange={(v) => set("status_interno", v)}
          />
          <ComboFiltro
            label="Prioridade"
            value={filtros.prioridade}
            options={["sim", "nao"]}
            renderOption={(v) => (v === "sim" ? "Somente prioritárias" : "Sem prioridade")}
            onChange={(v) => set("prioridade", v)}
          />

          <div className="space-y-1">
            <Label className="text-[11px]">Valor mínimo</Label>
            <Input
              type="number"
              placeholder="0"
              value={filtros.valor_min}
              onChange={(e) => set("valor_min", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Valor máximo</Label>
            <Input
              type="number"
              placeholder="sem limite"
              value={filtros.valor_max}
              onChange={(e) => set("valor_max", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Publicação de</Label>
            <Input
              type="date"
              value={filtros.publicacao_de}
              onChange={(e) => set("publicacao_de", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Publicação até</Label>
            <Input
              type="date"
              value={filtros.publicacao_ate}
              onChange={(e) => set("publicacao_ate", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Limite proposta de</Label>
            <Input
              type="date"
              value={filtros.limite_de}
              onChange={(e) => set("limite_de", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Limite proposta até</Label>
            <Input
              type="date"
              value={filtros.limite_ate}
              onChange={(e) => set("limite_ate", e.target.value)}
            />
          </div>
        </div>

        {/* Atalhos de urgência. O prazo é o que organiza o trabalho de quem monta
            proposta, e digitar a data toda vez para a pergunta mais frequente é
            atrito. A regra de proposta aberta já é obrigatória no servidor. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-[11px] text-muted-foreground">Encerrando em:</span>
          {[5, 15, 30].map((dias) => {
            const ate = diaBR(dias);
            const ativo = filtros.apenas_abertas && filtros.limite_ate === ate;
            return (
              <Button
                key={dias}
                size="sm"
                variant={ativo ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => {
                  // Clicar no atalho ativo remove somente o prazo rápido. A regra
                  // de mostrar apenas oportunidades abertas permanece ativa.
                  setFiltros((f) => ({
                    ...f,
                    apenas_abertas: true,
                    limite_ate: ativo ? "" : ate,
                  }));
                  // O resultado encolhe: ficar na página 7 mostraria vazio.
                  setPagina(1);
                }}
              >
                {dias} dias
              </Button>
            );
          })}
          <span className="text-[11px] text-muted-foreground">
            somente propostas abertas com data limite disponível
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3">
          {(
            [
              ["nao_analisadas", "Apenas não analisadas"],
              ["recomendadas", `Apenas recomendadas (score ≥ ${scoreMinimo})`],
            ] as const
          ).map(([campo, label]) => (
            <label key={campo} className="flex items-center gap-2 text-xs">
              <Checkbox checked={filtros[campo]} onCheckedChange={(v) => set(campo, Boolean(v))} />
              {label}
            </label>
          ))}

          {/* Documentos entram na próxima etapa. Marcar agora não encontraria
              nada, e "não coletado" não é o mesmo que "não tem". */}
          {(
            [
              ["com_edital", "Com edital"],
              ["com_projeto", "Com projeto"],
              ["com_orcamento", "Com orçamento"],
            ] as const
          ).map(([campo, label]) => (
            <label
              key={campo}
              className="flex cursor-not-allowed items-center gap-2 text-xs text-muted-foreground"
              title="Os documentos das licitações ainda não são coletados."
            >
              <Checkbox checked={false} disabled />
              {label}
            </label>
          ))}

          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Info className="size-3" /> filtros por documento ficam disponíveis quando a coleta de
            arquivos entrar no ar
          </span>
        </div>
      </section>

      <section className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
        {consulta.isLoading ? (
          <p className="px-4 py-10 text-center text-xs text-muted-foreground">Carregando…</p>
        ) : consulta.isError ? (
          <EmptyState
            titulo="Não foi possível consultar o banco"
            descricao={
              consulta.error instanceof Error ? consulta.error.message : "Erro desconhecido."
            }
          />
        ) : total === 0 ? (
          <EmptyState
            titulo="Nenhuma licitação encontrada"
            descricao="Ajuste ou limpe os filtros. Se o banco está vazio, execute uma sincronização com o PNCP."
            acao={
              <Button asChild size="sm" className="mt-2">
                <Link to="/sincronizacao">Ir para Sincronização PNCP</Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] table-fixed text-xs">
              <thead className="bg-secondary/70 text-muted-foreground">
                <tr className="border-b border-border">
                  {visivel("orgao") && (
                    <th className="h-10 w-[160px] px-3 py-0 text-left font-medium">Órgão</th>
                  )}
                  {visivel("local") && (
                    <th className="h-10 w-[130px] px-3 py-0 text-left font-medium">
                      Município / UF
                    </th>
                  )}
                  {visivel("objeto") && (
                    <th className="h-10 px-3 py-0 text-left font-medium">Objeto</th>
                  )}
                  {visivel("valor") && (
                    <th className="h-10 w-[124px] px-3 py-0 text-right font-medium">
                      <SortHead campo="valor_estimado" label="Valor" />
                    </th>
                  )}
                  {visivel("publicacao") && (
                    <th className="h-10 w-[96px] px-3 py-0 text-left font-medium">
                      <SortHead campo="data_publicacao" label="Publicação" />
                    </th>
                  )}
                  {visivel("limite") && (
                    <th className="h-10 w-[104px] px-3 py-0 text-left font-medium">
                      <SortHead campo="data_limite_proposta" label="Limite" />
                    </th>
                  )}
                  {visivel("modalidade") && (
                    <th className="h-10 w-[124px] px-3 py-0 text-left font-medium">Modalidade</th>
                  )}
                  {visivel("status_pncp") && (
                    <th className="h-10 w-[128px] px-3 py-0 text-left font-medium">Status PNCP</th>
                  )}
                  {visivel("status_interno") && (
                    <th className="h-10 w-[128px] px-3 py-0 text-left font-medium">
                      Status interno
                    </th>
                  )}
                  {visivel("categoria") && (
                    <th className="h-10 w-[136px] px-3 py-0 text-left font-medium">Categoria</th>
                  )}
                  {visivel("docs") && (
                    <th className="h-10 w-[52px] px-3 py-0 text-center font-medium">Docs</th>
                  )}
                  <th className="h-10 w-[76px] px-3 py-0 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((l) => {
                  const dias = l.data_limite_proposta
                    ? diasRestantes(l.data_limite_proposta)
                    : null;
                  return (
                    <tr
                      key={l.id}
                      className="h-12 cursor-pointer border-b border-border/60 align-middle transition-colors last:border-0 hover:bg-accent/40"
                      onClick={() => navigate({ to: "/licitacoes/$id", params: { id: l.id } })}
                    >
                      {visivel("orgao") && (
                        <td className="h-12 px-3 py-0">
                          <span className="block truncate" title={l.orgao}>
                            {l.orgao}
                          </span>
                        </td>
                      )}
                      {visivel("local") && (
                        <td
                          className="h-12 truncate px-3 py-0 text-muted-foreground"
                          title={`${l.municipio ?? "—"} / ${l.uf ?? "—"}`}
                        >
                          {l.municipio ?? "—"} / {l.uf ?? "—"}
                        </td>
                      )}
                      {visivel("objeto") && (
                        <td className="h-12 px-3 py-0">
                          <span className="block truncate" title={l.objeto}>
                            {l.objeto}
                          </span>
                        </td>
                      )}
                      {visivel("valor") && (
                        <td
                          className={cn(
                            "num h-12 whitespace-nowrap px-3 py-0 text-right font-medium",
                            l.valor_estimado === null && "text-[11px] text-muted-foreground",
                          )}
                        >
                          {brl(l.valor_estimado)}
                        </td>
                      )}
                      {visivel("publicacao") && (
                        <td className="num h-12 whitespace-nowrap px-3 py-0 text-muted-foreground">
                          {dataBR(l.data_publicacao)}
                        </td>
                      )}
                      {visivel("limite") && (
                        <td className="num h-12 whitespace-nowrap px-3 py-0">
                          {dataBR(l.data_limite_proposta)}
                          <span
                            className={cn(
                              "block text-[10px] leading-tight",
                              dias !== null && dias >= 0 && dias <= 7
                                ? "text-warning"
                                : "text-muted-foreground",
                            )}
                          >
                            {dias === null ? "sem prazo" : dias < 0 ? "encerrada" : `${dias}d`}
                          </span>
                        </td>
                      )}
                      {visivel("modalidade") && (
                        <td
                          className="h-12 truncate px-3 py-0 text-muted-foreground"
                          title={l.modalidade ?? ""}
                        >
                          {l.modalidade ?? "—"}
                        </td>
                      )}
                      {visivel("status_pncp") && (
                        <td className="h-12 px-3 py-0 *:whitespace-normal *:leading-tight">
                          <StatusPncpBadge status={l.status_pncp ?? "—"} />
                        </td>
                      )}
                      {visivel("status_interno") && (
                        <td className="h-12 px-3 py-0 *:whitespace-normal *:leading-tight">
                          <StatusInternoBadge status={l.status_interno} />
                        </td>
                      )}
                      {visivel("categoria") && (
                        <td
                          className="h-12 truncate px-3 py-0 text-muted-foreground"
                          title={l.categoria}
                        >
                          {l.categoria}
                        </td>
                      )}
                      {visivel("docs") && (
                        <td
                          className="num h-12 px-3 py-0 text-center"
                          title={
                            l.documentos_estado === "pendente"
                              ? "Documentos ainda não coletados"
                              : undefined
                          }
                        >
                          {l.documentos_estado === "pendente" ? "—" : l.documentos_total}
                        </td>
                      )}
                      <td
                        className="h-12 px-3 py-0 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                              Ações
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                navigate({ to: "/licitacoes/$id", params: { id: l.id } })
                              }
                            >
                              Abrir detalhe
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {(Object.keys(STATUS_INTERNO_LABEL) as StatusInterno[]).map((s) => (
                              <DropdownMenuItem key={s} onClick={() => setStatus(l.id, s)}>
                                Marcar como {STATUS_INTERNO_LABEL[s].toLowerCase()}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => togglePrioridade(l.id, l.prioridade)}>
                              {l.prioridade ? "Remover prioridade" : "Marcar prioridade"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setObsAberta(l.id);
                                setObsTexto("");
                              }}
                            >
                              <MessageSquarePlus className="mr-1.5 size-3.5" /> Observação rápida
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5 text-xs text-muted-foreground">
            <span className="num">
              Página {Math.min(pagina, totalPaginas)} de {totalPaginas} · {numero(total)} resultados
              {consulta.data?.consultadoEm &&
                ` · consultado em ${dataBR(consulta.data.consultadoEm)}`}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </section>

      <Dialog open={obsAberta !== null} onOpenChange={(o) => !o && setObsAberta(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Observação interna</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={5}
            placeholder="Ex.: exige acervo de pavimentação; conferir prazo de execução."
            value={obsTexto}
            onChange={(e) => setObsTexto(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setObsAberta(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarObs} disabled={!obsTexto.trim() || atualizar.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export { COLUNAS };
