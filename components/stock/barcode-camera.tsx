"use client";

import { useEffect, useRef, useState } from "react";
import { startCameraScanner, type CameraScanMode } from "@/lib/stock/camera-scanner";

type Props = {
  onResult: (code: string) => void;
  onError: (message: string) => void;
};

export default function BarcodeCamera(props: Props) {
  const [mode, setMode] = useState<CameraScanMode>("barcode");
  return (
    <div className="scanner-camera">
      <div className="scanner-modes" role="group" aria-label="Tipo de código">
        <button type="button" className={`btn${mode === "barcode" ? " primary" : ""}`} aria-pressed={mode === "barcode"} onClick={() => setMode("barcode")}>
          Código de barras
        </button>
        <button type="button" className={`btn${mode === "qr" ? " primary" : ""}`} aria-pressed={mode === "qr"} onClick={() => setMode("qr")}>
          QR Code
        </button>
      </div>
      <CameraPreview key={mode} mode={mode} {...props} />
    </div>
  );
}

function CameraPreview({
  mode,
  onResult,
  onError,
}: Props & { mode: CameraScanMode }) {
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onResult, onError });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    callbacks.current = { onResult, onError };
  }, [onResult, onError]);
  useEffect(() => {
    if (!video.current) return;
    return startCameraScanner(video.current, {
      mode,
      onResult: (code) => callbacks.current.onResult(code),
      onError: (message) => callbacks.current.onError(message),
      onReady: () => setReady(true),
    });
  }, [mode]);

  return (
    <div>
      <div className={`scanner-frame scanner-frame--${mode}`}>
        <video ref={video} className="scanner-video" autoPlay muted playsInline aria-label={mode === "qr" ? "Câmera vertical para QR Code" : "Câmera horizontal para código de barras"} />
        <div className="scanner-guide" aria-hidden="true" />
      </div>
      <p className="operation-hint" role="status">
        {ready
          ? mode === "qr"
            ? "Mantenha o celular em pé e centralize o QR Code inteiro no quadrado, com boa iluminação."
            : "Enquadre o código de barras inteiro na faixa horizontal. Se precisar de mais espaço, vire o celular de lado. Ajuste a distância até a imagem ficar nítida."
          : "Iniciando câmera… Autorize o acesso se o navegador solicitar."}
      </p>
    </div>
  );
}
