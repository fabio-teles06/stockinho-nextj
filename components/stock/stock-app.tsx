"use client";
import {
  useEffect,
  useState,
  useMemo,
  useRef,
  Children,
  isValidElement,
  FormEvent,
} from "react";
import Link from "next/link";
import PendingInvoiceNotice from "@/components/billing/pending-invoices";
import dynamic from "next/dynamic";
import { operationViews } from "@/modules/stock/navigation";
import { toCSV } from "@/modules/stock/csv-export";
import CashierScanner from "@/components/stock/cashier-scanner";
import { addCartItem } from "@/modules/stock/cart";
const OperationsPanel = dynamic(() => import("@/components/stock/operations-panel"), {loading: () => <p role="status">Carregando ferramentas de estoque…</p>});
import { useRouter } from "next/navigation";
import {
  Package,
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Tags,
  Store,
  Sparkles,
  Settings,
  HelpCircle,
  Search,
  Bell,
  ChevronRight,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  TriangleAlert,
  Wallet,
  Boxes,
  CalendarDays,
  Download,
  Send,
  Mail,
  TrendingUp,
  Clock3,
  Check,
  MoreHorizontal,
  Pencil,
  Trash2,
  LogOut,
  Building2,
  Leaf,
  X,
  SlidersHorizontal,
  ShoppingCart,
  CreditCard,
  ScanBarcode,
  ClipboardList,
  FileSpreadsheet,
  Truck,
  ClipboardPenLine,
  Repeat2,
  Layers3,
  Tag,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  Data,
  Product,
  uid,
  money,
  number,
} from "@/modules/stock/model";
const nav = [
  ["Visão geral", LayoutDashboard],
  ["Caixa", ShoppingCart],
  ["Produtos", Package],
  ["Movimentações", ArrowLeftRight],
  ["Categorias", Tags],
  ["Lojas e depósitos", Store],
  ["Escanear código", ScanBarcode],
  ["Inventários", ClipboardList],
  ["Importação", FileSpreadsheet],
  ["Fornecedores", Truck],
  ["Pedidos de compra", ClipboardPenLine],
  ["Transferências", Repeat2],
  ["Lotes e validades", Layers3],
  ["Etiquetas", Tag],
  ["Financeiro", Wallet],
  ["Assistente IA", Sparkles],
] as const;
function Pick({
  value,
  onChange,
  items,
  label,
  className = "",
}: {
  value: string;
  onChange: (s: string) => void;
  items: { id: string; name: string }[];
  label: string;
  className?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={"pick " + className}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {items.map((x) => (
          <SelectItem key={x.id} value={x.id}>
            {x.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function FormSelect({
  name,
  defaultValue,
  required,
  children,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((el: any) => ({
      value: el.props.value ?? el.props.children,
      label: el.props.children,
      disabled: el.props.disabled,
    }));
  return (
    <Select
      name={name}
      defaultValue={
        defaultValue || options.find((o) => o.value && !o.disabled)?.value
      }
      required={required}
    >
      <SelectTrigger className="form-select" aria-label={name}>
        <SelectValue placeholder="Selecione" />
      </SelectTrigger>
      <SelectContent>
        {options
          .filter((o) => o.value)
          .map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
function IconBox({ icon: Icon, tone = "green" }: { icon: any; tone?: string }) {
  return (
    <span className={"icon-box " + tone}>
      <Icon size={21} />
    </span>
  );
}
const titles: Record<string, string> = {
  ...Object.fromEntries(operationViews.map(label => [label, "Operações integradas ao estoque da sua empresa."])),
  "Visão geral": "Um olhar para o seu negócio, tudo em um só lugar.",
  Produtos: "Seu catálogo organizado, do cadastro à prateleira.",
  Movimentações: "Acompanhe cada entrada e saída do seu estoque.",
  Categorias: "Uma organização simples para encontrar tudo.",
  "Lojas e depósitos": "Cada unidade com seu estoque, tudo conectado.",
  "Assistente IA": "Respostas úteis para cuidar melhor do seu negócio.",
  Caixa: "Registre vendas e finalize pagamentos com rapidez.",
  Configurações: "Organize sua empresa e suas preferências.",
  Ajuda: "Um jeito fácil de começar.",
};
export default function StockApp({
  initialData,
  initialEmail,
  initialUserId,
}: {
  initialData: Data;
  initialEmail?: string;
  initialUserId?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<Data>(initialData);
  const [view, setView] = useState(
    initialData.companies.length ? "Visão geral" : "Configurações",
  );
  const [tenant, setTenant] = useState(initialData.companies[0]?.id || "");
  const [location, setLocation] = useState(initialData.locations[0]?.id || "");
  const [search, setSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [proIntent, setProIntent] = useState(false);
  const [filter, setFilter] = useState("all");
  const [period, setPeriod] = useState("7");
  const [modal, setModal] = useState(
    initialData.companies.length ? "" : "company",
  );
  const [edit, setEdit] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [operationKey, setOperationKey] = useState(uid);
  const [aiRemaining, setAiRemaining] = useState<number | null>(null);
  useEffect(() => {
    if(view!=="Assistente IA"||!tenant)return;
    const controller=new AbortController();
    fetch('/api/stock/operations?usage=1&tenant_id='+tenant,{signal:controller.signal}).then(async r=>{
      if(!r.ok)return;
      const b=await r.json() as {entitlements:{pro:boolean;ai_used:number}};
      if(!controller.signal.aborted)setAiRemaining(b.entitlements.pro?Math.max(0,50-b.entitlements.ai_used):0);
    }).catch(()=>{});
    return ()=>controller.abort();
  },[tenant,view]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [accountingOpen, setAccountingOpen] = useState(false);
  const [accountingEmail, setAccountingEmail] = useState("");
  const [accountingBusy, setAccountingBusy] = useState(false);
  const [assistantTipOpen, setAssistantTipOpen] = useState(true);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<{ role: string; text: string }[]>(
    [],
  );
  const [cart, setCart] = useState<{ product_id: string; quantity: number }[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"system" | "credit" | "debit">("system");
  const [installments, setInstallments] = useState(1);
  const [tapPendingOrder, setTapPendingOrder] = useState("");
  const [user] = useState(initialEmail?.split("@")[0] || "Olá");
  const initials = user.split(/[._\s-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  useEffect(() => {
    const restoreView = () => {
      const requested = new URLSearchParams(window.location.search).get("view");
      if (requested && Object.hasOwn(titles, requested)) setView(requested);
      else setView(initialData.companies.length ? "Visão geral" : "Configurações");
      setSearch("");
      setFilter("all");
    };
    restoreView();
    setProIntent(new URLSearchParams(window.location.search).get("intent") === "pro" || sessionStorage.getItem("stockinho-plan") === "pro");
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, [initialData.companies.length]);
  useEffect(() => {
    if (notice) {
      toast.success(notice);
      const t = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    const timer = setTimeout(() => setAssistantTipOpen(false), 15000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order_id");
    if (params.get("tap_result") === "1" && orderId) {
      setTapPendingOrder(orderId);
      const url = new URL(window.location.href);
      url.searchParams.delete("tap_result");
      url.searchParams.delete("order_id");
      url.searchParams.set("view", "Caixa");
      window.history.replaceState({}, "", url);
      setView("Caixa");
    }
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        go("Produtos");
        requestAnimationFrame(() =>
          (
            document.querySelector(
              ".input-search input",
            ) as HTMLInputElement | null
          )?.focus(),
        );
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  const current = useRef({ data, tenant, location });
  current.current = { data, tenant, location };
  useEffect(() => {
    const registry = (document as any).modelContext;
    if (!registry?.registerTool) return;
    const controller = new AbortController();
    try {
      Promise.resolve(
        registry.registerTool(
          {
            name: "get_stock_summary",
            title: "Consultar estoque da unidade",
            description:
              "Consulta produtos e alertas da empresa e unidade atualmente selecionadas, sem modificar dados.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute(input: unknown) {
              if (
                input === null ||
                typeof input !== "object" ||
                Array.isArray(input) ||
                Object.keys(input).length
              )
                throw Error("Este comando não aceita parâmetros.");
              const { data, tenant, location } = current.current;
              return {
                company: data.companies.find((c) => c.id === tenant)?.name,
                location: data.locations.find((l) => l.id === location)?.name,
                products: data.products
                  .filter((p) => p.tenant_id === tenant && p.active)
                  .map((p) => ({
                    name: p.name,
                    unit: p.unit,
                    minimum: p.min_quantity,
                    quantity: data.balances
                      .filter(
                        (b) =>
                          b.tenant_id === tenant &&
                          b.product_id === p.id &&
                          b.location_id === location,
                      )
                      .reduce((s, b) => s + Number(b.quantity), 0),
                  })),
              };
            },
          },
          { signal: controller.signal },
        ),
      ).catch(() => { });
    } catch { }
    return () => controller.abort();
  }, []);
  const locations = data.locations.filter((x) => x.tenant_id === tenant),
    categories = data.categories.filter((x) => x.tenant_id === tenant),
    products = data.products.filter((x) => x.tenant_id === tenant && x.active);
  const role =
    data.memberships.find(
      (membership) =>
        membership.tenant_id === tenant &&
        membership.user_id === initialUserId,
    )
      ?.role || "operator";
  const canManage = role === "admin";
  const setupSteps = [
    { label: "Empresa", done: Boolean(tenant), action: "company" },
    { label: "Unidade", done: locations.length > 0, action: "location" },
    { label: "Categoria", done: categories.length > 0, action: "category" },
    { label: "Produto", done: products.length > 0, action: "product" },
    {
      label: "Entrada inicial",
      done: data.movements.some((movement) => movement.tenant_id === tenant && movement.type === "entrada"),
      action: "movement",
    },
  ];
  const qty = (id: string) =>
    data.balances
      .filter(
        (b) =>
          b.product_id === id &&
          b.tenant_id === tenant &&
          b.location_id === location,
      )
      .reduce((s, b) => s + Number(b.quantity), 0);
  const movements = data.movements
    .filter((m) => m.tenant_id === tenant && m.location_id === location)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const low = products.filter((p) => qty(p.id) <= Number(p.min_quantity));
  const stockValue = products.reduce(
    (s, p) => s + qty(p.id) * Number(p.cost_price),
    0,
  );
  const recent = movements.filter(
    (m) =>
      new Date(m.created_at).getTime() >=
      Date.now() - Number(period) * 86400000,
  );
  const incoming = recent
    .filter((m) => m.type === "entrada")
    .reduce((s, m) => s + Number(m.quantity), 0),
    outgoing = recent
      .filter((m) => m.type === "saida")
      .reduce((s, m) => s + Number(m.quantity), 0);
  const chart = useMemo(
    () =>
      Array.from({ length: Number(period) }, (_, i) => {
        const day = new Date();
        day.setDate(day.getDate() - Number(period) + 1 + i);
        const key = day.toLocaleDateString("pt-BR");
        const mm = movements.filter(
          (m) => new Date(m.created_at).toLocaleDateString("pt-BR") === key,
        );
        return {
          day: day.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
          }),
          Entradas: mm
            .filter((m) => m.type === "entrada")
            .reduce((s, m) => s + Number(m.quantity), 0),
          Saídas: mm
            .filter((m) => m.type === "saida")
            .reduce((s, m) => s + Number(m.quantity), 0),
        };
      }),
    [data, tenant, location, period],
  );
  function go(v: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    if (url.href !== window.location.href) window.history.pushState({}, "", url);
    setView(v);
    setSearch("");
    setFilter("all");
    setError("");
  }
  function open(type: string, item: any = null) {
    setOperationKey(uid());
    setEdit(item);
    setModal(type);
    setError("");
  }
  async function change(
    action: string,
    payload: any,
  ): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, tenant_id: tenant, ...payload }),
        });
        const b: any = await r.json();
        if (!r.ok) throw Error(b.error || "Não foi possível salvar.");
        const updated = await fetch("/api/stock");
        if (!updated.ok)
          throw Error("Salvo, mas não foi possível atualizar a lista.");
        const next = ((await updated.json()) as { data: Data }).data;
        setData(next);
        const nextTenant = next.companies.some((company) => company.id === tenant)
          ? tenant : next.companies[0]?.id || "";
        setTenant(nextTenant);
        if (!next.locations.some((item) => item.id === location && item.tenant_id === nextTenant))
          setLocation(next.locations.find((item) => item.tenant_id === nextTenant)?.id || "");
        if (nextTenant !== tenant) setMessages([]);
      setModal("");
      setDeleting(null);
      setNotice("Tudo certo! Alteração salva.");
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function readImage(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Não foi possível ler a foto."));
      reader.readAsDataURL(file);
    });
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const id = edit?.id || operationKey;
    if (modal === "product") {
      const p: Product = {
        id,
        tenant_id: tenant,
        name: String(f.name).trim(),
        barcode: String(f.barcode).trim(),
        sku: String(f.sku || "").trim(),
        track_batches: edit?.track_batches || f.track_batches === "on",
        category_id: String(f.category_id),
        unit: String(f.unit),
        cost_price: Number(f.cost_price),
        sale_price: Number(f.sale_price),
        min_quantity: Number(f.min_quantity),
        active: true,
        image_url: edit?.image_url || null,
      };
      if (!p.name || !p.category_id) {
        setError("Informe o nome e a categoria.");
        return;
      }
      if (
        products.some(
          (x) => x.id !== id && p.barcode && x.barcode === p.barcode,
        )
      ) {
        setError("Este código de barras já está cadastrado.");
        return;
      }
      const image = f.image;
      let image_data: string | undefined;
      try {
        image_data =
          image instanceof File && image.size ? await readImage(image) : undefined;
      } catch (imageError) {
        setError(imageError instanceof Error ? imageError.message : "Não foi possível ler a foto.");
        return;
      }
      change("product", { item: p, image_data });
    }
    if (modal === "movement") {
      const quantity = Number(f.quantity),
        type = String(f.type),
        pid = String(f.product_id);
      if (!location || !pid || quantity <= 0) {
        setError("Selecione a unidade, o produto e uma quantidade válida.");
        return;
      }
      if (type === "saida" && qty(pid) < quantity) {
        setError(
          "Estoque insuficiente. A saída não pode deixar o saldo negativo.",
        );
        return;
      }
      if (
        (type === "entrada" && ["Venda", "Perda"].includes(String(f.reason))) ||
        (type === "saida" &&
          ["Compra", "Ajuste inicial"].includes(String(f.reason)))
      ) {
        setError(
          "O motivo selecionado não corresponde ao tipo de movimentação.",
        );
        return;
      }
      const item = {
        id,
        tenant_id: tenant,
        location_id: location,
        product_id: pid,
        type,
        quantity,
        reason: String(f.reason),
        note: String(f.note),
        created_at: new Date().toISOString(),
      };
      change("movement", { item });
    }
    if (modal === "category") {
      const item = {
        id,
        tenant_id: tenant,
        name: String(f.name).trim(),
        color: String(f.color),
      };
      change("category", { item });
    }
    if (modal === "location") {
      const item = {
        id,
        tenant_id: tenant,
        name: String(f.name).trim(),
        type: String(f.type),
        address: String(f.address),
        active: f.active !== "false",
      };
      change("location", { item });
    }
    if (modal === "member") {
      change("member", { email: String(f.email), role: String(f.role) });
    }
    if (modal === "company") {
      const item = { id, name: String(f.name).trim() };
      change("company", { item });
    }
  }
  async function ask(q = question) {
    if (!q.trim() || busy) return;
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const r = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: q,
            tenant_id: tenant,
            location_id: location,
          }),
        });
        const b: any = await r.json();
        if (!r.ok) throw Error(b.error);
      const answer = b.answer;
      setAiRemaining(typeof b.remaining === "number" ? b.remaining : null);
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Não consegui consultar agora. " + e.message,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }
  function exportData() {
    const rows = [
      [
        "Produto",
        "Categoria",
        "Unidade",
        "Quantidade",
        "Mínimo",
        "Custo",
        "Venda",
      ],
      ...products.map((p) => [
        p.name,
        categories.find((c) => c.id === p.category_id)?.name,
        p.unit,
        qty(p.id),
        p.min_quantity,
        p.cost_price,
        p.sale_price,
      ]),
    ];
    const text = toCSV(rows);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8;" }),
    );
    a.download = "stockinho-estoque.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    setNotice("Relatório de estoque exportado.");
  }
  const visible = products.filter(
    (p) =>
      (p.name + " " + p.barcode + " " + (p.sku || "")).toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "low" && qty(p.id) <= p.min_quantity) ||
        (filter === "zero" && qty(p.id) === 0) ||
        p.category_id === filter),
  );
  const totalUnits = products.reduce((s, p) => s + qty(p.id), 0);
  const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const abcRows = products
    .map((product) => {
      const sales = movements
        .filter(
          (movement) =>
            movement.product_id === product.id &&
            movement.type === "saida" &&
            movement.reason === "Venda" &&
            new Date(movement.created_at).getTime() >= sixtyDaysAgo,
        )
        .reduce((sum, movement) => sum + Number(movement.quantity), 0);
      const currentQty = qty(product.id);
      const lastSale = movements
        .filter(
          (movement) =>
            movement.product_id === product.id && movement.type === "saida" && movement.reason === "Venda",
        )
        .reduce(
          (latest, movement) =>
            Math.max(latest, new Date(movement.created_at).getTime()),
          0,
        );
      return { product, sales, currentQty, lastSale };
    })
    .sort((a, b) => b.sales - a.sales);
  const topProducts = abcRows.filter((row) => row.sales > 0).slice(0, 5);
  const stagnantProducts = abcRows
    .filter((row) => row.currentQty > 0 && row.lastSale < sixtyDaysAgo)
    .sort((a, b) => b.currentQty * Number(b.product.cost_price) - a.currentQty * Number(a.product.cost_price))
    .slice(0, 5);
  async function sendAccountingReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountingBusy(true);
    try {
      const response = await fetch("/api/reports/accounting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenant,
          location_id: location,
          email: accountingEmail,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível enviar o relatório.");
      setAccountingOpen(false);
      setAccountingEmail("");
      setNotice("Fechamento enviado para o e-mail do contador.");
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Não foi possível enviar o relatório.");
    } finally {
      setAccountingBusy(false);
    }
  }
    const cartDetails = cart
      .map((item) => {
        const product = products.find((candidate) => candidate.id === item.product_id);
        return product ? { ...item, product, total: item.quantity * Number(product.sale_price) } : null;
      })
      .filter((item): item is { product_id: string; quantity: number; product: Product; total: number } => Boolean(item));
    const cartTotal = cartDetails.reduce((sum, item) => sum + item.total, 0);
    const cashierProducts = products.filter((product) =>
      `${product.name} ${product.barcode} ${product.sku || ""}`.toLowerCase().includes(search.toLowerCase()) && qty(product.id) > 0,
    );
    function addToCart(product: Product) {
      if (busy) return false;
      try {
        setCart(addCartItem(cart, product.id, qty(product.id)));
        setError("");
        return true;
      } catch (cartError) {
        setError(cartError instanceof Error ? cartError.message : "Não foi possível adicionar o produto.");
        return false;
      }
    }
    function confirmSale(externalOrderId?: string) {
      if (!cartDetails.length) {
        setError("Adicione pelo menos um produto ao carrinho.");
        return;
      }
      change("sale", {
        sale: {
          location_id: location,
          payment_method: paymentMethod,
          installments: paymentMethod === "credit" ? installments : 1,
          external_order_id: externalOrderId,
          items: cartDetails.map(({ product_id, quantity }) => ({ product_id, quantity })),
        },
      }).then((success) => {
        if (success) {
          setCart([]);
          setTapPendingOrder("");
        }
      });
    }
    function cancelSale() {
      setCart([]);
      setTapPendingOrder("");
      setError("");
      setNotice("Venda cancelada.");
    }
    function openInfiniteTap() {
      if (!cartDetails.length || cartTotal < 1) {
        setError("O Checkout Tap exige uma venda de pelo menos R$ 1,00.");
        return;
      }
      if (paymentMethod === "system") {
        setError("Selecione crédito ou débito para usar o Checkout Tap.");
        return;
      }
      const orderId = uid();
      setTapPendingOrder(orderId);
      const params = new URLSearchParams({
        amount: String(Math.round(cartTotal * 100)),
        payment_method: paymentMethod,
        installments: String(paymentMethod === "credit" ? installments : 1),
        order_id: orderId,
        result_url: `${window.location.origin}/painel?tap_result=1&order_id=${orderId}`,
        app_client_referrer: "Stockinho",
        af_force_deeplink: "true",
      });
      window.location.href = `infinitepaydash://infinitetap-app?${params.toString()}`;
      setNotice("Checkout Tap aberto. Ao concluir o pagamento, volte e confirme a venda.");
    }
  function ProductTable({ compact = false }: { compact?: boolean }) {
    const rows = compact ? low.slice(0, 5) : visible;
    return (
      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              {!compact && <TableHead>Categoria</TableHead>}
              <TableHead>Em estoque</TableHead>
              <TableHead>Estoque mínimo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>{compact ? "" : "Preço de venda"}</TableHead>
              <th />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="product-name">
                    {p.image_url ? (
                      <img className="product-photo" src={p.image_url} alt="" />
                    ) : (
                      <span className={"product-icon cat-" + p.category_id.slice(-1)}>
                        <Package size={19} />
                      </span>
                    )}
                    <div>
                      <strong>{p.name}</strong>
                      <small>{p.barcode || "Sem código de barras"}</small>
                    </div>
                  </div>
                </TableCell>
                {!compact && (
                  <TableCell>
                    {categories.find((c) => c.id === p.category_id)?.name ||
                      "Sem categoria"}
                  </TableCell>
                )}
                <TableCell>
                  <b className={qty(p.id) === 0 ? "red-text" : ""}>
                    {number(qty(p.id))}
                  </b>{" "}
                  <span className="muted">{p.unit}</span>
                </TableCell>
                <TableCell>
                  {number(p.min_quantity)}{" "}
                  <span className="muted">{p.unit}</span>
                </TableCell>
                <TableCell>
                  <span
                    className={
                      "badge " +
                      (qty(p.id) === 0
                        ? "danger"
                        : qty(p.id) <= p.min_quantity
                          ? "warning"
                          : "success")
                    }
                  >
                    {qty(p.id) === 0
                      ? "Sem estoque"
                      : qty(p.id) <= p.min_quantity
                        ? "Estoque baixo"
                        : "Normal"}
                  </span>
                </TableCell>
                <TableCell>
                  {compact ? (
                    <button
                      className="text-button"
                      onClick={() =>
                        open("movement", { product_id: p.id, type: "entrada" })
                      }
                    >
                      Repor <Plus size={14} />
                    </button>
                  ) : (
                    money(Number(p.sale_price))
                  )}
                </TableCell>
                <TableCell>
                  {!compact && (
                    <div className="row-actions">
                      {canManage && (
                        <>
                          <button
                            aria-label={"Editar " + p.name}
                            onClick={() => open("product", p)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            aria-label={"Arquivar " + p.name}
                            onClick={() =>
                              setDeleting({ type: "product", item: p })
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && (
          <div className="empty">
            <Package />
            <h3>{compact ? (products.length ? "Estoque em dia!" : "Seu estoque começa aqui") : products.length ? "Nenhum produto encontrado" : "Cadastre seu primeiro produto"}</h3>
            <p>
              {compact
                ? (products.length ? "Nenhum produto precisa de reposição." : "Adicione produtos e registre uma entrada para acompanhar os saldos.")
                : products.length ? "Tente outro nome, código de barras ou remova os filtros." : "Comece pelo nome, categoria e preço do produto."}
            </p>
            {!compact && products.length > 0 && <button className="btn" onClick={() => { setSearch(""); setFilter("all"); }}>Limpar busca e filtros</button>}
            {!products.length && canManage && <button className="btn primary" onClick={() => open(categories.length ? "product" : "category")}>{categories.length ? "Cadastrar produto" : "Criar primeira categoria"}</button>}
          </div>
        )}
      </div>
    );
  }
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "248px" } as React.CSSProperties}
    >
      <Sidebar className="stock-sidebar">
        <SidebarHeader>
          <Link className="brand" href="/painel" aria-label="Stockinho painel">
            <span>
              <Package size={26} strokeWidth={2} />
            </span>
            stockinho<span className="brand-dot">.</span>
          </Link>
          <div className="company-picker">
            <span className="company-icon">
              <Store size={19} />
            </span>
            <Pick
              label="Empresa"
              value={tenant}
              items={data.companies}
              onChange={(id) => {
                setTenant(id);
                setLocation(
                  data.locations.find((l) => l.tenant_id === id)?.id || "",
                );
                setMessages([]);
              }}
            />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <div className="nav-label">PRINCIPAL</div>
          <SidebarMenu>
            {nav.map(([name, Icon]) => (
              <SidebarMenuItem key={name}>
                <SidebarMenuButton
                  className={"nav-item " + (view === name ? "selected" : "")}
                  isActive={view === name}
                  onClick={() => go(name)}
                >
                  <Icon />
                  <span>{name}</span>
                  {name === "Assistente IA" && (
                    <span className="new-badge">NOVO</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="nav-label manage">GERENCIAR</div>
          <SidebarMenu>
            {[
              ["Configurações", Settings],
              ["Ajuda", HelpCircle],
            ].map(([name, Icon]: any) => (
              <SidebarMenuItem key={name}>
                <SidebarMenuButton
                  className={"nav-item " + (view === name ? "selected" : "")}
                  onClick={() => go(name)}
                >
                  <Icon />
                  <span>{name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          {assistantTipOpen && (
            <div className="sidebar-tip">
              <button
                className="tip-close"
                type="button"
                aria-label="Fechar ajuda do assistente"
                onClick={() => setAssistantTipOpen(false)}
              >
                <X size={15} />
              </button>
              <span className="tip-icon">
                <Sparkles size={20} />
              </span>
              <strong>Uma mãozinha para o seu negócio</strong>
              <p>Tire dúvidas sobre seu estoque com o assistente Stockinho.</p>
              <button onClick={() => go("Assistente IA")}>
                Vamos conversar <ArrowUpRight size={16} />
              </button>
            </div>
          )}
          <button className="profile" onClick={() => go("Configurações")}>
            <span className="avatar">{initials}</span>
            <span>
              <strong>{user}</strong>
              <small>{role === "admin" ? "Administrador" : "Operador"}</small>
            </span>
            <Settings size={17} />
          </button>
        </SidebarFooter>
      </Sidebar>
      <div className="app-body">
        <PendingInvoiceNotice tenantId={tenant} />
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger className="mobile-trigger" />
            <span>Meu negócio</span>
            <ChevronRight size={14} />
            <b>{view}</b>
          </div>
          <div className="top-actions">
            <form className="top-search" role="search" onSubmit={(event) => { event.preventDefault(); go("Produtos"); setSearch(globalSearch); }}>
              <Search size={17} />
              <input
                aria-label="Buscar produtos"
                placeholder="Buscar produtos…"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
              <button type="submit" className="search-submit" aria-label="Pesquisar produtos"><ChevronRight size={18} /></button>
            </form>
            <button
              className="notification"
              aria-label="Ver alertas de estoque"
              onClick={() => {
                go("Produtos");
                setFilter("low");
              }}
            >
              <Bell size={20} />
              {low.length > 0 && <i />}
            </button>
            <span className="top-avatar" title={initialEmail}>{initials}</span>
          </div>
        </header>
        <main className="workspace">
          {proIntent && (
            <aside className="onboarding-panel" aria-label="Contratação do Pro">
              <div>
                <strong>Continue com o plano Pro</strong>
                <p>{tenant ? "Revise os dados e a cobrança antes de contratar." : "Cadastre sua empresa para continuar a contratação."}</p>
              </div>
              {tenant && <Link className="btn primary" href={`/configuracoes/assinatura?tenant_id=${tenant}`}>Revisar plano Pro</Link>}
              <button className="btn" onClick={() => {
                setProIntent(false);
                sessionStorage.removeItem("stockinho-plan");
                const url = new URL(window.location.href);
                url.searchParams.delete("intent");
                window.history.replaceState({}, "", url);
              }}>Agora não</button>
            </aside>
          )}
          {(canManage || !tenant) && setupSteps.some((step) => !step.done) && (
            <section className="onboarding-panel" aria-label="Primeiros passos">
              <div>
                <strong>Prepare seu estoque</strong>
                <p>Complete os passos para começar a acompanhar seu negócio.</p>
                <ol className="onboarding-steps">
                  {setupSteps.map((step, index) => (
                    <li key={step.action}>
                      <button
                        className="btn"
                        disabled={step.done || setupSteps.slice(0, index).some((previous) => !previous.done)}
                        onClick={() => open(step.action, step.action === "movement" ? { type: "entrada" } : null)}
                      >
                        {step.done && <Check size={15} />} {index + 1}. {step.label}{step.done ? " — concluído" : ""}
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}
          {error && !modal && !deleting && !accountingOpen && <p className="form-error" role="alert">{error}</p>}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "Visão geral"
                  ? "SEU NEGÓCIO EM DIA"
                  : "MERCADINHO BEM ORGANIZADO"}
              </div>
              <h1>
                {view === "Visão geral" ? `Olá, ${user}!` : view}
                {view === "Visão geral" && <span className="hello">☀</span>}
              </h1>
              <p>{titles[view]}</p>
            </div>
            <div className="location-picker">
              <Store size={17} />
              <Pick
                label="Loja ou depósito"
                value={location}
                items={locations}
                onChange={(v) => {
                  setLocation(v);
                  setMessages([]);
                }}
              />
            </div>
          </div>
          {(operationViews as readonly string[]).includes(view) && <OperationsPanel key={tenant + location + view} view={view} data={data} tenant={tenant} location={location} canManage={canManage} refresh={async () => {
            const r = await fetch("/api/stock");
            const b = await r.json() as {data:Data};
            if (!r.ok) throw Error("Salvo. Atualize a página para consultar os dados.");
            setData(b.data);
          }} />}
          {view === "Visão geral" && (
            <>
              <div className="dashboard-toolbar">
                <div className="section-tabs">
                  <button className="active">Visão geral</button>
                  <button onClick={() => go("Movimentações")}>
                    Atividade recente
                  </button>
                </div>
                <div className="toolbar-actions">
                  <CalendarDays size={16} />
                  <Pick
                    value={period}
                    onChange={setPeriod}
                    label="Período"
                    items={[
                      { id: "7", name: "Últimos 7 dias" },
                      { id: "30", name: "Últimos 30 dias" },
                    ]}
                  />
                  <button className="btn" onClick={exportData}>
                    <Download size={16} /> Exportar
                  </button>
                  {canManage && (
                    <button className="btn" onClick={() => setAccountingOpen(true)}>
                      <Mail size={16} /> Enviar ao contador
                    </button>
                  )}
                </div>
              </div>
              <div className="stats-grid">
                {[
                  {
                    label: "Produtos cadastrados",
                    value: number(products.length),
                    icon: Package,
                    tone: "green",
                    detail: "Produtos ativos no catálogo",
                    foot: `${categories.length} categorias`,
                  },
                  {
                    label: "Valor em estoque",
                    value: money(stockValue),
                    icon: Wallet,
                    tone: "blue",
                    detail: "Valor total a preço de custo",
                    foot: `${number(totalUnits)} itens na unidade`,
                  },
                  {
                    label: "Entradas no período",
                    value: number(incoming),
                    icon: ArrowDownToLine,
                    tone: "green",
                    detail: `Últimos ${period} dias`,
                    foot: `${recent.filter((m) => m.type === "entrada").length} movimentações`,
                  },
                  {
                    label: "Saídas no período",
                    value: number(outgoing),
                    icon: ArrowUpFromLine,
                    tone: "orange",
                    detail: `Últimos ${period} dias`,
                    foot: `${recent.filter((m) => m.type === "saida").length} movimentações`,
                  },
                ].map((c) => (
                  <div className="stat-card" key={c.label}>
                    <div className="stat-top">
                      <span>{c.label}</span>
                      <IconBox icon={c.icon} tone={c.tone} />
                    </div>
                    <div className="stat-value">{c.value}</div>
                    <p>{c.detail}</p>
                    <div className="stat-footer">
                      <span>{c.foot}</span>
                      <ArrowUpRight size={14} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="chart-grid">
                <section className="panel movement-chart">
                  <div className="panel-heading">
                    <div>
                      <h2>Movimentação de estoque</h2>
                      <p>Entradas e saídas ao longo do período</p>
                    </div>
                    <div className="chart-legend">
                      <span>
                        <i className="green-dot" />
                        Entradas
                      </span>
                      <span>
                        <i className="blue-dot" />
                        Saídas
                      </span>
                    </div>
                  </div>
                  <div className="chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chart}
                        margin={{ top: 15, right: 8, left: -27, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="entry"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#29a780"
                              stopOpacity={0.14}
                            />
                            <stop
                              offset="100%"
                              stopColor="#29a780"
                              stopOpacity={0.01}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 5"
                          vertical={false}
                          stroke="#e9eeeb"
                        />
                        <XAxis
                          dataKey="day"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#87938e", fontSize: 12 }}
                          tickMargin={12}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#87938e", fontSize: 12 }}
                        />
                        <Tooltip
                          contentStyle={{
                            border: "1px solid #e5ebe7",
                            borderRadius: 10,
                            fontSize: 13,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="Entradas"
                          stroke="#15986f"
                          strokeWidth={2.5}
                          fill="url(#entry)"
                        />
                        <Area
                          type="monotone"
                          dataKey="Saídas"
                          stroke="#73a4d8"
                          strokeWidth={2.5}
                          fill="transparent"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="panel categories-chart">
                  <div className="panel-heading">
                    <div>
                      <h2>Estoque por categoria</h2>
                      <p>Distribuição dos itens na unidade</p>
                    </div>
                  </div>
                  <div className="category-bars">
                    {categories.map((c) => {
                      const n = products
                        .filter((p) => p.category_id === c.id)
                        .reduce((s, p) => s + qty(p.id), 0);
                      const pct = totalUnits ? (n / totalUnits) * 100 : 0;
                      return (
                        <div key={c.id}>
                          <div className="bar-label">
                            <span>
                              <i style={{ background: c.color }} />
                              {c.name}
                            </span>
                            <b>{pct.toFixed(0)}%</b>
                          </div>
                          <div className="bar-track">
                            <span
                              style={{ width: pct + "%", background: c.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="category-foot">
                    <Boxes size={16} />
                    {number(totalUnits)} itens distribuídos em{" "}
                    {categories.length} categorias
                  </div>
                </section>
              </div>
              <section className="panel abc-panel">
                <div className="panel-heading">
                  <div>
                    <h2>O que mais gira e o que está parado</h2>
                    <p>Uma leitura simples dos últimos 60 dias, sem termos difíceis.</p>
                  </div>
                  <TrendingUp size={19} className="abc-heading-icon" />
                </div>
                <div className="abc-grid">
                  <div className="abc-column">
                    <div className="abc-column-title">
                      <span className="abc-icon positive"><TrendingUp size={16} /></span>
                      <div>
                        <strong>Produtos que mais giram</strong>
                        <small>Quantidade de saídas com motivo Venda</small>
                      </div>
                    </div>
                    {topProducts.length ? topProducts.map(({ product, sales }) => (
                      <div className="abc-row" key={product.id}>
                        <span>{product.name}</span>
                        <b>{number(sales)} saídas</b>
                        <small>{product.unit}</small>
                      </div>
                    )) : <p className="abc-empty">Ainda não há saídas registradas neste período.</p>}
                  </div>
                  <div className="abc-column stagnant">
                    <div className="abc-column-title">
                      <span className="abc-icon neutral"><Clock3 size={16} /></span>
                      <div>
                        <strong>Produtos sem vendas há mais de 60 dias</strong>
                        <small>Dinheiro parado na prateleira</small>
                      </div>
                    </div>
                    {stagnantProducts.length ? stagnantProducts.map(({ product, currentQty }) => (
                      <div className="abc-row" key={product.id}>
                        <span>{product.name}</span>
                        <b>{number(currentQty)} {product.unit}</b>
                        <small>{money(currentQty * Number(product.cost_price))}</small>
                      </div>
                    )) : <p className="abc-empty">Nenhum produto parado por mais de 60 dias.</p>}
                  </div>
                </div>
              </section>
              <div className="attention-banner">
                <div className="attention-icon">
                  <TriangleAlert size={20} />
                </div>
                <div>
                  <strong>
                    {low.length
                      ? `${low.length} produtos precisam de atenção`
                      : "Tudo em ordem nas suas prateleiras"}
                  </strong>
                  <p>
                    {low.length
                      ? "Alguns itens estão com estoque baixo ou zerado. Que tal planejar a reposição?"
                      : "Continue acompanhando as movimentações para manter tudo organizado."}
                  </p>
                </div>
                <button
                  onClick={() => {
                    go("Produtos");
                    setFilter("low");
                  }}
                >
                  Ver produtos <ChevronRight size={16} />
                </button>
              </div>
              <section className="panel low-panel">
                <div className="panel-heading">
                  <div className="inline-heading">
                    <h2>Hora de reabastecer</h2>
                    <span className="count-pill">{low.length} produtos</span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      go("Produtos");
                      setFilter("low");
                    }}
                  >
                    Ver todos <ArrowUpRight size={16} />
                  </button>
                </div>
                <ProductTable compact />
              </section>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Últimas movimentações</h2>
                    <button
                      className="text-button"
                      onClick={() => go("Movimentações")}
                    >
                      Ver histórico <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {movements.slice(0, 3).map((m) => (
                    <div className="activity-row" key={m.id}>
                      <IconBox
                        icon={
                          m.type === "entrada"
                            ? ArrowDownToLine
                            : ArrowUpFromLine
                        }
                        tone={m.type === "entrada" ? "green" : "orange"}
                      />
                      <div>
                        <strong>
                          {products.find((p) => p.id === m.product_id)?.name ||
                            "Produto arquivado"}
                        </strong>
                        <small>
                          {m.reason} ·{" "}
                          {new Date(m.created_at).toLocaleDateString("pt-BR")}
                        </small>
                      </div>
                      <b
                        className={
                          m.type === "entrada" ? "green-text" : "orange-text"
                        }
                      >
                        {m.type === "entrada" ? "+" : "−"} {number(m.quantity)}
                      </b>
                    </div>
                  ))}
                </section>
                <section className="assistant-card">
                  <Sparkles size={25} />
                  <span className="assistant-label">
                    SEU ASSISTENTE STOCKINHO
                  </span>
                  <h2>
                    Seu estoque tem respostas.
                    <br />É só perguntar.
                  </h2>
                  <p>
                    Descubra o que repor, o que mais vende
                    <br />e onde seu negócio pode melhorar.
                  </p>
                  <button
                    className="btn primary"
                    onClick={() => go("Assistente IA")}
                  >
                    Conversar com o assistente <ArrowUpRight size={16} />
                  </button>
                </section>
              </div>
            </>
          )}
          {view === "Caixa" && (
            <section className="cashier-layout">
              <div className="cashier-products panel">
                <div className="panel-heading">
                  <h2>Produtos para venda</h2>
                  <div className="input-search">
                    <Search size={18} />
                    <input
                      aria-label="Buscar produto para venda"
                      placeholder="Buscar nome, código ou SKU"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
                <CashierScanner key={`${tenant}:${location}:${busy}`} products={products} onAdd={addToCart} disabled={busy || !location} />
                <div className="cashier-product-grid">
                  {!cashierProducts.length && <div className="empty"><Package /><h3>{search ? "Nenhum produto encontrado" : "Nenhum produto disponível para venda"}</h3><p>{search ? "Tente outro nome, código ou limpe a busca." : "Cadastre um produto e registre uma entrada nesta unidade."}</p><button className="btn" onClick={() => search ? setSearch("") : go("Produtos")}>{search ? "Limpar busca" : "Ver produtos"}</button></div>}
                  {cashierProducts
                    .map((product) => (
                      <button className="cashier-product" key={product.id} onClick={() => addToCart(product)}>
                        {product.image_url ? <img src={product.image_url} alt="" /> : <Package size={22} />}
                        <strong>{product.name}</strong>
                        <span>{money(Number(product.sale_price))} · {number(qty(product.id))} {product.unit}</span>
                      </button>
                    ))}
                </div>
              </div>
              <div className="cashier-cart panel">
                <div className="panel-heading">
                  <h2>Carrinho <span className="count-pill">{cartDetails.length}</span></h2>
                  {cartDetails.length > 0 && <button className="text-button" onClick={() => setCart([])}>Limpar</button>}
                </div>
                <div className="cart-items">
                  {cartDetails.map(({ product, quantity, product_id, total }) => (
                    <div className="cart-item" key={product_id}>
                      <div><strong>{product.name}</strong><small>{money(Number(product.sale_price))} cada</small></div>
                      <div className="cart-quantity">
                        <button aria-label={`Diminuir quantidade de ${product.name}`} onClick={() => setCart((items) => items.map((item) => item.product_id === product_id ? { ...item, quantity: item.quantity - 1 } : item).filter((item) => item.quantity > 0))}>−</button>
                        <span>{quantity}</span>
                        <button aria-label={`Aumentar quantidade de ${product.name}`} onClick={() => addToCart(product)}>+</button>
                      </div>
                      <b>{money(total)}</b>
                    </div>
                  ))}
                  {!cartDetails.length && <div className="empty"><ShoppingCart /><p>Adicione produtos para começar a venda.</p></div>}
                </div>
                <div className="cashier-total"><span>Total</span><strong>{money(cartTotal)}</strong></div>
                <div className="payment-options">
                  <label>Modo de confirmação
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as "system" | "credit" | "debit")}>
                      <option value="system">Salvar venda no sistema</option>
                      <option value="credit">Checkout Tap · Crédito</option>
                      <option value="debit">Checkout Tap · Débito</option>
                    </select>
                  </label>
                  {paymentMethod === "credit" && (
                    <label>Parcelas
                      <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                        {Array.from({ length: Math.min(12, Math.floor(cartTotal)) }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}x</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <div className="cashier-actions">
                  {paymentMethod === "system" ? (
                    <button className="btn primary" disabled={busy || !cartDetails.length} onClick={() => confirmSale()}>
                      Confirmar venda <Check size={17} />
                    </button>
                  ) : tapPendingOrder ? (
                    <button className="btn primary" disabled={busy || !cartDetails.length} onClick={() => confirmSale(tapPendingOrder)}>
                      Confirmar pagamento aprovado <Check size={17} />
                    </button>
                  ) : (
                    <button className="btn primary" disabled={busy || !cartDetails.length} onClick={openInfiniteTap}>
                      Abrir Checkout Tap <CreditCard size={17} />
                    </button>
                  )}
                  <button className="btn" disabled={busy || !cartDetails.length} onClick={cancelSale}>
                    Cancelar venda <X size={17} />
                  </button>
                </div>
              </div>
            </section>
          )}
          {view === "Produtos" && (
            <>
              <div className="list-toolbar">
                <div className="input-search">
                  <Search size={18} />
                  <input
                    aria-label="Buscar por nome ou código de barras"
                    placeholder="Buscar por nome ou código de barras"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Pick
                  value={filter}
                  onChange={setFilter}
                  label="Filtrar produtos"
                  items={[
                    { id: "all", name: "Todos os produtos" },
                    { id: "low", name: "Estoque baixo" },
                    { id: "zero", name: "Sem estoque" },
                    ...categories,
                  ]}
                />
                <button className="btn" onClick={exportData}>
                  <Download size={16} />
                  Exportar
                </button>
                {canManage && (
                  <button className="btn primary" onClick={() => open("product")}>
                    <Plus size={18} />
                    Novo produto
                  </button>
                )}
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>
                    Seus produtos{" "}
                    <span className="count-pill">{visible.length}</span>
                  </h2>
                  <button
                    className="text-button"
                    onClick={() => open("movement")}
                  >
                    <ArrowLeftRight size={16} /> Registrar movimentação
                  </button>
                </div>
                <ProductTable />
              </section>
            </>
          )}
          {view === "Movimentações" && (
            <>
              <div className="list-toolbar">
                <div className="input-search">
                  <Search size={18} />
                  <input
                    placeholder="Buscar produto ou motivo"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Pick
                  value={filter}
                  onChange={setFilter}
                  label="Tipo"
                  items={[
                    { id: "all", name: "Todos os tipos" },
                    { id: "entrada", name: "Entradas" },
                    { id: "saida", name: "Saídas" },
                  ]}
                />
                <button
                  className="btn primary"
                  onClick={() => open("movement")}
                >
                  <Plus size={18} />
                  Nova movimentação
                </button>
              </div>
              <section className="panel">
                <div className="table-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Quantidade</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Data e hora</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements
                        .filter(
                          (m) =>
                            (filter === "all" || m.type === filter) &&
                            (
                              (data.products.find((p) => p.id === m.product_id)
                                ?.name || "") +
                              " " +
                              m.reason
                            )
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                        )
                        .slice(0, 100)
                        .map((m) => (
                          <TableRow key={m.id}>
                            <TableCell>
                              <strong>
                                {
                                  data.products.find(
                                    (p) => p.id === m.product_id,
                                  )?.name
                                }
                              </strong>
                              {m.note && <small>{m.note}</small>}
                            </TableCell>
                            <TableCell>
                              <span
                                className={
                                  "badge " +
                                  (m.type === "entrada" ? "success" : "warning")
                                }
                              >
                                {m.type === "entrada"
                                  ? "↙ Entrada"
                                  : "↗ Saída"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <b>{number(m.quantity)}</b>
                            </TableCell>
                            <TableCell>{m.reason}</TableCell>
                            <TableCell>
                              {new Date(m.created_at).toLocaleString("pt-BR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                  {!movements.length && (
                    <div className="empty">
                      Nenhuma movimentação nesta unidade.
                    </div>
                  )}
                </div>
                <div className="table-footer">
                  Exibindo até 100 movimentações recentes. O histórico preserva
                  a rastreabilidade do estoque.
                </div>
              </section>
            </>
          )}
          {view === "Categorias" && (
            <>
              <div className="list-toolbar">
                <p>
                  {categories.length} categorias para organizar seus produtos
                </p>
                {canManage && (
                  <button
                    className="btn primary"
                    onClick={() => open("category")}
                  >
                    <Plus size={18} />
                    Nova categoria
                  </button>
                )}
              </div>
              <div className="entity-grid">
                {categories.map((c) => (
                  <section className="panel entity-card" key={c.id}>
                    <div className="entity-top">
                      <span
                        className="category-symbol"
                        style={{ color: c.color, background: c.color + "18" }}
                      >
                        <Tags size={25} />
                      </span>
                      {canManage && (
                        <div className="row-actions">
                          <button
                            aria-label={"Editar " + c.name}
                            onClick={() => open("category", c)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            aria-label={"Excluir " + c.name}
                            onClick={() =>
                              setDeleting({ type: "category", item: c })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                    <h2>{c.name}</h2>
                    <p>
                      {products.filter((p) => p.category_id === c.id).length}{" "}
                      produtos cadastrados
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        go("Produtos");
                        setFilter(c.id);
                      }}
                    >
                      Ver produtos <ArrowUpRight size={16} />
                    </button>
                  </section>
                ))}
              </div>
            </>
          )}
          {view === "Lojas e depósitos" && (
            <>
              <div className="list-toolbar">
                <p>Estoque independente para cada unidade do seu negócio.</p>
                {canManage && (
                  <button
                    className="btn primary"
                    onClick={() => open("location")}
                  >
                    <Plus size={18} />
                    Nova unidade
                  </button>
                )}
              </div>
              <div className="entity-grid">
                {locations.map((l) => (
                  <section className="panel entity-card" key={l.id}>
                    <div className="entity-top">
                      <IconBox icon={l.type === "Loja" ? Store : Boxes} />
                      <span className="badge success">{l.type}</span>
                    </div>
                    <h2>{l.name}</h2>
                    <p>{l.address || "Endereço não informado"}</p>
                    <div className="location-total">
                      {number(
                        data.balances
                          .filter((b) => b.location_id === l.id)
                          .reduce((s, b) => s + Number(b.quantity), 0),
                      )}
                      <small>itens em estoque</small>
                    </div>
                    <div className="entity-bottom">
                      <button
                        className="text-button"
                        onClick={() => {
                          setLocation(l.id);
                          go("Produtos");
                        }}
                      >
                        Acessar estoque <ArrowUpRight size={15} />
                      </button>
                      {canManage && (
                        <button
                          className="icon-button"
                          aria-label={"Editar " + l.name}
                          onClick={() => open("location", l)}
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                    </div>
                  </section>
                ))}
              </div>
              {!locations.length && (
                <div className="empty">
                  Cadastre a primeira loja ou depósito desta empresa.
                </div>
              )}
            </>
          )}
          {view === "Assistente IA" && (
            <section className="panel chat-panel">
              <div className="chat-heading">
                <IconBox icon={Sparkles} />
                <div>
                  <h2>Assistente Stockinho</h2>
                  <small>{aiRemaining === null ? "Pro: 50 consultas por mês (UTC)." : `${50 - aiRemaining} de 50 consultas usadas · ${aiRemaining} restantes.`}</small>
                  <p>
                    Consultas aos dados da sua empresa{" "}
                    ·{" "}
                    {locations.find((l) => l.id === location)?.name ||
                      "Selecione uma unidade"}
                  </p>
                </div>
                <button className="text-button" onClick={() => setMessages([])}>
                  Nova conversa
                </button>
              </div>
              <div className="chat-messages">
                {!messages.length ? (
                  <div className="chat-welcome">
                    <span className="large-spark">
                      <Sparkles size={34} />
                    </span>
                    <h2>Como posso ajudar seu negócio hoje?</h2>
                    <p>
                      Vamos transformar os números do seu estoque em boas
                      decisões.
                    </p>
                    <div className="suggestions">
                      {[
                        "Quais produtos devo reabastecer?",
                        "Quais produtos mais venderam no último mês?",
                        "Qual é o valor do meu estoque?",
                      ].map((q) => (
                        <button key={q} onClick={() => ask(q)}>
                          {q}
                          <ArrowUpRight size={17} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <div className={"chat-message " + m.role} key={i}>
                      {m.role === "assistant" && <Sparkles size={20} />}
                      <div>{m.text}</div>
                    </div>
                  ))
                )}
                {busy && <p className="muted">Consultando seu estoque…</p>}
              </div>
              <form
                className="chat-input"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask();
                }}
              >
                <input
                  aria-label="Sua pergunta"
                  placeholder="Pergunte algo sobre seu estoque..."
                  value={question}
                  maxLength={1000}
                  onChange={(e) => setQuestion(e.target.value)}
                />
                <button
                  className="btn primary"
                  aria-label="Enviar pergunta"
                  disabled={busy || !question.trim()}
                >
                  <Send size={19} />
                </button>
              </form>
              <p className="chat-note">
                As respostas consideram a unidade selecionada. Confira as
                sugestões antes de fazer suas compras.
              </p>
            </section>
          )}
          {view === "Configurações" && (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <IconBox icon={Building2} />
                <h2>Suas empresas</h2>
                <p>
                  Cada empresa possui seu próprio catálogo, equipe e unidades.
                </p>
                {data.companies.map((c) => (
                  <div className="settings-row" key={c.id}>
                    <Store size={20} />
                    <strong>{c.name}</strong>
                    <span className="badge neutral">
                      {c.id === tenant ? "Selecionada" : "Empresa"}
                    </span>
                    {data.memberships.some((member) => member.tenant_id === c.id && member.user_id === initialUserId && member.role === "admin") && (
                      <button className="btn" disabled={busy} aria-label={`Excluir empresa ${c.name}`} onClick={() => {
                        if (window.prompt(`Esta ação exclui permanentemente a empresa, produtos, estoque e histórico. Digite "${c.name}" para confirmar:`) === c.name)
                          void change("delete_company", { tenant_id: c.id });
                      }}><Trash2 size={15} /> Excluir</button>
                    )}
                  </div>
                ))}
                {canManage && (
                  <button className="btn primary" onClick={() => open("company")}>
                    <Plus size={17} />
                    Adicionar empresa
                  </button>
                )}
                <div className="team-section">
                  <h2>Equipe da empresa</h2>
                  <p>
                    Administradores gerenciam as permissões. Operadores podem
                    apenas consultar a equipe.
                  </p>
                  <div className="team-table-wrap">
                    <table className="team-table">
                      <thead>
                        <tr>
                          <th>E-mail</th>
                          <th>Permissão</th>
                          {canManage && <th className="team-action-cell">Ação</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {data.memberships
                          .filter((member) => member.tenant_id === tenant)
                          .map((member) => (
                            <tr key={member.id}>
                              <td>
                                <span className="team-email">
                                  <Mail size={16} />
                                  {member.email}
                                </span>
                              </td>
                              <td>
                                <span className={"badge " + (member.role === "admin" ? "success" : "neutral")}>
                                  {member.role === "admin" ? "Administrador" : "Operador"}
                                </span>
                              </td>
                              {canManage && (
                                <td className="team-action-cell">
                                  <button
                                    className="btn"
                                    type="button"
                                    onClick={() => open("member", member)}
                                  >
                                    <Pencil size={15} />
                                    Editar
                                  </button>
                                  {member.user_id !== initialUserId && (
                                    <button className="btn" type="button" disabled={busy} onClick={() => {
                                      if (window.confirm(`Remover ${member.email} da empresa? O acesso será revogado e o histórico será mantido.`))
                                        void change("remove_member", { member_id: member.id });
                                    }}><Trash2 size={15} /> Remover</button>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {canManage && (
                    <button className="btn" onClick={() => open("member")}>
                      <Plus size={17} />
                      Adicionar membro
                    </button>
                  )}
                </div>
              </section>
              <section className="panel settings-panel">
                <IconBox icon={Settings} tone="blue" />
                <h2>Conta e conexão</h2>
                <p>
                  Sua conta está conectada ao Supabase. Os dados são isolados por empresa e salvos na nuvem.
                </p>
                  <a className="btn" href="/configuracoes/conta">
                    <Settings size={16} /> Configurar dados da minha conta
                  </a>
                  <a className="btn" href={`/configuracoes/assinatura?tenant_id=${encodeURIComponent(tenant)}`}>
                    <CreditCard size={16} />
                    Gerenciar assinatura
                  </a>
                  <button
                    className="btn"
                    onClick={async () => {
                      await fetch("/api/auth", { method: "DELETE" });
                      router.push("/login");
                    }}
                  >
                    <LogOut size={16} />
                    Sair da conta
                  </button>
              </section>
            </div>
          )}
          {view === "Ajuda" && (
            <section className="panel settings-panel help-panel">
              <h2>Seu primeiro dia no Stockinho</h2>
              {[
                [
                  "Cadastre sua unidade",
                  "Em Lojas e depósitos, adicione as lojas e os depósitos da sua empresa.",
                ],
                [
                  "Organize seu catálogo",
                  "Crie categorias e cadastre seus produtos com preço de custo, venda e estoque mínimo.",
                ],
                [
                  "Registre seu estoque",
                  "Use uma entrada com motivo Ajuste inicial para informar o saldo existente.",
                ],
                [
                  "Acompanhe as vendas",
                  "Registre uma saída com motivo Venda. Saídas maiores que o saldo disponível são bloqueadas.",
                ],
                [
                  "Planeje suas compras",
                  "Confira os alertas do painel e pergunte ao assistente quais produtos precisam de reposição.",
                ],
              ].map(([t, d], i) => (
                <div className="help-step" key={t}>
                  <span>{i + 1}</span>
                  <div>
                    <h3>{t}</h3>
                    <p>{d}</p>
                  </div>
                </div>
              ))}
            </section>
          )}
          <footer className="page-footer">
            <span>
              <Leaf size={13} /> Pequeno no nome. Grande na organização.
            </span>
            <span>Stockinho © {new Date().getFullYear()}</span>
          </footer>
        </main>
      </div>
      <Dialog open={accountingOpen} onOpenChange={setAccountingOpen}>
        <DialogContent className="stock-dialog accounting-dialog">
          <DialogHeader>
            <DialogTitle>Enviar fechamento para a contabilidade</DialogTitle>
            <DialogDescription>
              Vamos gerar o saldo e as movimentações deste mês em um arquivo CSV e enviar para o contador.
            </DialogDescription>
          </DialogHeader>
          <form className="stock-form" onSubmit={sendAccountingReport}>
            <label>
              E-mail do contador
              <input
                type="email"
                required
                value={accountingEmail}
                onChange={(event) => setAccountingEmail(event.target.value)}
                placeholder="contador@escritorio.com.br"
              />
            </label>
            <p className="form-hint">
              Unidade: {locations.find((item) => item.id === location)?.name || "Selecione uma unidade"}.
            </p>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setAccountingOpen(false)}>
                Cancelar
              </button>
              <button className="btn primary" disabled={accountingBusy}>
                <Send size={16} />
                {accountingBusy ? "Enviando…" : "Gerar e enviar"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!modal}
        onOpenChange={(o) => {
          if (!o) setModal("");
        }}
      >
        <DialogContent className="stock-dialog">
          <DialogHeader>
            <DialogTitle>
              {modal === "product"
                ? edit
                  ? "Editar produto"
                  : "Novo produto"
                : modal === "movement"
                  ? "Registrar movimentação"
                  : modal === "category"
                    ? edit
                      ? "Editar categoria"
                      : "Nova categoria"
                    : modal === "location"
                      ? edit
                        ? "Editar unidade"
                        : "Nova loja ou depósito"
                      : modal === "member"
                        ? edit
                          ? "Editar membro"
                          : "Adicionar membro"
                        : "Nova empresa"}
            </DialogTitle>
            <DialogDescription>
              {modal === "movement"
                ? "O saldo é atualizado ao confirmar. Movimentações não podem ser apagadas."
                : "Preencha os dados abaixo para manter tudo organizado."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="stock-form">
            {modal === "product" && (
              <>
                <label>
                  Nome do produto
                  <input
                    name="name"
                    required
                    maxLength={150}
                    defaultValue={edit?.name}
                    placeholder="Ex.: Arroz branco 5kg"
                  />
                </label>
                <label>
                  Código de barras
                  <input
                    name="barcode"
                    maxLength={60}
                    defaultValue={edit?.barcode}
                    placeholder="Digite o código de barras"
                  />
                </label>
                <label>
                  Foto do produto
                  <input name="image" type="file" accept="image/jpeg,image/png,image/webp" />
                  <small className="form-hint">JPG, PNG ou WEBP, até 5 MB.</small>
                </label>
                <label>SKU<input name="sku" maxLength={60} defaultValue={edit?.sku || ""} /></label>
                <label className="inline-check"><input name="track_batches" type="checkbox" defaultChecked={edit?.track_batches || false} disabled={!!edit?.track_batches} />Controlar lotes e validade (Pro, ativar com saldo zero)</label>
                <div className="form-grid">
                  <label>
                    Categoria
                    <FormSelect
                      name="category_id"
                      required
                      defaultValue={edit?.category_id || ""}
                    >
                      <option value="" disabled>
                        Selecione
                      </option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </FormSelect>
                  </label>
                  <label>
                    Unidade
                    <FormSelect name="unit" defaultValue={edit?.unit || "un"}>
                      <option value="un">Unidade (un)</option>
                      <option value="kg">Quilograma (kg)</option>
                      <option value="L">Litro (L)</option>
                      <option value="cx">Caixa (cx)</option>
                    </FormSelect>
                  </label>
                  <label>
                    Preço de custo (R$)
                    <input
                      type="number"
                      name="cost_price"
                      min="0"
                      step="0.000001"
                      required
                      defaultValue={edit?.cost_price || 0}
                    />
                  </label>
                  <label>
                    Preço de venda (R$)
                    <input
                      type="number"
                      name="sale_price"
                      min="0"
                      step="0.01"
                      required
                      defaultValue={edit?.sale_price || 0}
                    />
                  </label>
                </div>
                <label>
                  Estoque mínimo por unidade
                  <input
                    type="number"
                    name="min_quantity"
                    min="0"
                    step="0.01"
                    required
                    defaultValue={edit?.min_quantity ?? 10}
                  />
                </label>
                {!edit && (
                  <p className="form-hint">
                    O produto começa com saldo zero. Registre uma entrada para
                    adicionar estoque.
                  </p>
                )}
              </>
            )}
            {modal === "movement" && (
              <>
                <label>
                  Produto
                  <FormSelect
                    name="product_id"
                    required
                    defaultValue={edit?.product_id || ""}
                  >
                    <option value="" disabled>
                      Selecione um produto
                    </option>
                    {products.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name} · {number(qty(p.id))} {p.unit}
                      </option>
                    ))}
                  </FormSelect>
                </label>
                <div className="form-grid">
                  <label>
                    Tipo
                    <FormSelect
                      name="type"
                      defaultValue={edit?.type || "entrada"}
                    >
                      <option value="entrada">Entrada</option>
                      <option value="saida">Saída</option>
                    </FormSelect>
                  </label>
                  <label>
                    Quantidade
                    <input
                      name="quantity"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="0"
                    />
                  </label>
                </div>
                <label>
                  Motivo
                  <FormSelect name="reason">
                    <option>Compra</option>
                    <option>Venda</option>
                    <option>Ajuste inicial</option>
                    <option>Devolução</option>
                    <option>Perda</option>
                    <option>Ajuste de inventário</option>
                  </FormSelect>
                </label>
                <label>
                  Observação
                  <textarea
                    name="note"
                    maxLength={500}
                    placeholder="Informações adicionais (opcional)"
                  />
                </label>
                <p className="form-hint">
                  Unidade:{" "}
                  {locations.find((l) => l.id === location)?.name ||
                    "Selecione uma unidade antes de registrar."}
                </p>
              </>
            )}
            {(modal === "category" ||
              modal === "location" ||
              modal === "company") && (
                <label>
                  Nome
                  <input
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={edit?.name}
                    placeholder={
                      modal === "company"
                        ? "Nome do seu negócio"
                        : "Digite um nome"
                    }
                  />
                </label>
              )}
            {modal === "member" && (
              <>
                <label>
                  E-mail da conta
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={edit?.email}
                    readOnly={!!edit}
                    placeholder="pessoa@exemplo.com"
                  />
                </label>
                <label>
                  Permissão
                  <FormSelect name="role">
                    <option value="operator">Operador</option>
                    <option value="admin">Administrador</option>
                  </FormSelect>
                </label>
              </>
            )}
            {modal === "category" && (
              <label>
                Cor da categoria
                <input
                  type="color"
                  name="color"
                  defaultValue={edit?.color || "#179c72"}
                />
              </label>
            )}
            {modal === "location" && (
              <>
                <label>
                  Tipo
                  <FormSelect name="type" defaultValue={edit?.type || "Loja"}>
                    <option>Loja</option>
                    <option>Depósito</option>
                  </FormSelect>
                </label>
                <label>
                  Endereço
                  <input
                    name="address"
                    maxLength={250}
                    defaultValue={edit?.address}
                    placeholder="Rua, número e bairro"
                  />
                </label>
                <label>Situação<select name="active" defaultValue={String(edit?.active ?? true)}><option value="true">Ativo</option><option value="false">Arquivado (saldo deve ser zero)</option></select></label>
              </>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setModal("")}
              >
                Cancelar
              </button>
              <button className="btn primary" disabled={busy}>
                {busy
                  ? "Salvando…"
                  : modal === "movement"
                    ? "Confirmar movimentação"
                    : "Salvar"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) {
            setDeleting(null);
            setError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting?.type === "product"
                ? "Arquivar produto?"
                : "Excluir categoria?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.item.name}.{" "}
              {deleting?.type === "product"
                ? "O histórico será preservado. Só é possível arquivar produtos sem saldo em todas as unidades."
                : "A exclusão só é permitida se não houver produtos vinculados."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="form-error">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <button
              className="btn destructive"
              disabled={busy}
              onClick={() => {
                if (
                  deleting.type === "product" &&
                  data.balances.some(
                    (b) => b.product_id === deleting.item.id && b.quantity > 0,
                  )
                ) {
                  setError(
                    "Este produto ainda tem estoque. Zere os saldos por movimentações antes de arquivar.",
                  );
                  return;
                }
                if (
                  deleting.type === "category" &&
                  data.products.some((p) => p.category_id === deleting.item.id)
                ) {
                  setError("Existem produtos vinculados a esta categoria.");
                  return;
                }
                change(
                  "delete",
                  { type: deleting.type, id: deleting.item.id },
                );
              }}
            >
              Confirmar
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster position="bottom-center" richColors theme="light" />
    </SidebarProvider>
  );
}
