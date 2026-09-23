import { useMemo, useState } from "react";
import {
  AlertCircle,
  Coins,
  Eye,
  FileText,
  Layers,
  Package,
  RefreshCw,
  Search,
  Tag,
} from "lucide-react";
import { useItensLicitacao } from "@/services/api";
import type { ItemLicitacao } from "@/lib/types";
import { brl, numero } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ItensLicitacaoTabProps {
  licitacaoId: string;
}

export function ItensLicitacaoTab({ licitacaoId }: ItensLicitacaoTabProps) {
  const { data, isLoading, isFetching, error, refetch } = useItensLicitacao(licitacaoId);
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "material" | "servico">("todos");
  const [itemSelecionado, setItemSelecionado] = useState<ItemLicitacao | null>(null);

  const itens = data?.itens ?? [];

  // Filtragem dos itens por texto e tipo
  const itensFiltrados = useMemo(() => {
    return itens.filter((item) => {
      const matchBusca =
        !busca ||
        item.descricao.toLowerCase().includes(busca.toLowerCase()) ||
        String(item.numeroItem) === busca.trim() ||
        (item.itemCategoriaNome &&
          item.itemCategoriaNome.toLowerCase().includes(busca.toLowerCase())) ||
        (item.ncmNbsCodigo && item.ncmNbsCodigo.includes(busca.trim()));

      const matchTipo =
        tipoFiltro === "todos" ||
        (tipoFiltro === "material" && item.materialOuServico === "M") ||
        (tipoFiltro === "servico" && item.materialOuServico === "S");

      return matchBusca && matchTipo;
    });
  }, [itens, busca, tipoFiltro]);

  // Cálculos consolidados
  const metricas = useMemo(() => {
    if (itens.length === 0) return { totalItens: 0, valorTotalItens: 0, maiorValorUnit: 0 };
    const valorTotalItens = itens.reduce((acc, it) => acc + (it.valorTotal || 0), 0);
    const maiorValorUnit = Math.max(...itens.map((it) => it.valorUnitarioEstimado || 0));
    return {
      totalItens: itens.length,
      valorTotalItens,
      maiorValorUnit,
    };
  }, [itens]);

  return (
    <div className="space-y-4">
      {/* Card Principal */}
      <section className="rounded-xl border border-border bg-card">
        {/* Cabeçalho da Seção */}
        <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Package className="size-4 text-primary" /> Itens da Contratação
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tabela oficial de itens do edital consultada diretamente na base de dados do PNCP.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/10 cursor-pointer"
            >
              <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
              {isFetching ? "Consultando PNCP..." : "Atualizar Itens"}
            </Button>
          </div>
        </header>

        {/* Métricas Consolidadas dos Itens */}
        {itens.length > 0 && (
          <div className="grid grid-cols-1 gap-2 border-b border-border/60 bg-muted/20 p-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-card p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers className="size-3 text-primary" /> Total de Itens
              </span>
              <p className="font-mono mt-1 text-xl font-bold text-foreground">
                {numero(metricas.totalItens)}
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Coins className="size-3 text-success" /> Soma Total dos Itens
              </span>
              <p className="font-mono mt-1 text-xl font-bold text-success">
                {brl(metricas.valorTotalItens)}
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Tag className="size-3 text-info" /> Maior Unitário Estimado
              </span>
              <p className="font-mono mt-1 text-xl font-bold text-foreground">
                {brl(metricas.maiorValorUnit)}
              </p>
            </div>
          </div>
        )}

        {/* Barra de Busca e Filtros */}
        {itens.length > 0 && (
          <div className="flex flex-col gap-2.5 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por descrição, número ou código..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="h-8 pl-8 text-xs bg-background"
              />
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <span className="text-[11px] text-muted-foreground mr-1">Tipo:</span>
              <Button
                variant={tipoFiltro === "todos" ? "default" : "outline"}
                size="sm"
                onClick={() => setTipoFiltro("todos")}
                className="h-7 px-2.5 text-xs cursor-pointer"
              >
                Todos ({itens.length})
              </Button>
              <Button
                variant={tipoFiltro === "material" ? "default" : "outline"}
                size="sm"
                onClick={() => setTipoFiltro("material")}
                className="h-7 px-2.5 text-xs cursor-pointer"
              >
                Material
              </Button>
              <Button
                variant={tipoFiltro === "servico" ? "default" : "outline"}
                size="sm"
                onClick={() => setTipoFiltro("servico")}
                className="h-7 px-2.5 text-xs cursor-pointer"
              >
                Serviço
              </Button>
            </div>
          </div>
        )}

        {/* Conteúdo: Loading, Erro, Vazio ou Tabela de Itens */}
        {isLoading ? (
          <div className="p-8 text-center space-y-3">
            <RefreshCw className="size-6 animate-spin text-primary mx-auto" />
            <p className="text-xs text-muted-foreground">
              Carregando os itens cadastrados no PNCP...
            </p>
          </div>
        ) : error || (data?.mensagem && itens.length === 0) ? (
          <div className="p-6 text-center space-y-2">
            <AlertCircle className="size-6 text-warning mx-auto" />
            <p className="text-xs font-medium text-foreground">
              {data?.mensagem || "Não foi possível carregar os itens desta licitação."}
            </p>
            <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
              A listagem de itens pode estar indisponível momentaneamente ou o órgão não detalhou os
              itens diretamente na API do PNCP.
            </p>
          </div>
        ) : itens.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <Package className="size-8 text-muted-foreground mx-auto stroke-1" />
            <p className="text-sm font-semibold text-foreground">Nenhum item cadastrado no PNCP</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Esta contratação não possui itens lançados na API pública do PNCP. Consulte os
              documentos do edital ou termo de referência para verificar a especificação.
            </p>
          </div>
        ) : itensFiltrados.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Nenhum item encontrado com o termo pesquisado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            {data?.mensagem && (
              <p className="border-b border-border bg-warning/10 px-3 py-2 text-[11px] text-warning">
                {data.mensagem}
              </p>
            )}
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="px-3 py-3 w-16 text-center">Número</th>
                  <th className="px-3 py-3">Descrição</th>
                  <th className="px-3 py-3 w-28 text-right">Quantidade</th>
                  <th className="px-3 py-3 w-36 text-right">Valor unitário estimado</th>
                  <th className="px-3 py-3 w-36 text-right">Valor total estimado</th>
                  <th className="px-3 py-3 w-20 text-center">Detalhar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {itensFiltrados.map((item) => (
                  <tr
                    key={item.numeroItem}
                    className="hover:bg-muted/30 transition-colors group cursor-pointer"
                    onClick={() => setItemSelecionado(item)}
                  >
                    {/* Número */}
                    <td className="px-3 py-3 font-mono font-bold text-center text-foreground">
                      <span className="inline-flex items-center justify-center size-6 rounded bg-muted/70 text-xs text-foreground group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                        {item.numeroItem}
                      </span>
                    </td>

                    {/* Descrição */}
                    <td className="px-3 py-3">
                      <p className="font-medium text-foreground leading-relaxed line-clamp-2">
                        {item.descricao}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        {item.materialOuServicoNome && (
                          <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-medium">
                            {item.materialOuServicoNome}
                          </span>
                        )}
                        {item.itemCategoriaNome && (
                          <span className="inline-flex items-center rounded bg-muted/60 px-1.5 py-0.5">
                            {item.itemCategoriaNome}
                          </span>
                        )}
                        {item.criterioJulgamentoNome && (
                          <span className="inline-flex items-center rounded bg-muted/60 px-1.5 py-0.5">
                            {item.criterioJulgamentoNome}
                          </span>
                        )}
                        {item.orcamentoSigiloso && (
                          <span className="inline-flex items-center rounded bg-warning/10 text-warning px-1.5 py-0.5 font-medium border border-warning/20">
                            Sigiloso
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Quantidade */}
                    <td className="px-3 py-3 font-mono text-right text-foreground font-medium whitespace-nowrap">
                      {numero(item.quantidade)} {item.unidadeMedida}
                    </td>

                    {/* Valor Unitário */}
                    <td className="px-3 py-3 font-mono text-right text-foreground whitespace-nowrap">
                      {item.orcamentoSigiloso ? (
                        <span className="text-muted-foreground italic">Sigiloso</span>
                      ) : (
                        brl(item.valorUnitarioEstimado)
                      )}
                    </td>

                    {/* Valor Total */}
                    <td className="px-3 py-3 font-mono font-semibold text-right text-foreground whitespace-nowrap">
                      {item.orcamentoSigiloso ? (
                        <span className="text-muted-foreground italic">Sigiloso</span>
                      ) : (
                        <span className="text-success font-bold">{brl(item.valorTotal)}</span>
                      )}
                    </td>

                    {/* Detalhar (Ícone de olho) */}
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setItemSelecionado(item);
                        }}
                        className="inline-flex items-center justify-center size-8 rounded-full text-primary hover:bg-primary/20 hover:text-primary transition-colors cursor-pointer"
                        title="Ver detalhes completos do item"
                      >
                        <Eye className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Rodapé informativo */}
        {itensFiltrados.length > 0 && (
          <footer className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
            <span>
              Exibindo {itensFiltrados.length} de {itens.length} itens da contratação
            </span>
            <span>Valores de referência PNCP</span>
          </footer>
        )}
      </section>

      {/* Modal de Detalhamento do Item */}
      <Dialog
        open={Boolean(itemSelecionado)}
        onOpenChange={(open) => !open && setItemSelecionado(null)}
      >
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          {itemSelecionado && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center size-6 rounded bg-primary/20 text-primary font-mono text-xs font-bold">
                    {itemSelecionado.numeroItem}
                  </span>
                  <DialogTitle className="text-base font-semibold text-foreground">
                    Detalhes do Item #{itemSelecionado.numeroItem}
                  </DialogTitle>
                </div>
                <DialogDescription className="text-xs text-muted-foreground pt-1">
                  Especificação cadastrada para a contratação no portal PNCP.
                </DialogDescription>
              </DialogHeader>

              {/* Descrição Completa */}
              <div className="space-y-3 pt-2">
                <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <FileText className="size-3 text-primary" /> Descrição do Objeto / Item
                  </span>
                  <p className="mt-1.5 text-sm font-medium leading-relaxed text-foreground select-text">
                    {itemSelecionado.descricao}
                  </p>
                </div>

                {/* Grid de Valores */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border/60 bg-card p-2.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Quantidade
                    </span>
                    <p className="font-mono mt-1 text-sm font-bold text-foreground">
                      {numero(itemSelecionado.quantidade)} {itemSelecionado.unidadeMedida}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-card p-2.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Valor Unitário
                    </span>
                    <p className="font-mono mt-1 text-sm font-bold text-foreground">
                      {itemSelecionado.orcamentoSigiloso ? (
                        <span className="italic text-muted-foreground">Sigiloso</span>
                      ) : (
                        brl(itemSelecionado.valorUnitarioEstimado)
                      )}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-card p-2.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Valor Total
                    </span>
                    <p className="font-mono mt-1 text-sm font-bold text-success">
                      {itemSelecionado.orcamentoSigiloso ? (
                        <span className="italic text-muted-foreground">Sigiloso</span>
                      ) : (
                        brl(itemSelecionado.valorTotal)
                      )}
                    </p>
                  </div>
                </div>

                {/* Especificações Técnicas e Legais */}
                <div className="rounded-lg border border-border/60 bg-card p-3 space-y-2 text-xs">
                  <h4 className="font-semibold text-foreground text-xs border-b border-border/50 pb-1.5">
                    Classificação & Parâmetros
                  </h4>

                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Tipo de Objeto
                      </dt>
                      <dd className="font-medium text-foreground">
                        {itemSelecionado.materialOuServicoNome ?? "Não informado"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Categoria
                      </dt>
                      <dd className="font-medium text-foreground">
                        {itemSelecionado.itemCategoriaNome ?? "Não informado"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Critério de Julgamento
                      </dt>
                      <dd className="font-medium text-foreground">
                        {itemSelecionado.criterioJulgamentoNome ?? "Não informado"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Situação da Compra do Item
                      </dt>
                      <dd className="font-medium text-foreground">
                        {itemSelecionado.situacaoCompraItemNome ?? "Em andamento"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Benefício ME / EPP
                      </dt>
                      <dd className="font-medium text-foreground">
                        {itemSelecionado.tipoBeneficioNome ?? "Não se aplica"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Orçamento Sigiloso
                      </dt>
                      <dd className="font-medium text-foreground">
                        {itemSelecionado.orcamentoSigiloso ? "Sim" : "Não"}
                      </dd>
                    </div>

                    {itemSelecionado.ncmNbsCodigo && (
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Código NCM / NBS
                        </dt>
                        <dd className="font-mono font-medium text-foreground">
                          {itemSelecionado.ncmNbsCodigo}
                          {itemSelecionado.ncmNbsDescricao
                            ? ` - ${itemSelecionado.ncmNbsDescricao}`
                            : ""}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Informação Complementar */}
                {itemSelecionado.informacaoComplementar && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Informações Complementares
                    </span>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed whitespace-pre-line select-text">
                      {itemSelecionado.informacaoComplementar}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
