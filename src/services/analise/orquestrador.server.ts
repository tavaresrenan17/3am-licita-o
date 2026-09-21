/**
 * Orquestrador da análise semântica de licitações.
 *
 * Combina texto integral dos editais, evidências vetoriais temáticas,
 * limites de contexto, validação rigorosa de fontes e persistência com lease.
 */
import {
  ALGORITMO_VERSAO,
  CONSULTAS_TEMATICAS,
  PROMPT_VERSAO,
  parseAnaliseResultado,
  validarFontes,
  type AnaliseResultado,
  type FonteConhecida,
} from "./contrato";
import {
  calcularCobertura,
  calcularFingerprint,
  construirPromptAnalise,
  deduplicarEOrdenarEvidencias,
  dividirTextoIntegral,
  type BlocoContexto,
  type EvidenciaContexto,
} from "./contexto";
import { type GeradorChat, criarGeradorChat } from "./gerador.server";
import {
  type LinhaAnalise,
  type RepositorioAnalise,
  repositorioAnalise,
} from "./repositorio.analise.server";
import { obterEmbedderPadrao, paraLiteralPg, type Embedder } from "../busca/embedder";

export interface ParametrosExecutarAnalise {
  licitacaoId: string;
  forcar?: boolean;
  repositorio?: RepositorioAnalise;
  gerador?: GeradorChat;
  embedder?: Embedder;
}

export async function executarAnaliseLicitacao(
  parametros: ParametrosExecutarAnalise,
): Promise<LinhaAnalise> {
  const repo = parametros.repositorio ?? repositorioAnalise;
  const gerador = parametros.gerador ?? criarGeradorChat();
  const embedder = parametros.embedder ?? obterEmbedderPadrao();
  const { licitacaoId, forcar = false } = parametros;

  const materiaPrima = await repo.obterMateriaPrima(licitacaoId);
  if (!materiaPrima || !materiaPrima.licitacao) {
    throw new Error(`Licitação não encontrada: ${licitacaoId}`);
  }

  const cobertura = calcularCobertura(materiaPrima.documentos);
  const fingerprint = calcularFingerprint({
    licitacao: materiaPrima.licitacao,
    documentos: materiaPrima.documentos,
    modelo: gerador.modelo,
    promptVersao: PROMPT_VERSAO,
    algoritmoVersao: ALGORITMO_VERSAO,
  });

  // Regra de negócio: uma vez gerada e salva para esta licitação, a análise é definitiva
  // e não deve ser gerada novamente, economizando recursos e protegendo o histórico.
  const analiseSalva = await repo.obterAnalise(licitacaoId);
  if (analiseSalva && analiseSalva.estado === "pronta" && analiseSalva.resultado) {
    return analiseSalva;
  }

  const { adquirido, linha, leaseId } = await repo.adquirirLease(
    licitacaoId,
    fingerprint,
    forcar,
    PROMPT_VERSAO,
    ALGORITMO_VERSAO,
  );

  if (!adquirido) {
    if (linha) return linha;
    throw new Error("Não foi possível adquirir a trava de processamento da análise");
  }

  try {
    const blocos: BlocoContexto[] = materiaPrima.documentos
      .filter((d) => d.ativo && d.texto && d.texto.trim().length > 0)
      .flatMap((d) =>
        dividirTextoIntegral({
          documentoId: d.documentoId,
          nome: d.nome,
          texto: d.texto,
        }),
      );

    let evidencias: EvidenciaContexto[] = [];
    if (materiaPrima.chunksDisponiveis > 0) {
      try {
        const consultas = CONSULTAS_TEMATICAS.map((c) => c.consulta);
        const vetores = await embedder.embed(consultas);
        const buscas = vetores.map(async (vetor) => {
          return repo.buscarChunks(licitacaoId, Array.from(vetor), embedder.modelo, 8);
        });
        const resultados = await Promise.all(buscas);
        evidencias = deduplicarEOrdenarEvidencias(resultados.flat());
      } catch {
        // Se a busca vetorial falhar (ex: embedder offline), continua por cobertura integral
      }
    }

    const fontesValidas: FonteConhecida[] = [
      ...blocos.map((b) => ({ id: b.id })),
      ...evidencias.map((e) => ({ id: e.id })),
    ];

    if (fontesValidas.length === 0) {
      throw new Error(
        "Nenhum texto disponível nos documentos da licitação para realizar a análise",
      );
    }

    const prompt = construirPromptAnalise({
      metadados: materiaPrima.licitacao,
      blocos,
      evidencias,
      cobertura,
    });

    const respostaTexto = await gerador.gerar(prompt);
    const resultadoBruto = parseAnaliseResultado(respostaTexto);
    const resultado = validarFontes(resultadoBruto, fontesValidas);

    const fontesSalvas = [
      ...blocos.map((b) => ({
        id: b.id,
        documentoId: b.documentoId,
        nome: b.nome,
        tipo: "bloco_integral",
        ordem: b.indice,
        trecho: b.texto.slice(0, 300),
      })),
      ...evidencias.map((e) => ({
        id: e.id,
        documentoId: e.documentoId,
        nome: e.nome,
        tipo: e.tipo,
        ordem: e.ordem,
        trecho: e.trecho,
      })),
    ];

    await repo.concluir({
      licitacaoId,
      leaseId,
      resultado: resultado as unknown as import("./repositorio.analise.server").Json,
      fontes: fontesSalvas as unknown as import("./repositorio.analise.server").Json,
      cobertura: cobertura as unknown as import("./repositorio.analise.server").Json,
      modelo: gerador.modelo,
    });

    const linhaAtualizada = await repo.obterAnalise(licitacaoId, fingerprint);
    if (linhaAtualizada) return linhaAtualizada;

    return {
      licitacaoId,
      estado: "pronta",
      resultado: resultado as unknown as import("./repositorio.analise.server").Json,
      fontes: fontesSalvas as unknown as import("./repositorio.analise.server").Json,
      cobertura: cobertura as unknown as import("./repositorio.analise.server").Json,
      fingerprint,
      modelo: gerador.modelo,
      promptVersao: PROMPT_VERSAO,
      algoritmoVersao: ALGORITMO_VERSAO,
      leaseId: null,
      leaseExpiraEm: null,
      erro: null,
      geradoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };
  } catch (erro) {
    const erroTexto = erro instanceof Error ? erro.message : String(erro);
    await repo.falhar(licitacaoId, leaseId, erroTexto).catch(() => {});
    throw erro;
  }
}
