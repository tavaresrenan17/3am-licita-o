/**
 * Dados adicionais da licitação: cache no banco + extração por IA sob demanda.
 *
 * Só baixa documentos quando a pessoa pede (`baixarSeFaltar`), mantendo a
 * regra do produto de nunca buscar arquivos no PNCP por conta própria.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  EXTRATOR_VERSAO,
  montarPrompt,
  parsearDadosAdicionais,
  selecionarTrechos,
  type DadosAdicionais,
  type TextoDocumento,
} from "./extracao";

export interface DadosAdicionaisDTO {
  /**
   * pronto: extraído (agora ou antes); nao_extraido: há texto, falta rodar a IA;
   * sem_texto: nenhum documento com texto baixado ainda.
   */
  estado: "pronto" | "nao_extraido" | "sem_texto";
  dados: DadosAdicionais | null;
  geradoEm: string | null;
  documentos: string[];
  /** Preenchido quando a tabela de cache ainda não existe no banco. */
  aviso: string | null;
}

const TABELA = "licitacoes_dados_adicionais";
const AVISO_SEM_TABELA =
  "Resultado não foi salvo: aplique supabase/APLICAR-DADOS-ADICIONAIS.sql no Supabase.";

let clienteSupabase: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (clienteSupabase) return clienteSupabase;
  const url = process.env["SUPABASE_URL"];
  const chave = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !chave) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  clienteSupabase = createClient(url, chave, { auth: { persistSession: false } });
  return clienteSupabase;
}

/** Tabela inexistente: Postgres 42P01 ou PostgREST "schema cache" (PGRST205). */
function tabelaAusente(erro: { code?: string } | null): boolean {
  return erro?.code === "42P01" || erro?.code === "PGRST205";
}

async function lerCache(client: SupabaseClient, licitacaoId: string) {
  const { data, error } = await client
    .from(TABELA)
    .select("dados, documentos, gerado_em")
    .eq("licitacao_id", licitacaoId)
    .maybeSingle();
  if (error) {
    if (tabelaAusente(error)) return { ausente: true as const };
    throw new Error(`Falha ao ler dados adicionais: ${error.message}`);
  }
  return { ausente: false as const, linha: data };
}

async function lerTextos(client: SupabaseClient, licitacaoId: string): Promise<TextoDocumento[]> {
  const { data: arquivos, error } = await client
    .from("documentos_arquivo")
    .select("documento_id, texto")
    .eq("licitacao_id", licitacaoId)
    .eq("estado", "extraido")
    .not("texto", "is", null);
  if (error) throw new Error(`Falha ao ler o texto dos documentos: ${error.message}`);
  if (!arquivos || arquivos.length === 0) return [];

  const { data: docs } = await client
    .from("documentos_licitacao")
    .select("id, nome, tipo_documento")
    .in(
      "id",
      arquivos.map((a) => a.documento_id),
    );
  const porId = new Map((docs ?? []).map((d) => [d.id, d]));
  return arquivos.map((a) => ({
    nome: porId.get(a.documento_id)?.nome ?? "documento",
    tipo: porId.get(a.documento_id)?.tipo_documento ?? "outro",
    texto: String(a.texto ?? ""),
  }));
}

/** Leitura barata para abrir a aba: cache, ou se já dá para extrair. */
export async function obterDadosAdicionais(licitacaoId: string): Promise<DadosAdicionaisDTO> {
  const client = db();
  const cache = await lerCache(client, licitacaoId);
  if (!cache.ausente && cache.linha) {
    return {
      estado: "pronto",
      dados: cache.linha.dados as DadosAdicionais,
      geradoEm: cache.linha.gerado_em as string,
      documentos: (cache.linha.documentos as string[]) ?? [],
      aviso: null,
    };
  }
  const { count } = await client
    .from("documentos_arquivo")
    .select("documento_id", { count: "exact", head: true })
    .eq("licitacao_id", licitacaoId)
    .eq("estado", "extraido");
  return {
    estado: (count ?? 0) > 0 ? "nao_extraido" : "sem_texto",
    dados: null,
    geradoEm: null,
    documentos: [],
    aviso: cache.ausente ? AVISO_SEM_TABELA : null,
  };
}

/** Roda a IA sobre o texto do edital e salva o resultado. */
export async function extrairDadosAdicionais(
  licitacaoId: string,
  opcoes: { baixarSeFaltar?: boolean } = {},
): Promise<DadosAdicionaisDTO> {
  const client = db();
  let textos = await lerTextos(client, licitacaoId);

  if (textos.length === 0 && opcoes.baixarSeFaltar) {
    const { sincronizarArquivosLicitacaoSobDemanda } =
      await import("../documentos/otimizador.server");
    await sincronizarArquivosLicitacaoSobDemanda(licitacaoId, {
      cliente: client,
      concorrencia: 4,
      maxArquivos: 5,
    });
    textos = await lerTextos(client, licitacaoId);
  }

  const trechos = selecionarTrechos(textos);
  if (!trechos) {
    return { estado: "sem_texto", dados: null, geradoEm: null, documentos: [], aviso: null };
  }

  const { GeradorChatOpenAI } = await import("../analise/gerador.server");
  const gerador = new GeradorChatOpenAI({ timeoutMs: 90_000 });
  const dados = parsearDadosAdicionais(await gerador.gerar(montarPrompt(trechos)));
  const documentos = textos.map((t) => t.nome);
  const geradoEm = new Date().toISOString();

  const { error } = await client.from(TABELA).upsert({
    licitacao_id: licitacaoId,
    dados,
    documentos,
    modelo: gerador.modelo,
    extrator_versao: EXTRATOR_VERSAO,
    gerado_em: geradoEm,
  });
  if (error && !tabelaAusente(error)) {
    throw new Error(`Falha ao salvar dados adicionais: ${error.message}`);
  }

  return {
    estado: "pronto",
    dados,
    geradoEm,
    documentos,
    aviso: error ? AVISO_SEM_TABELA : null,
  };
}
