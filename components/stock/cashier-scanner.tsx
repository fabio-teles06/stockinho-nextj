"use client";

import { useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { ScanBarcode } from "lucide-react";
import { findScannedProduct } from "@/modules/stock/barcodes";
import type { Product } from "@/modules/stock/model";

const BarcodeCamera = dynamic(() => import("./barcode-camera"), {
  loading: () => <p role="status">Carregando câmera…</p>,
});

export default function CashierScanner({ products, onAdd, disabled }: {
  products: Product[];
  onAdd: (product: Product) => boolean;
  disabled: boolean;
}) {
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function scan(value: string) {
    setCamera(false);
    setError("");
    setNotice("");
    if (disabled) return;
    const product = findScannedProduct(products, value.trim());
    if (!product) {
      setError("Código não encontrado ou associado a mais de um produto. Confira o cadastro nesta empresa.");
      return;
    }
    if (onAdd(product)) {
      setCode("");
      setNotice(`${product.name} adicionado ao carrinho.`);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    scan(code);
  }

  return (
    <div className="cashier-scanner">
      <form onSubmit={submit} className="cashier-scanner-form">
        <label htmlFor="cashier-scan-code">Código de barras, QR ou SKU</label>
        <div className="cashier-scanner-actions">
          <input id="cashier-scan-code" value={code} onChange={(event) => setCode(event.target.value)}
            placeholder="Digite ou use seu leitor e pressione Enter" maxLength={60}
            autoComplete="off" disabled={disabled} required />
          <button type="submit" className="btn" disabled={disabled}>Adicionar</button>
          <button type="button" className="btn" aria-expanded={camera && !disabled} disabled={disabled}
            onClick={() => { setError(""); setNotice(""); setCamera(!camera); }}>
            <ScanBarcode size={17} />{camera ? "Fechar câmera" : "Ler com câmera"}
          </button>
        </div>
      </form>
      {camera && !disabled && <BarcodeCamera onResult={scan} onError={(message) => { setCamera(false); setError(message); }} />}
      {error && <p className="operation-error" role="alert">{error}</p>}
      {notice && <p className="operation-success" role="status">{notice}</p>}
    </div>
  );
}
