import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AtalhosModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const grupos = [
    {
      categoria: "Comandos Globais",
      atalhos: [
        { tecla: "Ctrl + K", descricao: "Abrir Command Palette global" },
        { tecla: "?", descricao: "Exibir esta lista de atalhos" },
        { tecla: "/", descricao: "Focar na caixa de busca de licitações" },
        { tecla: "Esc", descricao: "Fechar modais ou limpar seleções" },
      ],
    },
    {
      categoria: "Navegação por Sequência (G + Letra)",
      atalhos: [
        { tecla: "G depois D", descricao: "Ir para Dashboard Executivo" },
        { tecla: "G depois L", descricao: "Ir para Licitações Salvas" },
        { tecla: "G depois S", descricao: "Ir para Sincronização PNCP" },
      ],
    },
    {
      categoria: "Ações na Licitação",
      atalhos: [
        { tecla: "Alt + P", descricao: "Alternar prioridade da oportunidade" },
        { tecla: "Alt + C", descricao: "Copiar resumo executivo" },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border/90 bg-card p-5 sm:rounded-xl shadow-2xl">
        <DialogHeader className="pb-3 border-b border-border/60">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Keyboard className="size-4 text-primary" />
            <span>Atalhos de Teclado & Usabilidade</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Navegue e execute ações no 3AM Licitação em alta velocidade sem tirar as mãos do teclado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {grupos.map((g) => (
            <div key={g.categoria} className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.categoria}
              </p>
              <div className="space-y-1.5">
                {g.atalhos.map((a) => (
                  <div
                    key={a.tecla}
                    className="flex items-center justify-between rounded-lg bg-muted/25 px-3 py-2 text-xs border border-border/40"
                  >
                    <span className="text-foreground/90">{a.descricao}</span>
                    <kbd className="rounded border border-border/80 bg-background/80 px-2 py-0.5 font-mono text-[11px] font-medium text-foreground shadow-xs">
                      {a.tecla}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border/60 pt-3 text-center text-[11px] text-muted-foreground">
          Pressione <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Esc</kbd> para fechar.
        </div>
      </DialogContent>
    </Dialog>
  );
}
