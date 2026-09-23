/**
 * Otimizador de acesso e sincronização documental do PNCP.
 *
 * Elimina a necessidade de baixar 8000+ arquivos em fila única sequencial:
 * - Filtra documentos essenciais (editais, termos de referência, projetos e orçamentos),
 *   descartando recibos, certidões e comprovantes irrelevantes para a análise da IA.
 * - Realiza download e extração em lote paralelo sob demanda para a licitação aberta.
 * - Suporta streaming em memória e arquivos compactados (ZIP contendo editais).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { baixarArquivo } from "./download.server";
import { extrairTextoDocumento, type TextoExtraido } from "./texto";
import { buscarArquivos } from "../pncp/client.server";
import { mapearArquivos } from "../pncp/documentos";

export interface DocumentoParaFiltro {
  id: string;
  nome?: string | null;
  tipo_documento?: string | null;
  tipo_documento_pncp?: string | null;
  url?: string | null;
  ativo?: boolean;
}

export const TERMOS_IRRELEVANTES = [
  "recibo",
  "comprovante",
  "publicacao em jornal",
  "publicação em jornal",
  "publicacao diario",
  "publicação diário",
  "extrato diario",
  "extrato diário",
  "certidao",
  "certidão",
  "ata de sessao",
  "ata de sessão",
  "declaracao de idoneidade",
  "declaração de idoneidade",
  "termo de encerramento",
  "relatorio de sessao",
  "relatório de sessão",
  "despacho de homologacao",
  "despacho de homologação",
];

export const TERMOS_ALTA_PRIORIDADE = [
  "edital",
  "termo de referencia",
  "termo de referência",
  "projeto basico",
  "projeto básico",
  "projeto executivo",
  "especificacao tecnica",
  "especificação técnica",
  "memorial descritivo",
  "planilha orcamentaria",
  "planilha orçamentária",
  "chamada publica",
  "chamada pública",
  "aviso de contratacao",
  "aviso de contratação",
  "tr",
];

function normalizarTextoBusca(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function calcularRelevanciaDocumento(doc: DocumentoParaFiltro): number {
  if (doc.ativo === false) return -100;
  if (!doc.url) return -100;

  const nome = doc.nome ?? "";
  const tipoPncp = doc.tipo_documento_pncp ?? "";
  const textoCompleto = `${nome} ${tipoPncp}`;
  const textoNormalizado = normalizarTextoBusca(textoCompleto);

  // Se for documento de trâmite formal ou comprovante, baixa prioridade
  for (const termo of TERMOS_IRRELEVANTES) {
    if (
      textoCompleto.toLowerCase().includes(termo.toLowerCase()) ||
      textoNormalizado.includes(normalizarTextoBusca(termo))
    ) {
      return 1; // Prioridade mínima
    }
  }

  // Se for edital ou projeto, pontuação máxima
  for (const termo of TERMOS_ALTA_PRIORIDADE) {
    if (
      textoCompleto.toLowerCase().includes(termo.toLowerCase()) ||
      textoNormalizado.includes(normalizarTextoBusca(termo))
    ) {
      return 100;
    }
  }

  if (doc.tipo_documento === "edital") return 90;
  if (doc.tipo_documento === "projeto") return 80;
  if (doc.tipo_documento === "orcamento") return 70;
  if (doc.tipo_documento === "anexo") return 50;

  return 10;
}

export function filtrarDocumentosEssenciais<T extends DocumentoParaFiltro>(
  documentos: T[],
  limite = 8,
): T[] {
  const pontuados = documentos
    .filter((d) => d.ativo !== false && !!d.url)
    .map((doc) => ({
      doc,
      score: calcularRelevanciaDocumento(doc),
    }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);

  return pontuados.slice(0, limite).map((p) => p.doc);
}

let clienteSupabase: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (clienteSupabase) return clienteSupabase;
  const url = process.env["SUPABASE_URL"];
  const chave = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !chave) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  clienteSupabase = createClient(url, chave, { auth: { persistSession: false } });
  return clienteSupabase;
}

export interface ResultadoSincronizacaoOtimizada {
  licitacaoId: string;
  totalCatalogados: number;
  processados: number;
  extraidos: number;
  erros: string[];
  documentosProntos: Array<{
    documentoId: string;
    nome: string;
    tipo: string;
    chars: number;
    paginas: number;
  }>;
}

export async function sincronizarArquivosLicitacaoSobDemanda(
  licitacaoId: string,
  opcoes: {
    concorrencia?: number;
    maxArquivos?: number;
    cliente?: SupabaseClient;
  } = {},
): Promise<ResultadoSincronizacaoOtimizada> {
  const client = opcoes.cliente ?? db();
  const maxArquivos = opcoes.maxArquivos ?? 5;
  const concorrencia = opcoes.concorrencia ?? 3;

  // 1. Obter dados da licitacao
  const { data: licitacao, error: errLic } = await client
    .from("licitacoes")
    .select("id, cnpj_orgao, ano_compra, sequencial_compra, score_aderencia")
    .eq("id", licitacaoId)
    .single();

  if (errLic || !licitacao) {
    throw new Error(`Licitação não encontrada: ${licitacaoId}`);
  }

  // 2. Obter documentos já catalogados
  let { data: docsExistentes } = await client
    .from("documentos_licitacao")
    .select("id, nome, tipo_documento, tipo_documento_pncp, url, ativo, sequencial_documento")
    .eq("licitacao_id", licitacaoId)
    .eq("ativo", true);

  // 3. Se não houver documentos catalogados, busca no PNCP
  const errosPncp: string[] = [];
  if (!docsExistentes || docsExistentes.length === 0) {
    const { cnpj_orgao, ano_compra, sequencial_compra } = licitacao;
    if (cnpj_orgao && ano_compra && sequencial_compra) {
      try {
        // Chamada disparada por clique: timeout e tentativas curtos para a tela
        // responder em segundos quando a base de Integração do PNCP cai.
        const resp = await buscarArquivos(
          String(cnpj_orgao),
          Number(ano_compra),
          Number(sequencial_compra),
          { timeoutMs: 15_000, tentativasMax: 2 },
        );
        if (resp.arquivos && resp.arquivos.length > 0) {
          const mapeamento = mapearArquivos(licitacaoId, resp.arquivos);
          const { error: errGravar } = await client.rpc("pncp_gravar_documentos", {
            p_licitacao_id: licitacaoId,
            p_documentos: mapeamento.linhas,
            p_score: Number(licitacao.score_aderencia ?? 0),
          });
          if (errGravar) throw new Error(`falha ao gravar documentos: ${errGravar.message}`);

          const { data: recarregados } = await client
            .from("documentos_licitacao")
            .select(
              "id, nome, tipo_documento, tipo_documento_pncp, url, ativo, sequencial_documento",
            )
            .eq("licitacao_id", licitacaoId)
            .eq("ativo", true);
          docsExistentes = recarregados ?? [];
        }
      } catch (errPncp) {
        // Engolir o erro fazia a tela anunciar "0 arquivo(s) atualizados" como
        // sucesso enquanto o PNCP estava fora do ar.
        console.warn("Erro ao buscar arquivos no PNCP sob demanda:", errPncp);
        errosPncp.push(
          errPncp instanceof Error ? errPncp.message : "Falha ao consultar os documentos no PNCP",
        );
      }
    }
  }

  const docs = docsExistentes ?? [];
  const essenciais = filtrarDocumentosEssenciais(docs, maxArquivos);

  // 4. Verificar quais documentos já possuem texto extraído
  const idsEssenciais = essenciais.map((d) => d.id);
  const { data: arquivosExistentes } = await client
    .from("documentos_arquivo")
    .select("documento_id, estado, chars, paginas")
    .in("documento_id", idsEssenciais);

  const mapaEstado = new Map(arquivosExistentes?.map((a) => [a.documento_id, a]) ?? []);

  const pendentes = essenciais.filter((doc) => {
    const salvo = mapaEstado.get(doc.id);
    return !salvo || salvo.estado !== "extraido" || !salvo.chars || salvo.chars < 50;
  });

  const resultado: ResultadoSincronizacaoOtimizada = {
    licitacaoId,
    totalCatalogados: docs.length,
    processados: 0,
    extraidos: 0,
    erros: errosPncp,
    documentosProntos: [],
  };

  // Se já tinha arquivos extraídos, inclui no resultado
  for (const doc of essenciais) {
    const salvo = mapaEstado.get(doc.id);
    if (salvo && salvo.estado === "extraido" && salvo.chars && salvo.chars >= 50) {
      resultado.documentosProntos.push({
        documentoId: doc.id,
        nome: doc.nome ?? "",
        tipo: doc.tipo_documento ?? "outro",
        chars: salvo.chars,
        paginas: salvo.paginas ?? 1,
      });
      resultado.extraidos++;
    }
  }

  if (pendentes.length === 0) {
    return resultado;
  }

  // 5. Download e extração concorrente dos pendentes em lotes paralelos
  for (let i = 0; i < pendentes.length; i += concorrencia) {
    const lote = pendentes.slice(i, i + concorrencia);
    const promessas = lote.map(async (doc) => {
      if (!doc.url) return;
      try {
        const download = await baixarArquivo(doc.url, { nomeCatalogado: doc.nome });
        if (!download.ok) {
          resultado.erros.push(`Falha no download de ${doc.nome}: ${download.detalhe}`);
          return;
        }

        const extraido = await extrairTextoDocumento(
          download.bytes,
          download.tipo.nomeArquivo ?? download.tipo.mime,
        );

        await client.from("documentos_arquivo").upsert({
          documento_id: doc.id,
          licitacao_id: licitacaoId,
          estado: extraido.estado,
          nome_arquivo: download.tipo.nomeArquivo,
          extensao: download.tipo.extensao,
          mime_detectado: download.tipo.mime,
          bytes: download.tamanho,
          sha256: download.sha256,
          paginas: extraido.paginas,
          chars: extraido.chars,
          texto: extraido.estado === "extraido" ? extraido.texto : null,
          erro: null,
          atualizado_em: new Date().toISOString(),
        });

        resultado.processados++;
        if (extraido.estado === "extraido" && extraido.chars >= 50) {
          resultado.extraidos++;
          resultado.documentosProntos.push({
            documentoId: doc.id,
            nome: doc.nome ?? "",
            tipo: doc.tipo_documento ?? "outro",
            chars: extraido.chars,
            paginas: extraido.paginas,
          });
        }
      } catch (errDoc) {
        const msg = errDoc instanceof Error ? errDoc.message : String(errDoc);
        resultado.erros.push(`Erro ao processar ${doc.nome}: ${msg}`);
      }
    });

    await Promise.allSettled(promessas);
  }

  // 6. Atualizar estado geral dos documentos para a licitação
  try {
    const novoEstado =
      resultado.extraidos > 0 ? "completo" : resultado.erros.length > 0 ? "erro" : "completo";
    await client.from("documentos_estado").upsert({
      licitacao_id: licitacaoId,
      estado: novoEstado,
      atualizado_em: new Date().toISOString(),
    });
  } catch (errEstado) {
    console.warn("Falha ao atualizar documentos_estado:", errEstado);
  }

  return resultado;
}
