import {
  AlertTriangle,
  CalendarClock,
  FileCheck2,
  MapPin,
  Paperclip,
  Settings2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FonteEvidenciaDTO } from "@/lib/dto";
import {
  PARTE1_PRAZOS_CONTATOS,
  PARTE2_HABILITACAO,
  PARTE3_REQUISITOS,
  type AnaliseResultado,
  type CampoExtraido,
  type DefSecaoCampos,
  type DocumentoExigido,
} from "@/services/analise/contrato";

interface Citavel {
  trecho: string | null;
  fonteIds: string[];
  confirmado: boolean;
}

/**
 * Onde conferir no edital. Confirmado: a frase citada foi achada no documento.
 * Não confirmado: a IA não citou frase ou citou uma que não existe no texto —
 * é o caso típico de "não exigido" deduzido do silêncio do edital.
 */
function Citacao({ item, fontes }: { item: Citavel; fontes: Map<string, string> }) {
  const nomes = [...new Set(item.fonteIds.map((id) => fontes.get(id) ?? id))];
  const onde = nomes.length > 0 ? `Fonte: ${nomes.join(" · ")}` : "Sem fonte citada";
  if (!item.confirmado) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-0.5 rounded bg-warning/15 px-1 text-[10px] font-semibold normal-case tracking-normal text-warning"
        title={`Frase não localizada no edital — confira antes de usar.\n${onde}${item.trecho ? `\nCitado pela IA: “${item.trecho}”` : ""}`}
      >
        <AlertTriangle className="size-2.5" />
        não confirmado
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground"
      title={`“${item.trecho}”\n${onde}`}
    >
      <Paperclip className="size-2.5" />
      {Math.max(nomes.length, 1)}
    </span>
  );
}

function ValorCampo({
  rotulo,
  campo,
  fontes,
}: {
  rotulo: string;
  campo: CampoExtraido | null | undefined;
  fontes: Map<string, string>;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-card/80 p-2.5">
      <dt className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
        {campo && <Citacao item={campo} fontes={fontes} />}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-xs leading-relaxed",
          campo ? "text-foreground" : "italic text-muted-foreground/70",
        )}
      >
        {campo?.valor ?? "Não informado no edital"}
      </dd>
    </div>
  );
}

function SecaoCampos({
  def,
  valores,
  fontes,
  children,
}: {
  def: DefSecaoCampos;
  valores: Record<string, CampoExtraido | null> | undefined;
  fontes: Map<string, string>;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h5 className="text-xs font-bold text-foreground">{def.titulo}</h5>
      <dl className="grid gap-2 sm:grid-cols-2">
        {def.campos.map((campo) => (
          <ValorCampo
            key={campo.chave}
            rotulo={campo.rotulo}
            campo={valores?.[campo.chave]}
            fontes={fontes}
          />
        ))}
      </dl>
      {children}
    </section>
  );
}

const ROTULO_EXIGENCIA: Record<DocumentoExigido["exigencia"], string | null> = {
  obrigatorio: null,
  alternativo: "Alternativo",
  condicional: "Condicional",
};

function ListaDocumentos({
  titulo,
  documentos,
  fontes,
}: {
  titulo: string;
  documentos: DocumentoExigido[];
  fontes: Map<string, string>;
}) {
  return (
    <section className="space-y-2">
      <h5 className="flex items-center gap-2 text-xs font-bold text-foreground">
        {titulo}
        <span className="text-[10px] font-normal text-muted-foreground">
          {documentos.length} documento(s)
        </span>
      </h5>
      {documentos.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 p-2.5 text-xs italic text-muted-foreground/70">
          Nenhuma exigência desta categoria encontrada no edital.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {documentos.map((doc, i) => {
            const exigencia = ROTULO_EXIGENCIA[doc.exigencia];
            return (
              <li key={i} className="rounded-md border border-border/50 bg-card/80 p-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-foreground">{doc.documento}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {exigencia && (
                      <Badge variant="outline" className="py-0 text-[10px]">
                        {exigencia}
                      </Badge>
                    )}
                    <Citacao item={doc} fontes={fontes} />
                  </span>
                </div>
                {doc.detalhe && <p className="mt-0.5 text-muted-foreground">{doc.detalhe}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CabecalhoParte({
  numero,
  titulo,
  icone: Icone,
  resumo,
}: {
  numero: number;
  titulo: string;
  icone: LucideIcon;
  resumo: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-between gap-3 pr-2">
      <span className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-xs font-bold text-primary">
          {numero}
        </span>
        <Icone className="size-4 text-primary" />
        <span className="text-sm font-bold text-foreground">{titulo}</span>
      </span>
      <span className="text-[11px] font-normal text-muted-foreground">{resumo}</span>
    </div>
  );
}

function contarPreenchidos(
  secoes: readonly DefSecaoCampos[],
  valores: Record<string, Record<string, CampoExtraido | null>>,
): string {
  let total = 0;
  let preenchidos = 0;
  for (const secao of secoes) {
    for (const campo of secao.campos) {
      total += 1;
      if (valores[secao.chave]?.[campo.chave]) preenchidos += 1;
    }
  }
  return `${preenchidos} de ${total} informados`;
}

export function AnaliseTresPartes({
  resultado,
  fontes,
}: {
  resultado: AnaliseResultado;
  fontes: FonteEvidenciaDTO[];
}) {
  const nomesFontes = new Map(fontes.map((f) => [f.id, f.nome || f.documentoId]));
  const totalDocumentos = PARTE2_HABILITACAO.reduce(
    (soma, s) => soma + (resultado.habilitacao[s.chave]?.length ?? 0),
    0,
  );
  const entrega = PARTE3_REQUISITOS.find((s) => s.chave === "entrega");

  return (
    <Accordion type="multiple" defaultValue={["parte1", "parte2", "parte3"]} className="space-y-3">
      <AccordionItem value="parte1" className="rounded-xl border border-border/70 px-4">
        <AccordionTrigger className="py-3 hover:no-underline">
          <CabecalhoParte
            numero={1}
            titulo="Prazos e contatos"
            icone={CalendarClock}
            resumo={contarPreenchidos(PARTE1_PRAZOS_CONTATOS, resultado.prazosContatos)}
          />
        </AccordionTrigger>
        <AccordionContent className="space-y-4 pb-4">
          {PARTE1_PRAZOS_CONTATOS.map((secao) => (
            <SecaoCampos
              key={secao.chave}
              def={secao}
              valores={resultado.prazosContatos[secao.chave]}
              fontes={nomesFontes}
            />
          ))}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="parte2" className="rounded-xl border border-border/70 px-4">
        <AccordionTrigger className="py-3 hover:no-underline">
          <CabecalhoParte
            numero={2}
            titulo="Documentos de habilitação"
            icone={FileCheck2}
            resumo={`${totalDocumentos} documento(s)`}
          />
        </AccordionTrigger>
        <AccordionContent className="space-y-4 pb-4">
          {PARTE2_HABILITACAO.map((secao) => (
            <ListaDocumentos
              key={secao.chave}
              titulo={secao.titulo}
              documentos={resultado.habilitacao[secao.chave] ?? []}
              fontes={nomesFontes}
            />
          ))}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="parte3" className="rounded-xl border border-border/70 px-4">
        <AccordionTrigger className="py-3 hover:no-underline">
          <CabecalhoParte
            numero={3}
            titulo="Requisitos operacionais"
            icone={Settings2}
            resumo={contarPreenchidos(PARTE3_REQUISITOS, resultado.requisitosOperacionais)}
          />
        </AccordionTrigger>
        <AccordionContent className="space-y-4 pb-4">
          {PARTE3_REQUISITOS.map((secao) => (
            <SecaoCampos
              key={secao.chave}
              def={secao}
              valores={resultado.requisitosOperacionais[secao.chave]}
              fontes={nomesFontes}
            >
              {secao === entrega && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Endereços de entrega
                  </p>
                  {resultado.enderecosEntrega.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground/70">
                      Não informado no edital
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {resultado.enderecosEntrega.map((e, i) => (
                        <li
                          key={i}
                          className="flex items-start justify-between gap-2 rounded-md border border-border/50 bg-card/80 p-2.5 text-xs"
                        >
                          <span className="flex items-start gap-1.5">
                            <MapPin className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                            <span>
                              {e.endereco}
                              {(e.cep || e.cidade || e.uf) && (
                                <span className="text-muted-foreground">
                                  {" · "}
                                  {[
                                    e.cep && `CEP ${e.cep}`,
                                    [e.cidade, e.uf].filter(Boolean).join("/"),
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              )}
                            </span>
                          </span>
                          {e.fonteIds.length > 0 && (
                            <span
                              className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground"
                              title={`Fonte: ${[...new Set(e.fonteIds.map((id) => nomesFontes.get(id) ?? id))].join(" · ")}`}
                            >
                              <Paperclip className="size-2.5" />
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </SecaoCampos>
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
