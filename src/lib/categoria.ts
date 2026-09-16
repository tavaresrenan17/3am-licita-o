import { CATEGORIAS } from "./types";

/**
 * O PNCP não publica "categoria": ela é uma classificação nossa, derivada do
 * objeto da contratação. Serve para organizar a análise, nunca para descartar
 * registros — a especificação (arquivo 02 §6) proíbe usar inferência por título
 * como filtro definitivo.
 */
const REGRAS: { categoria: (typeof CATEGORIAS)[number]; termos: string[] }[] = [
  {
    categoria: "Pavimentação",
    termos: ["pavimenta", "asfalt", "recapeamento", "tapa-buraco", "cbuq", "fresagem"],
  },
  {
    categoria: "Drenagem",
    termos: ["drenagem", "galeria de agua", "galeria pluvial", "bueiro", "contencao de encosta"],
  },
  {
    categoria: "Infraestrutura urbana",
    termos: [
      "urbaniza",
      "praca",
      "calcadao",
      "paisagismo",
      "iluminacao publica",
      "saneamento",
      "abastecimento de agua",
      "esgoto",
      "orla",
    ],
  },
  {
    categoria: "Manutenção predial",
    termos: [
      "manutencao predial",
      "manutencao preventiva",
      "manutencao corretiva",
      "conservacao predial",
    ],
  },
  {
    categoria: "Serviços de engenharia",
    termos: [
      "projeto executivo",
      "projeto basico",
      "elaboracao de projeto",
      "supervisao de obra",
      "gerenciamento de obra",
      "laudo tecnico",
      "estudo tecnico",
    ],
  },
  {
    categoria: "Reforma",
    termos: ["reforma", "ampliacao", "readequacao", "revitalizacao", "restauracao", "retrofit"],
  },
  {
    categoria: "Obra nova",
    termos: [
      "construcao",
      "edificacao",
      "implantacao de",
      "terraplenagem",
      "obra de",
      "execucao de obra",
    ],
  },
];

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * Classifica o objeto em uma das categorias do produto. A ordem das regras
 * importa: "reforma de pavimentação" é pavimentação, e "construção" só vence
 * quando nenhuma classificação mais específica se aplica.
 */
export function classificarCategoria(objeto: string): string {
  const texto = normalizar(objeto);
  for (const regra of REGRAS) {
    if (regra.termos.some((t) => texto.includes(t))) return regra.categoria;
  }
  return "Outros";
}
