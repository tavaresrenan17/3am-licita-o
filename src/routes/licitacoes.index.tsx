import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  HardHat,
  LayoutGrid,
  List,
  MessageSquarePlus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { EmptyState, StatusInternoBadge, StatusPncpBadge } from "@/components/data-bits";
import { LicitacaoCard } from "@/components/LicitacaoCard";
import { exportarLicitacoesCsv } from "@/lib/exportar-csv";
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
import { brl, dataBR, dataHoraBR, diaBR, diasRestantes, numero } from "@/lib/format";
import {
  DEFINICOES,
  contarFiltrosAtivos,
  definicoesDoGrupo,
  filtrosDaBusca,
  paramsDaBusca,
  presetPrazo,
} from "@/lib/filtros";
import { ATALHOS, type AcaoTriagem } from "@/lib/teclado";
import { useTriagemTeclado } from "@/hooks/useTriagemTeclado";
import {
  useAtualizarInterno,
  useConfiguracoes,
  useLicitacoes,
  useModalidades,
  useOpcoesFiltros,
} from "@/services/api";

/**
 * Cada parâmetro chega da URL como texto, mas o roteador faz `JSON.parse` de
 * cada valor antes de validar: `com_edital=true` vira booleano, `valor_min=500`
 * vira número e `uf=SP` continua string. Estes dois auxiliares absorvem as três
 * formas, em vez de o link quebrar a rota por causa de um tipo.
 */
const textoUrl = z.preprocess(
  (v) => (v === undefined || v === null || v === "" ? undefined : String(v)),
  z.string().optional(),
);
const boolUrl = z.preprocess(
  (v) => (v === undefined || v === null || v === "" ? undefined : v === true || v === "true"),
  z.boolean().optional(),
);

/**
 * Filtros que podem chegar pela URL — TODOS eles, e não um subconjunto.
 *
 * Servem para o Dashboard abrir esta tela já recortada: um número que a equipe
 * leu no painel tem de abrir exatamente a lista que foi contada, senão o card
 * vira enfeite. São a semente do estado inicial — mexer nos filtros aqui não
 * reescreve a URL, e é de propósito: a barra continua sendo o link que trouxe
 * você, não um espelho de cada clique.
 *
 * A lista tem de ser completa porque este `z.object` é o que decide o que
 * sobrevive ao "copiar link desta busca": o zod DESCARTA chave desconhecida
 * sem erro nenhum. Quando aqui só havia seis chaves, onze filtros sumiam em
 * silêncio — a começar pela palavra-chave, que é o filtro que dá nome ao
 * botão — e quem recebia o link via uma lista diferente da compartilhada, sem
 * nenhum indício.
 *
 * `uf` não valida mais o comprimento: um link com UF estranha deve devolver
 * lista vazia, e não derrubar a rota de quem recebeu.
 */
const buscaSchema = z.object({
  palavra_chave: textoUrl,
  uf: textoUrl,
  municipio: textoUrl,
  orgao: textoUrl,
  modalidade: textoUrl,
  valor_min: textoUrl,
  valor_max: textoUrl,
  publicacao_de: textoUrl,
  publicacao_ate: textoUrl,
  criadas_de: textoUrl,
  limite_de: textoUrl,
  limite_ate: textoUrl,
  status_interno: textoUrl,
  prioridade: textoUrl,
  categoria: textoUrl,
  com_edital: boolUrl,
  com_projeto: boolUrl,
  com_orcamento: boolUrl,
  nao_analisadas: boolUrl,
  recomendadas: boolUrl,
  apenas_abertas: boolUrl,
  ordenar: z
    .enum(["data_limite_proposta", "valor_estimado", "data_publicacao", "score_aderencia"])
    .optional()
    .catch(undefined),
  direcao: z.enum(["asc", "desc"]).optional().catch(undefined),
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
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          value={query}
          placeholder={placeholder || "Todos"}
          onChange={(e) => {
            setQuery(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          className="h-8 pr-7 text-xs"
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
  // `useMutation` devolve objeto novo a cada render; `mutate` é estável. É ele
  // que os callbacks do teclado fecham, para o ouvinte de `keydown` não ser
  // re-registrado a cada render por causa de uma identidade que muda sozinha.
  const { mutate: mutarInterno } = atualizar;

  const busca = Route.useSearch();

  // Semeado por uma função pura e testada, cobrindo TODAS as chaves: era aqui
  // que os filtros de um link compartilhado se perdiam ao chegar.
  const [filtros, setFiltros] = useState<FiltrosLicitacoes>(() =>
    filtrosDaBusca(busca, UF_INICIAL),
  );
  const [termo, setTermo] = useState(() => busca.palavra_chave ?? "");
  const buscaInputRef = useRef<HTMLInputElement>(null);
  const [filtrosExpandidos, setFiltrosExpandidos] = useState(false);

  useEffect(() => {
    const handleSlashKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        buscaInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleSlashKey);
    return () => window.removeEventListener("keydown", handleSlashKey);
  }, []);
  const [ordenarPor, setOrdenarPor] = useState<OrdenacaoCampo>(
    busca.ordenar ?? "data_limite_proposta",
  );
  const [direcao, setDirecao] = useState<"asc" | "desc">(busca.direcao ?? "asc");
  const [pagina, setPagina] = useState(1);
  const [obsAberta, setObsAberta] = useState<string | null>(null);
  const [obsTexto, setObsTexto] = useState("");
  const [modoVisualizacao, setModoVisualizacao] = useState<"tabela" | "cards">(() => {
    if (typeof window === "undefined") return "tabela";
    return (window.localStorage.getItem("3am-modo-visualizacao") as "tabela" | "cards") || "tabela";
  });

  const trocarModoVisualizacao = (modo: "tabela" | "cards") => {
    setModoVisualizacao(modo);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("3am-modo-visualizacao", modo);
    }
  };

  useEffect(() => {
    const handleAbrirAtalhos = () => setAjudaAberta(true);
    window.addEventListener("abrir-atalhos-teclado", handleAbrirAtalhos);
    return () => window.removeEventListener("abrir-atalhos-teclado", handleAbrirAtalhos);
  }, []);

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

  // `?? []` criaria um array novo a cada render. Junto com o `mutate` estável
  // acima, é isto que mantém `aoAgir` com a mesma identidade entre renders — e,
  // portanto, o ouvinte de `keydown` registrado uma vez em vez de a cada
  // render. Não havia vazamento nem registro duplo antes (a limpeza do efeito é
  // garantida), só churn; o comentário anterior contava metade da história.
  const itens = useMemo(() => consulta.data?.itens ?? [], [consulta.data]);
  const total = consulta.data?.total ?? 0;
  const totalPaginas = consulta.data?.totalPaginas ?? 1;
  // A tela não pode prometer semântica que não está ligada: o texto do campo
  // muda só quando o servidor confirma que respondeu em modo híbrido.
  const modoHibrido = consulta.data?.modo === "hibrido";
  const buscaDegradou = consulta.data?.degradou === true;

  const [ajudaAberta, setAjudaAberta] = useState(false);

  // Uma porta só para classificar e priorizar, usada pelo menu e pelo teclado.
  // Quando o teclado chamava `mutate` direto, ele gravava sem histórico e sem
  // toast: a trilha de auditoria ficava com buracos justamente no caminho que
  // esta tela existe para incentivar.
  const setStatus = useCallback(
    (id: string, status: StatusInterno) => {
      mutarInterno(
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
    },
    [mutarInterno],
  );

  const togglePrioridade = useCallback(
    (id: string, atual: boolean) => {
      mutarInterno(
        {
          id,
          prioridade: !atual,
          historico: atual ? "Prioridade removida" : "Marcada como prioritária",
        },
        {
          onSuccess: () =>
            toast.success(atual ? "Prioridade removida." : "Marcada como prioritária."),
        },
      );
    },
    [mutarInterno],
  );

  // Só traduz a ação em efeito. Quem decide que classificar avança para o item
  // seguinte é `avancaApos`, em `@/lib/teclado`, onde a regra é testável.
  const aoAgir = useCallback(
    (acao: AcaoTriagem, i: number) => {
      if (acao.tipo === "ajuda") {
        setAjudaAberta((v) => !v);
        return;
      }
      const alvo = itens[i];
      if (!alvo) return;
      if (acao.tipo === "abrir") {
        void navigate({ to: "/licitacoes/$id", params: { id: alvo.id } });
        return;
      }
      if (acao.tipo === "classificar") {
        setStatus(alvo.id, acao.status);
        return;
      }
      if (acao.tipo === "prioridade") {
        togglePrioridade(alvo.id, alvo.prioridade);
      }
    },
    [itens, navigate, setStatus, togglePrioridade],
  );

  // Trocar de recorte zera a seleção: o mesmo índice sobre outra lista aponta
  // para uma licitação que o usuário nunca viu, e a página 2 tem os mesmos 25
  // itens da página 1 — o efeito que só olhava `tamanho` não percebia nada.
  const chaveLista = useMemo(
    () => JSON.stringify([filtros, ordenarPor, direcao, pagina]),
    [filtros, ordenarPor, direcao, pagina],
  );

  const { indice } = useTriagemTeclado({
    tamanho: itens.length,
    // Nenhuma tecla pode classificar por trás de uma camada modal: com o
    // diálogo de observação aberto o ouvinte sai do ar por inteiro. A ajuda
    // não desliga o ouvinte — ela o restringe —, senão o `?` não fecharia o
    // painel que o `?` abriu.
    ativo: obsAberta === null,
    somenteAjuda: ajudaAberta,
    chaveLista,
    aoAgir,
  });

  // A linha selecionada precisa entrar em cena: com 25 itens por página, uns 15
  // toques em `j` levavam o anel para fora da janela, a tela parava de reagir
  // visivelmente e o `i` seguinte classificava uma licitação que o usuário
  // nunca leu. O foco programático é o que faz o leitor de tela anunciar a
  // linha do `role="grid"`; `preventScroll` deixa o salto por conta do
  // `scrollIntoView`, que usa `block: "nearest"` para não dar solavanco.
  const linhasRef = useRef<(HTMLTableRowElement | null)[]>([]);
  useEffect(() => {
    if (indice < 0) return;
    const linha = linhasRef.current[indice];
    if (!linha) return;
    linha.scrollIntoView({ block: "nearest" });
    linha.focus({ preventScroll: true });
  }, [indice]);

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

  // Contado a partir das DEFINICOES, e não de uma lista escrita à mão: era a
  // lista de oito campos que deixava `?recomendadas=true&categoria=Obras` mais
  // "Com edital" somarem quatro filtros e o contador exibir zero — e o contador
  // é quem decide se os botões "Limpar filtros" existem.
  const filtrosAtivos = contarFiltrosAtivos(filtros, UF_INICIAL);

  const limparTudo = () => {
    // Limpa as escolhas do usuário, preservando as invariantes do catálogo:
    // escopo inicial em SP e somente oportunidades abertas com prazo.
    setFiltros({ ...filtrosVazios, uf: UF_INICIAL });
    setTermo("");
    setPagina(1);
  };

  // Os chips saem das definições, e não de uma cadeia de `if`. Era a cadeia que
  // deixava filtro sem chip: nove filtros existiam no backend e nenhum deles
  // aparecia aqui.
  const chipsAtivos: { chave: string; label: string; limpar?: () => void }[] = [
    { chave: "uf-base", label: filtros.uf || UF_INICIAL },
    { chave: "abertas", label: "Em aberto" },
  ];
  for (const def of DEFINICOES) {
    const valor = filtros[def.chave];
    // `uf` já aparece como chip base; repetir seria ruído.
    if (def.chave === "uf") continue;
    if (valor === "" || valor === false || valor === undefined) continue;
    chipsAtivos.push({
      chave: def.chave,
      label: def.descrever(valor),
      limpar: () => {
        if (def.chave === "palavra_chave") setTermo("");
        set(def.chave, (typeof valor === "boolean" ? false : "") as never);
      },
    });
  }

  const copiarLink = () => {
    // A URL não é espelho dos filtros — decisão registrada no topo deste
    // arquivo. Quem quiser compartilhar um recorte compartilha por aqui, sem
    // poluir o histórico do navegador a cada tecla. `paramsDaBusca` percorre a
    // forma autoritativa dos filtros, e o `buscaSchema` lá em cima aceita todas
    // as chaves: o link agora chega inteiro do outro lado.
    const url = `${window.location.origin}/licitacoes?${paramsDaBusca(
      filtros,
      ordenarPor,
      direcao,
    ).toString()}`;

    // Fora de contexto seguro (um deploy de LAN por http, por exemplo)
    // `navigator.clipboard` é `undefined`, e ler `.writeText` dele lançaria
    // SÍNCRONO — antes de existir `.catch()`. O clique não fazia nada e nem o
    // toast de erro aparecia.
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("Este navegador só libera a cópia em HTTPS. Copie a URL da barra.");
      return;
    }
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Link desta busca copiado"))
      .catch(() => toast.error("Não consegui copiar o link"));
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
      <section className="rounded-xl border border-border/80 bg-card/90 p-3.5 shadow-sm">
        {/* Presets Rápidos de Construção Civil */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-2.5">
          <span className="text-[11px] font-semibold text-muted-foreground mr-1">
            Presets Rápidos:
          </span>
          <button
            type="button"
            onClick={() => {
              setFiltros((f) => ({
                ...f,
                recomendadas: !f.recomendadas,
                apenas_abertas: true,
              }));
              setPagina(1);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-150 cursor-pointer",
              filtros.recomendadas
                ? "border-success/60 bg-success/15 text-success shadow-xs font-semibold"
                : "border-border/80 bg-muted/40 text-muted-foreground hover:border-success/40 hover:text-foreground",
            )}
          >
            <HardHat className="size-3 text-success" />
            <span>🏗️ Alta Aderência (Obras)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const ativo = filtros.limite_ate === diaBR(3);
              setFiltros((f) => ({
                ...f,
                limite_ate: ativo ? "" : diaBR(3),
                apenas_abertas: true,
              }));
              setPagina(1);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-150 cursor-pointer",
              filtros.limite_ate === diaBR(3)
                ? "border-warning/60 bg-warning/15 text-warning shadow-xs font-semibold"
                : "border-border/80 bg-muted/40 text-muted-foreground hover:border-warning/40 hover:text-foreground",
            )}
          >
            <span>⏱️ Prazos Críticos (≤ 3d)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const ativo = filtros.valor_min === "1000000";
              setFiltros((f) => ({
                ...f,
                valor_min: ativo ? "" : "1000000",
                apenas_abertas: true,
              }));
              setPagina(1);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-150 cursor-pointer",
              filtros.valor_min === "1000000"
                ? "border-primary/60 bg-primary/15 text-primary shadow-xs font-semibold"
                : "border-border/80 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            <span>💰 Grandes Obras (&gt; R$ 1M)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const ativo = filtros.prioridade === "true";
              setFiltros((f) => ({
                ...f,
                prioridade: ativo ? "" : "true",
              }));
              setPagina(1);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-150 cursor-pointer",
              filtros.prioridade === "true"
                ? "border-primary/60 bg-primary/15 text-primary shadow-xs font-semibold"
                : "border-border/80 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            <Star className="size-3 fill-primary text-primary" />
            <span>Minhas Prioritárias</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFiltros((f) => ({
                ...f,
                com_edital: !f.com_edital,
              }));
              setPagina(1);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-150 cursor-pointer",
              filtros.com_edital
                ? "border-info/60 bg-info/15 text-info shadow-xs font-semibold"
                : "border-border/80 bg-muted/40 text-muted-foreground hover:border-info/40 hover:text-foreground",
            )}
          >
            <span>📄 Com Edital</span>
          </button>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={buscaInputRef}
              className="h-8 pl-8 pr-8 text-xs placeholder:text-muted-foreground"
              placeholder={
                modoHibrido
                  ? "Busque por palavras ou por ideia (ex.: reforma de escola)…"
                  : "Buscar por palavras-chave (ex.: pavimentação, reforma, escola)…"
              }
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
            />
            {!termo && (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border/80 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground shadow-xs">
                /
              </kbd>
            )}
            {termo && (
              <button
                type="button"
                onClick={() => setTermo("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Limpar termo de busca"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant={filtrosExpandidos ? "secondary" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setFiltrosExpandidos((v) => !v)}
            >
              <SlidersHorizontal className="mr-1.5 size-3.5" />
              <span>Filtros</span>
              {filtrosAtivos > 0 && (
                <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {filtrosAtivos}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "ml-1 size-3 transition-transform",
                  filtrosExpandidos && "rotate-180",
                )}
              />
            </Button>
          </div>
        </div>

        {filtrosExpandidos && (
          <div className="mt-2.5 grid gap-2.5 border-t border-border/70 pt-2.5 sm:grid-cols-2 lg:grid-cols-3">
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
              <Label className="text-[11px] font-medium text-muted-foreground">
                Data de publicação
              </Label>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className="mb-0.5 block text-[10px] text-muted-foreground">De</span>
                  <Input
                    type="date"
                    aria-label="Publicação de"
                    value={filtros.publicacao_de}
                    onChange={(e) => set("publicacao_de", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <span className="mb-0.5 block text-[10px] text-muted-foreground">Até</span>
                  <Input
                    type="date"
                    aria-label="Publicação até"
                    value={filtros.publicacao_ate}
                    onChange={(e) => set("publicacao_ate", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Valor mínimo</Label>
              <Input
                type="number"
                min="0"
                placeholder="R$ 0,00"
                value={filtros.valor_min}
                onChange={(e) => set("valor_min", e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Valor máximo</Label>
              <Input
                type="number"
                min="0"
                placeholder="Sem limite"
                value={filtros.valor_max}
                onChange={(e) => set("valor_max", e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            {/* --- prazo da proposta: os dois filtros que o backend aceitava e
                a tela nunca ofereceu, mais os atalhos de quem pensa em
                "o que fecha essa semana" --- */}
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">
                Prazo da proposta
              </Label>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className="mb-0.5 block text-[10px] text-muted-foreground">De</span>
                  <Input
                    type="date"
                    aria-label="Encerra a partir de"
                    value={filtros.limite_de}
                    onChange={(e) => set("limite_de", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <span className="mb-0.5 block text-[10px] text-muted-foreground">Até</span>
                  <Input
                    type="date"
                    aria-label="Encerra até"
                    value={filtros.limite_ate}
                    onChange={(e) => set("limite_ate", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex gap-1 pt-1">
                {[7, 15, 30].map((dias) => (
                  <Button
                    key={dias}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => {
                      // Os atalhos preenchem as duas pontas de uma vez e
                      // pulam o helper `set`: por isso repetem aqui o reset
                      // de página que `set` faria para cada campo isolado.
                      const p = presetPrazo(dias);
                      setFiltros((f) => ({ ...f, ...p }));
                      setPagina(1);
                    }}
                  >
                    {dias} dias
                  </Button>
                ))}
              </div>
            </div>

            {/* --- documentos: "só as que têm edital" é provavelmente o filtro
                mais útil do sistema, e não existia na tela --- */}
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Documentos</Label>
              <div className="flex flex-col gap-1 pt-1">
                {definicoesDoGrupo("documentos").map((def) => (
                  <label key={def.chave} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      className="size-3.5"
                      checked={Boolean(filtros[def.chave])}
                      onChange={(e) => set(def.chave, e.target.checked as never)}
                    />
                    {def.rotulo}
                  </label>
                ))}
              </div>
            </div>

            {/* --- meu fluxo: `prioridade` é três estados ("", "sim", "nao"),
                não booleano — desmarcar volta para "" (indiferente), nunca
                para "nao" --- */}
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">Meu fluxo</Label>
              <div className="flex flex-col gap-1 pt-1">
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="size-3.5"
                    checked={Boolean(filtros.recomendadas)}
                    onChange={(e) => set("recomendadas", e.target.checked)}
                  />
                  Só recomendadas
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="size-3.5"
                    checked={Boolean(filtros.nao_analisadas)}
                    onChange={(e) => set("nao_analisadas", e.target.checked)}
                  />
                  Só não analisadas
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="size-3.5"
                    checked={filtros.prioridade === "sim"}
                    onChange={(e) => set("prioridade", e.target.checked ? "sim" : "")}
                  />
                  Só prioritárias
                </label>
              </div>
            </div>

            {/* --- entrada no catálogo --- */}
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">
                No catálogo desde
              </Label>
              <Input
                type="date"
                aria-label="No catálogo desde"
                value={filtros.criadas_de}
                onChange={(e) => set("criadas_de", e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-2">
          {chipsAtivos.map((chip) => (
            <span
              key={chip.chave}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-muted/60 px-2 text-[10px] font-medium"
            >
              {chip.label}
              {chip.limpar && (
                <button onClick={chip.limpar} aria-label={`Remover filtro ${chip.label}`}>
                  <X className="size-2.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </span>
          ))}
          {filtrosAtivos > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-2 text-[11px]"
              onClick={limparTudo}
            >
              <X className="mr-1 size-3" /> Limpar filtros
            </Button>
          )}
        </div>
      </section>

      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setAjudaAberta((v) => !v)}
        >
          Atalhos de triagem (?)
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={copiarLink}
        >
          Copiar link
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-foreground border-border/80 cursor-pointer"
          onClick={() => {
            if (itens.length === 0) {
              toast.error("Nenhuma licitação para exportar.");
              return;
            }
            exportarLicitacoesCsv(itens, `licitacoes-3am-${diaBR().replace(/\//g, "-")}.csv`);
            toast.success(`${itens.length} licitações exportadas para CSV.`);
          }}
          title="Exportar licitações filtradas para arquivo CSV compatível com Excel"
        >
          <Download className="mr-1.5 size-3" /> Exportar CSV
        </Button>

        <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border/80 bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => trocarModoVisualizacao("tabela")}
            className={cn(
              "flex size-6.5 items-center justify-center rounded-md text-xs transition-colors cursor-pointer",
              modoVisualizacao === "tabela"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Visualização em Tabela Densa"
            aria-label="Visualização em Tabela Densa"
          >
            <List className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => trocarModoVisualizacao("cards")}
            className={cn(
              "flex size-6.5 items-center justify-center rounded-md text-xs transition-colors cursor-pointer",
              modoVisualizacao === "cards"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Visualização em Cards de Oportunidades"
            aria-label="Visualização em Cards de Oportunidades"
          >
            <LayoutGrid className="size-3.5" />
          </button>
        </div>
      </div>

      {ajudaAberta && (
        <div className="mt-2 rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-[11px] font-medium">Atalhos de triagem</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
            {ATALHOS.map((a) => (
              <li key={a.tecla} className="flex justify-between gap-4">
                <kbd className="rounded border border-border px-1 font-mono">{a.tecla}</kbd>
                <span className="text-right">{a.descricao}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Os atalhos não disparam enquanto você digita num campo.
          </p>
        </div>
      )}

      {buscaDegradou && (
        // Degradar em silêncio seria pior que degradar: quem busca precisa
        // saber que está vendo o resultado por palavra-chave, e não por ideia.
        <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          Busca semântica indisponível; exibindo resultados por palavra-chave.
        </p>
      )}

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
        ) : modoVisualizacao === "cards" ? (
          <div className="grid gap-3 p-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {itens.map((l, i) => (
              <LicitacaoCard
                key={l.id}
                licitacao={l}
                selecionada={i === indice}
                onSetStatus={setStatus}
                onTogglePrioridade={togglePrioridade}
                onAbrirObs={(id) => {
                  setObsAberta(id);
                  setObsTexto("");
                }}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* `role="grid"` é o que faz o leitor de tela anunciar a
                navegação por linha; sem ele a `<table>` fica com papel
                `table`, onde `aria-selected` numa `<tr>` nem é atributo
                permitido — o leitor ignorava e o axe acusava. */}
            <table role="grid" className="w-full min-w-[1120px] table-fixed text-xs">
              <thead className="bg-secondary text-muted-foreground border-b border-border">
                <tr role="row" className="border-b border-border">
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
                {itens.map((l, i) => {
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
                      role="row"
                      // A limpeza do ref (React 19) evita guardar linha já
                      // desmontada: sem ela, encolher a lista deixaria o
                      // índice apontando para um nó solto no ar.
                      ref={(el) => {
                        linhasRef.current[i] = el;
                        return () => {
                          linhasRef.current[i] = null;
                        };
                      }}
                      aria-selected={i === indice}
                      // Roving tabindex: só a linha selecionada é alcançável
                      // pelo Tab. Sem seleção, a primeira linha é a porta de
                      // entrada — e é exatamente nela que o primeiro `j` cai.
                      tabIndex={i === (indice < 0 ? 0 : indice) ? 0 : -1}
                      // NÃO existe `onMouseEnter` aqui, e a ausência é
                      // deliberada: o cursor atravessando a tabela a caminho de
                      // outra coisa roubava a seleção do teclado, e o `i`
                      // seguinte marcava a linha errada. A premissa do recurso é
                      // não classificar errado; quem usa mouse tem o `onClick`.
                      className={cn(
                        "cursor-pointer border-b border-border/60 align-middle outline-none transition-colors last:border-0 hover:bg-accent/40",
                        // A seleção precisa ser visível sem depender de cor
                        // sozinha: o anel marca a linha para quem navega por
                        // teclado sem tirar a mão do j/k.
                        i === indice && "bg-accent/60 ring-1 ring-inset ring-primary/40",
                      )}
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
                              {l.origem_semantica && l.trecho && (
                                // O trecho é o que fez este resultado aparecer:
                                // sem mostrá-lo, um acerto semântico parece
                                // arbitrário para quem buscou.
                                <span
                                  className="mt-1 line-clamp-2 block text-[11px] italic text-muted-foreground"
                                  title={l.trecho}
                                >
                                  Trecho do edital: “{l.trecho}”
                                </span>
                              )}
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
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Motivos rápidos (GO / NO-GO):</p>
            <div className="flex flex-wrap gap-1">
              {[
                "Falta Acervo (CAT)",
                "Margem Inexequível",
                "Prazo Curto",
                "Raio Inviável",
                "Risco Jurídico",
                "Alta Margem / Viável",
                "Acervo Pleno",
              ].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const prefixo = obsTexto ? `${obsTexto}\n• ` : "• ";
                    setObsTexto(`${prefixo}${tag}`);
                  }}
                  className="rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary/50 hover:bg-accent hover:text-foreground cursor-pointer"
                >
                  + {tag}
                </button>
              ))}
            </div>
          </div>
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
