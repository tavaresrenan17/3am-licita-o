export interface PontoGeografico {
  lat: number;
  lon: number;
}

export interface CidadeCoordenada {
  codigo_ibge?: string;
  nome: string;
  uf: string;
  lat: number;
  lon: number;
}

export interface OrigemOpcao {
  id: string;
  nome: string;
  uf: string;
  lat: number;
  lon: number;
  descricao?: string;
}
