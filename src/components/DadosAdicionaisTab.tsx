import { useEffect, useRef } from "react";
import { AlertCircle, Download, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dataHoraBR } from "@/lib/format";
import { useDadosAdicionais, useExtrairDadosAdicionais } from "@/services/api";

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-primary">{rotulo}</p>
      <p className="mt-0.5 break-words text-sm text-muted-foreground">{valor || "---"}</p>
    </div>
  );
}

export function DadosAdicionaisTab({ licitacaoId }: { licitacaoId: string }) {
  const consulta = useDadosAdicionais(licitacaoId);
  const extrair = useExtrairDadosAdicionais(licitacaoId);
  const disparou = useRef(false);

  const info = extrair.data ?? consulta.data;

  // Com o edital já baixado, a extração roda sozinha na primeira abertura da
  // aba. Sem texto, só um clique baixa — documentos nunca vêm por conta própria.
  useEffect(() => {
    if (info?.estado === "nao_extraido" && !disparou.current) {
      disparou.current = true;
      extrair.mutate(false);
    }
  }, [info?.estado, extrair]);

  const executar = (baixarSeFaltar: boolean) =>
    extrair.mutate(baixarSeFaltar, {
      onSuccess: (r) => {
        if (r.estado === "sem_texto") {
          toast.error("Não há texto de edital disponível para esta licitação.");
        }
      },
    });

  let conteudo: React.ReactNode;
  if (consulta.isLoading || extrair.isPending) {
    conteudo = (
      <div className="space-y-2 p-8 text-center">
        <Sparkles className="mx-auto size-6 animate-pulse text-teal" />
        <p className="text-xs text-muted-foreground">
          {extrair.isPending ? "A IA está lendo o edital…" : "Carregando…"}
        </p>
      </div>
    );
  } else if (extrair.isError || consulta.isError) {
    const erro = extrair.error ?? consulta.error;
    conteudo = (
      <div className="space-y-3 p-6 text-center">
        <AlertCircle className="mx-auto size-6 text-warning" />
        <p className="text-xs text-foreground">
          {erro instanceof Error ? erro.message : "Não foi possível extrair os dados adicionais."}
        </p>
        <Button size="sm" variant="outline" onClick={() => executar(false)}>
          <RefreshCw className="size-3.5" /> Tentar novamente
        </Button>
      </div>
    );
  } else if (info?.estado === "pronto" && info.dados) {
    const d = info.dados;
    conteudo = (
      <div className="space-y-5 p-5">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
          <Campo rotulo="Prazo de entrega" valor={d.prazoEntrega} />
          <Campo rotulo="Prazo de pagamento" valor={d.prazoPagamento} />
          <Campo rotulo="Validade da proposta" valor={d.validadeProposta} />
          <Campo rotulo="Nome do pregoeiro" valor={d.pregoeiro} />
          <Campo rotulo="Telefone" valor={d.telefone} />
          <Campo rotulo="Email" valor={d.email} />
        </div>
        <div>
          <p className="text-xs font-semibold text-primary">Endereços</p>
          {d.enderecos.length === 0 ? (
            <p className="mt-0.5 text-sm text-muted-foreground">---</p>
          ) : (
            <ul className="mt-0.5 space-y-1">
              {d.enderecos.map((e, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  [{e.tipo}] {e.endereco}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Sparkles className="size-3 text-teal" />
            Extraído do edital por IA
            {info.geradoEm ? ` em ${dataHoraBR(info.geradoEm)}` : ""}. Confira no documento original
            antes de usar.
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={() => executar(false)}
          >
            <RefreshCw className="size-3" /> Extrair de novo
          </Button>
        </div>
      </div>
    );
  } else {
    conteudo = (
      <div className="space-y-3 p-8 text-center">
        <p className="text-sm font-medium text-foreground">Edital ainda não baixado</p>
        <p className="mx-auto max-w-md text-xs text-muted-foreground">
          Prazos, pregoeiro, contato e endereços ficam no texto do edital. Baixe os documentos do
          PNCP para a IA extrair esses dados.
        </p>
        <Button
          size="sm"
          className="gap-1.5 bg-teal text-teal-foreground hover:bg-teal/90"
          onClick={() => executar(true)}
        >
          <Download className="size-3.5" /> Baixar edital e extrair
        </Button>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      {info?.aviso && (
        <p className="border-b border-border bg-warning/10 px-4 py-2 text-[11px] text-warning">
          {info.aviso}
        </p>
      )}
      {conteudo}
    </section>
  );
}
