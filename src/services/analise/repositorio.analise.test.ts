import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { criarRepositorioAnalise, type PortaSupabaseAnalise } from "./repositorio.analise.server";

function portaFake(sobrescritas: Partial<PortaSupabaseAnalise> = {}): PortaSupabaseAnalise {
  return {
    obterLicitacao: vi.fn(async () => ({ id: "lic-a", objeto: "Obra" })),
    obterDocumentos: vi.fn(async () => []),
    obterModeloEsperado: vi.fn(async () => "bge-m3"),
    contarChunks: vi.fn(async () => 0),
    obterAnalise: vi.fn(async () => null),
    rpc: vi.fn(async () => []),
    ...sobrescritas,
  };
}

describe("repositorio de analise", () => {
  it("obtem somente documentos ativos e explicita a disponibilidade de chunks", async () => {
    const porta = portaFake({
      obterDocumentos: vi.fn(async () => [
        {
          id: "doc-a",
          nome: "Edital.pdf",
          tipo_documento: "edital",
          ativo: true,
          estado: "extraido",
          texto: "conteudo integral",
          sha256: "hash-a",
        },
      ]),
      contarChunks: vi.fn(async () => 7),
    });
    const repositorio = criarRepositorioAnalise(porta);

    const materia = await repositorio.obterMateriaPrima("lic-a");

    expect(porta.obterDocumentos).toHaveBeenCalledWith("lic-a", true);
    expect(porta.contarChunks).toHaveBeenCalledWith("lic-a", "bge-m3");
    expect(materia.documentos[0]).toMatchObject({
      documentoId: "doc-a",
      texto: "conteudo integral",
      sha256: "hash-a",
    });
    expect(materia.chunksDisponiveis).toBe(7);
  });

  it("nunca mistura chunks de outra licitacao", async () => {
    const rpc = vi.fn(async () => [
      {
        chunk_id: "chunk-a",
        licitacao_id: "lic-a",
        documento_id: "doc-a",
        nome: "Edital.pdf",
        tipo: "edital",
        ordem: 2,
        trecho: "prazo de 30 dias",
        distancia: 0.12,
      },
      {
        chunk_id: "chunk-invasor",
        licitacao_id: "lic-b",
        documento_id: "doc-b",
        nome: "Outro.pdf",
        tipo: "edital",
        ordem: 0,
        trecho: "nao pertence a lic-a",
        distancia: 0.01,
      },
    ]);
    const repositorio = criarRepositorioAnalise(portaFake({ rpc }));

    const fontes = await repositorio.buscarChunks("lic-a", [0.1, 0.2], "bge-m3", 8);

    expect(rpc).toHaveBeenCalledWith("buscar_chunks_analise", {
      p_licitacao_id: "lic-a",
      p_embedding: "[0.1,0.2]",
      p_modelo: "bge-m3",
      p_limite: 8,
    });
    expect(fontes).toEqual([
      {
        id: "chunk-a",
        licitacaoId: "lic-a",
        documentoId: "doc-a",
        nome: "Edital.pdf",
        tipo: "edital",
        ordem: 2,
        trecho: "prazo de 30 dias",
        distancia: 0.12,
      },
    ]);
  });

  it("repassa fingerprint e force ao adquirir o lease", async () => {
    const rpc = vi.fn(async () => [
      { adquirido: true, linha: { licitacao_id: "lic-a", estado: "processando" } },
    ]);
    const repositorio = criarRepositorioAnalise(portaFake({ rpc }));

    const lease = await repositorio.adquirirLease(
      "lic-a",
      "fp-atual",
      true,
      "prompt-1",
      "alg-1",
      "lease-cliente",
    );

    expect(rpc).toHaveBeenCalledWith("adquirir_lease_analise", {
      p_licitacao_id: "lic-a",
      p_fingerprint: "fp-atual",
      p_forcar: true,
      p_prompt_versao: "prompt-1",
      p_algoritmo_versao: "alg-1",
      p_lease_id: "lease-cliente",
    });
    expect(lease.adquirido).toBe(true);
    expect(lease.linha?.estado).toBe("processando");
    expect(lease.leaseId).toBe("lease-cliente");
  });

  it("renova o lease com o mesmo token", async () => {
    const rpc = vi.fn(async () => true);
    const repositorio = criarRepositorioAnalise(portaFake({ rpc }));

    await expect(repositorio.renovarLease("lic-a", "lease-a", "10 minutes")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("renovar_lease_analise", {
      p_licitacao_id: "lic-a",
      p_lease_id: "lease-a",
      p_duracao: "10 minutes",
    });
  });

  it("mapeia o cache persistido com fingerprint e versoes", async () => {
    const repositorio = criarRepositorioAnalise(
      portaFake({
        obterAnalise: vi.fn(async () => ({
          licitacao_id: "lic-a",
          estado: "pronta",
          resultado: { resumoExecutivo: "resumo" },
          fontes: [],
          cobertura: { estado: "completa" },
          fingerprint: "fp-atual",
          modelo: "modelo-a",
          prompt_versao: "prompt-1",
          algoritmo_versao: "alg-1",
          lease_id: null,
          lease_expira_em: null,
          erro: null,
          gerado_em: "2026-09-20T12:00:00Z",
          atualizado_em: "2026-09-20T12:00:00Z",
        })),
      }),
    );

    const cache = await repositorio.obterAnalise("lic-a", "fp-atual");

    expect(cache).toMatchObject({
      licitacaoId: "lic-a",
      estado: "pronta",
      fingerprint: "fp-atual",
      promptVersao: "prompt-1",
      algoritmoVersao: "alg-1",
    });
    await expect(repositorio.obterAnalise("lic-a", "fp-antigo")).resolves.toBeNull();
  });

  it("nao considera erro ou processamento como cache valido", async () => {
    const obterAnalise = vi.fn(async () => ({
      licitacao_id: "lic-a",
      estado: "erro",
      fingerprint: "fp-atual",
      prompt_versao: "prompt-1",
      algoritmo_versao: "alg-1",
      atualizado_em: "2026-09-20T12:00:00Z",
    }));
    const repositorio = criarRepositorioAnalise(portaFake({ obterAnalise }));

    await expect(repositorio.obterAnalise("lic-a", "fp-atual")).resolves.toBeNull();
  });

  it("conclui e falha apenas com o lease recebido", async () => {
    const rpc = vi.fn(async () => null);
    const repositorio = criarRepositorioAnalise(portaFake({ rpc }));

    await repositorio.concluir({
      licitacaoId: "lic-a",
      leaseId: "lease-a",
      resultado: { resumoExecutivo: "ok" },
      fontes: [{ id: "chunk-a" }],
      cobertura: { estado: "completa" },
      modelo: "modelo-a",
    });
    await repositorio.falhar("lic-a", "lease-a", "timeout");

    expect(rpc).toHaveBeenNthCalledWith(1, "concluir_analise_licitacao", {
      p_licitacao_id: "lic-a",
      p_lease_id: "lease-a",
      p_resultado: { resumoExecutivo: "ok" },
      p_fontes: [{ id: "chunk-a" }],
      p_cobertura: { estado: "completa" },
      p_modelo: "modelo-a",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "falhar_analise_licitacao", {
      p_licitacao_id: "lic-a",
      p_lease_id: "lease-a",
      p_erro: "timeout",
    });
  });

  it("propaga erros da porta com o nome da operacao", async () => {
    const repositorio = criarRepositorioAnalise(
      portaFake({
        obterAnalise: vi.fn(async () => {
          throw new Error("indisponivel");
        }),
      }),
    );

    await expect(repositorio.obterAnalise("lic-a")).rejects.toThrow("obter analise: indisponivel");
  });
});

describe("contrato SQL da analise", () => {
  const caminhoMigracao = resolve(
    process.cwd(),
    "supabase/migrations/20260920160000_analise_semantica_licitacao.sql",
  );
  const caminhoAplicacao = resolve(process.cwd(), "supabase/APLICAR-ANALISE-LICITACAO.sql");
  const sql = readFileSync(caminhoMigracao, "utf8").replace(/\r\n/g, "\n");
  const codigoRepositorio = readFileSync(
    resolve(process.cwd(), "src/services/analise/repositorio.analise.server.ts"),
    "utf8",
  );

  it("mantem o SQL de aplicacao byte a byte equivalente a migracao", () => {
    expect(readFileSync(caminhoAplicacao)).toEqual(readFileSync(caminhoMigracao));
  });

  it("filtra licitacao, documento ativo e modelo antes de calcular distancia", () => {
    const inicioCandidatos = sql.indexOf("with candidatos as materialized");
    const inicioDistancia = sql.indexOf("(c.embedding <=> v_vetor)::double precision");
    const candidatos = sql.slice(inicioCandidatos, inicioDistancia);

    expect(inicioCandidatos).toBeGreaterThan(0);
    expect(candidatos).toContain("c.licitacao_id = p_licitacao_id");
    expect(candidatos).toContain("d.licitacao_id = p_licitacao_id");
    expect(candidatos).toContain("d.ativo");
    expect(candidatos).toContain("c.modelo = p_modelo");
  });

  it("mantem RLS sem policy publica e RPCs exclusivas do service_role", () => {
    expect(sql).toContain("alter table public.licitacoes_analises enable row level security");
    expect(sql).not.toMatch(/create\s+policy[\s\S]+licitacoes_analises/i);

    for (const funcao of [
      "buscar_chunks_analise",
      "adquirir_lease_analise",
      "concluir_analise_licitacao",
      "falhar_analise_licitacao",
      "renovar_lease_analise",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${funcao}\\([\\s\\S]*?from public, anon, authenticated`,
        ),
      );
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${funcao}\\([\\s\\S]*?to service_role`),
      );
    }
  });

  it("nao permite que force roube lease ativo, mas permite substituir expirado", () => {
    const adquirir = sql.slice(
      sql.indexOf("create or replace function public.adquirir_lease_analise"),
      sql.indexOf("create or replace function public.concluir_analise_licitacao"),
    );
    const leaseAtivo = adquirir.indexOf("v_atual.lease_expira_em > now()");
    const cacheOuForce = adquirir.indexOf("not coalesce(p_forcar, false)");

    expect(leaseAtivo).toBeGreaterThan(0);
    expect(leaseAtivo).toBeLessThan(cacheOuForce);
    expect(adquirir).toContain("v_atual.estado = 'processando'");
    expect(adquirir).toContain("v_atual.fingerprint = p_fingerprint");
    expect(adquirir).toContain("v_atual.lease_id = p_lease_id");
    expect(adquirir).toContain("select true, to_jsonb(v_atual)");
    expect(adquirir.indexOf("v_atual.lease_id = p_lease_id")).toBeLessThan(leaseAtivo);
  });

  it("renova token atual inclusive expirado e limita a duracao", () => {
    const renovar = sql.slice(
      sql.indexOf("create or replace function public.renovar_lease_analise"),
      sql.indexOf("create or replace function public.concluir_analise_licitacao"),
    );

    expect(renovar).toContain("lease_id = p_lease_id");
    expect(renovar).toContain("estado = 'processando'");
    expect(renovar).not.toContain("lease_expira_em > now()");
    expect(renovar).toContain("greatest");
    expect(renovar).toContain("least");
  });

  it("conclui somente lease ativo e falha qualquer lease ainda pertencente ao chamador", () => {
    const concluir = sql.slice(
      sql.indexOf("create or replace function public.concluir_analise_licitacao"),
      sql.indexOf("create or replace function public.falhar_analise_licitacao"),
    );
    const falhar = sql.slice(
      sql.indexOf("create or replace function public.falhar_analise_licitacao"),
      sql.indexOf("revoke all on function public.buscar_chunks_analise"),
    );

    expect(concluir).toContain("lease_id = p_lease_id");
    expect(concluir).toContain("lease_expira_em > now()");
    expect(concluir).toContain("set estado = 'pronta'");
    expect(concluir).toContain("v_atual.estado = 'pronta'");
    expect(concluir).toContain("v_atual.lease_id = p_lease_id");
    expect(falhar).toContain("lease_id = p_lease_id");
    expect(falhar).not.toContain("lease_expira_em > now()");
    expect(falhar).toContain("set estado = 'erro'");
    expect(falhar).toContain("v_atual.estado = 'erro'");
    expect(falhar).toContain("v_atual.lease_id = p_lease_id");
  });

  it("conta somente chunks da licitacao, documentos ativos e modelo configurado", () => {
    expect(sql).toContain("create index if not exists documento_chunks_licitacao_modelo_idx");
    expect(sql).toContain("on public.documento_chunks (licitacao_id, modelo)");
    const contador = codigoRepositorio.slice(
      codigoRepositorio.indexOf("async contarChunks"),
      codigoRepositorio.indexOf(
        "async obterAnalise",
        codigoRepositorio.indexOf("async contarChunks"),
      ),
    );
    expect(contador).toContain('.eq("licitacao_id", licitacaoId)');
    expect(contador).toContain('.eq("modelo", modelo)');
    expect(contador).toContain('.eq("documentos_licitacao.ativo", true)');
  });

  it("usa search_path minimo nas RPCs", () => {
    const funcoes = sql.match(/set search_path = [^\n]+/g) ?? [];
    expect(funcoes.length).toBeGreaterThanOrEqual(5);
    expect(funcoes.every((linha) => !linha.includes("public"))).toBe(true);
  });
});
