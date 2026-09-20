import { describe, expect, it } from "vitest";

import { percentil, resumoLatencia } from "./estatistica.mjs";

describe("percentil", () => {
  it("lista vazia devolve null", () => {
    expect(percentil([], 50)).toBeNull();
    expect(percentil([], 99)).toBeNull();
  });

  it("um unico valor e o percentil em qualquer p", () => {
    expect(percentil([42], 50)).toBe(42);
    expect(percentil([42], 95)).toBe(42);
    expect(percentil([42], 99)).toBe(42);
  });

  it("lista conhecida de 10 valores: p50=500, p95=1000, p99=1000", () => {
    const valores = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(percentil(valores, 50)).toBe(500);
    expect(percentil(valores, 95)).toBe(1000);
    expect(percentil(valores, 99)).toBe(1000);
  });
});

describe("resumoLatencia", () => {
  it("lista vazia: amostras 0 e demais campos null", () => {
    expect(resumoLatencia([])).toEqual({
      amostras: 0,
      p50: null,
      p95: null,
      p99: null,
      min: null,
      max: null,
      media: null,
    });
  });

  it("um unico valor: p50 = p95 = p99 = esse valor, min = max = media", () => {
    expect(resumoLatencia([42])).toEqual({
      amostras: 1,
      p50: 42,
      p95: 42,
      p99: 42,
      min: 42,
      max: 42,
      media: 42,
    });
  });

  it("lista conhecida de 10 valores produz o resumo esperado", () => {
    const valores = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(resumoLatencia(valores)).toEqual({
      amostras: 10,
      p50: 500,
      p95: 1000,
      p99: 1000,
      min: 100,
      max: 1000,
      media: 550,
    });
  });

  it("nao depende da ordem de entrada: a mesma lista embaralhada produz o mesmo resumo", () => {
    const ordenada = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const embaralhada = [700, 100, 900, 300, 1000, 200, 800, 400, 600, 500];
    expect(resumoLatencia(embaralhada)).toEqual(resumoLatencia(ordenada));
  });

  it("um outlier unico em 100 amostras nao domina o p50 (o defeito que motivou esta tarefa)", () => {
    // 99 amostras rapidas e estaveis (110ms) mais um outlier de carregamento de
    // indice (5091ms, como o medido em producao). Com uma amostra de 12 (o
    // tamanho antigo do harness), esse unico valor virava o p95 inteiro por
    // nearest-rank apontar direto para o maior indice — e o relatorio acusava
    // reprovacao por causa de UMA leitura de indice frio, nao da consulta.
    // Com 100 amostras, nearest-rank aponta para indices que ainda estao
    // dentro do bloco de 99 valores baixos: p50, p95 e p99 ficam imunes ao
    // outlier, que so aparece onde deve — no maximo observado.
    const amostras = [...Array(99).fill(110), 5091];
    const resumo = resumoLatencia(amostras);
    expect(resumo.amostras).toBe(100);
    expect(resumo.p50).toBe(110);
    expect(resumo.p95).toBe(110);
    expect(resumo.p99).toBe(110);
    expect(resumo.max).toBe(5091);
  });
});
