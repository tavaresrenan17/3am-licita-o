import React from "react";
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileCheck2,
  FileText,
  Info,
  ListOrdered,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  Sparkles,
  Award,
  Coins,
  Compass,
  Swords,
  AlertCircle,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAnaliseLicitacao, useGerarAnaliseLicitacao } from "@/services/api";
import { formatarApresentacaoAnalise } from "@/services/analise/apresentacao";
import { ehFormatoAtual } from "@/services/analise/contrato";
import { AnaliseTresPartes } from "@/components/analise/AnaliseTresPartes";
import { dataHoraBR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AnaliseLicitacaoSheetProps {
  licitacaoId: string;
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  objeto?: string;
  orgao?: string;
}

export function AnaliseLicitacaoSheet({
  licitacaoId,
  aberto,
  onOpenChange,
  objeto,
  orgao,
}: AnaliseLicitacaoSheetProps) {
  const { data: analise, isLoading, isError, error } = useAnaliseLicitacao(licitacaoId, aberto);
  const gerarMutation = useGerarAnaliseLicitacao(licitacaoId);

  const apresentacao = formatarApresentacaoAnalise(analise);
  const resultado = analise?.resultado;
  const fontes = analise?.fontes ?? [];

  const handleGerar = (forcar = false) => {
    gerarMutation.mutate(forcar, {
      onSuccess: () => {
        toast.success(
          forcar ? "Análise com IA atualizada com sucesso!" : "Análise concluída com sucesso!",
        );
      },
      onError: (err) => {
        toast.error(`Falha na análise: ${err instanceof Error ? err.message : String(err)}`);
      },
    });
  };

  const processando = apresentacao.carregando || gerarMutation.isPending;

  return (
    <Sheet open={aberto} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col h-full bg-background/95 backdrop-blur-md"
      >
        {/* Cabeçalho do Sheet */}
        <SheetHeader className="p-6 border-b border-border/60 bg-muted/20">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-teal/10 text-teal">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle className="text-xl font-bold flex items-center gap-2">
                  Análise com Inteligência Artificial
                </SheetTitle>
                <SheetDescription className="text-xs line-clamp-1">
                  {orgao ?? "Análise aprofundada de editais, termos e projetos"}
                </SheetDescription>
              </div>
            </div>

            {resultado ? (
              <Badge
                variant="outline"
                className="border-success/50 bg-success/10 text-success gap-1.5 py-1 px-2.5 text-xs font-semibold"
              >
                <CheckCircle2 className="size-3.5" /> Salva no cadastro
              </Badge>
            ) : null}
          </div>
        </SheetHeader>

        {/* Conteúdo rolável */}
        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6 pb-8">
            {/* ESTADO 1: Carregamento inicial do cache */}
            {isLoading && (
              <div className="space-y-4 py-8">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-28 w-full rounded-lg" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
            )}

            {/* ESTADO 2: Em processamento pelo modelo */}
            {processando && (
              <Card className="border-teal/30 bg-teal/5">
                <CardContent className="pt-6 pb-6 text-center space-y-4">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal/15 text-teal animate-pulse">
                    <Sparkles className="h-7 w-7 animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {apresentacao.tituloEstado}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                      {apresentacao.descricaoEstado}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground/80 flex items-center justify-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Acessando editais do PNCP em tempo real e sintetizando pelo modelo de IA...</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ESTADO 3: Nunca gerada */}
            {!processando && !isLoading && apresentacao.estadoVisual === "nunca" && (
              <div className="py-6 space-y-6">
                <Card className="border-dashed border-2">
                  <CardHeader className="text-center pb-2">
                    <div className="mx-auto p-3 rounded-full bg-teal/10 text-teal w-fit mb-2">
                      <Sparkles className="h-8 w-8" />
                    </div>
                    <CardTitle className="text-lg">Pronto para analisar esta licitação</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      A inteligência artificial lerá todo o texto dos editais, projetos e termos de
                      referência para gerar um diagnóstico completo e citável.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-muted-foreground">
                      <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40 border border-border/40">
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                        <span>Veredito, resumo e parecer go / no-go</span>
                      </div>
                      <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40 border border-border/40">
                        <Calendar className="h-4 w-4 text-brand shrink-0 mt-0.5" />
                        <span>Parte 1 · Prazos procedimentais, comerciais e contatos</span>
                      </div>
                      <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40 border border-border/40">
                        <FileCheck2 className="h-4 w-4 text-info shrink-0 mt-0.5" />
                        <span>Parte 2 · Documentos de habilitação</span>
                      </div>
                      <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40 border border-border/40">
                        <ShieldAlert className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                        <span>Parte 3 · Amostras, entrega, lances, garantias e exequibilidade</span>
                      </div>
                    </div>

                    <div className="pt-4 flex justify-center">
                      <Button
                        size="lg"
                        className="gap-2 px-8 font-semibold bg-teal text-teal-foreground hover:bg-teal/90 shadow-md shadow-teal/20"
                        onClick={() => handleGerar(false)}
                      >
                        <Sparkles className="h-4 w-4" />
                        {apresentacao.rotuloBotaoAcao}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ESTADO 4: Erro ou Indisponível */}
            {!processando &&
              !isLoading &&
              (apresentacao.estadoVisual === "erro" ||
                apresentacao.estadoVisual === "indisponivel") && (
                <Alert variant={apresentacao.estadoVisual === "erro" ? "destructive" : "default"}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{apresentacao.tituloEstado}</AlertTitle>
                  <AlertDescription className="space-y-3 mt-2">
                    <p>{apresentacao.descricaoEstado}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleGerar(true)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {apresentacao.rotuloBotaoAcao}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

            {/* ESTADO 5: Análise Pronta ou Parcial */}
            {!processando && !isLoading && resultado && (() => {
              // Formato anterior às três partes: só leitura, até a pessoa refazer.
              const antigo = ehFormatoAtual(resultado) ? null : resultado;
              const pontosAtencao =
                antigo?.pontosAtencao && antigo.pontosAtencao.length > 0
                  ? antigo.pontosAtencao
                  : (antigo?.riscos ?? []);
              const pontosImportantes = antigo?.pontosImportantes ?? [];
              const itensNaoImportantes = antigo?.itensNaoImportantes ?? [];
              const requisitos = antigo?.requisitos ?? [];
              const prazos = antigo?.prazos ?? [];
              const proximosPassos = antigo?.proximosPassos ?? [];

              return (
                <div className="space-y-6">
                  {/* Selo de Persistência Definitiva */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-success/40 bg-success/10 text-success">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                      <span className="text-xs font-semibold text-foreground">
                        Análise Salva no Cadastro da Licitação
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      {analise.geradoEm && <span>Salva em {dataHoraBR(analise.geradoEm)}</span>}
                      {analise.modelo && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-mono">
                          {analise.modelo}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {apresentacao.estadoVisual === "desatualizada" && (
                    <Alert className="border-warning/40 bg-warning/10">
                      <RotateCw className="h-4 w-4 text-warning" />
                      <AlertTitle className="text-xs font-semibold">
                        {apresentacao.tituloEstado}
                      </AlertTitle>
                      <AlertDescription className="space-y-2 text-xs">
                        <p>{apresentacao.descricaoEstado}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 border-warning/50 cursor-pointer"
                          onClick={() => handleGerar(true)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          {apresentacao.rotuloBotaoAcao}
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Veredito e Nível de Confiança */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border/70 bg-muted/30">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <Badge
                        variant={apresentacao.vereditoFormatado?.varianteBadge}
                        className="px-3 py-1 text-xs font-semibold"
                      >
                        {apresentacao.vereditoFormatado?.texto}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Confiança:{" "}
                        <span className="font-semibold ml-1 capitalize">{resultado.confianca}</span>
                      </Badge>
                    </div>
                  </div>

                  {/* Aviso de Cobertura Parcial se houver */}
                  {analise.cobertura?.estado === "parcial" && (
                    <Alert className="border-warning/40 bg-warning/10 text-warning">
                      <Info className="h-4 w-4 text-warning" />
                      <AlertTitle className="text-xs font-semibold">
                        Cobertura documental parcial
                      </AlertTitle>
                      <AlertDescription className="text-xs">
                        {analise.cobertura.disponiveis} de {analise.cobertura.ativos} arquivos com
                        camada de texto completa. As conclusões refletem os documentos legíveis disponíveis.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* CARD DESTAQUE: PARECER DO ENGENHEIRO CHEFE (GO / NO-GO) */}
                  {resultado.parecerEngenheiro && (
                    <Card className="border-brand/40 bg-gradient-to-br from-brand/[0.08] via-brand/[0.04] to-background shadow-md">
                      <CardHeader className="pb-2.5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-brand/20 text-brand">
                              <Compass className="h-4 w-4" />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider text-brand">
                              Decisão do Engenheiro Chefe (Go / No-Go)
                            </span>
                          </div>
                          <Badge
                            className={cn(
                              "text-xs px-2.5 py-0.5 font-bold uppercase tracking-wide",
                              resultado.parecerEngenheiro.decisao === "go"
                                ? "bg-success/20 text-success border-success/40"
                                : resultado.parecerEngenheiro.decisao === "go_com_ressalvas"
                                  ? "bg-warning/20 text-warning border-warning/40"
                                  : "bg-destructive/20 text-destructive border-destructive/40",
                            )}
                          >
                            {resultado.parecerEngenheiro.decisao === "go"
                              ? "🟢 GO — Recomendado Disputar"
                              : resultado.parecerEngenheiro.decisao === "go_com_ressalvas"
                                ? "🟡 GO COM RESSALVAS — Disputar com Cautela"
                                : "🔴 NO-GO — Alto Risco / Desfavorável"}
                          </Badge>
                        </div>
                        {resultado.parecerEngenheiro.titulo && (
                          <CardTitle className="text-base font-bold text-foreground mt-1.5">
                            {resultado.parecerEngenheiro.titulo}
                          </CardTitle>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        {resultado.parecerEngenheiro.justificativa && (
                          <p className="text-xs leading-relaxed text-foreground/90 font-medium">
                            {resultado.parecerEngenheiro.justificativa}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-4 text-xs pt-2 border-t border-border/40">
                          {resultado.parecerEngenheiro.atratividadeComercial && (
                            <span className="text-muted-foreground">
                              Atratividade Comercial:{" "}
                              <strong className="text-foreground capitalize font-semibold">
                                {resultado.parecerEngenheiro.atratividadeComercial}
                              </strong>
                            </span>
                          )}
                          {resultado.parecerEngenheiro.complexidadeOperacional && (
                            <span className="text-muted-foreground">
                              Complexidade Operacional:{" "}
                              <strong className="text-foreground capitalize font-semibold">
                                {resultado.parecerEngenheiro.complexidadeOperacional}
                              </strong>
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Card Resumo Executivo */}
                  <Card className="border-primary/20 bg-primary/[0.02]">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
                        <FileText className="h-4 w-4" />
                        Resumo Executivo do Engenheiro
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                        {resultado.resumoExecutivo}
                      </p>
                    </CardContent>
                  </Card>

                  {/* AS TRÊS PARTES: prazos e contatos, habilitação, requisitos operacionais */}
                  {ehFormatoAtual(resultado) && (
                    <AnaliseTresPartes resultado={resultado} fontes={fontes} />
                  )}

                  {/* BLOCO ESPECIAL: ENGENHARIA DE CUSTOS, BDI & ALERTA DE CAIXA */}
                  {antigo?.engenhariaCustos && (
                    <div className="rounded-xl border border-warning/40 bg-warning/[0.03] p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-warning/15 text-warning">
                          <Coins className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-warning tracking-tight">
                            💰 Engenharia de Custos, BDI & Alerta de Caixa
                          </h4>
                          <p className="text-[11px] text-muted-foreground">
                            Regime de execução, limites legais de inexequibilidade e garantia adicional.
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-2 text-xs sm:grid-cols-2">
                        {antigo.engenhariaCustos.regimeExecucao && (
                          <div className="p-2.5 rounded-lg border border-border/50 bg-card/80 space-y-0.5">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold">Regime de Execução</span>
                            <p className="font-semibold text-foreground">{antigo.engenhariaCustos.regimeExecucao}</p>
                          </div>
                        )}
                        {antigo.engenhariaCustos.bdiSugerido && (
                          <div className="p-2.5 rounded-lg border border-border/50 bg-card/80 space-y-0.5">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold">BDI Referencial</span>
                            <p className="font-semibold text-foreground">{antigo.engenhariaCustos.bdiSugerido}</p>
                          </div>
                        )}
                        {antigo.engenhariaCustos.alertaLinha75 && (
                          <div className="p-2.5 rounded-lg border border-destructive/30 bg-destructive/10 space-y-0.5 sm:col-span-2">
                            <span className="text-[10px] text-destructive uppercase font-bold flex items-center gap-1">
                              <AlertTriangle className="size-3" /> Linha dos 75% (Inexequibilidade Art. 59 §4º)
                            </span>
                            <p className="text-foreground/90">{antigo.engenhariaCustos.alertaLinha75}</p>
                          </div>
                        )}
                        {antigo.engenhariaCustos.alertaLinha85 && (
                          <div className="p-2.5 rounded-lg border border-warning/30 bg-warning/10 space-y-0.5 sm:col-span-2">
                            <span className="text-[10px] text-warning uppercase font-bold flex items-center gap-1">
                              <ShieldAlert className="size-3" /> Linha dos 85% (Garantia Adicional de Caixa Art. 59 §5º)
                            </span>
                            <p className="text-foreground/90">{antigo.engenhariaCustos.alertaLinha85}</p>
                          </div>
                        )}
                        {antigo.engenhariaCustos.reajusteRegra && (
                          <div className="p-2.5 rounded-lg border border-border/50 bg-card/80 space-y-0.5 sm:col-span-2">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold">Reajuste Inflacionário Anual (Art. 25 §7º)</span>
                            <p className="text-foreground/90">{antigo.engenhariaCustos.reajusteRegra}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* BLOCO ESPECIAL: QUALIFICAÇÃO TÉCNICA & CAT/CREA (SÚMULA TCU 263) */}
                  {antigo?.engenhariaHabilitacao && (
                    <div className="rounded-xl border border-info/40 bg-info/[0.03] p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-info/15 text-info">
                          <Award className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-info tracking-tight">
                            🏆 Qualificação Técnica & CAT/CREA (Súmula TCU 263)
                          </h4>
                          <p className="text-[11px] text-muted-foreground">
                            Atestados de capacidade operacional e profissional, parcelas de maior relevância e armadilhas.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs">
                        {antigo.engenhariaHabilitacao.catExigida && (
                          <div className="p-2.5 rounded-lg border border-border/50 bg-card/80 space-y-1">
                            <span className="text-[10px] text-info uppercase font-bold">Exigência de Acervo Técnico (CAT)</span>
                            <p className="text-foreground/90">{antigo.engenhariaHabilitacao.catExigida}</p>
                          </div>
                        )}
                        {antigo.engenhariaHabilitacao.parcelasRelevantes && antigo.engenhariaHabilitacao.parcelasRelevantes.length > 0 && (
                          <div className="p-2.5 rounded-lg border border-border/50 bg-card/80 space-y-1">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold">Parcelas de Maior Relevância e Valor Significativo</span>
                            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                              {antigo.engenhariaHabilitacao.parcelasRelevantes.map((parc, i) => (
                                <li key={i} className="text-foreground/90">{parc}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {antigo.engenhariaHabilitacao.pegadinhasHabilitacao && antigo.engenhariaHabilitacao.pegadinhasHabilitacao.length > 0 && (
                          <div className="p-2.5 rounded-lg border border-destructive/30 bg-destructive/10 space-y-1">
                            <span className="text-[10px] text-destructive uppercase font-bold flex items-center gap-1">
                              <AlertTriangle className="size-3" /> Armadilhas de Habilitação Detectadas no Edital
                            </span>
                            <ul className="list-disc pl-4 space-y-0.5 text-destructive">
                              {antigo.engenhariaHabilitacao.pegadinhasHabilitacao.map((peg, i) => (
                                <li key={i}>{peg}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* BLOCO ESPECIAL: ESTRATÉGIA DE COMBATE & IMPUGNAÇÃO PREVENTIVA */}
                  {antigo?.estrategiaImpugnacao && (
                    <div className="rounded-xl border border-brand/40 bg-brand/[0.03] p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-brand/15 text-brand">
                          <Swords className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-brand tracking-tight">
                            ⚔️ Estratégia de Combate & Impugnação Preventiva
                          </h4>
                          <p className="text-[11px] text-muted-foreground">
                            Ilegalidades atacáveis antes da sessão (prazo fatal de 3 dias úteis) e documentos urgentes.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs">
                        {antigo.estrategiaImpugnacao.pontosImpugnar && antigo.estrategiaImpugnacao.pontosImpugnar.length > 0 && (
                          <div className="p-2.5 rounded-lg border border-destructive/30 bg-destructive/10 space-y-1">
                            <span className="text-[10px] text-destructive uppercase font-bold flex items-center gap-1">
                              <AlertCircle className="size-3" /> Pontos com Fundamento para Impugnação Prévia (Art. 164)
                            </span>
                            <ul className="list-disc pl-4 space-y-0.5 text-destructive">
                              {antigo.estrategiaImpugnacao.pontosImpugnar.map((imp, i) => (
                                <li key={i}>{imp}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {antigo.estrategiaImpugnacao.esclarecimentos && antigo.estrategiaImpugnacao.esclarecimentos.length > 0 && (
                          <div className="p-2.5 rounded-lg border border-border/50 bg-card/80 space-y-1">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold">Pedidos de Esclarecimento Sugeridos</span>
                            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                              {antigo.estrategiaImpugnacao.esclarecimentos.map((esc, i) => (
                                <li key={i} className="text-foreground/90">{esc}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {antigo.estrategiaImpugnacao.documentosUrgentes && antigo.estrategiaImpugnacao.documentosUrgentes.length > 0 && (
                          <div className="p-2.5 rounded-lg border border-warning/30 bg-warning/10 space-y-1">
                            <span className="text-[10px] text-warning uppercase font-bold flex items-center gap-1">
                              <Clock className="size-3" /> Documentação Crítica a Providenciar Imediatamente
                            </span>
                            <ul className="list-disc pl-4 space-y-0.5 text-warning">
                              {antigo.estrategiaImpugnacao.documentosUrgentes.map((doc, i) => (
                                <li key={i}>{doc}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SEÇÃO 1: PONTOS DE ATENÇÃO & RISCOS CRÍTICOS (MÁXIMA PRIORIDADE) */}
                  {pontosAtencao.length > 0 && (
                    <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/[0.03] p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-destructive/15 text-destructive">
                            <ShieldAlert className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-destructive tracking-tight">
                              🚨 Pontos de Atenção & Riscos Críticos
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                              Exigências eliminatórias, vistorias obrigatórias, multas ou regras que demandam máxima cautela.
                            </p>
                          </div>
                        </div>
                        <Badge variant="destructive" className="text-[10px] py-0.5 px-2 uppercase font-semibold">
                          {pontosAtencao.length} item(ns)
                        </Badge>
                      </div>

                      <div className="space-y-2 mt-2">
                        {pontosAtencao.map((item, idx) => {
                          const severidade = item.severidade ?? "alta";
                          return (
                            <div
                              key={idx}
                              className="p-3 rounded-lg border border-destructive/30 bg-card/90 shadow-xs space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                                  {item.titulo}
                                </span>
                                <Badge variant="destructive" className="text-[9px] py-0 uppercase">
                                  {severidade}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed pl-5">
                                {item.descricao}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* SEÇÃO 2: PONTOS IMPORTANTES & OPORTUNIDADES */}
                  {pontosImportantes.length > 0 && (
                    <div className="space-y-3 rounded-xl border border-success/40 bg-success/[0.03] p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-success/15 text-success">
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-success tracking-tight">
                              ⭐ Pontos Importantes & Oportunidades
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                              Valores atrativos, condições favoráveis de pagamento, margens e escopo chave da obra.
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="border-success/50 text-success bg-success/10 text-[10px] py-0.5 px-2 font-semibold"
                        >
                          {pontosImportantes.length} item(ns)
                        </Badge>
                      </div>

                      <div className="space-y-2 mt-2">
                        {pontosImportantes.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border border-success/30 bg-card/90 shadow-xs space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                                {item.titulo}
                              </span>
                              {item.fonteIds?.length > 0 && (
                                <Badge variant="outline" className="text-[9px] py-0 text-muted-foreground">
                                  {item.fonteIds.length} citação(ões)
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed pl-5">
                              {item.descricao}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SEÇÃO 3: REQUISITOS DE HABILITAÇÃO & QUALIFICAÇÃO */}
                  {requisitos.length > 0 && (
                    <div className="space-y-3 rounded-xl border border-info/40 bg-info/[0.03] p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-info/15 text-info">
                            <FileCheck2 className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-info tracking-tight">
                              📋 Requisitos de Habilitação & Qualificação
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                              Atestados (CAT), comprovação de experiência técnica, patrimônio líquido e certidões indispensáveis.
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="border-info/50 text-info bg-info/10 text-[10px] py-0.5 px-2 font-semibold"
                        >
                          {requisitos.length} item(ns)
                        </Badge>
                      </div>

                      <div className="space-y-2 mt-2">
                        {requisitos.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border border-info/30 bg-card/90 shadow-xs space-y-1"
                          >
                            <span className="text-xs font-semibold text-foreground block">
                              {item.titulo}
                            </span>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {item.descricao}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SEÇÃO 4: CRONOGRAMA & DATAS DECISIVAS */}
                  {prazos.length > 0 && (
                    <div className="space-y-3 rounded-xl border border-brand/40 bg-brand/[0.03] p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-brand/15 text-brand">
                            <Calendar className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-brand tracking-tight">
                              📅 Prazos Críticos & Cronograma Legal
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                              Data-limite para propostas, prazo de impugnação, esclarecimentos e duração do contrato.
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="border-brand/50 text-brand bg-brand/10 text-[10px] py-0.5 px-2 font-semibold"
                        >
                          {prazos.length} data(s)
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        {prazos.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border border-brand/30 bg-card/90 shadow-xs"
                          >
                            <span className="text-xs font-semibold text-foreground block">
                              {item.titulo}
                            </span>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.descricao}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SEÇÃO 5: O QUE NÃO É IMPORTANTE (CLÁUSULAS PADRÃO & DISPENSÁVEIS) */}
                  {antigo && (
                  <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-muted text-muted-foreground">
                          <Info className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-muted-foreground tracking-tight">
                            ℹ️ O que NÃO é Importante (Cláusulas Padrão & Dispensáveis)
                          </h4>
                          <p className="text-[11px] text-muted-foreground">
                            Formalidades corriqueiras da Lei 14.133/2021 e exigências de praxe que não demandam perda de tempo da equipe comercial.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mt-2">
                      {itensNaoImportantes.length > 0 ? (
                        itensNaoImportantes.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg border border-border/50 bg-background/50 text-xs space-y-0.5"
                          >
                            <span className="font-medium text-foreground/80 block">{item.titulo}</span>
                            <p className="text-[11px] text-muted-foreground">{item.descricao}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-2.5 rounded-lg border border-border/40 bg-background/40 text-xs text-muted-foreground">
                          Declarações de praxe (menor de idade, inexistência de fatos impeditivos, compromisso anticorrupção genérico e disposições comuns da Lei 14.133) são atendidas por padrão na habilitação e não representam riscos ou diferenciais competitivos.
                        </div>
                      )}
                    </div>
                  </div>
                  )}

                  {/* SEÇÃO 6: PRÓXIMOS PASSOS */}
                  {proximosPassos.length > 0 && (
                    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-primary/15 text-primary">
                          <ListOrdered className="h-4 w-4" />
                        </div>
                        <h4 className="text-sm font-bold text-foreground">
                          Próximos Passos Sugeridos
                        </h4>
                      </div>
                      <ol className="space-y-1.5 list-decimal list-inside text-xs text-muted-foreground mt-2">
                        {proximosPassos.map((passo, idx) => (
                          <li
                            key={idx}
                            className="p-2.5 rounded-md bg-card border border-border/60 text-foreground font-medium"
                          >
                            <span>{passo}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* SEÇÃO 7: FONTES E EVIDÊNCIAS EXPANSÍVEIS */}
                  {fontes.length > 0 && (
                    <div className="pt-2">
                      <Accordion type="single" collapsible className="w-full border rounded-lg px-3">
                        <AccordionItem value="fontes" className="border-none">
                          <AccordionTrigger className="text-xs font-medium text-muted-foreground hover:text-foreground py-3">
                            <div className="flex items-center gap-2">
                              <BookOpen className="h-3.5 w-3.5" />
                              <span>Evidências e Fontes Documentais ({fontes.length})</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-1 pb-3 space-y-2">
                            {fontes.slice(0, 15).map((fonte) => (
                              <div
                                key={fonte.id}
                                className="p-2.5 rounded bg-muted/40 text-[11px] space-y-1 border border-border/30"
                              >
                                <div className="flex items-center justify-between text-muted-foreground font-mono text-[10px]">
                                  <span className="font-semibold text-foreground truncate max-w-[280px]">
                                    {fonte.nome || fonte.documentoId}
                                  </span>
                                  <span>{fonte.id}</span>
                                </div>
                                <p className="text-muted-foreground line-clamp-3 italic">
                                  "{fonte.trecho}"
                                </p>
                              </div>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
