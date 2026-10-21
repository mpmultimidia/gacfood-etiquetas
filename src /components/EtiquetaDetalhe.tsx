"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { msgErro } from "@/lib/erros";
import { fmtData, fmtDataHora } from "@/lib/tempo";
import type { Etiqueta, Lista } from "@/lib/tipos";
import SelectComNovo from "./SelectComNovo";
import StatusImpressao from "./StatusImpressao";

type Props = {
  etiqueta: Etiqueta;
  motivos: Lista[];
  recarregarListas: () => Promise<void> | void;
  aoAtualizar: (e: Etiqueta, acao?: "baixada" | "cancelada") => void;
  aoUsarComoBase?: (e: Etiqueta) => void;
  destaqueBaixa?: boolean;
};

function situacaoDe(e: Etiqueta): "vencida" | "ativa" | "baixada" | "cancelada" {
  return e.situacao ?? e.status;
}

const ROTULO = { ativa: "ATIVA", baixada: "BAIXADA", cancelada: "CANCELADA", vencida: "VENCIDA" } as const;

export default function EtiquetaDetalhe({ etiqueta, motivos, recarregarListas, aoAtualizar, aoUsarComoBase, destaqueBaixa }: Props) {
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [copias, setCopias] = useState("1");
  const [grupo, setGrupo] = useState<string | null>(null);
  const sit = situacaoDe(etiqueta);
  const encerrada = etiqueta.status !== "ativa";

  async function baixar() {
    setOcupado(true); setMsg(null);
    const { data, error } = await supabase.rpc("baixar_etiqueta", { p_codigo: etiqueta.codigo });
    setOcupado(false);
    if (error) { setMsg({ tipo: "erro", texto: msgErro(error) }); return; }
    setMsg({ tipo: "ok", texto: "Baixa realizada!" });
    aoAtualizar({ ...etiqueta, ...(data as Etiqueta), situacao: "baixada", vencida: false }, "baixada");
  }

  async function cancelar() {
    if (!motivo.trim()) { setMsg({ tipo: "erro", texto: "Selecione o motivo do cancelamento." }); return; }
    setOcupado(true); setMsg(null);
    const { data, error } = await supabase.rpc("cancelar_etiqueta", { p_codigo: etiqueta.codigo, p_motivo: motivo });
    setOcupado(false);
    if (error) { setMsg({ tipo: "erro", texto: msgErro(error) }); return; }
    setMsg({ tipo: "ok", texto: "Etiqueta cancelada." });
    setCancelando(false);
    aoAtualizar({ ...etiqueta, ...(data as Etiqueta), situacao: "cancelada", vencida: false }, "cancelada");
  }

  async function reimprimir() {
    const n = Number(copias);
    if (!Number.isInteger(n) || n < 1 || n > 50) { setMsg({ tipo: "erro", texto: "Quantidade de vias inválida (de 1 a 50)." }); return; }
    setOcupado(true); setMsg(null);
    const { data, error } = await supabase.rpc("reimprimir_etiqueta", { p_etiqueta_id: etiqueta.id, p_copias: n });
    setOcupado(false);
    if (error) { setMsg({ tipo: "erro", texto: msgErro(error) }); return; }
    setGrupo(String(data));
  }

  const linhas: [string, string][] = [
    ["Código", etiqueta.codigo],
    ["Lote", etiqueta.lote],
    ["Categoria", etiqueta.categoria_nome],
    ["Armazenamento", etiqueta.armazenamento ?? "-"],
    ["Praças", etiqueta.pracas?.length ? etiqueta.pracas.join(", ") : "-"],
    ["Setor", etiqueta.setor_nome ?? "-"],
    ["Filial", etiqueta.filial_nome ?? "-"],
    ["Quantidade", etiqueta.quantidade_produzida != null ? `${etiqueta.quantidade_produzida} ${etiqueta.unidade ?? ""}`.trim() : "-"],
    ["Peso", etiqueta.peso_gramas != null ? `${etiqueta.peso_gramas} g` : "-"],
    ["Marca", etiqueta.marca ?? "-"],
    ["SIF", etiqueta.sif ?? "-"],
    ["Val. original", fmtData(etiqueta.validade_original)],
    ["Manipulação", fmtDataHora(etiqueta.manipulado_em)],
    ["Validade", `${fmtData(etiqueta.validade)} (${etiqueta.dias_validade} dia${etiqueta.dias_validade === 1 ? "" : "s"})`],
    ["Responsável", etiqueta.responsavel_nome],
  ];
  if (etiqueta.status === "baixada") linhas.push(["Baixada em", `${fmtDataHora(etiqueta.baixada_em)} por ${etiqueta.baixada_por_nome ?? "-"}`]);
  if (etiqueta.status === "cancelada") {
    linhas.push(["Cancelada em", `${fmtDataHora(etiqueta.baixada_em)} por ${etiqueta.baixada_por_nome ?? "-"}`]);
    linhas.push(["Motivo", etiqueta.motivo_cancelamento ?? "-"]);
  }

  return (
    <div className="detalhe" data-testid="detalhe-etiqueta">
      <div className="detalhe-topo">
        <b className="detalhe-nome">{etiqueta.produto_nome}</b>
        <span className={`badge ${sit}`}>{ROTULO[sit]}</span>
      </div>
      {linhas.map(([k, v]) => (
        <div className="linha-dado" key={k}><span>{k}</span><b>{v}</b></div>
      ))}

      {msg && <div className={`aviso ${msg.tipo}`}>{msg.texto}</div>}

      <div className="acoes">
        {!encerrada && (
          <button type="button" className={`btn ${destaqueBaixa ? "grande" : ""} verde`} disabled={ocupado} onClick={baixar} data-testid="btn-baixar">
            ✔ Dar baixa
          </button>
        )}
        {!encerrada && !cancelando && (
          <button type="button" className="btn perigo" disabled={ocupado} onClick={() => setCancelando(true)}>Cancelar etiqueta</button>
        )}
        {cancelando && (
          <div className="caixa">
            <SelectComNovo tabela="motivos_cancelamento" rotulo="Motivo do cancelamento" opcoes={motivos} valor={motivo} modo="nome"
              onChange={setMotivo} aoCriar={recarregarListas} obrigatorio />
            <button type="button" className="btn perigo" disabled={ocupado || !motivo} onClick={cancelar} data-testid="btn-confirmar-cancelamento">Confirmar cancelamento</button>
            <button type="button" className="btn secundario" onClick={() => setCancelando(false)}>Voltar</button>
          </div>
        )}
        <div className="linha-campo">
          <input type="number" min={1} max={50} value={copias} onChange={(e) => setCopias(e.target.value)} aria-label="Quantidade de vias" style={{ maxWidth: 90 }} />
          <button type="button" className="btn secundario" disabled={ocupado} onClick={reimprimir} data-testid="btn-reimprimir">🖨 Reimprimir</button>
        </div>
        {grupo && <StatusImpressao grupoId={grupo} />}
        {aoUsarComoBase && (
          <button type="button" className="btn secundario" onClick={() => aoUsarComoBase(etiqueta)} data-testid="btn-usar-base">↻ Usar como base para novas etiquetas</button>
        )}
      </div>
    </div>
  );
}
