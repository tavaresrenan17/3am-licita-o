import { describe, expect, it } from "vitest";
import { GeradorChatOpenAI } from "./gerador.server";

describe("mensagem de sistema do gerador", () => {
  it("não cita referências normativas não verificadas", async () => {
    // O "Decreto nº 12.807/2025" virou fonte inventada em três análises.
    let corpo: { messages: { role: string; content: string }[] } | null = null;
    const gerador = new GeradorChatOpenAI({
      url: "https://exemplo.invalid/v1",
      modelo: "modelo-teste",
      apiKey: "chave",
      fetchImpl: (async (_url: string, init: RequestInit) => {
        corpo = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
          status: 200,
        });
      }) as typeof fetch,
    });

    await gerador.gerar("prompt");

    const sistema = corpo!.messages.find((m) => m.role === "system")!.content;
    expect(sistema).not.toContain("12.807");
    expect(sistema).not.toMatch(/jurisprud[êe]ncia/i);
    expect(sistema).toMatch(/JSON/);
  });
});
