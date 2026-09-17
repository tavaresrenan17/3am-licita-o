import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  MessageSquarePlus,
  Search,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { EmptyState, StatusInternoBadge, StatusPncpBadge } from "@/components/data-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  STATUS_INTERNO_LABEL,
  filtrosVazios,
  type FiltrosLicitacoes,
  type OrdenacaoCampo,
  type StatusInterno,
} from "@/lib/types";
import { brl, dataBR, diasRestantes, numero } from "@/lib/format";
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
      { title: "Licitações | 3AM Licitação" },
      {
        name: "description",
        content:
          "Pesquise, filtre e classifique as licitações de construção civil já salvas no banco da 3AM.",
      },
      { property: "og:title", content: "Licitações | 3AM Licitação" },
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

  const filtrosAtivos = [
    filtros.palavra_chave,
    filtros.modalidade,
    filtros.uf !== UF_INICIAL ? filtros.uf : "",
    filtros.municipio,
    filtros.publicacao_de,
    filtros.publicacao_ate,
    filtros.valor_min,
    filtros.valor_max,
  ].filter(Boolean).length;

  const limparTudo = () => {
    // Limpa as escolhas do usuário, preservando as invariantes do catálogo:
    // escopo inicial em SP e somente oportunidades abertas com prazo.
    setFiltros({ ...filtrosVazios, uf: UF_INICIAL });
    setTermo("");
    setPagina(1);
  };

  const chipsAtivos: { chave: string; label: string; limpar?: () => void }[] = [
    { chave: "uf-base", label: filtros.uf || UF_INICIAL },
    { chave: "abertas", label: "Em aberto" },
  ];
  if (filtros.palavra_chave)
    chipsAtivos.push({
      chave: "palavra_chave",
      label: `Busca: ${filtros.palavra_chave}`,
      limpar: () => {
        setTermo("");
        set("palavra_chave", "");
      },
    });
  if (filtros.municipio)
    chipsAtivos.push({
      chave: "municipio",
      label: filtros.municipio,
      limpar: () => set("municipio", ""),
    });
  if (filtros.modalidade)
    chipsAtivos.push({
      chave: "modalidade",
      label: filtros.modalidade,
      limpar: () => set("modalidade", ""),
    });
  if (filtros.publicacao_de)
    chipsAtivos.push({
      chave: "publicacao_de",
      label: `Publicadas desde ${dataBR(filtros.publicacao_de)}`,
      limpar: () => set("publicacao_de", ""),
    });
  if (filtros.publicacao_ate)
    chipsAtivos.push({
      chave: "publicacao_ate",
      label: `Publicadas até ${dataBR(filtros.publicacao_ate)}`,
      limpar: () => set("publicacao_ate", ""),
    });
  if (filtros.valor_min)
    chipsAtivos.push({
      chave: "valor_min",
      label: `Valor mínimo: ${brl(Number(filtros.valor_min))}`,
      limpar: () => set("valor_min", ""),
    });
  if (filtros.valor_max)
    chipsAtivos.push({
      chave: "valor_max",
      label: `Valor máximo: ${brl(Number(filtros.valor_max))}`,
      limpar: () => set("valor_max", ""),
    });

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
      titulo="Licitações"
      descricao="Encontre e priorize oportunidades abertas no catálogo."
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
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label className="text-xs font-medium">Palavras-chave</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 pl-9 text-sm"
                placeholder="Ex.: pavimentação, reforma, escola"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <ComboFiltro
            label="Modalidade"
            value={filtros.modalidade}
            options={(modalidades ?? []).map((m) => m.nome)}
            onChange={(v) => set("modalidade", v)}
          />
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

          <div className="space-y-1">
            <Label className="text-[11px]">Data de publicação</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="mb-1 block text-[10px] text-muted-foreground">De</span>
                <Input
                  type="date"
                  aria-label="Publicação de"
                  value={filtros.publicacao_de}
                  onChange={(e) => set("publicacao_de", e.target.value)}
                />
              </div>
              <div>
                <span className="mb-1 block text-[10px] text-muted-foreground">Até</span>
                <Input
                  type="date"
                  aria-label="Publicação até"
                  value={filtros.publicacao_ate}
                  onChange={(e) => set("publicacao_ate", e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Valor mínimo</Label>
            <Input
              type="number"
              min="0"
              placeholder="R$ 0,00"
              value={filtros.valor_min}
              onChange={(e) => set("valor_min", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Valor máximo</Label>
            <Input
              type="number"
              min="0"
              placeholder="Sem limite"
              value={filtros.valor_max}
              onChange={(e) => set("valor_max", e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          {chipsAtivos.map((chip) => (
            <span
              key={chip.chave}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 text-[11px] font-medium"
            >
              {chip.label}
              {chip.limpar && (
                <button onClick={chip.limpar} aria-label={`Remover filtro ${chip.label}`}>
                  <X className="size-3 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </span>
          ))}
          {filtrosAtivos > 0 && (
            <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={limparTudo}>
              <X className="mr-1 size-3.5" /> Limpar filtros
            </Button>
          )}
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
            <table className="w-full min-w-[1120px] table-fixed text-xs">
              <thead className="sticky top-[57px] z-10 bg-secondary text-muted-foreground shadow-[0_1px_0_hsl(var(--border))]">
                <tr className="border-b border-border">
                  {visivel("objeto") && (
                    <th className="h-11 px-4 py-0 text-left font-medium">Oportunidade</th>
                  )}
                  {visivel("valor") && (
                    <th className="h-10 w-[124px] px-3 py-0 text-right font-medium">
                      <SortHead campo="valor_estimado" label="Valor" />
                    </th>
                  )}
                  {visivel("limite") && (
                    <th className="h-11 w-[132px] px-3 py-0 text-left font-medium">
                      <SortHead campo="data_limite_proposta" label="Prazo" />
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
                  const objeto =
                    l.objeto && l.objeto.trim().toLowerCase() !== "null"
                      ? l.objeto
                      : "Objeto não informado";
                  return (
                    <tr
                      key={l.id}
                      className="cursor-pointer border-b border-border/60 align-middle transition-colors last:border-0 hover:bg-accent/40"
                      onClick={() => navigate({ to: "/licitacoes/$id", params: { id: l.id } })}
                    >
                      {visivel("objeto") && (
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            {l.prioridade && (
                              <Star className="mt-0.5 size-3.5 shrink-0 fill-primary text-primary" />
                            )}
                            <div className="min-w-0">
                              <span
                                className="line-clamp-2 text-[13px] font-medium leading-snug"
                                title={objeto}
                              >
                                {objeto}
                              </span>
                              <span
                                className="mt-1 block truncate text-[11px] text-muted-foreground"
                                title={`${l.orgao} · ${l.municipio ?? "—"} / ${l.uf ?? "—"}`}
                              >
                                {l.orgao} · {l.municipio ?? "—"} / {l.uf ?? "—"}
                              </span>
                            </div>
                          </div>
                        </td>
                      )}
                      {visivel("valor") && (
                        <td
                          className={cn(
                            "num whitespace-nowrap px-3 py-3 text-right font-semibold",
                            l.valor_estimado === null && "text-[11px] text-muted-foreground",
                          )}
                        >
                          {brl(l.valor_estimado)}
                        </td>
                      )}
                      {visivel("limite") && (
                        <td className="num whitespace-nowrap px-3 py-3">
                          <span className="font-medium">{dataBR(l.data_limite_proposta)}</span>
                          <span
                            className={cn(
                              "mt-1 block w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight",
                              dias !== null && dias >= 0 && dias <= 2
                                ? "bg-destructive/15 text-destructive"
                                : dias !== null && dias <= 5
                                  ? "bg-warning/15 text-warning"
                                  : dias !== null && dias <= 15
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground",
                            )}
                          >
                            {dias === null
                              ? "Sem prazo"
                              : dias < 0
                                ? "Encerrada"
                                : dias === 0
                                  ? "Encerra hoje"
                                  : `Encerra em ${dias}d`}
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
