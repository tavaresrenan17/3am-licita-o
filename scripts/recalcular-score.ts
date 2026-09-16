/**
 * Recalcula o score de aderência do catálogo inteiro com a configuração atual.
 *
 * Necessário porque o score é GRAVADO na linha, calculado no momento da coleta.
 * Mudar palavras-chave ou pesos na tela não reescreve o que já está no banco: a
 * licitação só seria repontuada se a fonte a devolvesse alterada. Sem isto, uma
 * mudança de critério só valeria para o que entrasse depois dela.
 *
 *   npm run recalcular:score              # simulação: mostra o efeito, não grava
 *   npm run recalcular:score -- --aplicar # grava
 *
 * A fórmula não é reimplementada aqui: usa `calcularScore` de src/lib/score.ts,
 * a mesma que a coleta usa. Duas implementações divergiriam no primeiro ajuste
 * de peso.
 */
import { readFileSync } from "node:fs";
import { calcularScore } from "../src/lib/score";
import type { TipoDocumento } from "../src/lib/types";

function carregarEnv() {
  const texto = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m?.[1] && m[2] !== undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

interface LinhaLicitacao {
  id: string;
  numero_controle_pncp: string;
  objeto: string;
  modalidade_nome: string | null;
  valor_total_estimado: number | string | null;
  categoria: string;
  score_aderencia: number;
  situacao_temporal: string;
}

const numeroBR = (n: number) => n.toLocaleString("pt-BR");

async function main() {
  carregarEnv();
  const aplicar = process.argv.includes("--aplicar");

  const U = process.env["SUPABASE_URL"];
  const K = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!U || !K) throw new Error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };

  const get = async <T>(caminho: string): Promise<T> => {
    const r = await fetch(`${U}/rest/v1/${caminho}`, { headers: H });
    if (!r.ok) throw new Error(`GET ${caminho} → ${r.status} ${await r.text()}`);
    return JSON.parse(await r.text()) as T;
  };

  const cfg = (
    await get<
      {
        palavras_chave: string[];
        score_peso_palavras: number;
        score_peso_documentos: number;
        score_peso_valor: number;
        score_minimo_recomendado: number;
      }[]
    >(
      "configuracoes?select=palavras_chave,score_peso_palavras,score_peso_documentos,score_peso_valor,score_minimo_recomendado",
    )
  )[0]!;

  console.log(
    `${cfg.palavras_chave.length} palavras-chave · mínimo ${cfg.score_minimo_recomendado}`,
  );
  console.log(
    `pesos: palavras ${cfg.score_peso_palavras} · documentos ${cfg.score_peso_documentos} · valor ${cfg.score_peso_valor}\n`,
  );

  // Varredura paginada: o catálogo cresce para dezenas de milhares.
  const licitacoes: LinhaLicitacao[] = [];
  for (let offset = 0; ; offset += 1000) {
    const lote = await get<LinhaLicitacao[]>(
      "licitacoes?select=id,numero_controle_pncp,objeto,modalidade_nome,valor_total_estimado," +
        `categoria,score_aderencia,situacao_temporal&limit=1000&offset=${offset}&order=id`,
    );
    licitacoes.push(...lote);
    if (lote.length < 1000) break;
  }

  const docs = new Map<string, { tipo_documento: TipoDocumento }[]>();
  for (let offset = 0; ; offset += 1000) {
    const lote = await get<{ licitacao_id: string; tipo_documento: TipoDocumento }[]>(
      `documentos_licitacao?select=licitacao_id,tipo_documento&ativo=is.true&limit=1000&offset=${offset}&order=id`,
    );
    for (const d of lote) {
      const lista = docs.get(d.licitacao_id) ?? [];
      lista.push({ tipo_documento: d.tipo_documento });
      docs.set(d.licitacao_id, lista);
    }
    if (lote.length < 1000) break;
  }

  console.log(
    `${numeroBR(licitacoes.length)} licitações · ${numeroBR(docs.size)} com documentos coletados\n`,
  );

  const mudancas: { id: string; de: number; para: number; linha: LinhaLicitacao }[] = [];
  let cruzam = 0;
  let deixamDeCruzar = 0;

  for (const l of licitacoes) {
    const novo = calcularScore(
      {
        objeto: l.objeto,
        modalidade: l.modalidade_nome ?? "",
        // numeric do Postgres chega como texto; Number(null) seria 0, e zero
        // aqui significaria "de graça" em vez de "não divulgado".
        valor_estimado:
          l.valor_total_estimado === null || l.valor_total_estimado === ""
            ? null
            : Number(l.valor_total_estimado),
        categoria: l.categoria,
        documentos: docs.get(l.id) ?? [],
      },
      cfg,
    );

    if (novo !== l.score_aderencia) {
      mudancas.push({ id: l.id, de: l.score_aderencia, para: novo, linha: l });
      const antes = l.score_aderencia >= cfg.score_minimo_recomendado;
      const depois = novo >= cfg.score_minimo_recomendado;
      if (!antes && depois) cruzam++;
      if (antes && !depois) deixamDeCruzar++;
    }
  }

  const abertasCruzam = mudancas.filter(
    (m) =>
      m.linha.situacao_temporal === "aberta" &&
      m.de < cfg.score_minimo_recomendado &&
      m.para >= cfg.score_minimo_recomendado,
  );

  console.log(`${numeroBR(mudancas.length)} licitações mudariam de score`);
  console.log(
    `  ${numeroBR(cruzam)} passariam a cruzar o mínimo (${numeroBR(abertasCruzam.length)} delas abertas)`,
  );
  console.log(`  ${numeroBR(deixamDeCruzar)} deixariam de cruzar`);

  if (abertasCruzam.length > 0) {
    console.log(`\nAmostra das abertas que passariam a ser recomendadas:`);
    for (const m of abertasCruzam.slice(0, 12)) {
      console.log(
        `  ${String(m.de).padStart(3)} → ${String(m.para).padStart(3)} · ${m.linha.categoria.padEnd(22)} · ${m.linha.objeto.slice(0, 70)}`,
      );
    }
  }

  if (!aplicar) {
    console.log(`\n(simulação — nada foi gravado. Use --aplicar para gravar.)`);
    return;
  }

  let gravadas = 0;
  for (const m of mudancas) {
    const r = await fetch(`${U}/rest/v1/licitacoes?id=eq.${m.id}`, {
      method: "PATCH",
      headers: H,
      // `updated_at` acompanha porque o score é campo derivado nosso: a linha
      // mudou de verdade, e quem olhar a data precisa ver isso.
      body: JSON.stringify({ score_aderencia: m.para, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(`PATCH ${m.id} → ${r.status} ${await r.text()}`);
    gravadas++;
    if (gravadas % 200 === 0) console.log(`  ${numeroBR(gravadas)}/${numeroBR(mudancas.length)}…`);
  }
  console.log(`\n${numeroBR(gravadas)} scores atualizados.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
