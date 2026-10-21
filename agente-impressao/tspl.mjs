// Monta o comando TSPL da etiqueta (60 x 60 mm, 203 dpi = 480 x 480 pontos).
// Só usa recursos já confirmados na impressora do cliente: TEXT com fonte "3" (16x24) e "1" (8x12) em escala 1x1,
// QRCODE e PRINT. Sem BAR: as réguas são feitas com "_". Negrito = texto impresso duas vezes com 1 ponto de deslocamento.
// Datas/horas sempre no horário de Brasília (America/Sao_Paulo), independente do fuso do computador.

export const FUSO = "America/Sao_Paulo";
const LARGURA = 480, MARGEM = 16, UTIL = LARGURA - MARGEM * 2, F3 = 16, F1 = 8;
const Y_TITULO = 10, Y_REGUA_TOPO = 64, Y_CORPO = 74, PASSO = 28;
const Y_REGUA_RODAPE = 298, Y_RODAPE = 312, PASSO_RODAPE = 28, Y_EMPRESA = 458;
const QR_X = 344, QR_Y = 316, QR_CELULA = 6;
const ALTURA_CORPO = Y_REGUA_RODAPE - 8 - Y_CORPO; // 216 pontos para os dados do produto
const MAX_F3 = 27; // caracteres por linha na fonte 3 (largura total)
const MAX_F1 = 55; // caracteres por linha na fonte 1

const fmtData = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });

export function dataBrDeInstante(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "-" : fmtData.format(d);
}
export function dataBrDeDia(iso) {
  if (!iso) return "-";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : String(iso);
}

export function criarMontador({ manterAcentos = false } = {}) {
  const limpar = (t, max = 100) => {
    let s = String(t ?? "");
    if (!manterAcentos) s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return s.replace(/"/g, "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  };
  const maiuscula1 = (t) => { const s = String(t ?? "").replace(/_/g, " ").trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

  const texto = (out, x, y, fonte, conteudo, negrito = false) => {
    const s = limpar(conteudo);
    if (!s) return;
    out.push(`TEXT ${x},${y},"${fonte}",0,1,1,"${s}"`);
    if (negrito) out.push(`TEXT ${x + 1},${y},"${fonte}",0,1,1,"${s}"`);
  };
  const regua = (out, y) => {
    const traco = "_".repeat(Math.floor(UTIL / F3));
    out.push(`TEXT ${MARGEM},${y - 21},"3",0,1,1,"${traco}"`);
    out.push(`TEXT ${MARGEM},${y - 19},"3",0,1,1,"${traco}"`);
  };
  const centro = (n, larg) => Math.max(MARGEM, Math.floor((LARGURA - n * larg) / 2));

  function quebrarTitulo(nome) {
    if (nome.length <= MAX_F3) return [nome];
    let l1 = "";
    for (const p of nome.split(" ")) { const t = l1 ? `${l1} ${p}` : p; if (t.length > MAX_F3) break; l1 = t; }
    if (!l1) l1 = nome.slice(0, MAX_F3);
    const resto = nome.slice(l1.length).trim().slice(0, MAX_F3);
    return resto ? [l1, resto] : [l1];
  }

  // Um item longo ocupa até 2 linhas (a 2ª recuada); além disso é cortado.
  function linhasDoItem(t, maxLinhas = 2) {
    if (t.length <= MAX_F3) return [t];
    if (maxLinhas < 2) return [t.slice(0, MAX_F3 - 2) + ".."];
    let corte = Math.max(t.lastIndexOf(", ", MAX_F3), t.lastIndexOf(" ", MAX_F3));
    if (corte < 10) corte = MAX_F3;
    const l1 = t.slice(0, corte + (t[corte] === "," ? 1 : 0)).trimEnd();
    const resto = t.slice(l1.length).replace(/^[,\s]+/, "");
    const l2 = "  " + (resto.length > MAX_F3 - 2 ? resto.slice(0, MAX_F3 - 4) + ".." : resto);
    return [l1, l2];
  }

  // Agrupa em linhas: dois itens curtos lado a lado (colunas x=16 e x=250); senão um por linha.
  function empacotar(itens, maxLinhasItem) {
    const linhas = [];
    for (let i = 0; i < itens.length; ) {
      const a = itens[i], b = itens[i + 1];
      if (b && a.length <= 14 && b.length <= 13) { linhas.push({ par: [a, b] }); i += 2; }
      else { for (const l of linhasDoItem(a, maxLinhasItem)) linhas.push({ uma: l }); i += 1; }
    }
    return linhas;
  }

  function compactar(itens) {
    const linhas = []; let atual = "";
    for (const it of itens) {
      const t = it.length > MAX_F1 ? it.slice(0, MAX_F1 - 2) + ".." : it;
      if (atual && (atual + "   " + t).length > MAX_F1) { linhas.push(atual); atual = t; } else atual = atual ? atual + "   " + t : t;
    }
    if (atual) linhas.push(atual);
    return linhas;
  }

  const altura = (grandes, compactos) => grandes.length * PASSO + (compactos.length ? compactos.length * 16 + 6 : 0);

  return function montar(e, empresa = {}) {
    const out = ["SIZE 60 mm,60 mm", "GAP 2 mm,0 mm", "CLS"];

    // ---- título ----
    const titulo = quebrarTitulo(limpar(e.produto_nome, 54));
    if (titulo.length === 1) texto(out, centro(titulo[0].length, F3), Y_TITULO + 12, "3", titulo[0], true);
    else { texto(out, centro(titulo[0].length, F3), Y_TITULO, "3", titulo[0], true); texto(out, centro(titulo[1].length, F3), Y_TITULO + 26, "3", titulo[1], true); }
    regua(out, Y_REGUA_TOPO);

    // ---- dados do produto (só o que tem valor), por prioridade ----
    const qtd = e.quantidade_produzida != null ? `${e.quantidade_produzida} ${e.unidade ?? ""}`.trim() : "";
    const peso = e.peso_gramas != null && Number(e.peso_gramas) > 0 ? `${Number(e.peso_gramas).toFixed(0)}g` : "";
    const lista = [
      ["Qtd", qtd, "fixo"], ["Cat", maiuscula1(e.categoria_nome), "fixo"], ["Arm", e.armazenamento, "fixo"],
      ["Praca", Array.isArray(e.pracas) ? e.pracas.join(", ") : "", "fixo"], ["Setor", e.setor_nome, "setor"],
      ["Peso", peso, "peso"], ["Marca", e.marca, "marca"], ["SIF", e.sif, "sif"],
      ["Val.Orig", e.validade_original ? dataBrDeDia(e.validade_original) : "", "vo"],
    ].map(([r, v, grupo]) => ({ texto: `${r}: ${limpar(v, 90)}`, tem: Boolean(limpar(v, 90)), grupo })).filter((x) => x.tem);

    // Se não couber em fonte grande, os menos importantes passam para linhas compactas (fonte pequena).
    const democao = ["vo", "sif", "marca", "peso", "setor"]; // do menos para o mais importante
    let grandes = lista.slice(), compactos = [], maxLinhasItem = 2;
    let rows = empacotar(grandes.map((x) => x.texto), maxLinhasItem);
    const medir = () => { rows = empacotar(grandes.map((x) => x.texto), maxLinhasItem); return altura(rows, compactar(compactos.map((x) => x.texto))); };
    for (const g of democao) {
      if (medir() <= ALTURA_CORPO) break;
      const mover = grandes.filter((x) => x.grupo === g);
      if (mover.length) { grandes = grandes.filter((x) => x.grupo !== g); compactos = lista.filter((x) => compactos.includes(x) || x.grupo === g); }
    }
    if (medir() > ALTURA_CORPO) { maxLinhasItem = 1; medir(); }
    while (altura(rows, compactar(compactos.map((x) => x.texto))) > ALTURA_CORPO && rows.length > 1) rows.pop(); // última proteção

    let y = Y_CORPO;
    for (const r of rows) {
      if (r.par) { texto(out, MARGEM, y, "3", r.par[0]); texto(out, 250, y, "3", r.par[1]); }
      else texto(out, MARGEM, y, "3", r.uma);
      y += PASSO;
    }
    const linhasCompactas = compactar(compactos.map((x) => x.texto));
    y += linhasCompactas.length ? 6 - 0 : 0;
    for (const l of linhasCompactas) { texto(out, MARGEM, y, "1", l); y += 16; }

    // ---- rodapé ----
    regua(out, Y_REGUA_RODAPE);
    let yr = Y_RODAPE;
    texto(out, MARGEM, yr, "3", `Manip.: ${dataBrDeInstante(e.manipulado_em)}`, true); yr += PASSO_RODAPE;
    texto(out, MARGEM, yr, "3", `Valid.: ${dataBrDeDia(e.validade)}`, true); yr += PASSO_RODAPE;
    texto(out, MARGEM, yr, "3", `ID: ${limpar(e.codigo, 13)}`); yr += PASSO_RODAPE;
    texto(out, MARGEM, yr, "3", `Lote: ${limpar(e.lote, 13)}`); yr += PASSO_RODAPE;
    const resp = limpar(e.responsavel_nome, 31);
    if (resp) { if (resp.length <= 13) texto(out, MARGEM, yr, "3", `Resp: ${resp}`); else texto(out, MARGEM, yr + 6, "1", `Resp.: ${resp}`); }

    out.push(`QRCODE ${QR_X},${QR_Y},L,${QR_CELULA},A,0,"${limpar(e.codigo, 13)}"`);

    const nome = limpar(empresa.nome ?? "", 54), cnpj = limpar(empresa.cnpj ?? "", 24);
    const linhaEmpresa = limpar(cnpj ? `${nome ? nome + " - " : ""}CNPJ ${cnpj}` : nome, MAX_F1);
    texto(out, MARGEM, Y_EMPRESA, "1", linhaEmpresa);

    out.push("PRINT 1");
    return out.join("\r\n");
  };
}
