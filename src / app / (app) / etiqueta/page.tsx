"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useListas } from "@/lib/listas";
import { msgErro } from "@/lib/erros";
import { diasEntre, fmtData, hojeSP, somarDias } from "@/lib/tempo";
import type { Etiqueta, Produto } from "@/lib/tipos";
import SelectComNovo from "@/components/SelectComNovo";
import PracasChips from "@/components/PracasChips";
import Scanner from "@/components/Scanner";
import StatusImpressao from "@/components/StatusImpressao";
import AgenteStatus from "@/components/AgenteStatus";
import EtiquetaDetalhe from "@/components/EtiquetaDetalhe";

const LIMITE = 50;
const SELECT_PRODUTO = "*, filial:filiais(nome), setor:setores(nome), categoria:categorias(nome)";

type Form = {
  categoria: string; armazenamento: string; pracas: string[];
  qtdProduzida: string; unidade: string; peso: string; marca: string; sif: string;
  validadeOriginal: string; dias: string; validade: string; qtdEtiquetas: string;
};
const FORM_VAZIO: Form = {
  categoria: "", armazenamento: "", pracas: [], qtdProduzida: "", unidade: "", peso: "", marca: "", sif: "",
  validadeOriginal: "", dias: "", validade: "", qtdEtiquetas: "",
};

export default function EtiquetaPagina() {
  return (
    <Suspense fallback={<div className="vazio">Carregando…</div>}>
      <Conteudo />
    </Suspense>
  );
}

function Conteudo() {
  const params = useSearchParams();
  const baseId = params.get("base");
  const { listas, recarregar } = useListas();
  const [modo, setModo] = useState<"gerar" | "baixar">("gerar");

  // ---------- produto / busca ----------
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [produto, setProduto] = useState<Produto | null>(null);
  const [historico, setHistorico] = useState<Etiqueta[]>([]);
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<{ grupoId: string; etiquetas: Etiqueta[] } | null>(null);
  const baseAplicada = useRef<string | null>(null);

  const atualizar = (parcial: Partial<Form>) => setForm((f) => ({ ...f, ...parcial }));

  // pesquisa (lupa)
  useEffect(() => {
    let ativo = true;
    const t = setTimeout(async () => {
      let q = supabase.from("produtos").select(SELECT_PRODUTO).eq("ativo", true).limit(20);
      const s = busca.trim().replace(/[,()%*\\]/g, " ");
      if (s) q = q.or(`nome.ilike.%${s}%,descricao.ilike.%${s}%`).order("nome");
      else q = q.order("updated_at", { ascending: false });
      const { data } = await q;
      if (ativo) setResultados((data as Produto[]) ?? []);
    }, 250);
    return () => { ativo = false; clearTimeout(t); };
  }, [busca]);

  const carregarHistorico = useCallback(async (produtoId: string) => {
    const { data } = await supabase.from("etiquetas").select("*").eq("produto_id", produtoId).order("created_at", { ascending: false }).limit(15);
    setHistorico((data as Etiqueta[]) ?? []);
  }, []);

  const escolherProduto = useCallback((p: Produto, base?: Etiqueta) => {
    setProduto(p);
    setResultado(null);
    setErro("");
    carregarHistorico(p.id);
    if (base) {
      const dias = base.dias_validade;
      setForm({
        categoria: base.categoria_nome,
        armazenamento: base.armazenamento ?? "",
        pracas: base.pracas ?? [],
        qtdProduzida: base.quantidade_produzida != null ? String(base.quantidade_produzida) : "",
        unidade: base.unidade ?? p.unidade ?? "",
        peso: base.peso_gramas != null ? String(base.peso_gramas) : "",
        marca: base.marca ?? "",
        sif: base.sif ?? "",
        validadeOriginal: base.validade_original ?? "",
        dias: String(dias),
        validade: somarDias(hojeSP(), dias), // a data é recalculada a partir de hoje
        qtdEtiquetas: "",
      });
    } else {
      setForm({
        ...FORM_VAZIO,
        categoria: p.categoria?.nome ?? "",
        pracas: (p.praca_ids ?? []).map((id) => listas.pracas.find((x) => x.id === id)?.nome).filter((n): n is string => Boolean(n)),
        unidade: p.unidade ?? "",
      });
    }
  }, [carregarHistorico, listas.pracas]);

  // "Usar como base" vindo do Dashboard (?base=<id da etiqueta>)
  useEffect(() => {
    if (!baseId || baseAplicada.current === baseId || listas.pracas === undefined) return;
    baseAplicada.current = baseId;
    (async () => {
      const { data: e } = await supabase.from("etiquetas").select("*").eq("id", baseId).maybeSingle();
      if (!e?.produto_id) { setErro("O produto dessa etiqueta não está mais cadastrado."); return; }
      const { data: p } = await supabase.from("produtos").select(SELECT_PRODUTO).eq("id", e.produto_id).eq("ativo", true).maybeSingle();
      if (!p) { setErro("O produto dessa etiqueta está inativo ou foi removido."); return; }
      escolherProduto(p as Produto, e as Etiqueta);
    })();
  }, [baseId, escolherProduto, listas.pracas]);

  // ---------- dias de validade <-> data de validade (horário de Brasília) ----------
  function mudouDias(v: string) {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 3650) atualizar({ dias: v, validade: somarDias(hojeSP(), n) });
    else atualizar({ dias: v });
  }
  function mudouValidade(v: string) {
    if (!v) { atualizar({ validade: "", dias: "" }); return; }
    const d = diasEntre(hojeSP(), v);
    atualizar({ validade: v, dias: d >= 1 ? String(d) : "" });
  }

  // ---------- gerar ----------
  async function gerar() {
    setErro("");
    if (gerando) return;
    if (!produto) { setErro("Selecione o produto."); return; }
    if (!form.categoria) { setErro("Selecione a categoria."); return; }
    if (!form.qtdProduzida || Number(form.qtdProduzida) <= 0) { setErro("Informe a quantidade produzida."); return; }
    if (!form.validade) { setErro("Informe a validade do produto manipulado."); return; }
    if (diasEntre(hojeSP(), form.validade) < 1) { setErro("A validade deve ser pelo menos 1 dia depois de hoje. Informe os dias de validade ou uma data futura."); return; }
    if (diasEntre(hojeSP(), form.validade) > 3650) { setErro("A validade não pode passar de 10 anos (3650 dias). Confira a data digitada."); return; }
    const n = Number(form.qtdEtiquetas);
    if (!Number.isInteger(n) || n < 1 || n > LIMITE) { setErro(`Informe a quantidade de etiquetas (de 1 a ${LIMITE}).`); return; }

    setGerando(true);
    const { data, error } = await supabase.rpc("gerar_etiquetas", {
      p_produto_id: produto.id,
      p_categoria: form.categoria,
      p_armazenamento: form.armazenamento || null,
      p_pracas: form.pracas,
      p_quantidade_produzida: Number(form.qtdProduzida),
      p_unidade: form.unidade || null,
      p_peso_gramas: form.peso ? Number(form.peso) : null,
      p_marca: form.marca || null,
      p_sif: form.sif || null,
      p_validade_original: form.validadeOriginal || null,
      p_validade: form.validade,
      p_quantidade_etiquetas: n,
    });
    setGerando(false);
    if (error) { setErro(msgErro(error)); return; }
    const lista = (data as Etiqueta[]) ?? [];
    if (lista.length !== n) { setErro(`Atenção: foram geradas ${lista.length} etiqueta(s) em vez de ${n}. Avise o responsável.`); }
    setResultado({ grupoId: lista[0]?.grupo_id, etiquetas: lista });
    atualizar({ qtdEtiquetas: "" });
    carregarHistorico(produto.id);
  }

  // ---------- baixar / consultar ----------
  const [codigo, setCodigo] = useState("");
  const [lendo, setLendo] = useState(false);
  const [scanKey, setScanKey] = useState(0);
  const [encontrada, setEncontrada] = useState<Etiqueta | null>(null);
  const [msgBaixa, setMsgBaixa] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(null);

  const buscarCodigo = useCallback(async (bruto: string, daCamera = false) => {
    const c = bruto.trim().toUpperCase();
    setMsgBaixa(null);
    if (!c) { setMsgBaixa({ tipo: "erro", texto: "Informe o código da etiqueta." }); return; }
    const { data, error } = await supabase.from("etiquetas_v").select("*").eq("codigo", c).maybeSingle();
    if (error) { setMsgBaixa({ tipo: "erro", texto: msgErro(error) }); return; }
    if (!data) {
      setEncontrada(null);
      setMsgBaixa({ tipo: "erro", texto: `Etiqueta ${c} não encontrada.` });
      if (daCamera) { setLendo(true); setScanKey((k) => k + 1); } // leitura errada: volta a escanear
      return;
    }
    setEncontrada(data as Etiqueta);
    setCodigo(c);
  }, []);

  function aoLerQr(texto: string) {
    setLendo(false);
    buscarCodigo(texto, true);
  }

  function aposAtualizar(nova: Etiqueta, acao?: "baixada" | "cancelada") {
    setEncontrada(nova);
    if (acao) {
      setMsgBaixa({ tipo: "ok", texto: acao === "baixada" ? `Baixa da etiqueta ${nova.codigo} realizada!` : `Etiqueta ${nova.codigo} cancelada.` });
    }
  }

  function proxima() {
    setEncontrada(null); setCodigo(""); setMsgBaixa(null); setLendo(true); setScanKey((k) => k + 1);
  }

  return (
    <div>
      <div className="segmentos" role="tablist">
        <button role="tab" aria-selected={modo === "gerar"} className={modo === "gerar" ? "ativo" : ""} onClick={() => setModo("gerar")}>Gerar etiqueta</button>
        <button role="tab" aria-selected={modo === "baixar"} className={modo === "baixar" ? "ativo" : ""} onClick={() => setModo("baixar")}>Baixar / consultar</button>
      </div>

      {modo === "gerar" && (
        <>
          <AgenteStatus filialId={produto?.filial_id} />

          {!produto && (
            <div className="card">
              <h2>🔍 Procurar produto</h2>
              <input placeholder="Digite o nome ou a descrição do produto" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Procurar produto" />
              <div className="lista-busca">
                {resultados.length === 0 && <div className="vazio">Nenhum produto encontrado. Cadastre em <b>Cadastros</b>.</div>}
                {resultados.map((p) => (
                  <button type="button" key={p.id} className="item" data-testid="produto-resultado" onClick={() => escolherProduto(p)}>
                    <div>
                      <div className="nome">{p.nome}</div>
                      <div className="meta">{[p.descricao, p.filial?.nome, p.setor?.nome, p.categoria?.nome].filter(Boolean).join(" · ")}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {produto && (
            <>
              <div className="produto-sel" data-testid="produto-selecionado">
                <div className="linha-campo" style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <b>{produto.nome}</b>
                    <div className="meta sub">{[produto.descricao, produto.filial?.nome, produto.setor?.nome].filter(Boolean).join(" · ")}</div>
                  </div>
                  <button type="button" className="btn pequeno secundario" onClick={() => { setProduto(null); setHistorico([]); setResultado(null); }}>Trocar</button>
                </div>
              </div>

              {historico.length > 0 && (
                <div className="card">
                  <h2>🕘 Etiquetas anteriores deste produto</h2>
                  <div className="dica" style={{ marginBottom: 8 }}>Toque em uma para usar os mesmos dados (você pode editar antes de gerar).</div>
                  {historico.map((h) => (
                    <button type="button" key={h.id} className="item" data-testid="historico-item" onClick={() => escolherProduto(produto, h)}>
                      <div>
                        <div className="nome">Lote {h.lote}</div>
                        <div className="meta">{h.categoria_nome} · {h.quantidade_produzida ?? "-"} {h.unidade ?? ""} · {h.dias_validade} dia(s) · gerada em {fmtData(h.created_at.slice(0, 10))}</div>
                      </div>
                      <span className={`badge ${h.status}`}>{h.status.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="card">
                <h2>Gerar e imprimir etiqueta</h2>

                <SelectComNovo tabela="categorias" rotulo="Categoria (Cat)" opcoes={listas.categorias} valor={form.categoria} modo="nome"
                  onChange={(v) => atualizar({ categoria: v })} aoCriar={recarregar} obrigatorio />
                <SelectComNovo tabela="armazenamentos" rotulo="Armazenamento" opcoes={listas.armazenamentos} valor={form.armazenamento} modo="nome"
                  onChange={(v) => atualizar({ armazenamento: v })} aoCriar={recarregar} />
                <PracasChips opcoes={listas.pracas} selecionadas={form.pracas} modo="nome" onChange={(v) => atualizar({ pracas: v })} aoCriar={recarregar} />

                <div className="grade2">
                  <div className="campo">
                    <label htmlFor="f-qtd">Quantidade produzida *</label>
                    <input id="f-qtd" type="number" step="0.01" inputMode="decimal" value={form.qtdProduzida} onChange={(e) => atualizar({ qtdProduzida: e.target.value })} />
                  </div>
                  <div className="campo">
                    <label htmlFor="f-un">Unidade</label>
                    <input id="f-un" value={form.unidade} onChange={(e) => atualizar({ unidade: e.target.value })} placeholder="un, kg, L…" />
                  </div>
                </div>
                <div className="campo">
                  <label htmlFor="f-peso">Peso (gramas)</label>
                  <input id="f-peso" type="number" step="1" inputMode="numeric" value={form.peso} onChange={(e) => atualizar({ peso: e.target.value })} />
                </div>
                <div className="grade2">
                  <div className="campo">
                    <label htmlFor="f-marca">Marca / Fornecedor</label>
                    <input id="f-marca" value={form.marca} onChange={(e) => atualizar({ marca: e.target.value })} />
                  </div>
                  <div className="campo">
                    <label htmlFor="f-sif">SIF</label>
                    <input id="f-sif" value={form.sif} onChange={(e) => atualizar({ sif: e.target.value })} />
                  </div>
                </div>
                <div className="campo">
                  <label htmlFor="f-vo">Val. original (fabricante)</label>
                  <input id="f-vo" type="date" value={form.validadeOriginal} onChange={(e) => atualizar({ validadeOriginal: e.target.value })} />
                </div>
                <div className="grade2">
                  <div className="campo">
                    <label htmlFor="f-dias">Dias de validade</label>
                    <input id="f-dias" type="number" min={1} step={1} inputMode="numeric" placeholder="Ex: 3" value={form.dias} onChange={(e) => mudouDias(e.target.value)} />
                  </div>
                  <div className="campo">
                    <label htmlFor="f-validade">Validade (manipulado) *</label>
                    <input id="f-validade" type="date" value={form.validade} onChange={(e) => mudouValidade(e.target.value)} />
                  </div>
                </div>
                <div className="campo">
                  <label htmlFor="f-qe">Quantidade de etiquetas * (1 a {LIMITE})</label>
                  <input id="f-qe" type="number" min={1} max={LIMITE} step={1} inputMode="numeric" placeholder="Informe a quantidade"
                    value={form.qtdEtiquetas} onFocus={(e) => e.currentTarget.select()} onChange={(e) => atualizar({ qtdEtiquetas: e.target.value })} />
                </div>

                {erro && <div className="aviso erro" role="alert" data-testid="erro-geracao">{erro}</div>}
                <button type="button" className="btn" disabled={gerando} onClick={gerar} data-testid="btn-gerar">
                  {gerando ? "Gerando…" : "🖨 Gerar e imprimir etiqueta"}
                </button>

                {resultado && resultado.grupoId && (
                  <div data-testid="resultado-geracao">
                    <div className="aviso ok">
                      {resultado.etiquetas.length === 1 ? "1 etiqueta gerada" : `${resultado.etiquetas.length} etiquetas geradas`}: {resultado.etiquetas.map((e) => e.codigo).join(", ")}
                    </div>
                    <StatusImpressao grupoId={resultado.grupoId} />
                  </div>
                )}
              </div>
            </>
          )}
          {!produto && erro && <div className="aviso erro">{erro}</div>}
        </>
      )}

      {modo === "baixar" && (
        <>
          <div className="card">
            <h2>Baixar etiqueta</h2>
            {!lendo && !encontrada && (
              <button type="button" className="btn grande" onClick={() => { setLendo(true); setScanKey((k) => k + 1); setMsgBaixa(null); }} data-testid="btn-abrir-camera">
                📷 Escanear com a câmera
              </button>
            )}
            {lendo && <Scanner key={scanKey} onLer={aoLerQr} onFechar={() => setLendo(false)} />}
            <div className="campo" style={{ marginTop: 10 }}>
              <label htmlFor="f-codigo">Ou digite o código</label>
              <div className="linha-campo">
                <input id="f-codigo" value={codigo} style={{ textTransform: "uppercase" }} maxLength={12} onChange={(e) => setCodigo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") buscarCodigo(codigo); }} />
                <button type="button" className="btn pequeno secundario" onClick={() => { setLendo(false); buscarCodigo(codigo); }} data-testid="btn-buscar-codigo">Buscar</button>
              </div>
            </div>
            {msgBaixa && <div className={`aviso ${msgBaixa.tipo}`} data-testid="msg-baixa">{msgBaixa.texto}</div>}
          </div>

          {encontrada && (
            <div className="card">
              <EtiquetaDetalhe etiqueta={encontrada} motivos={listas.motivos_cancelamento} recarregarListas={recarregar} aoAtualizar={aposAtualizar} destaqueBaixa />
              <button type="button" className="btn secundario" onClick={proxima} data-testid="btn-proxima">📷 Escanear a próxima</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
