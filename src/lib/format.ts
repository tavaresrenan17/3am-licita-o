// Valores em R$ sempre completos, com centavos (ex.: R$ 120.684.000,00).
// Nulo significa valor não divulgado pelo PNCP (inclusive orçamento sigiloso):
// mostrar isso é diferente de mostrar R$ 0,00.
export const brl = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "Não informado"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(v);

/**
 * Data ISO no formato brasileiro, ou "—" quando não dá para formatar.
 *
 * A checagem de data inválida não é zelo vazio: `Intl.DateTimeFormat.format`
 * LANÇA `RangeError` com uma data inválida, e `dataBR` é chamada dentro do
 * render de quatro rotas — uma data estranha derrubaria a página inteira onde
 * antes saía texto feio numa célula. Nenhum chamador de hoje passa lixo (tudo
 * vem de `timestamptz`), e é justamente por isso que a falha só apareceria em
 * produção, no dia em que aparecesse.
 */
export const dataBR = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(d);
};

export const dataHoraBR = (iso?: string | number | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const diasRestantes = (iso: string) =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

export const duracao = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
};

export const numero = (v: number) => new Intl.NumberFormat("pt-BR").format(v);

/**
 * Uma rotina a cada três horas tolera uma execução perdida antes de alertar.
 * Rodadas parciais ou com erro não comprovam que o catálogo esteja atualizado.
 */
export const sincronizacaoEstaAtualizada = (
  status?: string | null,
  finalizadoEm?: string | null,
  agoraMs = Date.now(),
  toleranciaHoras = 6,
) => {
  if (status !== "concluido" || !finalizadoEm) return false;
  const finalizadoMs = Date.parse(finalizadoEm);
  return Number.isFinite(finalizadoMs) && agoraMs - finalizadoMs <= toleranciaHoras * 3_600_000;
};

/**
 * Data de calendário de Brasília em AAAA-MM-DD, com deslocamento em dias.
 *
 * Os filtros da lista e as métricas do painel raciocinam em dias civis, não em
 * instantes: perto da meia-noite o dia em UTC já virou e o da equipe não.
 */
export const diaBR = (deslocamentoDias = 0, agora: Date = new Date()) => {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  if (deslocamentoDias === 0) return iso;

  const [a, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(a!, m! - 1, d!) + deslocamentoDias * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
