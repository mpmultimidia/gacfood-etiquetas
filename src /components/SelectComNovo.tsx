"use client";
import { useState } from "react";
import { criarNaLista } from "@/lib/listas";
import { msgErro } from "@/lib/erros";
import type { Lista, ListaNome } from "@/lib/tipos";

type Props = {
  tabela: ListaNome;
  rotulo: string;
  opcoes: Lista[];
  valor: string;
  /** "id": o valor é o id do registro. "nome": o valor é o nome (usado na geração da etiqueta). */
  modo: "id" | "nome";
  onChange: (valor: string) => void;
  aoCriar: () => Promise<void> | void;
  obrigatorio?: boolean;
  textoNovo?: string;
  vazio?: string;
};

export default function SelectComNovo({ tabela, rotulo, opcoes, valor, modo, onChange, aoCriar, obrigatorio, textoNovo = "Novo", vazio = "Selecione..." }: Props) {
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro("");
    setSalvando(true);
    try {
      const criado = await criarNaLista(tabela, nome);
      await aoCriar();
      onChange(modo === "id" ? criado.id : criado.nome);
      setNome("");
      setNovo(false);
    } catch (e) {
      setErro(msgErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="campo">
      <label>{rotulo}{obrigatorio ? " *" : ""}</label>
      <div className="linha-campo">
        <select value={valor} onChange={(e) => onChange(e.target.value)} aria-label={rotulo}>
          <option value="">{vazio}</option>
          {opcoes.map((o) => (
            <option key={o.id} value={modo === "id" ? o.id : o.nome}>{o.nome}</option>
          ))}
        </select>
        <button type="button" className="btn pequeno secundario" onClick={() => setNovo((v) => !v)} aria-label={`${textoNovo} ${rotulo}`}>
          ＋ {textoNovo}
        </button>
      </div>
      {novo && (
        <div className="novo-inline">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={`Nome (${rotulo.toLowerCase()})`} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvar(); } }} />
          <button type="button" className="btn pequeno" disabled={salvando || !nome.trim()} onClick={salvar}>Salvar</button>
        </div>
      )}
      {erro && <div className="aviso erro">{erro}</div>}
    </div>
  );
}
