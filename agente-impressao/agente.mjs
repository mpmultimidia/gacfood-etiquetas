// Agente de impressão — roda no computador ligado à impressora.
// Busca no sistema (Supabase) as etiquetas pendentes e imprime UMA POR VEZ, em ordem, com pausa entre elas.
// Nunca repete sozinho: se uma etiqueta falhar, ela fica com ERRO e o usuário decide reimprimir pelo sistema.
import fs from "node:fs";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";
import { criarMontador } from "./tspl.mjs";
import { criarImpressora } from "./impressora.mjs";

function lerEnv() {
  const cfg = { ...process.env };
  try {
    for (const linha of fs.readFileSync(new URL("./.env", import.meta.url), "utf8").split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !m[1].startsWith("#") && cfg[m[1]] === undefined) cfg[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* sem .env: usa só o ambiente */ }
  return cfg;
}

const cfg = lerEnv();
const faltando = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "AGENTE_EMAIL", "AGENTE_SENHA"].filter((k) => !cfg[k]);
if (faltando.length) { console.error(`Faltam configurações no arquivo .env: ${faltando.join(", ")}`); process.exit(1); }

const NOME = cfg.AGENTE_NOME || os.hostname();
const FILIAL = cfg.FILIAL_ID || null;
const INTERVALO = Math.min(10000, Math.max(200, Number(cfg.INTERVALO_MS) || 1000));
const MODO = cfg.MODO_IMPRESSAO === "arquivo" ? "arquivo" : "copy";
const montar = criarMontador({ manterAcentos: cfg.MANTER_ACENTOS === "1" });
const enviar = criarImpressora({ modo: MODO, compartilhamento: cfg.IMPRESSORA_COMPARTILHAMENTO, pastaSaida: cfg.PASTA_SAIDA || "./saida-teste" });
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), "-", ...a);

const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: true } });

async function entrar() {
  for (;;) {
    const { error } = await supabase.auth.signInWithPassword({ email: cfg.AGENTE_EMAIL, password: cfg.AGENTE_SENHA });
    if (!error) { log(`Conectado como ${cfg.AGENTE_EMAIL} (${NOME}).`); return; }
    log(`Não foi possível entrar: ${error.message}. Nova tentativa em 15 s.`);
    await pausa(15000);
  }
}

async function concluir(jobId, ok, erro) {
  for (let t = 1; t <= 6; t++) {
    const { error } = await supabase.rpc("agente_concluir", { p_job_id: jobId, p_ok: ok, p_erro: erro ?? null });
    if (!error) return;
    log(`Aviso: não consegui registrar o resultado (tentativa ${t}): ${error.message}`);
    await pausa(Math.min(5000 * t, 20000));
  }
}

async function principal() {
  await entrar();
  log(`Aguardando etiquetas${FILIAL ? ` da filial ${FILIAL}` : " (todas as filiais)"}. Modo: ${MODO}. Pausa entre etiquetas: ${INTERVALO} ms.`);
  let ultimoPing = 0;
  for (;;) {
    try {
      if (Date.now() - ultimoPing > 10000) {
        const { error } = await supabase.rpc("agente_ping", { p_nome: NOME, p_filial: FILIAL });
        if (error) throw error;
        ultimoPing = Date.now();
      }
      const { data: job, error } = await supabase.rpc("agente_proximo_trabalho", { p_filial: FILIAL });
      if (error) throw error;
      if (!job) { await pausa(2000); continue; }

      const e = job.etiqueta;
      log(`Imprimindo etiqueta ${e.codigo} (${e.produto_nome})...`);
      let resultado;
      try { resultado = await enviar(montar(e, { nome: job.empresa_nome, cnpj: job.empresa_cnpj })); }
      catch (ex) { resultado = { ok: false, detalhe: `Erro inesperado: ${ex.message}` }; }
      await concluir(job.job_id, resultado.ok, resultado.ok ? null : resultado.detalhe);
      log(resultado.ok ? `OK ${e.codigo}` : `ERRO ${e.codigo}: ${resultado.detalhe}`);
      await pausa(INTERVALO);
    } catch (ex) {
      log(`Falha de comunicação: ${ex.message || ex}. Tentando de novo em 5 s.`);
      await pausa(5000);
      if (/jwt|expired|not authenticated|invalid/i.test(String(ex.message))) await entrar();
    }
  }
}

principal();
