export class RequestLimitError extends Error {
  status = 413;
}
/** Enforce the limit while streaming, before buffering an entire untrusted request. */
export async function readLimitedJSON(
  req: Request,
  maxBytes: number,
): Promise<unknown> {
  if (Number(req.headers.get("content-length")) > maxBytes)
    throw new RequestLimitError(
      "Arquivo ou requisição acima do limite permitido.",
    );
  const reader = req.body?.getReader();
  if (!reader) throw new SyntaxError("Corpo vazio.");
  let length = 0,
    text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new RequestLimitError(
          "Arquivo ou requisição acima do limite permitido.",
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    reader.releaseLock();
  }
}
