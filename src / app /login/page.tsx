"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigurado } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace("/"); });
  }, [router]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!email.trim() || !senha) { setErro("Preencha e-mail e senha."); return; }
    setEntrando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEntrando(false);
    if (error) { setErro(/invalid|credentials/i.test(error.message) ? "E-mail ou senha inválidos." : error.message); return; }
    router.replace("/"); // a primeira tela depois do login é o Dashboard
  }

  return (
    <div className="login">
      <h1>🏷 Etiquetas</h1>
      <div className="sub" style={{ marginBottom: 16 }}>Rastreio de produção</div>
      {!supabaseConfigurado && <div className="aviso erro">Sistema sem conexão configurada (variáveis do Supabase ausentes).</div>}
      <form className="card" onSubmit={entrar}>
        <div className="campo">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input id="senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        {erro && <div className="aviso erro" role="alert">{erro}</div>}
        <button className="btn" type="submit" disabled={entrando}>{entrando ? "Entrando…" : "Entrar"}</button>
      </form>
    </div>
  );
}
