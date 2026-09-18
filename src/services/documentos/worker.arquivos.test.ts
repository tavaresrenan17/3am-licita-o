import { describe, expect, it } from "vitest";
import {
  executarTickArquivos,
  type GravacaoArquivo,
  type PortaArquivos,
} from "./worker.arquivos.server";

function bancoFalso(
  fila: Array<{
    documentoId: string;
    licitacaoId: string;
    url: string;
    nome: string;
    tipoDocumento: string;
  }>,
) {
  const gravado: GravacaoArquivo[] = [];
  const banco: PortaArquivos = {
    async reservar(limite) {
      return fila.splice(0, limite);
    },
    async gravar(g) {
      gravado.push(g);
    },
  };
  return { banco, gravado };
}

const item = (id: string) => ({
  documentoId: id,
  licitacaoId: `lic-${id}`,
  url: `https://pncp/${id}`,
  nome: `doc ${id}`,
  tipoDocumento: "edital",
});

describe("executarTickArquivos", () => {
  it("grava texto extraído quando o download e a extração dão certo", async () => {
    const { banco, gravado } = bancoFalso([item("1")]);
    const resumo = await executarTickArquivos({
      banco,
      intervaloPartidaMs: 0,
      baixar: async () => ({
        ok: true,
        bytes: new Uint8Array([1]),
        sha256: "abc",
        tamanho: 1,
        tipo: { nomeArquivo: "a.pdf", extensao: "pdf", mime: "application/pdf", suportado: true },
      }),
      extrair: async () => ({
        texto: "objeto do edital",
        paginas: 2,
        chars: 800,
        densidade: 400,
        estado: "extraido",
      }),
    });
    expect(resumo.extraidos).toBe(1);
    expect(gravado[0]!.estado).toBe("extraido");
    expect(gravado[0]!.texto).toBe("objeto do edital");
    expect(gravado[0]!.sha256).toBe("abc");
  });

  it("arquivo acima do teto vira grande_demais e não tenta extrair", async () => {
    const { banco, gravado } = bancoFalso([item("1")]);
    let extraiu = false;
    const resumo = await executarTickArquivos({
      banco,
      intervaloPartidaMs: 0,
      baixar: async () => ({ ok: false, motivo: "grande_demais", detalhe: "grande", tamanho: 99 }),
      extrair: async () => {
        extraiu = true;
        throw new Error("não deveria extrair");
      },
    });
    expect(extraiu).toBe(false);
    expect(resumo.grandesDemais).toBe(1);
    expect(gravado[0]!.estado).toBe("grande_demais");
  });

  it("formato não suportado é registrado como erro visível, não ignorado", async () => {
    const { banco, gravado } = bancoFalso([item("1")]);
    await executarTickArquivos({
      banco,
      intervaloPartidaMs: 0,
      baixar: async () => ({
        ok: true,
        bytes: new Uint8Array([1]),
        sha256: "abc",
        tamanho: 1,
        tipo: { nomeArquivo: "a.zip", extensao: "zip", mime: "application/zip", suportado: false },
      }),
      extrair: async () => {
        throw new Error("não deveria extrair");
      },
    });
    expect(gravado[0]!.estado).toBe("erro");
    expect(gravado[0]!.erro).toContain("formato_nao_suportado");
  });

  it("um arquivo problemático não derruba o lote", async () => {
    const { banco, gravado } = bancoFalso([item("1"), item("2")]);
    const resumo = await executarTickArquivos({
      banco,
      intervaloPartidaMs: 0,
      concorrencia: 1,
      baixar: async (url) => {
        if (url.endsWith("1")) throw new Error("rede caiu");
        return {
          ok: true,
          bytes: new Uint8Array([1]),
          sha256: "abc",
          tamanho: 1,
          tipo: { nomeArquivo: "a.pdf", extensao: "pdf", mime: "application/pdf", suportado: true },
        };
      },
      extrair: async () => ({
        texto: "t",
        paginas: 1,
        chars: 300,
        densidade: 300,
        estado: "extraido",
      }),
    });
    expect(resumo.processados).toBe(2);
    expect(resumo.extraidos).toBe(1);
    expect(resumo.erros).toHaveLength(1);
  });

  it("PDF escaneado vira sem_texto e não guarda texto vazio", async () => {
    const { banco, gravado } = bancoFalso([item("1")]);
    const resumo = await executarTickArquivos({
      banco,
      intervaloPartidaMs: 0,
      baixar: async () => ({
        ok: true,
        bytes: new Uint8Array([1]),
        sha256: "abc",
        tamanho: 1,
        tipo: { nomeArquivo: "a.pdf", extensao: "pdf", mime: "application/pdf", suportado: true },
      }),
      extrair: async () => ({
        texto: "x",
        paginas: 40,
        chars: 1,
        densidade: 0.025,
        estado: "sem_texto",
      }),
    });
    expect(resumo.semTexto).toBe(1);
    expect(gravado[0]!.estado).toBe("sem_texto");
    expect(gravado[0]!.texto).toBeNull();
  });

  it("reserva vazia encerra o tick sinalizando fila vazia", async () => {
    const { banco } = bancoFalso([]);
    const resumo = await executarTickArquivos({ banco, intervaloPartidaMs: 0 });
    expect(resumo.filaVazia).toBe(true);
    expect(resumo.processados).toBe(0);
  });
});
