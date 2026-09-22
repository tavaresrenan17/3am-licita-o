import type { OrigemOpcao } from "./tipos";

/**
 * Origens predefinidas do filtro por raio, com Santa Cruz do Rio Pardo/SP como
 * sede operacional prioritária.
 *
 * O `id` é o código IBGE do município e é só isso que vai para o servidor: as
 * coordenadas moram na tabela `municipios` do banco (5.571 municípios), a
 * mesma que localiza cada licitação pelo `codigo_ibge` vindo do PNCP. Guardar
 * coordenadas aqui abriria uma segunda fonte de verdade — foi um dicionário
 * local de 56 cidades, buscado pelo nome, que fazia o filtro perder metade das
 * licitações dentro do raio.
 */
export const ORIGENS_PREDEFINIDAS: OrigemOpcao[] = [
  { id: "3546405", nome: "Santa Cruz do Rio Pardo", uf: "SP", descricao: "Sede Operacional 3AM" },
  { id: "3534708", nome: "Ourinhos", uf: "SP", descricao: "Polo Regional SP/PR" },
  { id: "3506003", nome: "Bauru", uf: "SP", descricao: "Centro-Oeste Paulista" },
  { id: "3529005", nome: "Marília", uf: "SP", descricao: "Alta Paulista" },
  { id: "3541406", nome: "Presidente Prudente", uf: "SP", descricao: "Oeste Paulista" },
  { id: "3504008", nome: "Assis", uf: "SP", descricao: "Média Sorocabana" },
  { id: "3509502", nome: "Campinas", uf: "SP", descricao: "Região Metropolitana" },
  { id: "3543402", nome: "Ribeirão Preto", uf: "SP", descricao: "Norte/Nordeste Paulista" },
  { id: "3549805", nome: "São José do Rio Preto", uf: "SP", descricao: "Noroeste Paulista" },
  { id: "3552205", nome: "Sorocaba", uf: "SP", descricao: "Região Sorocaba" },
  { id: "3550308", nome: "São Paulo", uf: "SP", descricao: "Capital / SP" },
  { id: "3549904", nome: "São José dos Campos", uf: "SP", descricao: "Vale do Paraíba" },
  { id: "4106902", nome: "Curitiba", uf: "PR", descricao: "Capital / PR" },
  { id: "4113700", nome: "Londrina", uf: "PR", descricao: "Norte do Paraná" },
  { id: "4115200", nome: "Maringá", uf: "PR", descricao: "Noroeste do Paraná" },
  { id: "3106200", nome: "Belo Horizonte", uf: "MG", descricao: "Capital / MG" },
  { id: "3304557", nome: "Rio de Janeiro", uf: "RJ", descricao: "Capital / RJ" },
  { id: "5300108", nome: "Brasília", uf: "DF", descricao: "Distrito Federal" },
  { id: "5208707", nome: "Goiânia", uf: "GO", descricao: "Capital / GO" },
];

// A lista acima é literal e nunca vazia.
export const ORIGEM_PADRAO: OrigemOpcao = ORIGENS_PREDEFINIDAS[0]!;
