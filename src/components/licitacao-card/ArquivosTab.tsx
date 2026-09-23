import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { useLicitacao } from "@/services/api";
import { StatusDocumentosBadge } from "@/components/StatusDocumentosBadge";
import { dataBR } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Conteúdo da aba "Arquivos" dentro do card.
 *
 * Usa o MESMO hook (`useLicitacao`, chave `["licitacao", id]`) que a ficha
 * completa em `/licitacoes/$id` — não existe endpoint separado só de
 * documentos. Por isso a busca sai de graça: o Radix Tabs só monta este
 * componente quando a aba "Arquivos" fica ativa (ele não mantém o conteúdo
 * inativo no DOM), então o fetch só dispara no primeiro clique na aba, e se
 * a pessoa já abriu a ficha completa antes, os dados vêm do cache do
 * TanStack Query sem nova requisição.
 */
export function LicitacaoCardArquivosTab({ licitacaoId }: { licitacaoId: string }) {
  const { data, isLoading, isError } = useLicitacao(licitacaoId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Carregando arquivos…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        Não foi possível carregar os arquivos desta licitação.
      </p>
    );
  }

  const docs = data.documentos ?? [];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {docs.length} {docs.length === 1 ? "arquivo vinculado" : "arquivos vinculados"}
        </span>
        <StatusDocumentosBadge
          estado={data.documentosEstado}
          total={data.licitacao.documentos_total}
        />
      </div>

      {docs.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Nenhum documento vinculado ainda.
        </p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto pr-0.5">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs"
            >
              <a
                href={d.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "flex min-w-0 items-center gap-1.5 hover:text-primary transition-colors",
                  !d.ativo && "text-muted-foreground line-through",
                )}
                title={d.tipo_documento_pncp ?? undefined}
              >
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium text-foreground">
                  {d.nome || "(sem título)"}
                </span>
              </a>
              <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                <span className="capitalize">{d.tipo_documento}</span>
                <span>{dataBR(d.data_publicacao)}</span>
                {d.url && <ExternalLink className="size-3 text-primary" />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
