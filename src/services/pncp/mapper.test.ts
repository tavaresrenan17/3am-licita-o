import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALAVRAS_CHAVE_PADRAO } from "@/lib/types";
import {
  deduplicarPorControle,
  hashEstavel,
  mapearContratacao,
  paraInstanteUtc,
  RegistroInvalidoError,
  type ContratacaoPNCP,
} from "./mapper";

const fixture = (nome: string) =>
  JSON.parse(
    readFileSync(new URL(`./__fixtures__/${nome}`, import.meta.url), "utf8"),
  ) as { data: ContratacaoPNCP[] };

const cfg = {
  palavras_chave: PALAVRAS_CHAVE_PADRAO,
  score_peso_palavras: 45,
  score_peso_documentos: 30,
  score_peso_valor: 17,
};

const mapear = (dto: ContratacaoPNCP, extras = {}) =>
  mapearContratacao(dto, { cfg, fetchedAt: "2026-09-11T17:00:00.000Z", ...extras });

describe("D04 — datas sem offset são horário de Brasília", () => {
  it("converte abertura e encerramento somando 3 horas para UTC", () => {
    expect(paraInstanteUtc("2026-09-10T08:00:00")).toBe("2026-09-10T11:00:00.000Z");
    expect(paraInstanteUtc("2026-09-24T10:00:00")).toBe("2026-09-24T13:00:00.000Z");
  });

  it("respeita offset explícito quando existe e não concatena Z ao horário local", () => {
    expect(paraInstanteUtc("2026-09-10T08:00:00Z")).toBe("2026-09-10T08:00:00.000Z");
    expect(paraInstanteUtc("2026-09-10T08:00:00-03:00")).toBe("2026-09-10T11:00:00.000Z");
  });

  it("trata virada de dia: 21h de Brasília já é o dia seguinte em UTC", () => {
    expect(paraInstanteUtc("2026-09-11T21:30:00")).toBe("2026-09-12T00:30:00.000Z");
  });

  it("data ausente ou ilegível vira nulo, não 'agora' nem zero", () => {
    expect(paraInstanteUtc(null)).toBeNull();
    expect(paraInstanteUtc("")).toBeNull();
    expect(paraInstanteUtc("sem data")).toBeNull();
  });
});

describe("mapeamento de uma resposta real (probe-publicacao_valida.json)", () => {
  const dto = fixture("probe-publicacao_valida.json").data[0]!;
  const linha = mapear(dto, { vistoEmProposta: false });

  it("usa numeroControlePNCP como identidade e preserva o CNPJ como texto", () => {
    expect(linha.numero_controle_pncp).toBe("26989715000102-1-001386/2026");
    expect(linha.cnpj_orgao).toBe("26989715000102");
    expect(linha.orgao).toBe("MINISTERIO PUBLICO DA UNIAO");
  });

  it("traz órgão, unidade, UF, município e IBGE do lugar certo", () => {
    expect(linha.uf).toBe("DF");
    expect(linha.municipio).toBe("Brasília");
    expect(linha.codigo_ibge).toBe("5300108");
    expect(linha.codigo_unidade).toBe("200100");
    expect(linha.unidade_nome).toBe("SECRETARIA DE ADMINISTRACAO MIN. PUBLICO FED.");
  });

  it("converte datas e valores sem perder precisão", () => {
    expect(linha.data_abertura_proposta).toBe("2026-09-10T11:00:00.000Z");
    expect(linha.data_encerramento_proposta).toBe("2026-09-24T13:00:00.000Z");
    expect(linha.data_publicacao).toBe("2026-09-10T07:00:02.000Z");
    expect(linha.data_atualizacao_global).toBe("2026-09-10T07:01:12.000Z");
    expect(linha.valor_total_estimado).toBe(1186531.2);
  });

  it("monta o link do PNCP e classifica a categoria localmente", () => {
    expect(linha.url_pncp).toBe("https://pncp.gov.br/app/editais/26989715000102/2026/1386");
    expect(linha.categoria).toBe("Outros");
  });

  it("registra observação em proposta só quando veio desse endpoint", () => {
    expect(linha.observado_em_proposta_at).toBeNull();
    expect(mapear(dto, { vistoEmProposta: true }).observado_em_proposta_at).toBe(
      "2026-09-11T17:00:00.000Z",
    );
  });
});

describe("D08/D11 — campos ausentes, tipos divergentes e valores desconhecidos", () => {
  const base = fixture("probe-proposta_sem_modalidade.json").data[0]!;

  it("aceita situacaoCompraId como número ou string (divergência do schema)", () => {
    expect(mapear({ ...base, situacaoCompraId: 1 }).situacao_compra_id).toBe(1);
    expect(mapear({ ...base, situacaoCompraId: "1" }).situacao_compra_id).toBe(1);
    expect(mapear({ ...base, situacaoCompraId: null }).situacao_compra_id).toBeNull();
  });

  it("valor nulo continua nulo e não vira zero", () => {
    expect(mapear({ ...base, valorTotalEstimado: null }).valor_total_estimado).toBeNull();
    expect(mapear({ ...base, valorTotalEstimado: 0 }).valor_total_estimado).toBe(0);
  });

  it("valor desconhecido não é pontuado como faixa alta no score", () => {
    const semValor = mapear({ ...base, valorTotalEstimado: null });
    const comValorAlto = mapear({ ...base, valorTotalEstimado: 5_000_000 });
    expect(semValor.score_aderencia).toBeLessThan(comValorAlto.score_aderencia);
  });

  it("rejeita registro sem identidade em vez de inventar uma", () => {
    const semIdentidade: ContratacaoPNCP = { ...base };
    delete semIdentidade.numeroControlePNCP;
    expect(() => mapear(semIdentidade)).toThrow(RegistroInvalidoError);
  });

  it("campo novo desconhecido não derruba o mapeamento", () => {
    expect(() =>
      mapear({ ...base, campoNovoDoPncp: "algo" } as unknown as ContratacaoPNCP),
    ).not.toThrow();
  });
});

describe("I08/I09 — hash e deduplicação", () => {
  const dto = fixture("probe-atualizacao_valida.json").data[0]!;

  it("mesmo conteúdo gera o mesmo hash, mesmo com fetched_at diferente", () => {
    const a = mapear(dto, { fetchedAt: "2026-09-11T10:00:00.000Z" });
    const b = mapear(dto, { fetchedAt: "2026-09-12T22:33:44.000Z" });
    expect(a.source_hash).toBe(b.source_hash);
  });

  it("mudança real no conteúdo muda o hash", () => {
    const a = mapear(dto);
    const b = mapear({ ...dto, objetoCompra: `${dto.objetoCompra} (retificado)` });
    expect(a.source_hash).not.toBe(b.source_hash);
  });

  it("hash é estável entre execuções para a mesma entrada", () => {
    expect(hashEstavel({ a: 1, b: "x" })).toBe(hashEstavel({ a: 1, b: "x" }));
    expect(hashEstavel({ a: 1 })).not.toBe(hashEstavel({ a: 2 }));
  });

  it("deduplica o lote pela identidade canônica", () => {
    const linhas = fixture("probe-atualizacao_valida.json").data.map((d) => mapear(d));
    const comRepetido = [...linhas, linhas[0]!];
    expect(deduplicarPorControle(comRepetido)).toHaveLength(linhas.length);
  });
});
