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
import { ehFormatoAtual } from "@/services/analise/contrato";
import { AnaliseTresPartes } from "@/components/analise/AnaliseTresPartes";
import { FatosCertame } from "@/components/analise/FatosCertame";
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
                        <span>Resumo com quantidades, valores, prazo e local, mais os itens do PNCP</span>
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

                  {/* Completude e fatos do certame calculados pelo sistema */}
                  {ehFormatoAtual(resultado) && (
                    <>
                      {apresentacao.completude && (
                        <p className="text-xs text-muted-foreground">
                          O edital respondeu{" "}
                          <span className="font-semibold text-foreground">
                            {apresentacao.completude.camposPreenchidos} de{" "}
                            {apresentacao.completude.camposTotal}
                          </span>{" "}
                          itens do roteiro ·{" "}
                          {apresentacao.completude.documentosHabilitacao} documentos de habilitação ·{" "}
                          {apresentacao.completude.trechosConfirmados} trechos conferidos no texto
                        </p>
                      )}
                      <FatosCertame
                        fatos={resultado.fatosPncp}
                        alertasSistema={resultado.alertasSistema}
                      />
                    </>
                  )}

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

                  {/* Card Resumo Executivo */}
                  <Card className="border-primary/20 bg-primary/[0.02]">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
                        <FileText className="h-4 w-4" />
                        Resumo
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
