import type { CidadeCoordenada, OrigemOpcao, PontoGeografico } from "./tipos";

/**
 * Normaliza o nome da cidade para comparação sem acento, sem pontuação e em caixa baixa.
 */
export function normalizarNomeCidade(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentuação
    .replace(/[^a-z0-9\s]/g, "") // remove pontuação
    .trim()
    .replace(/\s+/g, " "); // colapsa múltiplos espaços
}

/**
 * Origens predefinidas com Santa Cruz do Rio Pardo/SP como sede operacional prioritária.
 */
export const ORIGENS_PREDEFINIDAS: OrigemOpcao[] = [
  {
    id: "3549805",
    nome: "Santa Cruz do Rio Pardo",
    uf: "SP",
    lat: -22.8989,
    lon: -49.6339,
    descricao: "Sede Operacional 3AM",
  },
  {
    id: "3536505",
    nome: "Ourinhos",
    uf: "SP",
    lat: -22.9786,
    lon: -49.8706,
    descricao: "Polo Regional SP/PR",
  },
  {
    id: "3506003",
    nome: "Bauru",
    uf: "SP",
    lat: -22.3147,
    lon: -49.0606,
    descricao: "Centro-Oeste Paulista",
  },
  {
    id: "3529005",
    nome: "Marília",
    uf: "SP",
    lat: -22.2139,
    lon: -49.9458,
    descricao: "Alta Paulista",
  },
  {
    id: "3541406",
    nome: "Presidente Prudente",
    uf: "SP",
    lat: -22.1256,
    lon: -51.3889,
    descricao: "Oeste Paulista",
  },
  {
    id: "3504008",
    nome: "Assis",
    uf: "SP",
    lat: -22.6606,
    lon: -50.4183,
    descricao: "Média Sorocabana",
  },
  {
    id: "3509502",
    nome: "Campinas",
    uf: "SP",
    lat: -22.9056,
    lon: -47.0608,
    descricao: "Região Metropolitana",
  },
  {
    id: "3543402",
    nome: "Ribeirão Preto",
    uf: "SP",
    lat: -21.1704,
    lon: -47.8103,
    descricao: "Norte/Nordeste Paulista",
  },
  {
    id: "3549904",
    nome: "São José do Rio Preto",
    uf: "SP",
    lat: -20.8113,
    lon: -49.3758,
    descricao: "Noroeste Paulista",
  },
  {
    id: "3552205",
    nome: "Sorocaba",
    uf: "SP",
    lat: -23.5015,
    lon: -47.4581,
    descricao: "Região Sorocaba",
  },
  {
    id: "3550308",
    nome: "São Paulo",
    uf: "SP",
    lat: -23.5505,
    lon: -46.6333,
    descricao: "Capital / SP",
  },
  {
    id: "3549904_sjc",
    nome: "São José dos Campos",
    uf: "SP",
    lat: -23.1896,
    lon: -45.8841,
    descricao: "Vale do Paraíba",
  },
  {
    id: "4106902",
    nome: "Curitiba",
    uf: "PR",
    lat: -25.4284,
    lon: -49.2733,
    descricao: "Capital / PR",
  },
  {
    id: "4113700",
    nome: "Londrina",
    uf: "PR",
    lat: -23.3045,
    lon: -51.1696,
    descricao: "Norte do Paraná",
  },
  {
    id: "4115200",
    nome: "Maringá",
    uf: "PR",
    lat: -23.4209,
    lon: -51.9331,
    descricao: "Noroeste do Paraná",
  },
  {
    id: "3106200",
    nome: "Belo Horizonte",
    uf: "MG",
    lat: -19.9167,
    lon: -43.9345,
    descricao: "Capital / MG",
  },
  {
    id: "3304557",
    nome: "Rio de Janeiro",
    uf: "RJ",
    lat: -22.9068,
    lon: -43.1729,
    descricao: "Capital / RJ",
  },
  {
    id: "5300108",
    nome: "Brasília",
    uf: "DF",
    lat: -15.7975,
    lon: -47.8919,
    descricao: "Distrito Federal",
  },
  {
    id: "5208707",
    nome: "Goiânia",
    uf: "GO",
    lat: -16.6869,
    lon: -49.2648,
    descricao: "Capital / GO",
  },
];

export const ORIGEM_PADRAO: OrigemOpcao = ORIGENS_PREDEFINIDAS[0];

/**
 * Base de cidades mapeadas com coordenadas para busca e cálculo rápido de distância.
 */
export const DICIONARIO_CIDADES: CidadeCoordenada[] = [
  // Cidades do arquivo de instrução e principais polos de SP/PR/MG/RJ/DF
  { codigo_ibge: "3550308", nome: "São Paulo", uf: "SP", lat: -23.5505, lon: -46.6333 },
  { codigo_ibge: "3549805", nome: "Santa Cruz do Rio Pardo", uf: "SP", lat: -22.8989, lon: -49.6339 },
  { codigo_ibge: "3536505", nome: "Ourinhos", uf: "SP", lat: -22.9786, lon: -49.8706 },
  { codigo_ibge: "3506003", nome: "Bauru", uf: "SP", lat: -22.3147, lon: -49.0606 },
  { codigo_ibge: "3529005", nome: "Marília", uf: "SP", lat: -22.2139, lon: -49.9458 },
  { codigo_ibge: "3541406", nome: "Presidente Prudente", uf: "SP", lat: -22.1256, lon: -51.3889 },
  { codigo_ibge: "3503208", nome: "Araraquara", uf: "SP", lat: -21.7946, lon: -48.1766 },
  { codigo_ibge: "3548906", nome: "São Carlos", uf: "SP", lat: -22.0175, lon: -47.8908 },
  { codigo_ibge: "3543402", nome: "Ribeirão Preto", uf: "SP", lat: -21.1704, lon: -47.8103 },
  { codigo_ibge: "3549904", nome: "São José do Rio Preto", uf: "SP", lat: -20.8113, lon: -49.3758 },
  { codigo_ibge: "3509502", nome: "Campinas", uf: "SP", lat: -22.9056, lon: -47.0608 },
  { codigo_ibge: "3552205", nome: "Sorocaba", uf: "SP", lat: -23.5015, lon: -47.4581 },
  { codigo_ibge: "3549904_sjc", nome: "São José dos Campos", uf: "SP", lat: -23.1896, lon: -45.8841 },
  { codigo_ibge: "3526902", nome: "Limeira", uf: "SP", lat: -22.5647, lon: -47.4017 },
  { codigo_ibge: "3538709", nome: "Piracicaba", uf: "SP", lat: -22.7253, lon: -47.6492 },
  { codigo_ibge: "3504008", nome: "Assis", uf: "SP", lat: -22.6606, lon: -50.4183 },
  { codigo_ibge: "3500605", nome: "Águas de Lindóia", uf: "SP", lat: -22.4764, lon: -46.6328 },
  { codigo_ibge: "3505500", nome: "Barretos", uf: "SP", lat: -20.5572, lon: -48.5678 },
  { codigo_ibge: "3516200", nome: "Franca", uf: "SP", lat: -20.5386, lon: -47.4008 },
  { codigo_ibge: "3522109", nome: "Itapetininga", uf: "SP", lat: -23.5917, lon: -48.0531 },
  { codigo_ibge: "3522208", nome: "Itapeva", uf: "SP", lat: -23.9822, lon: -48.8761 },
  { codigo_ibge: "3524402", nome: "Jacareí", uf: "SP", lat: -23.3056, lon: -45.9658 },
  { codigo_ibge: "3525904", nome: "Jundiaí", uf: "SP", lat: -23.1857, lon: -46.8978 },
  { codigo_ibge: "3527108", nome: "Lins", uf: "SP", lat: -21.6797, lon: -49.7511 },
  { codigo_ibge: "3507506", nome: "Botucatu", uf: "SP", lat: -22.8858, lon: -48.4450 },
  { codigo_ibge: "3524006", nome: "Ipaussu", uf: "SP", lat: -23.0567, lon: -49.6267 },
  { codigo_ibge: "3510005", nome: "Cândido Mota", uf: "SP", lat: -22.7467, lon: -50.3872 },
  { codigo_ibge: "3536703", nome: "Palmital", uf: "SP", lat: -22.7889, lon: -50.2194 },
  { codigo_ibge: "3537602", nome: "Piraju", uf: "SP", lat: -23.1939, lon: -49.3839 },
  { codigo_ibge: "3504107", nome: "Avaré", uf: "SP", lat: -23.0989, lon: -48.9258 },
  { codigo_ibge: "3525300", nome: "Jaú", uf: "SP", lat: -22.2964, lon: -48.5586 },
  { codigo_ibge: "3548500", nome: "Santos", uf: "SP", lat: -23.9608, lon: -46.3336 },
  { codigo_ibge: "3554102", nome: "Taubaté", uf: "SP", lat: -23.0264, lon: -45.5553 },
  { codigo_ibge: "3501608", nome: "Americana", uf: "SP", lat: -22.7394, lon: -47.3314 },
  { codigo_ibge: "3520509", nome: "Indaiatuba", uf: "SP", lat: -23.0903, lon: -47.2181 },
  { codigo_ibge: "3547809", nome: "Santo André", uf: "SP", lat: -23.6639, lon: -46.5383 },
  { codigo_ibge: "3548708", nome: "São Bernardo do Campo", uf: "SP", lat: -23.6944, lon: -46.5653 },
  { codigo_ibge: "3534401", nome: "Osasco", uf: "SP", lat: -23.5325, lon: -46.7917 },
  { codigo_ibge: "3518800", nome: "Guarulhos", uf: "SP", lat: -23.4628, lon: -46.5333 },

  // Capitais e Polos Interestaduais
  { codigo_ibge: "3304557", nome: "Rio de Janeiro", uf: "RJ", lat: -22.9068, lon: -43.1729 },
  { codigo_ibge: "3106200", nome: "Belo Horizonte", uf: "MG", lat: -19.9167, lon: -43.9345 },
  { codigo_ibge: "4106902", nome: "Curitiba", uf: "PR", lat: -25.4284, lon: -49.2733 },
  { codigo_ibge: "4113700", nome: "Londrina", uf: "PR", lat: -23.3045, lon: -51.1696 },
  { codigo_ibge: "4115200", nome: "Maringá", uf: "PR", lat: -23.4209, lon: -51.9331 },
  { codigo_ibge: "4104808", nome: "Cascavel", uf: "PR", lat: -24.9578, lon: -53.4595 },
  { codigo_ibge: "4108304", nome: "Foz do Iguaçu", uf: "PR", lat: -25.5478, lon: -54.5881 },
  { codigo_ibge: "4119905", nome: "Ponta Grossa", uf: "PR", lat: -25.0994, lon: -50.1583 },
  { codigo_ibge: "4111258", nome: "Jacarezinho", uf: "PR", lat: -23.1611, lon: -49.9717 },
  { codigo_ibge: "4125803", nome: "Santo Antônio da Platina", uf: "PR", lat: -23.2953, lon: -50.0789 },
  { codigo_ibge: "5300108", nome: "Brasília", uf: "DF", lat: -15.7975, lon: -47.8919 },
  { codigo_ibge: "5208707", nome: "Goiânia", uf: "GO", lat: -16.6869, lon: -49.2648 },
  { codigo_ibge: "5002704", nome: "Campo Grande", uf: "MS", lat: -20.4697, lon: -54.6201 },
  { codigo_ibge: "4314902", nome: "Porto Alegre", uf: "RS", lat: -30.0346, lon: -51.2177 },
  { codigo_ibge: "4205407", nome: "Florianópolis", uf: "SC", lat: -27.5954, lon: -48.5480 },
  { codigo_ibge: "2927408", nome: "Salvador", uf: "BA", lat: -12.9777, lon: -38.5016 },
];

/**
 * Tabela hash para acesso instantâneo O(1) por nome normalizado + uf.
 */
const mapaCidades = new Map<string, CidadeCoordenada>();

for (const c of DICIONARIO_CIDADES) {
  const chave = `${normalizarNomeCidade(c.nome)}_${c.uf.toUpperCase()}`;
  mapaCidades.set(chave, c);
  // Também indexa sem UF se for único
  const chaveSemUf = normalizarNomeCidade(c.nome);
  if (!mapaCidades.has(chaveSemUf)) {
    mapaCidades.set(chaveSemUf, c);
  }
}

/**
 * Obtém as coordenadas geográficas de um município por nome e UF com tolerância a acentos.
 */
export function obterCoordenadasMunicipio(
  municipio?: string | null,
  uf?: string | null,
): PontoGeografico | null {
  if (!municipio || !municipio.trim()) return null;

  const nomeNorm = normalizarNomeCidade(municipio);
  const ufNorm = uf ? uf.trim().toUpperCase() : "";

  if (ufNorm) {
    const chaveComUf = `${nomeNorm}_${ufNorm}`;
    const encontrada = mapaCidades.get(chaveComUf);
    if (encontrada) {
      return { lat: encontrada.lat, lon: encontrada.lon };
    }
  }

  const encontradaSemUf = mapaCidades.get(nomeNorm);
  if (encontradaSemUf) {
    return { lat: encontradaSemUf.lat, lon: encontradaSemUf.lon };
  }

  return null;
}
