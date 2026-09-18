/**
 * WORKER DA FILA DE ARQUIVOS.
 *
 * Terceira fila do sistema, irmã da fila de documentos: descobrir oportunidade,
 * catalogar anexo e baixar anexo são ritmos diferentes e não podem se prender.
 *
 * Invariantes herdadas do worker de documentos:
 * - a rede acontece FORA da transação; o commit é a RPC `gravar_arquivo`;
 * - falha antes do commit deixa o arquivo reservado, e o lease expira sozinho;
 * - um arquivo problemático não derruba o lote;
 * - estado definitivo (grande demais, formato não suportado) não volta à fila.
 *
 * Pressão sobre a fonte: 2 simultâneas e 2 partidas por segundo para toda a
 * integração (arquivo 03 §8). Download é muito mais pesado que metadado — um
 * arquivo medido levou 15,2 s —, então a concorrência fica em 2 e o worker de
 * arquivos não roda junto com o de cabeçalhos NEM com o de documentos
 * (`worker.documentos.server.ts`): os dois reivindicam a mesma cota de 2
 * simultâneas/2 partidas por segundo da integração inteira, e se ambos
 * correrem ao mesmo tempo a carga real dobra. Quem agenda os ticks precisa
 * serializar os dois.
 */
import { baixarArquivo, MAX_BYTES_PADRAO, type ResultadoDownload } from "./download.server";
import { extrairTextoPdf, type TextoExtraido } from "./texto";

export interface ArquivoReservado {
  documentoId: string;
  licitacaoId: string;
  url: string;
  nome: string;
  tipoDocumento: string;
}

export interface GravacaoArquivo {
  documentoId: string;
  estado: "extraido" | "sem_texto" | "grande_demais" | "erro";
  nomeArquivo?: string | null;
  extensao?: string | null;
  mime?: string | null;
  bytes?: number | null;
  sha256?: string | null;
  paginas?: number | null;
  chars?: number | null;
  texto?: string | null;
  erro?: string | null;
}

export interface PortaArquivos {
  reservar(limite: number): Promise<ArquivoReservado[]>;
  gravar(gravacao: GravacaoArquivo): Promise<void>;
}

export interface OpcoesTickArquivos {
  banco: PortaArquivos;
  baixar?: (
    url: string,
    opcoes?: { maxBytes?: number; nomeCatalogado?: string | null },
  ) => Promise<ResultadoDownload>;
  extrair?: (bytes: Uint8Array) => Promise<TextoExtraido>;
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  orcamentoMs?: number;
  reservaMs?: number;
  loteReserva?: number;
  maxArquivosPorTick?: number;
  concorrencia?: number;
  intervaloPartidaMs?: number;
  maxBytes?: number;
}

export interface ResumoTickArquivos {
  processados: number;
  extraidos: number;
  semTexto: number;
  grandesDemais: number;
  erros: string[];
  filaVazia: boolean;
  duracaoMs: number;
}

const PADRAO = {
  // Um download medido levou 15,2 s. O orçamento é maior que o da fila de
  // metadados porque aqui cada item pode ser lento por natureza.
  orcamentoMs: 120_000,
  reservaMs: 20_000,
  loteReserva: 10,
  maxArquivosPorTick: 100,
  concorrencia: 2,
  intervaloPartidaMs: 500,
  // `download.server.ts` já exporta o teto padrão; duplicar o número aqui só
  // criaria uma segunda fonte de verdade que pode dessincronizar.
  maxBytes: Number(process.env["DOCS_MAX_BYTES"] ?? MAX_BYTES_PADRAO),
};

const dormirPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function executarTickArquivos(
  opcoes: OpcoesTickArquivos,
): Promise<ResumoTickArquivos> {
  const cfg = { ...PADRAO, ...opcoes };
  const baixar = opcoes.baixar ?? baixarArquivo;
  const extrair = opcoes.extrair ?? extrairTextoPdf;
  const agora = opcoes.agora ?? Date.now;
  const dormir = opcoes.dormir ?? dormirPadrao;

  const inicio = agora();
  const resumo: ResumoTickArquivos = {
    processados: 0,
    extraidos: 0,
    semTexto: 0,
    grandesDemais: 0,
    erros: [],
    filaVazia: false,
    duracaoMs: 0,
  };

  // Partilhado entre TODOS os lotes do tick: é o limite global de partidas,
  // não um limite por lote. Reiniciar a cada reserva deixaria passar partidas
  // extras exatamente na fronteira entre um lote e o próximo.
  let proximaPartida = 0;

  async function processar(item: ArquivoReservado): Promise<void> {
    try {
      const download = await baixar(item.url, {
        maxBytes: cfg.maxBytes,
        nomeCatalogado: item.nome,
      });

      if (!download.ok) {
        if (download.motivo === "grande_demais") {
          resumo.grandesDemais++;
          await cfg.banco.gravar({
            documentoId: item.documentoId,
            estado: "grande_demais",
            bytes: download.tamanho ?? null,
            erro: download.detalhe,
          });
          return;
        }
        resumo.erros.push(`${item.documentoId}: ${download.detalhe}`);
        await cfg.banco.gravar({
          documentoId: item.documentoId,
          estado: "erro",
          erro: `${download.motivo}: ${download.detalhe}`,
        });
        return;
      }

      if (!download.tipo.suportado) {
        // Visível e contabilizado: a v1 só lê PDF, e saber quanto do acervo é
        // ZIP/DOC é o que vai decidir se vale ampliar.
        resumo.erros.push(
          `${item.documentoId}: formato_nao_suportado ${download.tipo.mime ?? "?"}`,
        );
        await cfg.banco.gravar({
          documentoId: item.documentoId,
          estado: "erro",
          nomeArquivo: download.tipo.nomeArquivo,
          extensao: download.tipo.extensao,
          mime: download.tipo.mime,
          bytes: download.tamanho,
          sha256: download.sha256,
          erro: `formato_nao_suportado: ${download.tipo.mime ?? "desconhecido"}`,
        });
        return;
      }

      const extraido = await extrair(download.bytes);
      if (extraido.estado === "sem_texto") resumo.semTexto++;
      else resumo.extraidos++;

      await cfg.banco.gravar({
        documentoId: item.documentoId,
        estado: extraido.estado,
        nomeArquivo: download.tipo.nomeArquivo,
        extensao: download.tipo.extensao,
        mime: download.tipo.mime,
        bytes: download.tamanho,
        sha256: download.sha256,
        paginas: extraido.paginas,
        chars: extraido.chars,
        // Texto de PDF escaneado é ruído: não guardar.
        texto: extraido.estado === "extraido" ? extraido.texto : null,
        erro: null,
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      resumo.erros.push(`${item.documentoId}: ${motivo}`);
      await cfg.banco.gravar({ documentoId: item.documentoId, estado: "erro", erro: motivo });
    } finally {
      resumo.processados++;
    }
  }

  // `filaVazia` descreve a PRIMEIRA reserva do tick: só ela diz que não havia
  // nada pendente. Uma reserva vazia mais adiante só significa que a fila
  // secou no meio do tick — os lotes anteriores já processaram algo, e isso
  // não é o mesmo estado.
  let primeiraReserva = true;

  while (resumo.processados < cfg.maxArquivosPorTick) {
    if (agora() - inicio > cfg.orcamentoMs - cfg.reservaMs) break;

    const espaco = cfg.maxArquivosPorTick - resumo.processados;
    const reservados = await cfg.banco.reservar(Math.min(cfg.loteReserva, espaco));

    if (reservados.length === 0) {
      if (primeiraReserva) resumo.filaVazia = true;
      break;
    }
    primeiraReserva = false;

    const pendentes = [...reservados];
    const trabalhador = async (): Promise<void> => {
      while (pendentes.length > 0) {
        if (agora() - inicio > cfg.orcamentoMs - cfg.reservaMs) return;
        const item = pendentes.shift();
        if (!item) return;
        // A vaga de partida é calculada E reivindicada ANTES de qualquer
        // await. Se a escrita de `proximaPartida` esperasse o `dormir`
        // terminar, o intervalo entre leitura e escrita seria um ponto de
        // fuga: enquanto este trabalhador dorme, outro leria o mesmo
        // `proximaPartida` obsoleto, dormiria o mesmo tempo e os dois
        // disparariam `processar` juntos — furando o teto de 2 partidas por
        // segundo contra o PNCP. `Math.max(..., agora())` evita que o
        // agendamento arraste no passado depois de um item lento.
        const espera = proximaPartida - agora();
        proximaPartida = Math.max(proximaPartida, agora()) + cfg.intervaloPartidaMs;
        if (espera > 0) await dormir(espera);
        await processar(item);
      }
    };

    await Promise.all(Array.from({ length: cfg.concorrencia }, () => trabalhador()));
  }

  resumo.duracaoMs = agora() - inicio;
  return resumo;
}
