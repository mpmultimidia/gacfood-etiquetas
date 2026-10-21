export type Lista = { id: string; nome: string; ativo: boolean };

export type Produto = {
  id: string;
  nome: string;
  descricao: string | null;
  filial_id: string | null;
  setor_id: string | null;
  categoria_id: string | null;
  praca_ids: string[];
  unidade: string | null;
  ativo: boolean;
  filial?: { nome: string } | null;
  setor?: { nome: string } | null;
  categoria?: { nome: string } | null;
};

export type Etiqueta = {
  id: string;
  codigo: string;
  lote: string;
  grupo_id: string;
  produto_id: string | null;
  produto_nome: string;
  filial_id: string | null;
  filial_nome: string | null;
  setor_nome: string | null;
  categoria_nome: string;
  armazenamento: string | null;
  pracas: string[];
  quantidade_produzida: number | null;
  unidade: string | null;
  peso_gramas: number | null;
  marca: string | null;
  sif: string | null;
  validade_original: string | null;
  dias_validade: number;
  validade: string;
  manipulado_em: string;
  status: "ativa" | "baixada" | "cancelada";
  baixada_em: string | null;
  baixada_por_nome: string | null;
  motivo_cancelamento: string | null;
  responsavel_nome: string;
  created_at: string;
  vencida?: boolean;
  situacao?: "ativa" | "baixada" | "cancelada" | "vencida";
};

export type Perfil = { user_id: string; nome: string; email: string | null; ativo: boolean };
export type PrintJob = { id: string; status: "pendente" | "imprimindo" | "ok" | "erro"; erro: string | null; etiqueta_id: string };
export type ListaNome = "filiais" | "setores" | "categorias" | "pracas" | "armazenamentos" | "motivos_cancelamento";
