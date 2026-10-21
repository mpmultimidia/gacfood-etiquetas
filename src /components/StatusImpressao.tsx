"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { msgErro } from "@/lib/erros";
import type { PrintJob } from "@/lib/tipos";

/** Acompanha a fila de impressão de uma geração (a impressão acontece no computador ligado à impressora). */
export default function StatusImpressao({ grupoId }: { grupoId: string }) {
  const [grupos, setGrupos] = useState<string[]>([grupoId]);
  const [jobs, setJobs] = useState<(PrintJob & { ordem: number })[]>([]);
  const [tentando, setTentando] = useState(false);
  const [erroAcao, setErroAcao] = useState("");

  useEffect(() => { setGrupos([grupoId]); }, [grupoId]);

  useEffect(() => {
    let ativo = true;
    let timer: ReturnType<typeof setTimeout>;
    async function buscar() {
      const { data } = await supabase.from("print_jobs").select("id, status, erro, etiqueta_id, ordem").in("grupo_id", grupos).order("ordem");
      if (!ativo) return;
      const lista = (data as (PrintJob & { ordem: number })[]) ?? [];
      setJobs(lista);
      if (lista.some((j) => j.status === "pendente" || j.status === "imprimindo")) timer = setTimeout(buscar, 2000);
    }
    buscar();
    return () => { ativo = false; clearTimeout(timer); };
  }, [grupos]);

  // situação atual de cada etiqueta = o trabalho mais recente dela
  const porEtiqueta = new Map<string, PrintJob & { ordem: number }>();
  jobs.forEach((j) => { const atual = porEtiqueta.get(j.etiqueta_id); if (!atual || j.ordem > atual.ordem) porEtiqueta.set(j.etiqueta_id, j); });
  const atuais = [...porEtiqueta.values()];
  const total = atuais.length;
  const ok = atuais.filter((j) => j.status === "ok").length;
  const erros = atuais.filter((j) => j.status === "erro");
  const aguardando = atuais.filter((j) => j.status === "pendente" || j.status === "imprimindo").length;

  async function tentarNovamente() {
    setTentando(true);
    setErroAcao("");
    try {
      const novos: string[] = [];
      for (const j of erros) {
        const { data, error } = await supabase.rpc("reimprimir_etiqueta", { p_etiqueta_id: j.etiqueta_id, p_copias: 1 });
        if (error) throw error;
        novos.push(String(data));
      }
      setGrupos((g) => [...g, ...novos]);
    } catch (e) {
      setErroAcao(msgErro(e));
    } finally {
      setTentando(false);
    }
  }

  if (total === 0) return <div className="aviso info">Enviando para a impressão…</div>;

  return (
    <div className="status-impressao" data-testid="status-impressao">
      <div className="barra"><div className="barra-ok" style={{ width: `${(ok / total) * 100}%` }} /></div>
      <div>
        {aguardando > 0 && <span>🖨 Imprimindo… <b>{ok}</b> de <b>{total}</b> impressas</span>}
        {aguardando === 0 && erros.length === 0 && <span className="ok-texto">✔ {total === 1 ? "Etiqueta impressa" : `${total} etiquetas impressas`}</span>}
        {aguardando === 0 && erros.length > 0 && <span className="erro-texto">⚠ {erros.length} não imprimiu(ram) — {ok} de {total} impressas</span>}
      </div>
      {aguardando === 0 && erros.length > 0 && (
        <>
          <div className="dica">{erros[0].erro}</div>
          <button type="button" className="btn pequeno" disabled={tentando} onClick={tentarNovamente}>Tentar imprimir novamente</button>
        </>
      )}
      {erroAcao && <div className="aviso erro">{erroAcao}</div>}
    </div>
  );
}
