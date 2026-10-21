"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type A = { nome: string; filial_id: string | null; online: boolean };

/** Mostra se o computador da impressora está conectado (agente de impressão). */
export default function AgenteStatus({ filialId }: { filialId?: string | null }) {
  const [agentes, setAgentes] = useState<A[] | null>(null);

  useEffect(() => {
    let ativo = true;
    async function buscar() {
      const { data } = await supabase.from("agentes_v").select("nome, filial_id, online");
      if (ativo) setAgentes((data as A[]) ?? []);
    }
    buscar();
    const t = setInterval(buscar, 15000);
    return () => { ativo = false; clearInterval(t); };
  }, []);

  if (agentes === null) return null;
  const relevantes = agentes.filter((a) => !filialId || !a.filial_id || a.filial_id === filialId);
  const online = relevantes.some((a) => a.online);
  return (
    <div className={`agente ${online ? "on" : "off"}`} data-testid="agente-status">
      {online ? "🟢 Impressora conectada" : "🔴 Computador da impressora desconectado — as etiquetas ficam na fila até ele ligar"}
    </div>
  );
}
