"use client";
import { useState } from "react";
import { criarNaLista } from "@/lib/listas";
import { msgErro } from "@/lib/erros";
import type { Lista } from "@/lib/tipos";

type Props = {
  opcoes: Lista[];
  selecionadas: string[];
  modo: "id" | "nome";
  onChange: (valores: string[]) => void;
  aoCriar: () => Promise<void> | void;
  rotulo?: string;
};

/** Todas as praças cadastradas aparecem na tela; toque para marcar mais de uma. */
export default function PracasChips({ opcoes, selecionadas, modo, onChange, aoCriar, rotulo = "Praças" }: Props) {
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");

  const chave = (o: Lista) => (modo === "id" ? o.id : o.nome);
  const alternar = (v: string) => onChange(selecionadas.includes(v) ? selecionadas.filter((x) => x !== v) : [...selecionadas, v]);

  async function salvar() {
    setErro("");
    try {
      const criada = await criarNaLista("pracas", nome);
      await aoCriar();
      const v = modo === "id" ? criada.id : criada.nome;
      if (!selecionadas.includes(v)) onChange([...selecionadas, v]);
      setNome("");
      setNovo(false);
    } catch (e) {
      setErro(msgErro(e));
    }
  }

  return (
    <div className="campo">
      <label>{rotulo} <span className="dica">(toque para marcar uma ou mais)</span></label>
      <div className="chips" role="group" aria-label={rotulo}>
        {opcoes.length === 0 && <span className="dica">Nenhuma praça cadastrada ainda.</span>}
        {opcoes.map((o) => {
          const marcada = selecionadas.includes(chave(o));
          return (
            <button type="button" key={o.id} className={`chip ${marcada ? "marcado" : ""}`} aria-pressed={marcada} onClick={() => alternar(chave(o))}>
              {marcada ? "✓ " : ""}{o.nome}
            </button>
          );
        })}
        <button type="button" className="chip novo" onClick={() => setNovo((v) => !v)}>＋ Nova praça</button>
      </div>
      {novo && (
        <div className="novo-inline">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da praça" autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvar(); } }} />
          <button type="button" className="btn pequeno" disabled={!nome.trim()} onClick={salvar}>Salvar</button>
        </div>
      )}
      {erro && <div className="aviso erro">{erro}</div>}
    </div>
  );
}
