import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Info, Save } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PALAVRAS_CHAVE_PADRAO, UFS } from "@/lib/types";
import type { ConfiguracoesDTO } from "@/lib/dto";
import { COLUNAS } from "./licitacoes.index";
import { useConfiguracoes, useModalidades, useSalvarConfiguracoes } from "@/services/api";

export const Route = createFileRoute("/configuracoes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Configurações | 3AM Licitação" },
      {
        name: "description",
        content:
          "Configure o recorte de coleta do PNCP, palavras-chave de construção civil e regras de score.",
      },
      { property: "og:title", content: "Configurações | 3AM Licitação" },
      {
        property: "og:description",
        content: "Ajustes de coleta, palavras-chave e score de aderência.",
      },
    ],
  }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const { data: config, isLoading, isError, error } = useConfiguracoes();
  const { data: modalidades } = useModalidades();
  const salvar = useSalvarConfiguracoes();
  const [form, setForm] = useState<ConfiguracoesDTO | null>(null);

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const set = <K extends keyof ConfiguracoesDTO>(k: K, v: ConfiguracoesDTO[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const alternar = <T,>(lista: T[], item: T): T[] =>
    lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item];

  const alternarUf = (uf: string) => {
    if (form.ufs_coleta.includes(uf) && form.ufs_coleta.length === 1) {
      toast.error("Mantenha ao menos uma UF no escopo de coleta.");
      return;
    }
    set("ufs_coleta", alternar(form.ufs_coleta, uf));
  };

  const gravar = () => {
    if (!form) return;
    salvar.mutate(form, {
      onSuccess: () =>
        toast.success("Configurações salvas. Scores recalculados na próxima coleta."),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
    });
  };

  if (isError) {
    return (
      <AppShell titulo="Configurações">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
          <p className="font-semibold">Não foi possível ler as configurações</p>
          <p className="mt-1">{error instanceof Error ? error.message : "Erro desconhecido."}</p>
          <p className="mt-1 opacity-80">
            Verifique se as migrações foram aplicadas no Supabase e se a chave de serviço está
            configurada no ambiente do servidor.
          </p>
        </div>
      </AppShell>
    );
  }

  if (isLoading || !form) {
    return (
      <AppShell titulo="Configurações">
        <p className="px-1 py-10 text-center text-xs text-muted-foreground">Carregando…</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      titulo="Configurações"
      descricao="Recorte de coleta do PNCP, palavras-chave, exibição e regras de score."
      acoes={
        <Button size="sm" onClick={gravar} disabled={salvar.isPending}>
          <Save className="mr-1 size-3.5" /> Salvar
        </Button>
      }
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Recorte padrão de coleta</h2>
          <p className="mt-0.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 size-3 shrink-0" />A API de consulta do PNCP é pública e não
            exige credencial — por isso não há URL nem token para configurar.
          </p>

          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Horizonte de encerramento (dias)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={form.horizonte_dias}
                onChange={(e) =>
                  set("horizonte_dias", Math.max(1, Math.min(365, Number(e.target.value))))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">UFs de atuação — ao menos uma é obrigatória</Label>
              <div className="grid max-h-40 grid-cols-5 gap-1 overflow-y-auto rounded-md border border-border p-2">
                {UFS.map((uf) => (
                  <label key={uf} className="flex items-center gap-1.5 text-[11px]">
                    <Checkbox
                      checked={form.ufs_coleta.includes(uf)}
                      onCheckedChange={() => alternarUf(uf)}
                    />
                    {uf}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">
                Modalidades {form.modalidades_coleta.length === 0 && "— vazio significa todas"}
              </Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {(modalidades ?? []).map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-[11px]">
                    <Checkbox
                      checked={form.modalidades_coleta.includes(m.id)}
                      onCheckedChange={() =>
                        set("modalidades_coleta", alternar(form.modalidades_coleta, m.id))
                      }
                    />
                    <span className="truncate">{m.nome}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Lista vinda da tabela de domínio do PNCP, não de uma lista fixa no código.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Palavras-chave de construção civil</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Uma por linha. Usadas no score de aderência — a fonte não filtra por texto, então elas
            nunca excluem registros da importação.
          </p>
          <Textarea
            className="mt-3"
            rows={9}
            value={form.palavras_chave.join("\n")}
            onChange={(e) =>
              set(
                "palavras_chave",
                e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => set("palavras_chave", [...PALAVRAS_CHAVE_PADRAO])}
          >
            Restaurar lista padrão
          </Button>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Exibição da tabela</h2>
          <div className="mt-3 space-y-1">
            <Label className="text-[11px]">Itens por página</Label>
            <Select
              value={String(form.itens_por_pagina)}
              onValueChange={(v) => set("itens_por_pagina", Number(v))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="mt-4 text-[11px] uppercase tracking-wide text-muted-foreground">
            Colunas visíveis
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {COLUNAS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={form.colunas_visiveis.includes(c.key)}
                  onCheckedChange={(v) =>
                    set(
                      "colunas_visiveis",
                      v
                        ? [...form.colunas_visiveis, c.key]
                        : form.colunas_visiveis.filter((k) => k !== c.key),
                    )
                  }
                />
                {c.label}
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Regras do score de aderência</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Pesos sobre palavras-chave no objeto, documentos técnicos e faixa de valor. Valor não
            divulgado recebe a faixa mínima, nunca a máxima.
          </p>

          <div className="mt-4 grid gap-5">
            {(
              [
                ["score_peso_palavras", "Peso das palavras-chave"],
                ["score_peso_documentos", "Peso dos documentos (projeto/orçamento)"],
                ["score_peso_valor", "Peso da faixa de valor"],
              ] as const
            ).map(([campo, label]) => (
              <div key={campo}>
                <div className="flex items-center justify-between text-xs">
                  <Label className="text-[11px]">{label}</Label>
                  <span className="num text-muted-foreground">{form[campo]}</span>
                </div>
                <Slider
                  className="mt-2.5"
                  min={0}
                  max={60}
                  step={1}
                  value={[form[campo]]}
                  onValueChange={([v]) => set(campo, v ?? 0)}
                />
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs">
              <Label className="text-[11px]">Score mínimo para “recomendada”</Label>
              <span className="num text-muted-foreground">{form.score_minimo_recomendado}</span>
            </div>
            <Slider
              className="mt-2.5"
              min={0}
              max={100}
              step={5}
              value={[form.score_minimo_recomendado]}
              onValueChange={([v]) => set("score_minimo_recomendado", v ?? 0)}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button onClick={gravar} disabled={salvar.isPending}>
              <Save className="mr-1 size-4" /> Salvar configurações
            </Button>
            <Button variant="outline" onClick={() => config && setForm(config)}>
              Descartar alterações
            </Button>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            Mudar os pesos altera o score das próximas licitações coletadas. Para recalcular as já
            salvas, execute uma sincronização.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
