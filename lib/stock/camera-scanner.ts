import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";

export function cameraErrorMessage(error: unknown) {
  const name = error && typeof error === "object" && "name" in error
    ? error.name
    : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "O acesso à câmera foi bloqueado. Permita o uso da câmera nas configurações do navegador e tente novamente.";
  if (name === "NotFoundError")
    return "Nenhuma câmera foi encontrada neste dispositivo. Digite o código ou use um leitor USB/Bluetooth.";
  if (name === "NotReadableError" || name === "AbortError")
    return "Não foi possível iniciar a câmera. Feche outros aplicativos que estejam usando a câmera e tente novamente.";
  return "Não foi possível ler pela câmera. Tente novamente, digite o código ou use um leitor USB/Bluetooth.";
}

type Callbacks = {
  onResult: (code: string) => void;
  onError: (message: string) => void;
  onReady: () => void;
};

export function createCameraReader() {
  return new BrowserMultiFormatReader(
    new Map([[DecodeHintType.TRY_HARDER, true]]),
    { delayBetweenScanAttempts: 150 },
  );
}

// Own the stream so closing the scanner also cancels a pending camera startup.
export function startCameraScanner(
  video: HTMLVideoElement,
  callbacks: Callbacks,
  dependencies = {
    secureContext: globalThis.isSecureContext,
    mediaDevices: navigator.mediaDevices,
    reader: createCameraReader(),
  },
) {
  let canceled = false;
  let stream: MediaStream | undefined;
  let controls: IScannerControls | undefined;
  const stop = () => {
    canceled = true;
    controls?.stop();
    stream?.getTracks().forEach((track) => track.stop());
    if (stream && video.srcObject === stream) video.srcObject = null;
  };

  void (async () => {
    try {
      if (!dependencies.secureContext) {
        callbacks.onError("A câmera precisa de uma conexão segura. Abra o aplicativo por HTTPS para usar o leitor.");
        return;
      }
      if (!dependencies.mediaDevices?.getUserMedia) {
        callbacks.onError("Este navegador não disponibiliza acesso à câmera. Abra em um navegador atualizado ou digite o código.");
        return;
      }
      stream = await dependencies.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (canceled) {
        stop();
        return;
      }
      controls = await dependencies.reader.decodeFromStream(stream, video, (result, error) => {
        if (canceled) return;
        if (result) {
          stop();
          callbacks.onResult(result.getText());
        } else if (error && !["NotFoundException", "ChecksumException", "FormatException"].includes(error.name)) {
          stop();
          callbacks.onError(cameraErrorMessage(error));
        }
      });
      if (canceled) controls.stop();
      else callbacks.onReady();
    } catch (error) {
      if (canceled) return;
      stop();
      callbacks.onError(cameraErrorMessage(error));
    }
  })();
  return stop;
}
