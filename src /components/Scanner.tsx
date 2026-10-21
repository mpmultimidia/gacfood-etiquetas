"use client";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

type Props = { onLer: (texto: string) => void; onFechar?: () => void };

function mensagemCamera(e: unknown): string {
  const nome = (e as { name?: string })?.name ?? "";
  if (nome === "NotAllowedError" || nome === "SecurityError") return "A câmera foi bloqueada. Permita o acesso à câmera nas configurações do navegador e tente de novo.";
  if (nome === "NotFoundError" || nome === "OverconstrainedError") return "Nenhuma câmera encontrada neste aparelho.";
  if (nome === "NotReadableError") return "A câmera está sendo usada por outro aplicativo. Feche-o e tente de novo.";
  return "Não foi possível abrir a câmera. Digite o código manualmente.";
}

/** Lê QR Code pela câmera. Usa o leitor do navegador quando existe e, senão, a biblioteca jsQR (sem depender de internet/CDN). */
export default function Scanner({ onLer, onFechar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);
  const aoLer = useRef(onLer);
  aoLer.current = onLer;

  useEffect(() => {
    let parar = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let ultimo = 0;

    async function iniciar() {
      if (!window.isSecureContext) { setErro("A câmera só funciona em conexão segura (https)."); return; }
      if (!navigator.mediaDevices?.getUserMedia) { setErro("Este navegador não permite usar a câmera."); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) { setErro(mensagemCamera(e)); return; }
      if (parar) { stream.getTracks().forEach((t) => t.stop()); return; }

      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      try { await video.play(); } catch { /* alguns navegadores iniciam sozinhos */ }
      if (parar || !videoRef.current || !canvasRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      setPronto(true);

      const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      let detector: InstanceType<NonNullable<typeof Detector>> | null = null;
      try { detector = Detector ? new Detector({ formats: ["qr_code"] }) : null; } catch { detector = null; }
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) { setErro("Este navegador não conseguiu iniciar a leitura. Digite o código manualmente."); return; }

      const ciclo = async (t: number) => {
        if (parar) return;
        if (t - ultimo > 120 && video.readyState >= 2 && video.videoWidth > 0) {
          ultimo = t;
          try {
            let texto = "";
            if (detector) {
              const r = await detector.detect(video);
              texto = r[0]?.rawValue ?? "";
            }
            if (!texto) {
              const escala = Math.min(1, 640 / video.videoWidth);
              canvas.width = Math.round(video.videoWidth * escala);
              canvas.height = Math.round(video.videoHeight * escala);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              texto = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data ?? "";
            }
            if (texto) {
              parar = true;
              try { navigator.vibrate?.(60); } catch { /* sem vibração */ }
              aoLer.current(texto);
              return;
            }
          } catch { /* próximo quadro */ }
        }
        raf = requestAnimationFrame(ciclo);
      };
      raf = requestAnimationFrame(ciclo);
    }

    iniciar();
    return () => {
      parar = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="scanner">
      {erro ? (
        <div className="aviso erro">{erro}</div>
      ) : (
        <div className="scanner-video">
          <video ref={videoRef} data-testid="scanner-video" />
          <div className="mira" />
          {!pronto && <div className="scanner-aguarde">Abrindo a câmera…</div>}
        </div>
      )}
      <canvas ref={canvasRef} hidden />
      {onFechar && <button type="button" className="btn secundario" onClick={onFechar}>Fechar câmera</button>}
    </div>
  );
}
