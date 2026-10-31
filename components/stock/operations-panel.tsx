"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import Image from "next/image";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { findScannedProduct } from "@/modules/stock/barcodes";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { Camera, Download, Plus, RefreshCw } from "lucide-react";
import { money, number, type Data, type Product } from "@/modules/stock/model";
import type {
  OperationsData,
  OperationAction,
  Supplier,
  Purchase,
} from "@/modules/stock/operations";
import {
  fieldLabels,
  importFields,
  mapRows,
  parseCSV,
  toCSV,
  type ImportField,
} from "@/modules/stock/spreadsheets";

type Props = {
  view: string;
  data: Data;
  tenant: string;
  location: string;
  canManage: boolean;
  refresh: () => Promise<void>;
};
type FormValues = Record<string, FormDataEntryValue>;
const values = (e: FormEvent<HTMLFormElement>): FormValues => {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget));
};
const s = (v: FormDataEntryValue | undefined) => String(v ?? "");
const n = (v: FormDataEntryValue | undefined) => Number(v || 0);
const status: Record<string, string> = {
  draft: "Rascunho",
  in_progress: "Em contagem",
  pending_review: "Em revisão",
  completed: "Concluído",
  canceled: "Cancelado",
  confirmed: "Confirmado",
  partially_received: "Recebido parcialmente",
  received: "Recebido",
};
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}
function Amount({
  name,
  defaultValue = 0,
  min = 0,
}: {
  name: string;
  defaultValue?: number;
  min?: number;
}) {
  return (
    <input
      aria-label={name}
      name={name}
      type="number"
      step="0.01"
      min={min}
      max="100000000"
      required
      defaultValue={defaultValue}
    />
  );
}
function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function OperationsPanel({
  view,
  data,
  tenant,
  location,
  canManage,
  refresh,
}: Props) {
  const [ops, setOps] = useState<OperationsData | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const pending = useRef(new Map<string, string>());
  const products = data.products.filter(
      (p) => p.tenant_id === tenant && p.active,
    ),
    locations = data.locations.filter((l) => l.tenant_id === tenant);
  const categories = data.categories.filter((c) => c.tenant_id === tenant);
  const pro = ops?.entitlements.pro ?? false;
  const write = canManage && !busy && !!ops?.entitlements.can_write,
    premium = write && pro;
  const product = (id: string) =>
    data.products.find((p) => p.id === id && p.tenant_id === tenant);
  const locationName = (id: string) =>
    locations.find((l) => l.id === id)?.name || "Local";
  const quantity = (id: string) =>
    data.balances
      .filter(
        (b) =>
          b.tenant_id === tenant &&
          b.product_id === id &&
          b.location_id === location,
      )
      .reduce((sum, b) => sum + Number(b.quantity), 0);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const r = await fetch("/api/stock/operations?tenant_id=" + tenant, {
        signal,
      });
      const b = (await r.json()) as OperationsData & { error?: string };
      if (!r.ok) throw Error(b.error);
      return b;
    },
    [tenant],
  );
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((b) => {
        if (!controller.signal.aborted) setOps(b);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load]);
  async function run(action: OperationAction, payload: unknown) {
    if (busy) return null;
    setBusy(true);
    setError("");
    setNotice("");
    const fingerprint = JSON.stringify({ action, payload });
    const key = pending.current.get(fingerprint) || crypto.randomUUID();
    pending.current.set(fingerprint, key);
    try {
      const r = await fetch("/api/stock/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenant, key, action, data: payload }),
      });
      const b = (await r.json()) as {
        error?: string;
        result: {
          id: string;
          created?: number;
          updated?: number;
          skipped?: number;
        };
      };
      if (!r.ok) throw Error(b.error);
      const [updated] = await Promise.all([load(), refresh()]);
      setOps(updated);
      pending.current.delete(fingerprint);
      setNotice(
        action === "import"
          ? `Importação concluída: ${b.result.created} criados, ${b.result.updated} atualizados, ${b.result.skipped} ignorados.`
          : "Operação concluída.",
      );
      return b.result as { id: string };
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível salvar. Tente novamente.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  const productSelect = (name = "product_id", batchOnly = false) => (
    <select name={name} required defaultValue="">
      <option value="" disabled>
        Selecione o produto
      </option>
      {products
        .filter((p) => !batchOnly || p.track_batches)
        .map((p) => (
          <option value={p.id} key={p.id}>
            {p.name}
            {p.sku ? " · " + p.sku : ""}
          </option>
        ))}
    </select>
  );

  const [code, setCode] = useState(""),
    [scanned, setScanned] = useState(""),
    [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    controls = useRef<IScannerControls | null>(null),
    lastScan = useRef({ code: "", at: 0 });
  const [scanProduct, setScanProduct] = useState("");
  const [selectedInventory, setSelectedInventory] = useState(""),
    [inventorySearch, setInventorySearch] = useState("");
  const found = findScannedProduct(products, scanned);
  useEffect(() => {
    if (!camera || !video.current) return;
    let canceled = false;
    const reader = new BrowserMultiFormatReader();
    reader
      .decodeFromVideoDevice(undefined, video.current, (result) => {
        if (!result || canceled) return;
        const value = result.getText(),
          now = Date.now();
        if (value === lastScan.current.code && now - lastScan.current.at < 2000)
          return;
        lastScan.current = { code: value, at: now };
        setCode(value);
        setScanned(value);
        if (view === "Inventários")
          setInventorySearch(
            findScannedProduct(
              data.products.filter((p) => p.tenant_id === tenant && p.active),
              value,
            )?.name || value,
          );
        setCamera(false);
      })
      .then((c) => {
        if (canceled) c.stop();
        else controls.current = c;
      })
      .catch(() => {
        if (!canceled) {
          setCamera(false);
          setError(
            "Não foi possível acessar a câmera. Digite o código ou use um leitor USB/Bluetooth.",
          );
        }
      });
    return () => {
      canceled = true;
      controls.current?.stop();
      controls.current = null;
    };
  }, [camera, view, data.products, tenant]);
  const inv = ops?.inventories.find((i) => i.id === selectedInventory);
  const invLines =
    ops?.inventoryItems.filter((i) => i.inventory_id === selectedInventory) ||
    [];
  const [supplierEdit, setSupplierEdit] = useState<Supplier | null>(null),
    [supplierSearch, setSupplierSearch] = useState("");
  const [orderLines, setOrderLines] = useState([
    { product_id: "", quantity: 1, unit_cost: 0 },
  ]);
  const [selectedOrder, setSelectedOrder] = useState("");
  const [editingOrder, setEditingOrder] = useState<Purchase | null>(null);
  const order = ops?.purchases.find((p) => p.id === selectedOrder);
  const [csv, setCSV] = useState<{
      headers: string[];
      rows: string[][];
    } | null>(null),
    [mapping, setMapping] = useState<Partial<Record<ImportField, string>>>({}),
    [category, setCategory] = useState("");
  const [conflict, setConflict] = useState("reject");
  const preview = csv
    ? mapRows(csv.rows, mapping, csv.headers, category, {
        categories,
        locations,
        suppliers: ops?.suppliers || [],
      })
    : null;
  const [labelProducts, setLabelProducts] = useState<string[]>([]),
    [pdf, setPDF] = useState(""),
    [labelType, setLabelType] = useState("code128"),
    [labelFormat, setLabelFormat] = useState("a4");
  useEffect(
    () => () => {
      if (pdf) URL.revokeObjectURL(pdf);
    },
    [pdf],
  );
  const [transferProduct, setTransferProduct] = useState(""),
    [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [finance, setFinance] = useState<Finance | null>(null),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  useEffect(() => {
    if (view !== "Financeiro") return;
    const controller = new AbortController();
    fetch(
      `/api/stock/finance?tenant_id=${tenant}&location_id=${location}&from=${from}&to=${to}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const b = (await r.json()) as Finance & { error?: string };
        if (!r.ok) throw Error(b.error);
        setFinance(b);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [view, tenant, location, from, to, data]);
  const [now] = useState(() => Date.now());

  if (!tenant)
    return (
      <div className="empty">
        <h3>Crie uma empresa para começar.</h3>
      </div>
    );
  if (loading) return <p role="status">Carregando {view.toLowerCase()}…</p>;
  if (!ops)
    return (
      <div role="alert">
        <p>{error}</p>
        <button
          className="btn"
          onClick={() => {
            setError("");
            setLoading(true);
            void load()
              .then(setOps)
              .catch((e) => setError(e.message))
              .finally(() => setLoading(false));
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  return (
    <section className="operations-panel" aria-busy={busy}>
      <div className="operations-toolbar">
        <p>
          {locationName(location)} · {pro ? "Pro" : "Free"} ·{" "}
          {ops.entitlements.product_limit} produtos ·{" "}
          {ops.entitlements.location_limit} locais
        </p>
        <button
          className="btn"
          disabled={busy}
          onClick={() => {
            void load()
              .then(setOps)
              .catch((e) => setError(e.message));
          }}
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>
      {error && (
        <p className="operation-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="operation-success" role="status">
          {notice}
        </p>
      )}
      {!pro && (
        <p className="operation-hint">
          Recursos Pro ficam disponíveis para consulta e exportação após
          downgrade. <Link href="/configuracoes/assinatura">Ver plano</Link>
        </p>
      )}
      {!canManage && (
        <p className="operation-hint">
          Seu perfil permite consultar os registros e movimentar produtos.
          Cadastros, compras e ajustes exigem administrador.
        </p>
      )}
      {!ops.entitlements.can_write && (
        <p className="operation-hint">
          Você mantém acesso de leitura. No Free, somente o administrador
          definido como usuário principal pode realizar operações.
        </p>
      )}

      {view === "Escanear código" && (
        <div className="operations-grid">
          <div className="operation-card">
            <h3>Consultar produto</h3>
            <form
              className="stock-form"
              onSubmit={(e) => {
                e.preventDefault();
                setScanned(code.trim());
                setError("");
              }}
            >
              <Field label="Código de barras ou SKU">
                <input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={60}
                  placeholder="Digite ou use seu leitor e pressione Enter"
                  required
                />
              </Field>
              <button className="btn primary">Buscar</button>
            </form>
            <button className="btn" onClick={() => setCamera(!camera)}>
              <Camera size={16} />
              {camera ? "Fechar câmera" : "Usar câmera"}
            </button>
            {camera && (
              <video ref={video} className="scanner-video" muted playsInline />
            )}
            {scanned && !found && (
              <div role="status">
                <p>Código desconhecido: {scanned}</p>
                {write && (
                  <form
                    className="stock-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run("barcode_associate", {
                        product_id: scanProduct,
                        barcode: scanned,
                      }).then((result) => {
                        if (result) setScanned(scanned);
                      });
                    }}
                  >
                    <Field label="Associar a um produto existente">
                      <select
                        required
                        value={scanProduct}
                        onChange={(e) => setScanProduct(e.target.value)}
                      >
                        <option value="">Selecione</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button className="btn" disabled={!scanProduct || busy}>
                      Associar código
                    </button>
                  </form>
                )}
                <p>Para cadastrar um novo produto, use Produtos no menu.</p>
              </div>
            )}
          </div>
          {found && (
            <div className="operation-card" key={found.id}>
              <h3>{found.name}</h3>
              {found.image_url && (
                <Image
                  src={found.image_url}
                  alt={found.name}
                  width={100}
                  height={100}
                  unoptimized
                />
              )}
              <p>
                SKU: {found.sku || "Não informado"} · Código:{" "}
                {found.barcode || "Não informado"}
              </p>
              <p>
                {number(quantity(found.id))} {found.unit} disponíveis
              </p>
              <MovementForm
                p={found}
                products={products}
                batches={ops.batches}
                location={location}
                canManage={canManage}
                busy={busy || !ops.entitlements.can_write}
                run={run}
              />
            </div>
          )}
        </div>
      )}

      {view === "Inventários" && (
        <div className="operations-grid">
          <div className="operation-card">
            <h3>Contagem e conferência</h3>
            <p>
              O saldo é fotografado ao iniciar. Movimentações posteriores
              impedem a confirmação: cancele e reinicie. Produtos com controle
              de lote são contados por lote no Pro.
            </p>
            <form
              className="stock-form"
              onSubmit={(e) => {
                const f = values(e);
                void run("inventory_create", {
                  location_id: location,
                  notes: s(f.notes),
                  ...(s(f.category_id)
                    ? { category_id: s(f.category_id) }
                    : {}),
                }).then((r) => {
                  if (r) setSelectedInventory(r.id);
                });
              }}
            >
              <Field label="Categoria">
                <select name="category_id">
                  <option value="">Todas</option>
                  {categories.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Observação">
                <input name="notes" maxLength={500} />
              </Field>
              <button className="btn primary" disabled={!write || !location}>
                Iniciar inventário
              </button>
            </form>
            <h3>Histórico</h3>
            {!ops.inventories.length && <p>Nenhum inventário registrado.</p>}
            {ops.inventories.map((i) => (
              <button
                key={i.id}
                className="operation-list-item"
                onClick={() => setSelectedInventory(i.id)}
              >
                {new Date(i.created_at).toLocaleString("pt-BR")} ·{" "}
                {locationName(i.location_id)} · {status[i.status]}
              </button>
            ))}
          </div>
          {inv && (
            <div className="operation-card">
              <h3>
                {status[inv.status]} · {locationName(inv.location_id)}
              </h3>
              <Field label="Buscar nome, SKU ou código">
                <input
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setInventorySearch(
                        findScannedProduct(products, inventorySearch)?.name ||
                          inventorySearch,
                      );
                    }
                  }}
                />
              </Field>
              {pro && (
                <button className="btn" onClick={() => setCamera(!camera)}>
                  <Camera size={16} />
                  {camera ? "Fechar câmera" : "Localizar por câmera"}
                </button>
              )}
              {camera && (
                <video
                  ref={video}
                  className="scanner-video"
                  muted
                  playsInline
                />
              )}
              <form
                className="stock-form"
                onSubmit={(e) => {
                  const f = values(e);
                  void run("inventory_count", {
                    id: inv.id,
                    items: invLines.map((i) => ({
                      product_id: i.product_id,
                      counted: n(f[i.id]),
                      ...(i.batch_id ? { batch_id: i.batch_id } : {}),
                    })),
                  });
                }}
              >
                <div className="operation-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Esperado</th>
                        <th>Contado</th>
                        <th>Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invLines.map((i) => {
                        const p = product(i.product_id);
                        const hidden = !`${p?.name} ${p?.barcode} ${p?.sku}`
                          .toLowerCase()
                          .includes(inventorySearch.toLowerCase());
                        return (
                          <tr key={i.id} hidden={hidden}>
                            <td>
                              {p?.name}
                              {i.batch_id
                                ? " · Lote " +
                                  ops.batches.find((b) => b.id === i.batch_id)
                                    ?.code
                                : ""}
                            </td>
                            <td>{number(i.expected)}</td>
                            <td>
                              <input
                                aria-label={"Contagem de " + p?.name}
                                name={i.id}
                                type="number"
                                min="0"
                                step="0.01"
                                required
                                defaultValue={i.counted ?? ""}
                                disabled={
                                  !write ||
                                  !["draft", "in_progress"].includes(inv.status)
                                }
                              />
                            </td>
                            <td>
                              {i.counted === null
                                ? "Pendente"
                                : number(i.counted - i.expected)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {["draft", "in_progress"].includes(inv.status) && (
                  <button className="btn primary" disabled={!write}>
                    Salvar contagem
                  </button>
                )}
              </form>
              <div className="operations-actions">
                {["draft", "in_progress"].includes(inv.status) && (
                  <button
                    className="btn"
                    disabled={!write}
                    onClick={() => {
                      void run("inventory_review", { id: inv.id });
                    }}
                  >
                    Enviar para revisão
                  </button>
                )}
                {inv.status === "pending_review" && (
                  <button
                    className="btn primary"
                    disabled={!write}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Aplicar as divergências ao estoque? Os ajustes ficarão no histórico.",
                        )
                      )
                        void run("inventory_complete", { id: inv.id });
                    }}
                  >
                    Confirmar ajustes
                  </button>
                )}
                {!["completed", "canceled"].includes(inv.status) && (
                  <button
                    className="btn"
                    disabled={!write}
                    onClick={() => {
                      if (window.confirm("Cancelar esta contagem?"))
                        void run("inventory_cancel", { id: inv.id });
                    }}
                  >
                    Cancelar
                  </button>
                )}
                <button
                  className="btn"
                  onClick={() =>
                    download(
                      "inventario.csv",
                      toCSV([
                        [
                          "Produto",
                          "Esperado",
                          "Contado",
                          "Diferença",
                          "Valor da diferença",
                        ],
                        ...invLines.map((i) => [
                          product(i.product_id)?.name,
                          i.expected,
                          i.counted,
                          i.counted === null ? "" : i.counted - i.expected,
                          i.counted === null
                            ? ""
                            : (i.counted - i.expected) * i.unit_cost,
                        ]),
                      ]),
                    )
                  }
                >
                  <Download size={16} /> Exportar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {view === "Importação" && (
        <div className="operation-card">
          <h3>Importar CSV</h3>
          <p>
            Até 2 MB e 2.000 linhas. Free: uma importação de até 50 produtos. A
            operação é integral: qualquer erro cancela todas as linhas. Estoques
            existentes não são substituídos.
          </p>
          <button
            className="btn"
            onClick={() =>
              download(
                "modelo-produtos.csv",
                toCSV([
                  [
                    "Nome",
                    "SKU",
                    "Código de barras",
                    "Unidade",
                    "Quantidade inicial",
                    "Estoque mínimo",
                    "Custo",
                    "Preço de venda",
                  ],
                  ["Produto exemplo", "SKU-001", "", "un", 0, 0, 0, 0],
                ]),
              )
            }
          >
            Baixar modelo
          </button>
          <Field label="Planilha CSV em UTF-8">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setCSV(null);
                setError("");
                try {
                  if (file.size > ops.limits.importMaxBytes)
                    throw Error("Arquivo acima de 2 MB.");
                  const parsed = parseCSV(await file.text());
                  setCSV(parsed);
                  const auto: Partial<Record<ImportField, string>> = {};
                  for (const field of importFields) {
                    const h = parsed.headers.find(
                      (h) =>
                        h.toLowerCase() === fieldLabels[field].toLowerCase() ||
                        h === field,
                    );
                    if (h) auto[field] = h;
                  }
                  setMapping(auto);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Arquivo inválido.",
                  );
                }
              }}
            />
          </Field>
          {csv && (
            <>
              <div className="form-grid">
                {importFields.map((field) => (
                  <Field key={field} label={fieldLabels[field]}>
                    <select
                      value={mapping[field] || ""}
                      onChange={(e) =>
                        setMapping({ ...mapping, [field]: e.target.value })
                      }
                    >
                      <option value="">Não importar</option>
                      {csv.headers.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                  </Field>
                ))}
                <Field label="Categoria para os produtos">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {categories.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Produtos já cadastrados">
                  <select
                    value={conflict}
                    onChange={(e) => setConflict(e.target.value)}
                  >
                    <option value="reject">Rejeitar</option>
                    <option value="skip">Ignorar existentes</option>
                    <option value="update" disabled={!pro}>
                      Atualizar cadastro (Pro)
                    </option>
                  </select>
                </Field>
              </div>
              <p>
                {preview?.valid.length} linhas válidas ·{" "}
                {preview?.errors.length} erros ·{" "}
                {ops.entitlements.initial_import_used && !pro
                  ? "Importação Free já utilizada"
                  : "Revise antes de confirmar"}
              </p>
              {!!preview?.errors.length && (
                <div role="alert">
                  {preview.errors.slice(0, 20).map((err) => (
                    <p key={err.line}>
                      Linha {err.line}: {err.message}
                    </p>
                  ))}
                  <button
                    className="btn"
                    onClick={() =>
                      download(
                        "erros-importacao.csv",
                        toCSV([
                          ["Linha", "Erro"],
                          ...preview.errors.map((e) => [e.line, e.message]),
                        ]),
                      )
                    }
                  >
                    Baixar erros
                  </button>
                </div>
              )}
              <div className="operation-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>SKU</th>
                      <th>Código</th>
                      <th>Quantidade</th>
                      <th>Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview?.valid.slice(0, 20).map((p, i) => (
                      <tr key={i}>
                        <td>{p.name}</td>
                        <td>{p.sku}</td>
                        <td>{p.barcode}</td>
                        <td>{number(p.quantity)}</td>
                        <td>{money(p.cost_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="btn primary"
                disabled={
                  !write ||
                  !preview?.valid.length ||
                  !!preview.errors.length ||
                  (!pro && ops.entitlements.initial_import_used)
                }
                onClick={() => {
                  if (
                    window.confirm(
                      `Importar ${preview?.valid.length} produtos para ${locationName(location)}?`,
                    )
                  )
                    void run("import", {
                      location_id: location,
                      conflict,
                      rows: preview?.valid,
                    }).then((r) => {
                      if (r) setCSV(null);
                    });
                }}
              >
                Confirmar importação
              </button>
            </>
          )}
        </div>
      )}

      {view === "Fornecedores" && (
        <div className="operations-grid">
          <div className="operation-card">
            <h3>Fornecedores</h3>
            <Field label="Pesquisar">
              <input
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
              />
            </Field>
            <button
              className="btn"
              disabled={!premium}
              onClick={() => setSupplierEdit(null)}
            >
              Novo fornecedor
            </button>
            {!ops.suppliers.length && <p>Nenhum fornecedor cadastrado.</p>}
            {ops.suppliers
              .filter((v) =>
                (v.name + " " + v.document)
                  .toLowerCase()
                  .includes(supplierSearch.toLowerCase()),
              )
              .map((v) => (
                <button
                  className="operation-list-item"
                  key={v.id}
                  onClick={() => setSupplierEdit(v)}
                >
                  {v.name} · {v.active ? "Ativo" : "Arquivado"}
                </button>
              ))}
            <button
              className="btn"
              onClick={() =>
                download(
                  "fornecedores.csv",
                  toCSV([
                    ["Nome", "Documento", "E-mail", "Telefone"],
                    ...ops.suppliers.map((v) => [
                      v.name,
                      v.document,
                      v.email,
                      v.phone,
                    ]),
                  ]),
                )
              }
            >
              Exportar
            </button>
          </div>
          <div className="operation-card">
            <h3>{supplierEdit ? "Editar fornecedor" : "Novo fornecedor"}</h3>
            <form
              key={supplierEdit?.id || "new"}
              className="stock-form"
              onSubmit={(e) => {
                const f = values(e);
                void run("supplier_save", {
                  ...f,
                  lead_days: n(f.lead_days),
                  active: s(f.active) === "true",
                  ...(supplierEdit ? { id: supplierEdit.id } : {}),
                });
              }}
            >
              <fieldset disabled={!premium}>
                <Field label="Nome / razão social">
                  <input
                    name="name"
                    maxLength={150}
                    required
                    defaultValue={supplierEdit?.name}
                  />
                </Field>
                <Field label="Nome fantasia">
                  <input
                    name="trade_name"
                    maxLength={500}
                    defaultValue={supplierEdit?.trade_name}
                  />
                </Field>
                <div className="form-grid">
                  <Field label="CPF/CNPJ (opcional)">
                    <input
                      name="document"
                      maxLength={18}
                      defaultValue={supplierEdit?.document}
                    />
                  </Field>
                  <Field label="E-mail">
                    <input
                      name="email"
                      type="email"
                      defaultValue={supplierEdit?.email}
                    />
                  </Field>
                  <Field label="Telefone / WhatsApp">
                    <input
                      name="phone"
                      maxLength={100}
                      defaultValue={supplierEdit?.phone}
                    />
                  </Field>
                  <Field label="Prazo de entrega (dias)">
                    <input
                      name="lead_days"
                      type="number"
                      min="0"
                      max="3650"
                      defaultValue={supplierEdit?.lead_days || 0}
                    />
                  </Field>
                </div>
                <Field label="Endereço">
                  <input
                    name="address"
                    maxLength={500}
                    defaultValue={supplierEdit?.address}
                  />
                </Field>
                <Field label="Contato">
                  <input
                    name="contact"
                    maxLength={150}
                    defaultValue={supplierEdit?.contact}
                  />
                </Field>
                <Field label="Observações">
                  <textarea
                    name="notes"
                    maxLength={500}
                    defaultValue={supplierEdit?.notes}
                  />
                </Field>
                <Field label="Situação">
                  <select
                    name="active"
                    defaultValue={String(supplierEdit?.active ?? true)}
                  >
                    <option value="true">Ativo</option>
                    <option value="false">Arquivado</option>
                  </select>
                </Field>
                <button className="btn primary">Salvar fornecedor</button>
              </fieldset>
            </form>
            {supplierEdit && (
              <>
                <h3>Produtos e últimas compras</h3>
                <form
                  className="stock-form"
                  onSubmit={(e) => {
                    const f = values(e);
                    void run("supplier_link", {
                      supplier_id: supplierEdit.id,
                      product_id: s(f.product_id),
                    });
                  }}
                >
                  {productSelect()}
                  <button className="btn" disabled={!premium}>
                    Relacionar produto
                  </button>
                </form>
                {ops.supplierProducts
                  .filter((p) => p.supplier_id === supplierEdit.id)
                  .map((p) => (
                    <p key={p.id}>
                      {product(p.product_id)?.name} ·{" "}
                      {p.last_cost === null ? "Sem compra" : money(p.last_cost)}{" "}
                      ·{" "}
                      {p.last_purchase_at
                        ? new Date(p.last_purchase_at).toLocaleDateString(
                            "pt-BR",
                          )
                        : ""}
                    </p>
                  ))}
                {ops.purchases
                  .filter((p) => p.supplier_id === supplierEdit.id)
                  .map((p) => (
                    <p key={p.id}>
                      Pedido {p.id.slice(0, 8)} · {status[p.status]} ·{" "}
                      {money(p.total)}
                    </p>
                  ))}
              </>
            )}
          </div>
        </div>
      )}

      {view === "Pedidos de compra" && (
        <div className="operations-grid">
          <div className="operation-card">
            <h3>
              {editingOrder
                ? "Editar rascunho " + editingOrder.id.slice(0, 8)
                : "Novo pedido"}
            </h3>
            {editingOrder && (
              <button
                className="btn"
                onClick={() => {
                  setEditingOrder(null);
                  setOrderLines([
                    { product_id: "", quantity: 1, unit_cost: 0 },
                  ]);
                }}
              >
                Novo pedido
              </button>
            )}
            <button
              className="btn"
              disabled={!premium}
              onClick={() =>
                setOrderLines(
                  products
                    .filter((p) => quantity(p.id) <= Number(p.min_quantity))
                    .map((p) => ({
                      product_id: p.id,
                      quantity: Math.max(
                        1,
                        Number(p.min_quantity) * 2 - quantity(p.id),
                      ),
                      unit_cost: Number(p.cost_price),
                    })),
                )
              }
            >
              Preparar reposição dos produtos abaixo do mínimo
            </button>
            <form
              key={editingOrder?.id || "new-order"}
              className="stock-form"
              onSubmit={(e) => {
                const f = values(e);
                void run("purchase_create", {
                  ...(editingOrder ? { id: editingOrder.id } : {}),
                  supplier_id: s(f.supplier_id),
                  location_id: editingOrder?.location_id || location,
                  freight: n(f.freight),
                  discount: n(f.discount),
                  ...(f.expected_on ? { expected_on: s(f.expected_on) } : {}),
                  notes: s(f.notes),
                  items: orderLines,
                }).then((r) => {
                  if (r) {
                    setSelectedOrder(r.id);
                    setEditingOrder(null);
                    setOrderLines([
                      { product_id: "", quantity: 1, unit_cost: 0 },
                    ]);
                  }
                });
              }}
            >
              <fieldset disabled={!premium}>
                <Field label="Fornecedor">
                  <select
                    name="supplier_id"
                    required
                    defaultValue={editingOrder?.supplier_id || ""}
                  >
                    <option value="" disabled>
                      Selecione
                    </option>
                    {ops.suppliers
                      .filter((v) => v.active)
                      .map((v) => (
                        <option value={v.id} key={v.id}>
                          {v.name}
                        </option>
                      ))}
                  </select>
                </Field>
                {orderLines.map((line, i) => (
                  <div className="purchase-line" key={i}>
                    <Field label="Produto">
                      <select
                        required
                        value={line.product_id}
                        onChange={(e) =>
                          setOrderLines(
                            orderLines.map((l, j) =>
                              j === i
                                ? { ...l, product_id: e.target.value }
                                : l,
                            ),
                          )
                        }
                      >
                        <option value="">Selecione</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Quantidade">
                      <input
                        type="number"
                        min="0.01"
                        max="100000000"
                        step="0.01"
                        required
                        value={line.quantity}
                        onChange={(e) =>
                          setOrderLines(
                            orderLines.map((l, j) =>
                              j === i
                                ? { ...l, quantity: Number(e.target.value) }
                                : l,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="Custo unitário">
                      <input
                        type="number"
                        min="0"
                        max="100000000"
                        step="0.01"
                        required
                        value={line.unit_cost}
                        onChange={(e) =>
                          setOrderLines(
                            orderLines.map((l, j) =>
                              j === i
                                ? { ...l, unit_cost: Number(e.target.value) }
                                : l,
                            ),
                          )
                        }
                      />
                    </Field>
                    {orderLines.length > 1 && (
                      <button
                        className="btn"
                        type="button"
                        onClick={() =>
                          setOrderLines(orderLines.filter((_, j) => j !== i))
                        }
                      >
                        Remover
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="btn"
                  type="button"
                  onClick={() =>
                    setOrderLines([
                      ...orderLines,
                      { product_id: "", quantity: 1, unit_cost: 0 },
                    ])
                  }
                >
                  <Plus size={16} /> Item
                </button>
                <p>
                  Subtotal:{" "}
                  {money(
                    orderLines.reduce(
                      (sum, l) => sum + l.quantity * l.unit_cost,
                      0,
                    ),
                  )}
                </p>
                <div className="form-grid">
                  <Field label="Frete">
                    <Amount
                      name="freight"
                      defaultValue={Number(editingOrder?.freight || 0)}
                    />
                  </Field>
                  <Field label="Desconto">
                    <Amount
                      name="discount"
                      defaultValue={Number(editingOrder?.discount || 0)}
                    />
                  </Field>
                  <Field label="Previsão">
                    <input
                      type="date"
                      name="expected_on"
                      defaultValue={editingOrder?.expected_on || ""}
                    />
                  </Field>
                </div>
                <Field label="Observações">
                  <input
                    name="notes"
                    maxLength={500}
                    defaultValue={editingOrder?.notes || ""}
                  />
                </Field>
                <button className="btn primary">
                  {editingOrder ? "Salvar alterações" : "Salvar rascunho"}
                </button>
              </fieldset>
            </form>
            <h3>Pedidos registrados</h3>
            {!ops.purchases.length && <p>Nenhum pedido.</p>}
            {ops.purchases.map((p) => (
              <button
                className="operation-list-item"
                key={p.id}
                onClick={() => setSelectedOrder(p.id)}
              >
                {p.id.slice(0, 8)} ·{" "}
                {ops.suppliers.find((v) => v.id === p.supplier_id)?.name} ·{" "}
                {status[p.status]} · {money(p.total)}
              </button>
            ))}
          </div>
          {order && (
            <div className="operation-card">
              <h3>
                Pedido {order.id.slice(0, 8)} · {status[order.status]}
              </h3>
              <p>
                {locationName(order.location_id)} · Total {money(order.total)} ·
                Frete {money(order.freight)} · Desconto {money(order.discount)}
              </p>
              {order.status === "draft" && (
                <button
                  className="btn"
                  disabled={!premium}
                  onClick={() => {
                    setEditingOrder(order);
                    setOrderLines(
                      ops.purchaseItems
                        .filter((i) => i.order_id === order.id)
                        .map((i) => ({
                          product_id: i.product_id,
                          quantity: Number(i.quantity),
                          unit_cost: Number(i.unit_cost),
                        })),
                    );
                  }}
                >
                  Editar rascunho
                </button>
              )}
              {order.received_at && (
                <p>
                  Último recebimento:{" "}
                  {new Date(order.received_at).toLocaleString("pt-BR")}
                </p>
              )}
              {order.status === "draft" && (
                <button
                  className="btn primary"
                  disabled={!premium}
                  onClick={() => {
                    void run("purchase_confirm", { id: order.id });
                  }}
                >
                  Confirmar pedido
                </button>
              )}
              {ops.purchaseItems
                .filter((i) => i.order_id === order.id)
                .map((i) => (
                  <div className="purchase-receipt" key={i.id}>
                    <h4>{product(i.product_id)?.name}</h4>
                    <p>
                      Pedido: {number(i.quantity)} · Recebido:{" "}
                      {number(i.received)} · Custo: {money(i.unit_cost)}
                    </p>
                    {["confirmed", "partially_received"].includes(
                      order.status,
                    ) &&
                      Number(i.received) < Number(i.quantity) && (
                        <form
                          className="stock-form"
                          onSubmit={(e) => {
                            const f = values(e);
                            void run("purchase_receive", {
                              id: order.id,
                              note: s(f.note),
                              items: [
                                {
                                  product_id: i.product_id,
                                  quantity: n(f.quantity),
                                  ...(f.batch_code
                                    ? {
                                        batch_code: s(f.batch_code),
                                        expires_on: s(f.expires_on),
                                        ...(f.manufactured_on
                                          ? {
                                              manufactured_on: s(
                                                f.manufactured_on,
                                              ),
                                            }
                                          : {}),
                                      }
                                    : {}),
                                },
                              ],
                            });
                          }}
                        >
                          <Field label="Quantidade recebida agora">
                            <input
                              name="quantity"
                              required
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={Number(i.quantity) - Number(i.received)}
                            />
                          </Field>
                          {product(i.product_id)?.track_batches && (
                            <>
                              <Field label="Lote">
                                <input
                                  name="batch_code"
                                  required
                                  maxLength={100}
                                />
                              </Field>
                              <Field label="Validade">
                                <input name="expires_on" required type="date" />
                              </Field>
                              <Field label="Fabricação (opcional)">
                                <input name="manufactured_on" type="date" />
                              </Field>
                            </>
                          )}
                          <Field label="Divergência / observação do recebimento">
                            <input name="note" maxLength={400} />
                          </Field>
                          <button className="btn primary" disabled={!premium}>
                            Registrar recebimento
                          </button>
                        </form>
                      )}
                  </div>
                ))}
              {["draft", "confirmed"].includes(order.status) && (
                <button
                  className="btn"
                  disabled={!premium}
                  onClick={() => {
                    if (window.confirm("Cancelar este pedido?"))
                      void run("purchase_cancel", { id: order.id });
                  }}
                >
                  Cancelar pedido
                </button>
              )}
              <button
                className="btn"
                onClick={() =>
                  download(
                    "pedido.csv",
                    toCSV([
                      ["Produto", "Quantidade", "Recebido", "Custo"],
                      ...ops.purchaseItems
                        .filter((i) => i.order_id === order.id)
                        .map((i) => [
                          product(i.product_id)?.name,
                          i.quantity,
                          i.received,
                          i.unit_cost,
                        ]),
                    ]),
                  )
                }
              >
                Exportar pedido
              </button>
            </div>
          )}
        </div>
      )}

      {view === "Transferências" && (
        <div className="operation-card">
          <h3>Transferir de {locationName(location)}</h3>
          <form
            className="stock-form"
            onSubmit={(e) => {
              const f = values(e);
              void run("primary_operator", { user_id: s(f.user_id) });
            }}
          >
            <Field label="Administrador principal (único usuário operacional no Free)">
              <select
                name="user_id"
                defaultValue={ops.entitlements.primary_user_id}
              >
                {data.memberships
                  .filter((m) => m.tenant_id === tenant && m.role === "admin")
                  .map((m) => (
                    <option value={m.user_id} key={m.id}>
                      {m.email || m.user_id}
                    </option>
                  ))}
              </select>
            </Field>
            <button className="btn" disabled={!write}>
              Definir usuário principal
            </button>
          </form>
          <p>
            Local padrão para operações Free:{" "}
            {locations.find((l) => l.is_default)?.name || "Não definido"}.
          </p>
          <div className="operations-actions">
            {locations
              .filter((l) => l.active !== false && !l.is_default)
              .map((l) => (
                <button
                  className="btn"
                  key={l.id}
                  disabled={!premium}
                  onClick={() => {
                    void run("location_default", { id: l.id });
                  }}
                >
                  Usar {l.name} como padrão
                </button>
              ))}
          </div>
          <form
            className="stock-form"
            onSubmit={(e) => {
              const f = values(e);
              void run("transfer", {
                product_id: transferProduct,
                location_id: location,
                destination_id: s(f.destination_id),
                quantity: n(f.quantity),
                note: s(f.note),
                ...(f.batch_id ? { batch_id: s(f.batch_id) } : {}),
              });
            }}
          >
            <fieldset disabled={!premium}>
              <Field label="Produto">
                <select
                  required
                  value={transferProduct}
                  onChange={(e) => setTransferProduct(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {products.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name} · {number(quantity(p.id))}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Destino">
                <select name="destination_id" required defaultValue="">
                  <option value="" disabled>
                    Selecione
                  </option>
                  {locations
                    .filter((l) => l.id !== location && l.active !== false)
                    .map((l) => (
                      <option value={l.id} key={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
              </Field>
              {product(transferProduct)?.track_batches && (
                <Field label="Lote">
                  <select name="batch_id" required defaultValue="">
                    <option value="" disabled>
                      Selecione
                    </option>
                    {ops.batches
                      .filter(
                        (b) =>
                          b.product_id === transferProduct &&
                          b.location_id === location,
                      )
                      .map((b) => (
                        <option value={b.id} key={b.id}>
                          {b.code} · {number(b.quantity)}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <Field label="Quantidade">
                <Amount name="quantity" min={0.01} defaultValue={1} />
              </Field>
              <Field label="Motivo / observação">
                <input name="note" maxLength={500} />
              </Field>
              <button className="btn primary">Confirmar transferência</button>
            </fieldset>
          </form>
          <h3>Histórico</h3>
          {data.movements
            .filter(
              (m) =>
                m.tenant_id === tenant &&
                m.movement_kind?.startsWith("transfer"),
            )
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 100)
            .map((m) => (
              <p key={m.id}>
                {new Date(m.created_at).toLocaleString("pt-BR")} ·{" "}
                {product(m.product_id)?.name} · {locationName(m.location_id)} ·{" "}
                {m.movement_kind === "transfer_in" ? "Entrada" : "Saída"}{" "}
                {number(m.quantity)} · {m.document_id?.slice(0, 8)}
              </p>
            ))}
        </div>
      )}

      {view === "Lotes e validades" && (
        <div className="operations-grid">
          <div className="operation-card">
            <h3>Novo lote</h3>
            <p>
              Ative o controle de lotes no cadastro do produto enquanto ele
              estiver sem saldo. Entradas de compras também criam lotes.
            </p>
            <form
              className="stock-form"
              onSubmit={(e) => {
                const f = values(e);
                void run("batch_create", {
                  product_id: s(f.product_id),
                  location_id: location,
                  code: s(f.code),
                  expires_on: s(f.expires_on),
                  ...(f.manufactured_on
                    ? { manufactured_on: s(f.manufactured_on) }
                    : {}),
                });
              }}
            >
              <fieldset disabled={!premium}>
                <Field label="Produto">
                  {productSelect("product_id", true)}
                </Field>
                <Field label="Código do lote">
                  <input name="code" required maxLength={100} />
                </Field>
                <Field label="Fabricação">
                  <input name="manufactured_on" type="date" />
                </Field>
                <Field label="Validade">
                  <input name="expires_on" required type="date" />
                </Field>
                <button className="btn primary">Criar lote sem saldo</button>
              </fieldset>
            </form>
            <h3>Entrada, saída ou descarte</h3>
            <MovementForm
              products={products}
              batches={ops.batches}
              location={location}
              canManage={canManage}
              busy={busy || !ops.entitlements.can_write}
              run={run}
            />
          </div>
          <div className="operation-card">
            <h3>Validades e FEFO</h3>
            <Field label="Alertar até (dias)">
              <select
                value={expiryDays ?? ops.entitlements.expiry_alert_days}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
              >
                <option value={0}>Vencidos</option>
                <option value={7}>7 dias</option>
                <option value={15}>15 dias</option>
                <option value={30}>30 dias</option>
                <option value={36500}>Todos</option>
              </select>
            </Field>
            <button
              className="btn"
              disabled={
                !premium ||
                ![7, 15, 30].includes(
                  expiryDays ?? ops.entitlements.expiry_alert_days,
                )
              }
              onClick={() => {
                void run("expiry_settings", {
                  days: expiryDays ?? ops.entitlements.expiry_alert_days,
                });
              }}
            >
              Salvar preferência de alerta da empresa
            </button>
            <p>
              Lotes vencidos permitem somente saída com motivo Perda. A seleção
              de lote é sempre confirmada por você.
            </p>
            {!ops.batches.length && <p>Nenhum lote cadastrado.</p>}
            {ops.batches
              .filter(
                (b) =>
                  b.location_id === location &&
                  ((expiryDays ?? ops.entitlements.expiry_alert_days) === 0
                    ? b.expires_on < new Date(now).toISOString().slice(0, 10)
                    : b.expires_on <=
                      new Date(
                        now +
                          (expiryDays ?? ops.entitlements.expiry_alert_days) *
                            86400000,
                      )
                        .toISOString()
                        .slice(0, 10)),
              )
              .sort((a, b) => a.expires_on.localeCompare(b.expires_on))
              .map((b) => (
                <div className="operation-list-item" key={b.id}>
                  <strong>
                    {product(b.product_id)?.name} · {b.code}
                  </strong>
                  <p>
                    {number(b.quantity)} disponíveis · Validade{" "}
                    {b.expires_on.split("-").reverse().join("/")}{" "}
                    {b.expires_on < new Date().toISOString().slice(0, 10)
                      ? " · Vencido"
                      : ""}
                  </p>
                  <small>
                    Origem:{" "}
                    {b.source_order_id
                      ? "Pedido " + b.source_order_id.slice(0, 8)
                      : "Entrada manual"}
                  </small>
                </div>
              ))}
            <button
              className="btn"
              onClick={() =>
                download(
                  "lotes.csv",
                  toCSV([
                    ["Produto", "Local", "Lote", "Validade", "Saldo", "Pedido"],
                    ...ops.batches.map((b) => [
                      product(b.product_id)?.name,
                      locationName(b.location_id),
                      b.code,
                      b.expires_on,
                      b.quantity,
                      b.source_order_id,
                    ]),
                  ]),
                )
              }
            >
              Exportar lotes
            </button>
          </div>
        </div>
      )}

      {view === "Etiquetas" && (
        <div className="operations-grid">
          <div className="operation-card">
            <h3>Gerar etiquetas</h3>
            <p>
              Code 128 e QR para identificação interna. PDF A4 ou 60 × 40 mm;
              impressão térmica depende do driver da impressora.
            </p>
            <form
              className="stock-form"
              onSubmit={async (e) => {
                const f = values(e);
                setBusy(true);
                setError("");
                try {
                  const r = await fetch("/api/stock/labels", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      tenant_id: tenant,
                      product_ids: labelProducts,
                      copies: n(f.copies),
                      type: labelType,
                      format: labelFormat,
                      show_price: f.show_price === "on",
                      ...(f.batch_id ? { batch_id: s(f.batch_id) } : {}),
                    }),
                  });
                  if (!r.ok)
                    throw Error(((await r.json()) as { error: string }).error);
                  setPDF(URL.createObjectURL(await r.blob()));
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Falha ao gerar PDF.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <fieldset disabled={busy}>
                <legend>Produtos</legend>
                <div className="label-product-list">
                  {products.map((p) => (
                    <label className="inline-check" key={p.id}>
                      <input
                        type="checkbox"
                        checked={labelProducts.includes(p.id)}
                        onChange={(e) =>
                          setLabelProducts(
                            e.target.checked
                              ? [...labelProducts, p.id]
                              : labelProducts.filter((id) => id !== p.id),
                          )
                        }
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
                <div className="form-grid">
                  <Field label="Cópias por produto">
                    <input
                      name="copies"
                      type="number"
                      min="1"
                      max={pro ? 100 : 1}
                      required
                      defaultValue={1}
                    />
                  </Field>
                  <Field label="Modelo">
                    <select
                      value={labelType}
                      onChange={(e) => setLabelType(e.target.value)}
                    >
                      <option value="code128">Código de barras</option>
                      <option value="qrcode" disabled={!pro}>
                        QR Code (Pro)
                      </option>
                    </select>
                  </Field>
                  <Field label="Papel">
                    <select
                      value={labelFormat}
                      onChange={(e) => setLabelFormat(e.target.value)}
                    >
                      <option value="a4">A4 · 21 etiquetas</option>
                      <option value="thermal" disabled={!pro}>
                        60 × 40 mm (Pro)
                      </option>
                    </select>
                  </Field>
                </div>
                <label className="inline-check">
                  <input name="show_price" type="checkbox" disabled={!pro} />
                  Exibir preço
                </label>
                {pro && labelProducts.length === 1 && (
                  <Field label="Lote e validade (opcional)">
                    <select name="batch_id">
                      <option value="">Sem lote</option>
                      {ops.batches
                        .filter((b) => b.product_id === labelProducts[0])
                        .map((b) => (
                          <option value={b.id} key={b.id}>
                            {b.code} · {locationName(b.location_id)}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                <button
                  className="btn primary"
                  disabled={!labelProducts.length}
                >
                  Gerar prévia PDF
                </button>
              </fieldset>
            </form>
          </div>
          {pdf && (
            <div className="operation-card">
              <a
                className="btn primary"
                href={pdf}
                download="stockinho-etiquetas.pdf"
              >
                Baixar PDF para imprimir
              </a>
              <iframe
                title="Prévia das etiquetas"
                src={pdf}
                className="label-preview"
              />
            </div>
          )}
        </div>
      )}

      {view === "Financeiro" && (
        <div className="operation-card">
          <h3>Valor do estoque a custo</h3>
          <p>
            Posição atual do local selecionado. Custo médio móvel em compras;
            custos históricos anteriores à migration não são reconstruídos.
            Preço de venda não representa lucro.
          </p>
          <div className="form-grid">
            <Field label="Histórico a partir de">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="Histórico até">
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          </div>
          {!finance ? (
            <p role="status">Carregando indicadores…</p>
          ) : (
            <>
              <div className="stats-grid">
                {[
                  ["Estoque a custo", money(finance.value)],
                  ["Produtos ativos", number(finance.active_products)],
                  ["Abaixo do mínimo", number(finance.low_stock)],
                  ["Sem movimento há 30 dias", number(finance.stale_products)],
                ].map(([label, value]) => (
                  <div className="stat-card" key={label}>
                    <p>{label}</p>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <p>
                {finance.zero_cost_products} produtos estão com custo zero
                cadastrado. Unidades são agrupadas por medida:{" "}
                {finance.units
                  .map((u) => `${number(u.quantity)} ${u.unit}`)
                  .join(" · ") || "Sem saldo"}
                .
              </p>
              {!pro ? (
                <p>Os relatórios detalhados exigem Pro.</p>
              ) : (
                <>
                  <h3>Valor por categoria</h3>
                  {finance.categories.map((c) => (
                    <div key={c.name} className="valuation-row">
                      <span>{c.name}</span>
                      <meter
                        min={0}
                        max={Math.max(finance.value, 1)}
                        value={c.value}
                      />
                      <strong>{money(c.value)}</strong>
                    </div>
                  ))}
                  <h3>Valor por local</h3>
                  {finance.locations.map((l) => (
                    <p key={l.name}>
                      {l.name}: {money(l.value)}
                    </p>
                  ))}
                  <h3>Maior valor imobilizado</h3>
                  {finance.top.map((p) => (
                    <p key={p.name}>
                      {p.name}: {money(p.value)}
                    </p>
                  ))}
                  <h3>Evolução registrada</h3>
                  {!!finance.unknown_cost_movements && (
                    <p>
                      {finance.unknown_cost_movements} movimentos do período não
                      têm custo histórico e foram excluídos dos totais de
                      entrada/saída.
                    </p>
                  )}
                  {!!finance.history.length && (
                    <div
                      style={{ width: "100%", height: 260 }}
                      aria-label="Evolução diária do valor do estoque"
                    >
                      <ResponsiveContainer>
                        <AreaChart data={finance.history}>
                          <XAxis dataKey="day" />
                          <YAxis />
                          <Tooltip
                            formatter={(value) => money(Number(value))}
                          />
                          <Area
                            dataKey="value"
                            name="Valor a custo"
                            stroke="#179c72"
                            fill="#d7eee3"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {!finance.history.length ? (
                    <p>Sem registros no período selecionado.</p>
                  ) : (
                    <div className="operation-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Dia</th>
                            <th>Valor a custo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {finance.history.map((h) => (
                            <tr key={h.day}>
                              <td>{h.day.split("-").reverse().join("/")}</td>
                              <td>{money(h.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p>
                    Entradas no período a custo: {money(finance.incoming)} ·
                    Saídas a custo: {money(finance.outgoing)}. Inclui
                    transferências; não representa faturamento.
                  </p>
                  <p>
                    Divergências de inventários concluídos:{" "}
                    {money(finance.discrepancies)} · Lotes vencendo em 30 dias:{" "}
                    {finance.expiring_batches}
                  </p>
                </>
              )}
              <button
                className="btn"
                onClick={() =>
                  download(
                    "financeiro.csv",
                    toCSV([
                      ["Indicador", "Valor"],
                      ["Estoque a custo", finance.value],
                      ["Produtos ativos", finance.active_products],
                      ["Estoque mínimo", finance.low_stock],
                      ...(pro
                        ? finance.categories.map((c) => [
                            "Categoria " + c.name,
                            c.value,
                          ])
                        : []),
                    ]),
                  )
                }
              >
                <Download size={16} />
                Exportar
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
type Finance = {
  unknown_cost_movements?: number;
  value: number;
  active_products: number;
  low_stock: number;
  stale_products: number;
  zero_cost_products: number;
  units: { unit: string; quantity: number }[];
  categories: { name: string; value: number }[];
  locations: { name: string; value: number }[];
  top: { name: string; value: number }[];
  history: { day: string; value: number }[];
  incoming: number;
  outgoing: number;
  discrepancies: number;
  expiring_batches: number;
};

function MovementForm({
  p,
  products,
  batches,
  location,
  canManage,
  busy,
  run,
}: {
  p?: Product;
  products: Product[];
  batches: OperationsData["batches"];
  location: string;
  canManage: boolean;
  busy: boolean;
  run: (
    action: OperationAction,
    payload: unknown,
  ) => Promise<{ id: string } | null>;
}) {
  const [pid, setPid] = useState(p?.id || "");
  const current = products.find((p) => p.id === pid);
  return (
    <form
      className="stock-form"
      onSubmit={(e) => {
        const f = values(e);
        void run("movement", {
          product_id: pid,
          location_id: location,
          type: s(f.type),
          quantity: n(f.quantity),
          reason: s(f.reason),
          note: s(f.note),
          ...(f.batch_id ? { batch_id: s(f.batch_id) } : {}),
          ...(s(f.unit_cost) ? { unit_cost: n(f.unit_cost) } : {}),
        });
      }}
    >
      {!p && (
        <Field label="Produto">
          <select required value={pid} onChange={(e) => setPid(e.target.value)}>
            <option value="">Selecione</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {current?.track_batches && (
        <Field label="Lote (sugestão FEFO: primeiro a vencer)">
          <select name="batch_id" required defaultValue="">
            <option value="" disabled>
              Confira e selecione o lote
            </option>
            {batches
              .filter((b) => b.product_id === pid && b.location_id === location)
              .sort((a, b) => a.expires_on.localeCompare(b.expires_on))
              .map((b) => (
                <option value={b.id} key={b.id}>
                  {b.code} · {b.expires_on.split("-").reverse().join("/")} ·{" "}
                  {number(b.quantity)} disponíveis
                </option>
              ))}
          </select>
        </Field>
      )}
      <div className="form-grid">
        <Field label="Tipo">
          <select name="type">
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </select>
        </Field>
        <Field label="Quantidade">
          <Amount name="quantity" defaultValue={1} min={0.01} />
        </Field>
        <Field label="Motivo">
          <select name="reason">
            <option>Compra</option>
            <option>Venda</option>
            <option>Devolução</option>
            <option>Perda</option>
            {canManage && <option>Ajuste de inventário</option>}
          </select>
        </Field>
        {canManage && (
          <Field label="Custo unitário da entrada (opcional)">
            <input
              name="unit_cost"
              type="number"
              min="0"
              max="100000000"
              step="0.01"
            />
          </Field>
        )}
      </div>
      <Field label="Observação">
        <input name="note" maxLength={500} />
      </Field>
      <button className="btn primary" disabled={busy || !pid || !location}>
        Confirmar movimentação
      </button>
    </form>
  );
}
