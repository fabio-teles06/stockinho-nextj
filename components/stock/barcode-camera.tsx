"use client";

import { useEffect, useRef, useState } from "react";
import { startCameraScanner } from "@/lib/stock/camera-scanner";

export default function BarcodeCamera({
  onResult,
  onError,
}: {
  onResult: (code: string) => void;
  onError: (message: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onResult, onError });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    callbacks.current = { onResult, onError };
  }, [onResult, onError]);
  useEffect(() => {
    if (!video.current) return;
    return startCameraScanner(video.current, {
      onResult: (code) => callbacks.current.onResult(code),
      onError: (message) => callbacks.current.onError(message),
      onReady: () => setReady(true),
    });
  }, []);

  return (
    <div>
      <video ref={video} className="scanner-video" autoPlay muted playsInline aria-label="Prévia da câmera para leitura do código" />
      <p className="operation-hint" role="status">
        {ready
          ? "Aponte a câmera para o código inteiro, com boa iluminação. Mantenha o código na horizontal e ajuste a distância até a imagem ficar nítida."
          : "Iniciando câmera… Autorize o acesso se o navegador solicitar."}
      </p>
    </div>
  );
}
