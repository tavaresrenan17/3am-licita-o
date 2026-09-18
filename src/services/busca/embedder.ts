/**
 * Provedor de embeddings.
 *
 * Não existe chave de API neste projeto, e a ADR-001 não autoriza gasto para
 * uma hipótese não medida. O padrão é Ollama local com bge-m3: grátis, offline,
 * multilíngue, e roda onde a rotina noturna já roda.
 *
 * Medido em 18/09/2026: 1024 dimensões; 6,9 s na primeira chamada (carga do
 * modelo em memória) e ~123 ms por texto em lote depois. Por isso o worker
 * sempre manda lote, nunca um texto por requisição.
 *
 * A interface existe para que trocar por uma API hospedada seja configuração, e
 * não reescrita. Modelo e versão viajam com cada vetor gravado — exigência da
 * ADR-001, que proíbe misturar vetores de modelos diferentes.
 */
export const DIMENSOES = 1024;
export const MODELO_PADRAO = "bge-m3";

export interface Embedder {
  readonly modelo: string;
  readonly versao: string;
  readonly dimensoes: number;
  embed(textos: string[]): Promise<Float32Array[]>;
}

export class ErroDimensao extends Error {
  constructor(esperado: number, recebido: number) {
    super(`embedding com ${recebido} dimensões, esperado ${esperado}`);
    this.name = "ErroDimensao";
  }
}

export function paraLiteralPg(vetor: Float32Array): string {
  return `[${Array.from(vetor).join(",")}]`;
}

export interface OpcoesOllama {
  url?: string;
  modelo?: string;
  versao?: string;
  fetchImpl?: typeof fetch;
}

export class OllamaEmbedder implements Embedder {
  readonly modelo: string;
  readonly versao: string;
  readonly dimensoes = DIMENSOES;
  private readonly url: string;
  private readonly buscar: typeof fetch;

  constructor(opcoes: OpcoesOllama = {}) {
    this.modelo = opcoes.modelo ?? process.env["EMBEDDING_MODELO"] ?? MODELO_PADRAO;
    this.versao = opcoes.versao ?? process.env["EMBEDDING_VERSAO"] ?? "ollama";
    this.url = opcoes.url ?? process.env["OLLAMA_URL"] ?? "http://127.0.0.1:11434";
    this.buscar = opcoes.fetchImpl ?? fetch;
  }

  async embed(textos: string[]): Promise<Float32Array[]> {
    if (textos.length === 0) return [];

    const resposta = await this.buscar(`${this.url}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.modelo, input: textos }),
    });

    if (!resposta.ok) {
      throw new Error(`Ollama respondeu HTTP ${resposta.status}`);
    }

    const corpo = (await resposta.json()) as { embeddings?: number[][] };
    const vetores = corpo.embeddings ?? [];

    return vetores.map((v) => {
      if (v.length !== this.dimensoes) throw new ErroDimensao(this.dimensoes, v.length);
      return Float32Array.from(v);
    });
  }
}

/**
 * Embedder determinístico para teste: mesmo texto, mesmo vetor, sem rede.
 * Não tem significado semântico e não serve para medir relevância.
 */
export class EmbedderFalso implements Embedder {
  readonly modelo = "falso";
  readonly versao = "1";
  readonly dimensoes = DIMENSOES;

  async embed(textos: string[]): Promise<Float32Array[]> {
    return textos.map((texto) => {
      const v = new Float32Array(this.dimensoes);
      let semente = 0;
      for (let i = 0; i < texto.length; i++) semente = (semente * 31 + texto.charCodeAt(i)) % 2147483647;
      for (let i = 0; i < this.dimensoes; i++) {
        semente = (semente * 1103515245 + 12345) % 2147483647;
        v[i] = semente / 2147483647;
      }
      return v;
    });
  }
}
