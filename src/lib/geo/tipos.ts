export interface OrigemOpcao {
  /** Código IBGE do município (7 dígitos). */
  id: string;
  nome: string;
  uf: string;
  descricao?: string;
}
