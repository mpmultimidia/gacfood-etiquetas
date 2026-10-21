const MENSAGENS: Record<string, string> = {
  ACESSO_NEGADO: "Acesso não liberado para este usuário.",
  QUANTIDADE_ETIQUETAS_INVALIDA: "Quantidade de etiquetas inválida (de 1 a 50).",
  DIAS_VALIDADE_INVALIDOS: "A validade deve ser pelo menos 1 dia depois de hoje.",
  VALIDADE_MUITO_LONGA: "A validade não pode passar de 10 anos (3650 dias). Confira a data digitada.",
  VALIDADE_OBRIGATORIA: "Informe a validade.",
  PRODUTO_NAO_ENCONTRADO: "Produto não encontrado ou inativo.",
  CATEGORIA_INVALIDA: "Categoria inválida. Selecione uma categoria cadastrada.",
  ARMAZENAMENTO_INVALIDO: "Armazenamento inválido. Selecione um cadastrado.",
  PRACA_INVALIDA: "Praça inválida. Selecione praças cadastradas.",
  ETIQUETA_NAO_ENCONTRADA: "Etiqueta não encontrada.",
  ETIQUETA_JA_ENCERRADA: "Esta etiqueta já foi baixada ou cancelada.",
  MOTIVO_OBRIGATORIO: "Informe o motivo do cancelamento.",
  NAO_PODE_BLOQUEAR_A_SI_MESMO: "Você não pode bloquear o seu próprio acesso.",
  CODIGO_INDISPONIVEL: "Não foi possível gerar um código único. Tente novamente.",
};

export function msgErro(e: unknown): string {
  const err = e as { message?: string; code?: string } | null;
  const texto = String(err?.message ?? e ?? "");
  for (const [codigo, msg] of Object.entries(MENSAGENS)) if (texto.includes(codigo)) return msg;
  if (err?.code === "23505") return "Já existe um registro com esse nome.";
  if (/failed to fetch|networkerror|load failed/i.test(texto)) return "Sem conexão com o servidor. Tente novamente.";
  if (/jwt|not authenticated|invalid claim/i.test(texto)) return "Sua sessão expirou. Entre novamente.";
  return texto || "Erro inesperado.";
}
