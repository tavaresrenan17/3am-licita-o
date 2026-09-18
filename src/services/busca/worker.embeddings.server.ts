/**
 * WORKER DA FILA DE EMBEDDINGS.
 *
 * Duas camadas, de propósito:
 *
 * - `licitacoes_embedding`, uma linha por licitação sobre objeto+órgão+município.
 *   Cobre as 7.713 licitações do catálogo sem depender de nenhum edital baixado.
 *   É o que faz a busca semântica existir no primeiro dia.
 * - `documento_chunks`, trechos do edital. Cobre o conteúdo, e só existe onde o
 *   worker de arquivos já conseguiu extrair texto.
 *
 * O que decide recálculo é o hash do texto de origem (md5, calculado no banco),
 * não um timestamp: mudou o objeto, muda o hash, e a linha volta para a fila.
 * Exigência direta da ADR-001.
 *
 * Medido em 18/09/2026: ~123 ms por texto em lote contra o Ollama local. Por
 * isso o worker sempre manda lote — um texto por requisição seria 6 s cada.
 */
import { dividirEmChunks, MAX_CHUNKS_DOC } from "./chunk";
import { OllamaEmbedder, paraLiteralPg, type Embedder } from "./embedder";

export interface LicitacaoParaEmbedding {
  licitacaoId: string;
  texto: string;
  origemHash: string;
}

export interface DocumentoParaEmbedding {
  documentoId: string;
  licitacaoId: string;
  texto: string;
  origemHash: string;
}

export interface PortaEmbeddings {
  reservarLicitacoes(limite: number): Promise<LicitacaoParaEmbedding[]>;
  reservarDocumentos(limite: number): Promise<DocumentoParaEmbedding[]>;
  gravarLicitacao(
    licitacaoId: string,
    literal: string,
    modelo: string,
    versao: string,
    origemHash: string,
  ): Promise<void>;
  gravarChunks(
    documentoId: string,
    licitacaoId: string,
    chunks: Array<{ ordem: number; texto: string; literal: string }>,
    modelo: string,
    versao: string,
    origemHash: string,
  ): Promise<void>;
}

export interface OpcoesTickEmbeddings {
  banco: PortaEmbeddings;
  embedder?: Embedder;
  loteLicitacoes?: number;
  loteDocumentos?: number;
  loteEmbedding?: number;
  maxChunksDoc?: number;
  agora?: () => number;
}

export interface ResumoTickEmbeddings {
  licitacoes: number;
  documentos: number;
  chunks: number;
  erros: string[];
  filaVazia: boolean;
  duracaoMs: number;
}

const PADRAO = {
  loteLicitacoes: 100,
  loteDocumentos: 5,
  // Lote do provedor. Grande demais estoura o contexto do modelo; pequeno
  // demais desperdiça o custo fixo da requisição.
  loteEmbedding: 16,
  maxChunksDoc: MAX_CHUNKS_DOC,
};

export async function executarTickEmbeddings(
  opcoes: OpcoesTickEmbeddings,
): Promise<ResumoTickEmbeddings> {
  const cfg = { ...PADRAO, ...opcoes };
  const embedder = opcoes.embedder ?? new OllamaEmbedder();
  const agora = opcoes.agora ?? Date.now;
  const inicio = agora();

  const resumo: ResumoTickEmbeddings = {
    licitacoes: 0,
    documentos: 0,
    chunks: 0,
    erros: [],
    filaVazia: false,
    duracaoMs: 0,
  };

  const licitacoes = await cfg.banco.reservarLicitacoes(cfg.loteLicitacoes);
  const documentos = await cfg.banco.reservarDocumentos(cfg.loteDocumentos);

  if (licitacoes.length === 0 && documentos.length === 0) {
    resumo.filaVazia = true;
    resumo.duracaoMs = agora() - inicio;
    return resumo;
  }

  // --- camada 1: o objeto da licitação
  for (let i = 0; i < licitacoes.length; i += cfg.loteEmbedding) {
    const lote = licitacoes.slice(i, i + cfg.loteEmbedding);
    try {
      const vetores = await embedder.embed(lote.map((l) => l.texto));
      for (const [j, item] of lote.entries()) {
        const vetor = vetores[j];
        if (!vetor) continue;
        await cfg.banco.gravarLicitacao(
          item.licitacaoId,
          paraLiteralPg(vetor),
          embedder.modelo,
          embedder.versao,
          item.origemHash,
        );
        resumo.licitacoes++;
      }
    } catch (erro) {
      // Um lote que falha não cancela os outros: a fila é retomável e o que
      // não foi gravado volta na próxima reserva.
      resumo.erros.push(`licitacoes[${i}]: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  // --- camada 2: os trechos do edital
  for (const doc of documentos) {
    try {
      const trechos = dividirEmChunks(doc.texto, { maxChunks: cfg.maxChunksDoc });
      if (trechos.length === 0) continue;

      const literais: Array<{ ordem: number; texto: string; literal: string }> = [];
      for (let i = 0; i < trechos.length; i += cfg.loteEmbedding) {
        const lote = trechos.slice(i, i + cfg.loteEmbedding);
        const vetores = await embedder.embed(lote);
        for (const [j, texto] of lote.entries()) {
          const vetor = vetores[j];
          if (!vetor) continue;
          literais.push({ ordem: i + j, texto, literal: paraLiteralPg(vetor) });
        }
      }

      if (literais.length === 0) continue;

      await cfg.banco.gravarChunks(
        doc.documentoId,
        doc.licitacaoId,
        literais,
        embedder.modelo,
        embedder.versao,
        doc.origemHash,
      );
      resumo.documentos++;
      resumo.chunks += literais.length;
    } catch (erro) {
      resumo.erros.push(
        `documento ${doc.documentoId}: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }

  resumo.duracaoMs = agora() - inicio;
  return resumo;
}
