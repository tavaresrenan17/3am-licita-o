/**
 * Cliente de chat para geração da análise semântica de licitações.
 *
 * Server-only por desenho: nunca vaza chaves nem detalhes de infraestrutura
 * para o cliente. Compatível com a API padrão /v1/chat/completions (OpenAI,
 * Ollama, Groq, OpenRouter, etc.).
 */


export interface OpcoesGeradorChat {
  url?: string;
  modelo?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface GeradorChat {
  readonly modelo: string;
  gerar(prompt: string): Promise<string>;
}

export class GeradorChatOpenAI implements GeradorChat {
  readonly modelo: string;
  private readonly url: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly buscar: typeof fetch;

  constructor(opcoes: OpcoesGeradorChat = {}) {
    const analiseUrl = opcoes.url ?? process.env["ANALISE_API_URL"];
    const analiseModelo = opcoes.modelo ?? process.env["ANALISE_MODELO"];
    const analiseKey = opcoes.apiKey ?? process.env["ANALISE_API_KEY"];

    const geminiKey = process.env["GEMINI_API_KEY"];
    const openAiKey = process.env["OPENAI_API_KEY"];

    if (analiseUrl) {
      this.url = analiseUrl;
      this.modelo =
        analiseModelo ??
        (analiseUrl.includes("generativelanguage") ? "gemini-3.5-flash-lite" : "gpt-4o-mini");
      this.apiKey = analiseKey ?? geminiKey ?? openAiKey;
    } else if (
      geminiKey &&
      (!openAiKey || process.env["ANALISE_PROVEDOR"] === "gemini" || analiseKey === geminiKey)
    ) {
      this.url = "https://generativelanguage.googleapis.com/v1beta/openai";
      this.modelo = analiseModelo ?? "gemini-3.5-flash-lite";
      this.apiKey = geminiKey;
    } else {
      this.url = process.env["OPENAI_API_URL"] ?? "https://api.openai.com/v1";
      this.modelo = analiseModelo ?? process.env["OPENAI_MODELO"] ?? "gpt-4o-mini";
      this.apiKey = analiseKey ?? openAiKey ?? geminiKey;
    }

    this.timeoutMs = opcoes.timeoutMs ?? Number(process.env["ANALISE_TIMEOUT_MS"] ?? 180_000);
    this.buscar = opcoes.fetchImpl ?? fetch;
  }

  async gerar(prompt: string): Promise<string> {
    if (!this.modelo) {
      throw new Error("Modelo de IA não configurado para análise (ANALISE_MODELO)");
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.apiKey) {
      headers["authorization"] = `Bearer ${this.apiKey}`;
    }

    const endpoint = this.url.endsWith("/chat/completions")
      ? this.url
      : `${this.url.replace(/\/+$/, "")}/chat/completions`;

    const sinal = AbortSignal.timeout(this.timeoutMs);

    const systemContent = [
      "Você é o consultor sênior de inteligência técnica em licitações e contratações públicas brasileiras (Lei nº 14.133/2021 consolidada, atualizada para 2026 pelo Decreto nº 12.807/2025 e jurisprudência pacificada do TCU).",
      "Sua missão é auditar os documentos oficiais do certame para defender a segurança jurídica, as margens comerciais e a saúde de caixa da empresa fornecedora/construtora.",
      "Estruture a análise com rigor cirúrgico e responda exclusivamente em formato JSON válido conforme solicitado.",
    ].join("\n\n");

    const enviarRequisicao = async (modeloRequisicao: string, targetEndpoint = endpoint, targetHeaders = headers) => {
      return this.buscar(targetEndpoint, {
        method: "POST",
        headers: targetHeaders,
        signal: sinal,
        body: JSON.stringify({
          model: modeloRequisicao,
          messages: [
            {
              role: "system",
              content: systemContent,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
      });
    };

    let resposta: Response;
    try {
      resposta = await enviarRequisicao(this.modelo);
    } catch (erro) {
      if (erro instanceof Error && erro.name === "TimeoutError") {
        throw new Error(
          `Tempo limite de ${Math.round(this.timeoutMs / 1000)}s excedido ao consultar o modelo de IA`,
        );
      }
      throw new Error(
        `Falha na comunicação com o modelo de IA: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }

    // Tolerância a picos temporários de demanda (503 / 429): retenta com modelos alternativos ou backoff
    if (!resposta.ok && (resposta.status === 503 || resposta.status === 429)) {
      const modelosAlternativos = this.url.includes("generativelanguage")
        ? ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash"].filter(
            (m) => m !== this.modelo,
          )
        : [];

      for (const modeloAlt of [this.modelo, ...modelosAlternativos]) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const tentada = await enviarRequisicao(modeloAlt);
          if (tentada.ok) {
            resposta = tentada;
            break;
          }
        } catch {
          // segue tentando próximo modelo da fila de resiliência
        }
      }
    }

    if (!resposta.ok) {
      const textoErro = await resposta.text().catch(() => "");

      // Fallback resiliente: se der HTTP 401 na OpenAI e houver GEMINI_API_KEY válida, executa com Gemini
      const geminiKey = process.env["GEMINI_API_KEY"];
      if (
        resposta.status === 401 &&
        geminiKey &&
        !this.url.includes("generativelanguage.googleapis.com")
      ) {
        try {
          const fallbackEndpoint =
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
          const fallbackHeaders = {
            "content-type": "application/json",
            authorization: `Bearer ${geminiKey}`,
          };
          const fallbackResposta = await enviarRequisicao("gemini-3.5-flash-lite", fallbackEndpoint, fallbackHeaders);

          if (fallbackResposta.ok) {
            const corpoFb = (await fallbackResposta.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const conteudoFb = corpoFb.choices?.[0]?.message?.content;
            if (conteudoFb && conteudoFb.trim().length > 0) {
              return conteudoFb;
            }
          }
        } catch {
          // Ignora e continua para o erro original caso o fallback também falhe
        }
      }

      if (resposta.status === 429) {
        throw new Error(
          "Cota de requisições da IA temporariamente atingida (HTTP 429). Por favor, aguarde cerca de 1 minuto antes de tentar novamente.",
        );
      }

      if (resposta.status === 503) {
        throw new Error(
          "O provedor de IA está com alta demanda temporária (HTTP 503). Por favor, tente novamente em instantes.",
        );
      }

      throw new Error(`Modelo de IA respondeu HTTP ${resposta.status}: ${textoErro.slice(0, 200)}`);
    }

    const corpo = (await resposta.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const conteudo = corpo.choices?.[0]?.message?.content;
    if (!conteudo || conteudo.trim().length === 0) {
      throw new Error("O modelo de IA retornou uma resposta vazia");
    }

    return conteudo;
  }
}

export function criarGeradorChat(opcoes?: OpcoesGeradorChat): GeradorChat {
  return new GeradorChatOpenAI(opcoes);
}
