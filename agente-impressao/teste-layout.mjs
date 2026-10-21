import fs from "node:fs";
import { criarMontador } from "./tspl.mjs";
const montar = criarMontador();
const empresa = { nome: "XXX Restaurante Gourmet", cnpj: "12.345.678/0001-90" };
const base = { codigo: "BVG647", lote: "FEI201026001".slice(0, 13), responsavel_nome: "Elton john", manipulado_em: "2026-10-20T02:30:00Z", validade: "2026-10-23", categoria_nome: "Manipulado" };
const casos = {
  feijao_completo: { ...base, produto_nome: "Feijão cozido", quantidade_produzida: 1, unidade: "unidade", armazenamento: "Refrigerado", pracas: ["Guarnição"], setor_nome: "Guarnição", peso_gramas: 500, marca: "Camil", sif: "1511", validade_original: "2026-12-20" },
  pior_caso: { ...base, codigo: "ZZ9999", lote: "MOL2010260012", responsavel_nome: "Maria Aparecida dos Santos Silva", produto_nome: "Molho de tomate artesanal com manjericao fresco e alho", quantidade_produzida: 2.5, unidade: "kg", categoria_nome: "em_producao", armazenamento: "Congelado a -18 graus", pracas: ["Guarnição", "Grill", "Fria", "Chapa", "Fritadeira", "Forno"], setor_nome: "Cozinha quente e confeitaria", peso_gramas: 2500, marca: "Marca Muito Longa Alimentos Ltda", sif: "12345", validade_original: "2026-12-20" },
  minimo: { ...base, codigo: "A1B2C3", lote: "ARR2010260001", responsavel_nome: "Ana", produto_nome: "Arroz", pracas: [] },
  so_praca_setor: { ...base, codigo: "PQ12RS", produto_nome: "Bacalhau Salgado", quantidade_produzida: 3, unidade: "kg", pracas: ["Grill", "Fria"], setor_nome: "Cozinha Quente", marca: "JBS", sif: "1511", peso_gramas: 1000 },
};
const saida = {};
for (const [k, v] of Object.entries(casos)) saida[k] = montar(v, empresa);
fs.writeFileSync("tspl-casos.json", JSON.stringify(saida, null, 1));
// regra de fuso: 02:30 UTC do dia 20 = 23:30 do dia 19 em Brasília
if (!saida.feijao_completo.includes("Manip.: 19/10/2026")) { console.error("FALHA: data de manipulação fora do horário de Brasília"); process.exit(1); }
if (!saida.feijao_completo.includes("Valid.: 23/10/2026")) { console.error("FALHA: validade"); process.exit(1); }
// comando completo: começa com SIZE, termina com PRINT 1, 1 etiqueta por comando
for (const [k, t] of Object.entries(saida)) {
  if (!t.startsWith("SIZE 60 mm,60 mm") || !t.endsWith("PRINT 1") || (t.match(/PRINT 1/g) || []).length !== 1) { console.error("FALHA estrutura", k); process.exit(1); }
  if (/[^\x00-\x7F]/.test(t)) { console.error("FALHA: caractere não-ASCII no padrão sem acentos em", k); process.exit(1); }
}
console.log("layout gerado:", Object.keys(saida).join(", "));
