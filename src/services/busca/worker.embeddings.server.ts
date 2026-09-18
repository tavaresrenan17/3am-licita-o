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
  /**
   * Fecha o documento cujo texto não rende nenhum chunk aproveitável.
   *
   * Sem isso ele é reservado para sempre: `reservar_documentos_para_embedding`
   * escolhe por `estado = 'extraido'` sem chunk de hash igual, e um documento
   * que nunca gera chunk satisfaz essa condição em todo tick, ocupando um dos
   * poucos slots indefinidamente.
   */
  marcarSemTexto(documentoId: string): Promise<void>;
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
  /**
   * Documentos fechados como `sem_texto`. Não são vetores, mas são fila que
   * andou: quem observa progresso do backfill precisa contá-los, senão um tick
   * que só descarta documentos vazios parece um tick travado.
   */
  semTexto: number;
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
  // Campo a campo, e não `{ ...PADRAO, ...opcoes }`: um `loteEmbedding:
  // undefined` explícito sobrescreveria o default com undefined, e o
  // `i += undefined` do laço viraria NaN — o tick terminaria sem fazer nada e
  // sem reclamar. `??` só cai no default quando o valor é ausente de verdade.
  const banco = opcoes.banco;
  const cfg = {
    loteLicitacoes: opcoes.loteLicitacoes ?? PADRAO.loteLicitacoes,
    loteDocumentos: opcoes.loteDocumentos ?? PADRAO.loteDocumentos,
    loteEmbedding: opcoes.loteEmbedding ?? PADRAO.loteEmbedding,
    maxChunksDoc: opcoes.maxChunksDoc ?? PADRAO.maxChunksDoc,
  };
  const embedder = opcoes.embedder ?? new OllamaEmbedder();
  const agora = opcoes.agora ?? Date.now;
  const inicio = agora();

  const resumo: ResumoTickEmbeddings = {
    licitacoes: 0,
    documentos: 0,
    chunks: 0,
    semTexto: 0,
    erros: [],
    filaVazia: false,
    duracaoMs: 0,
  };

  // A reserva também pode falhar por rede, e não só o trabalho em si. Isto
  // aconteceu de verdade em 18/09/2026: um `TypeError: fetch failed` no meio de
  // uma carga de 8.370 licitações matou o processo com 6.970 feitas, porque a
  // exceção escapava daqui. Agora ela vira erro no resumo, o tick devolve zero
  // progresso, e quem decide desistir é o contador de ticks sem progresso de
  // quem chamou — que é onde essa decisão pertence.
  let licitacoes: LicitacaoParaEmbedding[] = [];
  let documentos: DocumentoParaEmbedding[] = [];
  try {
    licitacoes = await banco.reservarLicitacoes(cfg.loteLicitacoes);
    documentos = await banco.reservarDocumentos(cfg.loteDocumentos);
  } catch (erro) {
    resumo.erros.push(`reserva: ${erro instanceof Error ? erro.message : String(erro)}`);
    resumo.duracaoMs = agora() - inicio;
    // Não é fila vazia: é fila desconhecida. Marcar `filaVazia` aqui faria o CLI
    // encerrar anunciando "Fila vazia." sobre uma carga incompleta.
    return resumo;
  }

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
        await banco.gravarLicitacao(
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
      if (trechos.length === 0) {
        // Texto extraído que não rende um único trecho é fim de linha para este
        // documento, não "tente de novo": `sem_texto` tira ele da reserva
        // (`reservar_documentos_para_embedding` só olha `estado = 'extraido'`) em
        // vez de deixá-lo ocupar um slot em todo tick, para sempre.
        await banco.marcarSemTexto(doc.documentoId);
        resumo.semTexto++;
        continue;
      }

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

      // Aqui HÁ trecho e o provedor é que não devolveu vetor nenhum. Não é
      // documento sem texto, e marcá-lo `sem_texto` excluiria do vetorial um
      // edital legítimo por causa de uma falha transitória. Fica na fila, mas
      // registrado: o operador precisa ver que o tick não andou.
      if (literais.length === 0) {
        resumo.erros.push(
          `documento ${doc.documentoId}: ${trechos.length} trecho(s), nenhum vetor devolvido pelo provedor`,
        );
        continue;
      }

      await banco.gravarChunks(
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
