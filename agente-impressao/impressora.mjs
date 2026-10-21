import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

let contador = 0;
const conteudoDoTrabalho = (tspl) => "\r\n" + String(tspl).replace(/^[\r\n]+|[\r\n]+$/g, "") + "\r\n"; // sempre começa e termina com quebra de linha

/**
 * Envia UMA etiqueta para a impressora (mesmo método já testado no GACFOOD: copy /b para o compartilhamento do Windows).
 * modo "arquivo" só grava o comando num arquivo (usado nos testes, sem impressora).
 */
export function criarImpressora({ modo = "copy", compartilhamento = "", pastaSaida = "./saida-teste", execFileFn = execFile } = {}) {
  return function enviar(tspl) {
    const conteudo = conteudoDoTrabalho(tspl);
    return new Promise((resolve) => {
      if (modo === "arquivo") {
        try {
          fs.mkdirSync(pastaSaida, { recursive: true });
          const arq = path.join(pastaSaida, `etiqueta-${Date.now()}-${++contador}.tspl`);
          fs.writeFileSync(arq, conteudo, "utf8");
          resolve({ ok: true, detalhe: arq });
        } catch (e) { resolve({ ok: false, detalhe: `Falha ao gravar arquivo: ${e.message}` }); }
        return;
      }
      if (!compartilhamento) { resolve({ ok: false, detalhe: "IMPRESSORA_COMPARTILHAMENTO não configurado no arquivo .env" }); return; }
      const temp = path.join(os.tmpdir(), `etiqueta-${Date.now()}-${++contador}.tspl`);
      try { fs.writeFileSync(temp, conteudo, "utf8"); } catch (e) { resolve({ ok: false, detalhe: `Falha ao preparar impressão: ${e.message}` }); return; }
      const destino = `\\\\localhost\\${compartilhamento}`;
      execFileFn("cmd.exe", ["/c", "copy", "/b", temp, destino], { timeout: 30000, windowsHide: true }, (erro, stdout, stderr) => {
        try { fs.unlinkSync(temp); } catch { /* já removido */ }
        if (erro) resolve({ ok: false, detalhe: `Falha ao copiar para ${destino} | ${erro.message} | ${stderr || "-"} | ${stdout || "-"}` });
        else resolve({ ok: true, detalhe: String(stdout || "").trim() });
      });
    });
  };
}
