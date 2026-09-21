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
import { dataHoraBR } from "@/lib/format";
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
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
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
                className="border-emerald-500/50 bg-emerald-500/10 text-emerald-400 gap-1.5 py-1 px-2.5 text-xs font-semibold"
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
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-6 pb-6 text-center space-y-4">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary animate-pulse">
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
                    <div className="mx-auto p-3 rounded-full bg-primary/10 text-primary w-fit mb-2">
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
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>Resumo executivo do objeto e entregáveis</span>
                      </div>
                      <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40 border border-border/40">
                        <FileCheck2 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                        <span>Exigências de qualificação e atestados</span>
                      </div>
                      <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40 border border-border/40">
                        <Calendar className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                        <span>Cronograma, prazos e datas-limite</span>
                      </div>
                      <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40 border border-border/40">
                        <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <span>Identificação de riscos e multas</span>
                      </div>
                    </div>

                    <div className="pt-4 flex justify-center">
                      <Button
                        size="lg"
                        className="gap-2 px-8 font-semibold shadow-md shadow-primary/20"
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
              const pontosAtencao =
                resultado.pontosAtencao && resultado.pontosAtencao.length > 0
                  ? resultado.pontosAtencao
                  : (resultado.riscos ?? []);
              const pontosImportantes = resultado.pontosImportantes ?? [];
              const itensNaoImportantes = resultado.itensNaoImportantes ?? [];
              const requisitos = resultado.requisitos ?? [];
              const prazos = resultado.prazos ?? [];
              const proximosPassos = resultado.proximosPassos ?? [];

              return (
                <div className="space-y-6">
                  {/* Selo de Persistência Definitiva */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
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
                    <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
                      <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <AlertTitle className="text-xs font-semibold">
                        Cobertura documental parcial
                      </AlertTitle>
                      <AlertDescription className="text-xs">
                        {analise.cobertura.disponiveis} de {analise.cobertura.ativos} arquivos com
                        camada de texto completa. As conclusões refletem os documentos legíveis disponíveis.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Card Resumo Executivo */}
                  <Card className="border-primary/20 bg-primary/[0.02]">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
                        <FileText className="h-4 w-4" />
                        Resumo Executivo
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                        {resultado.resumoExecutivo}
                      </p>
                    </CardContent>
                  </Card>

                  {/* SEÇÃO 1: PONTOS DE ATENÇÃO & RISCOS CRÍTICOS (MÁXIMA PRIORIDADE) */}
                  {pontosAtencao.length > 0 && (
                    <div className="space-y-3 rounded-xl border border-rose-500/40 bg-rose-500/[0.03] p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-rose-500/15 text-rose-400">
                            <ShieldAlert className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-rose-400 tracking-tight">
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
                              className="p-3 rounded-lg border border-rose-500/30 bg-card/90 shadow-xs space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
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
                    <div className="space-y-3 rounded-xl border border-emerald-500/40 bg-emerald-500/[0.03] p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-emerald-500/15 text-emerald-400">
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-emerald-400 tracking-tight">
                              ⭐ Pontos Importantes & Oportunidades
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                              Valores atrativos, condições favoráveis de pagamento, margens e escopo chave da obra.
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="border-emerald-500/50 text-emerald-400 bg-emerald-500/10 text-[10px] py-0.5 px-2 font-semibold"
                        >
                          {pontosImportantes.length} item(ns)
                        </Badge>
                      </div>

                      <div className="space-y-2 mt-2">
                        {pontosImportantes.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border border-emerald-500/30 bg-card/90 shadow-xs space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
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
                    <div className="space-y-3 rounded-xl border border-sky-500/40 bg-sky-500/[0.03] p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-sky-500/15 text-sky-400">
                            <FileCheck2 className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-sky-400 tracking-tight">
                              📋 Requisitos de Habilitação & Qualificação
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                              Atestados (CAT), comprovação de experiência técnica, patrimônio líquido e certidões indispensáveis.
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="border-sky-500/50 text-sky-400 bg-sky-500/10 text-[10px] py-0.5 px-2 font-semibold"
                        >
                          {requisitos.length} item(ns)
                        </Badge>
                      </div>

                      <div className="space-y-2 mt-2">
                        {requisitos.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border border-sky-500/30 bg-card/90 shadow-xs space-y-1"
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
                    <div className="space-y-3 rounded-xl border border-purple-500/40 bg-purple-500/[0.03] p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-purple-500/15 text-purple-400">
                            <Calendar className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-purple-400 tracking-tight">
                              📅 Prazos Críticos & Cronograma Legal
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                              Data-limite para propostas, prazo de impugnação, esclarecimentos e duração do contrato.
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="border-purple-500/50 text-purple-400 bg-purple-500/10 text-[10px] py-0.5 px-2 font-semibold"
                        >
                          {prazos.length} data(s)
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        {prazos.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border border-purple-500/30 bg-card/90 shadow-xs"
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
