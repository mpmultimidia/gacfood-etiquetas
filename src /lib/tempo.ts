// Todas as datas "de negócio" do sistema usam o horário de Brasília (America/Sao_Paulo),
// independente do fuso do celular, do computador ou do servidor.
export const FUSO = "America/Sao_Paulo";

const fmtDiaSP = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtDataHoraSP = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});

/** Data de hoje em Brasília, no formato AAAA-MM-DD */
export function hojeSP(agora: Date = new Date()): string {
  return fmtDiaSP.format(agora);
}

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.split("-").map(Number);
  return [a, m, d];
}

/** Soma dias a uma data AAAA-MM-DD (sem depender de fuso) */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = partes(iso);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Dias entre duas datas AAAA-MM-DD (ate - de) */
export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = partes(de);
  const [a2, m2, d2] = partes(ate);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

/** AAAA-MM-DD -> DD/MM/AAAA */
export function fmtData(iso?: string | null): string {
  if (!iso) return "-";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

/** Instante (timestamptz) -> DD/MM/AAAA HH:MM em Brasília */
export function fmtDataHora(ts?: string | null): string {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return fmtDataHoraSP.format(d).replace(",", "");
}
