"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Lista, ListaNome } from "./tipos";

export type Listas = Record<ListaNome, Lista[]>;
const vazio: Listas = { filiais: [], setores: [], categorias: [], pracas: [], armazenamentos: [], motivos_cancelamento: [] };
const NOMES: ListaNome[] = ["filiais", "setores", "categorias", "pracas", "armazenamentos", "motivos_cancelamento"];

export function useListas(incluirInativos = false) {
  const [listas, setListas] = useState<Listas>(vazio);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    const resultados = await Promise.all(
      NOMES.map((t) => {
        let q = supabase.from(t).select("id, nome, ativo").order("nome");
        if (!incluirInativos) q = q.eq("ativo", true);
        return q;
      })
    );
    const novo = { ...vazio };
    NOMES.forEach((t, i) => { novo[t] = (resultados[i].data as Lista[]) ?? []; });
    setListas(novo);
    setCarregando(false);
  }, [incluirInativos]);

  useEffect(() => { recarregar(); }, [recarregar]);
  return { listas, carregando, recarregar };
}

/** Cria um registro numa lista; se já existir (mesmo nome), devolve o existente. */
export async function criarNaLista(tabela: ListaNome, nome: string): Promise<Lista> {
  const limpo = nome.trim();
  if (!limpo) throw new Error("Informe o nome.");
  const { data, error } = await supabase.from(tabela).insert({ nome: limpo }).select("id, nome, ativo").single();
  if (!error && data) return data as Lista;
  if (error?.code === "23505") {
    const { data: existente } = await supabase.from(tabela).select("id, nome, ativo").ilike("nome", limpo.replace(/[%_]/g, "\\$&")).maybeSingle();
    if (existente) {
      if (!existente.ativo) await supabase.from(tabela).update({ ativo: true }).eq("id", existente.id);
      return { ...(existente as Lista), ativo: true };
    }
  }
  throw error ?? new Error("Não foi possível cadastrar.");
}
