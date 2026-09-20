/**
 * Fronteira server-only da análise de licitações.
 *
 * O texto integral dos arquivos é deliberadamente lido apenas aqui. Nenhum DTO
 * desta camada deve ser importado pelo cliente; as server functions expõem
 * somente a síntese e os trechos citáveis.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export type Json = null | boolean | number | string | Json[] | { [chave: string]: Json };

type LinhaGenerica = Record<string, unknown>;

export interface DocumentoMateriaPrima {
  documentoId: string;
  nome: string;
  tipoDocumento: string;
  ativo: boolean;
  estado: string;
  texto: string | null;
  sha256: string | null;
}

export interface MateriaPrimaAnalise {
  licitacao: LinhaGenerica;
  documentos: DocumentoMateriaPrima[];
  chunksDisponiveis: number;
}

export interface EvidenciaAnalise {
  id: string;
  licitacaoId: string;
  documentoId: string;
  nome: string;
  tipo: string;
  ordem: number;
  trecho: string;
  distancia: number;
}

export interface LinhaAnalise {
  licitacaoId: string;
  estado: "processando" | "pronta" | "erro";
  resultado: Json | null;
  fontes: Json;
  cobertura: Json;
  fingerprint: string | null;
  modelo: string | null;
  promptVersao: string;
  algoritmoVersao: string;
  leaseId: string | null;
  leaseExpiraEm: string | null;
  erro: string | null;
  geradoEm: string | null;
  atualizadoEm: string;
}

export interface PortaSupabaseAnalise {
  obterLicitacao(licitacaoId: string): Promise<LinhaGenerica | null>;
  obterDocumentos(licitacaoId: string, somenteAtivos: boolean): Promise<LinhaGenerica[]>;
  obterModeloEsperado(): Promise<string>;
  contarChunks(licitacaoId: string, modelo: string): Promise<number>;
  obterAnalise(licitacaoId: string): Promise<LinhaGenerica | null>;
  rpc(nome: string, parametros: Record<string, unknown>): Promise<unknown>;
}

export interface ConclusaoAnalise {
  licitacaoId: string;
  leaseId: string;
  resultado: Json;
  fontes: Json;
  cobertura: Json;
  modelo: string;
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function registro(valor: unknown): LinhaGenerica {
  return valor !== null && typeof valor === "object" ? (valor as LinhaGenerica) : {};
}

function primeiro(valor: unknown): LinhaGenerica | null {
  if (Array.isArray(valor)) return valor.length > 0 ? registro(valor[0]) : null;
  return valor === null || valor === undefined ? null : registro(valor);
}

function json(valor: unknown, padrao: Json): Json {
  return valor === undefined ? padrao : (valor as Json);
}

function mapearAnalise(valor: unknown): LinhaAnalise | null {
  const linha = primeiro(valor);
  if (!linha) return null;
  return {
    licitacaoId: String(linha["licitacao_id"]),
    estado: String(linha["estado"]) as LinhaAnalise["estado"],
    resultado: linha["resultado"] === null ? null : json(linha["resultado"], null),
    fontes: json(linha["fontes"], []),
    cobertura: json(linha["cobertura"], {}),
    fingerprint: linha["fingerprint"] == null ? null : String(linha["fingerprint"]),
    modelo: linha["modelo"] == null ? null : String(linha["modelo"]),
    promptVersao: String(linha["prompt_versao"] ?? ""),
    algoritmoVersao: String(linha["algoritmo_versao"] ?? ""),
    leaseId: linha["lease_id"] == null ? null : String(linha["lease_id"]),
    leaseExpiraEm: linha["lease_expira_em"] == null ? null : String(linha["lease_expira_em"]),
    erro: linha["erro"] == null ? null : String(linha["erro"]),
    geradoEm: linha["gerado_em"] == null ? null : String(linha["gerado_em"]),
    atualizadoEm: String(linha["atualizado_em"] ?? ""),
  };
}

let cliente: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env["SUPABASE_URL"];
  const chave = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !chave) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  cliente = createClient(url, chave, { auth: { persistSession: false } });
  return cliente;
}

function portaSupabase(): PortaSupabaseAnalise {
  return {
    async obterLicitacao(licitacaoId) {
      const { data, error } = await db()
        .from("licitacoes")
        .select(
          "id,numero_controle_pncp,orgao,unidade_nome,uf,municipio,objeto,informacao_complementar,modalidade_nome,processo,valor_total_estimado,data_publicacao,data_abertura_proposta,data_encerramento_proposta,situacao_nome,categoria,source_hash,updated_at",
        )
        .eq("id", licitacaoId)
        .maybeSingle();
      if (error) throw error;
      return data as LinhaGenerica | null;
    },

    async obterDocumentos(licitacaoId, somenteAtivos) {
      let consulta = db()
        .from("documentos_licitacao")
        .select(
          "id,nome,tipo_documento,ativo,documentos_arquivo(estado,texto,sha256,atualizado_em)",
        )
        .eq("licitacao_id", licitacaoId);
      if (somenteAtivos) consulta = consulta.eq("ativo", true);
      const { data, error } = await consulta.order("sequencial_documento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinhaGenerica[];
    },

    async obterModeloEsperado() {
      const { data, error } = await db()
        .from("configuracao_busca")
        .select("modelo_esperado")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return String(data.modelo_esperado);
    },

    async contarChunks(licitacaoId, modelo) {
      const { count, error } = await db()
        .from("documento_chunks")
        .select("id,documentos_licitacao!inner(id)", { count: "exact", head: true })
        .eq("licitacao_id", licitacaoId)
        .eq("modelo", modelo)
        .eq("documentos_licitacao.ativo", true);
      if (error) throw error;
      return count ?? 0;
    },

    async obterAnalise(licitacaoId) {
      const { data, error } = await db()
        .from("licitacoes_analises")
        .select("*")
        .eq("licitacao_id", licitacaoId)
        .maybeSingle();
      if (error) throw error;
      return data as LinhaGenerica | null;
    },

    async rpc(nome, parametros) {
      const { data, error } = await db().rpc(nome, parametros);
      if (error) throw error;
      return data;
    },
  };
}

function arquivoAninhado(linha: LinhaGenerica): LinhaGenerica {
  const valor = linha["documentos_arquivo"];
  if (Array.isArray(valor)) return registro(valor[0]);
  return registro(valor);
}

export function criarRepositorioAnalise(porta: PortaSupabaseAnalise = portaSupabase()) {
  return {
    async obterMateriaPrima(licitacaoId: string): Promise<MateriaPrimaAnalise> {
      try {
        const [licitacao, linhas, modeloEsperado] = await Promise.all([
          porta.obterLicitacao(licitacaoId),
          porta.obterDocumentos(licitacaoId, true),
          porta.obterModeloEsperado(),
        ]);
        if (!licitacao) throw new Error("licitacao nao encontrada");
        const chunksDisponiveis = await porta.contarChunks(licitacaoId, modeloEsperado);
        return {
          licitacao,
          documentos: linhas.map((linha) => {
            const arquivo = arquivoAninhado(linha);
            return {
              documentoId: String(linha["id"]),
              nome: String(linha["nome"] ?? ""),
              tipoDocumento: String(linha["tipo_documento"] ?? "outro"),
              ativo: linha["ativo"] === true,
              estado: String(arquivo["estado"] ?? linha["estado"] ?? "pendente"),
              texto:
                (arquivo["texto"] ?? linha["texto"]) == null
                  ? null
                  : String(arquivo["texto"] ?? linha["texto"]),
              sha256:
                (arquivo["sha256"] ?? linha["sha256"]) == null
                  ? null
                  : String(arquivo["sha256"] ?? linha["sha256"]),
            };
          }),
          chunksDisponiveis,
        };
      } catch (erro) {
        throw new Error(`obter materia-prima: ${mensagem(erro)}`);
      }
    },

    async buscarChunks(
      licitacaoId: string,
      embedding: readonly number[],
      modelo: string,
      limite: number,
    ): Promise<EvidenciaAnalise[]> {
      try {
        const data = await porta.rpc("buscar_chunks_analise", {
          p_licitacao_id: licitacaoId,
          p_embedding: `[${embedding.join(",")}]`,
          p_modelo: modelo,
          p_limite: limite,
        });
        return (Array.isArray(data) ? data : [])
          .map((valor) => registro(valor))
          .filter((linha) => linha["licitacao_id"] === licitacaoId)
          .map((linha) => ({
            id: String(linha["chunk_id"]),
            licitacaoId: String(linha["licitacao_id"]),
            documentoId: String(linha["documento_id"]),
            nome: String(linha["nome"] ?? ""),
            tipo: String(linha["tipo"] ?? "outro"),
            ordem: Number(linha["ordem"] ?? 0),
            trecho: String(linha["trecho"] ?? ""),
            distancia: Number(linha["distancia"] ?? 0),
          }));
      } catch (erro) {
        throw new Error(`buscar chunks: ${mensagem(erro)}`);
      }
    },

    async obterAnalise(licitacaoId: string, fingerprint?: string): Promise<LinhaAnalise | null> {
      try {
        const linha = mapearAnalise(await porta.obterAnalise(licitacaoId));
        if (fingerprint === undefined) return linha;
        return linha?.estado === "pronta" && linha.fingerprint === fingerprint ? linha : null;
      } catch (erro) {
        throw new Error(`obter analise: ${mensagem(erro)}`);
      }
    },

    async adquirirLease(
      licitacaoId: string,
      fingerprint: string,
      forcar: boolean,
      promptVersao = "v1",
      algoritmoVersao = "v1",
      leaseId: string = randomUUID(),
    ): Promise<{ adquirido: boolean; linha: LinhaAnalise | null; leaseId: string }> {
      try {
        const resposta = primeiro(
          await porta.rpc("adquirir_lease_analise", {
            p_licitacao_id: licitacaoId,
            p_fingerprint: fingerprint,
            p_forcar: forcar,
            p_prompt_versao: promptVersao,
            p_algoritmo_versao: algoritmoVersao,
            p_lease_id: leaseId,
          }),
        );
        return {
          adquirido: resposta?.["adquirido"] === true,
          linha: mapearAnalise(resposta?.["linha"]),
          leaseId,
        };
      } catch (erro) {
        throw new Error(`adquirir lease: ${mensagem(erro)}`);
      }
    },

    async renovarLease(
      licitacaoId: string,
      leaseId: string,
      duracao = "5 minutes",
    ): Promise<boolean> {
      try {
        return (
          (await porta.rpc("renovar_lease_analise", {
            p_licitacao_id: licitacaoId,
            p_lease_id: leaseId,
            p_duracao: duracao,
          })) === true
        );
      } catch (erro) {
        throw new Error(`renovar lease: ${mensagem(erro)}`);
      }
    },

    async concluir(dados: ConclusaoAnalise): Promise<void> {
      try {
        await porta.rpc("concluir_analise_licitacao", {
          p_licitacao_id: dados.licitacaoId,
          p_lease_id: dados.leaseId,
          p_resultado: dados.resultado,
          p_fontes: dados.fontes,
          p_cobertura: dados.cobertura,
          p_modelo: dados.modelo,
        });
      } catch (erro) {
        throw new Error(`concluir analise: ${mensagem(erro)}`);
      }
    },

    async falhar(licitacaoId: string, leaseId: string, erroOperacional: string): Promise<void> {
      try {
        await porta.rpc("falhar_analise_licitacao", {
          p_licitacao_id: licitacaoId,
          p_lease_id: leaseId,
          p_erro: erroOperacional,
        });
      } catch (erro) {
        throw new Error(`falhar analise: ${mensagem(erro)}`);
      }
    },
  };
}

export type RepositorioAnalise = ReturnType<typeof criarRepositorioAnalise>;

export const repositorioAnalise = criarRepositorioAnalise();
