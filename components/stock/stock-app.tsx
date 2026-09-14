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
  Check,
  MoreHorizontal,
  Pencil,
  Trash2,
  LogOut,
  Building2,
  Leaf,
  X,
  SlidersHorizontal,
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
  ["Produtos", Package],
  ["Movimentações", ArrowLeftRight],
  ["Categorias", Tags],
  ["Lojas e depósitos", Store],
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
  "Visão geral": "Um olhar para o seu negócio, tudo em um só lugar.",
  Produtos: "Seu catálogo organizado, do cadastro à prateleira.",
  Movimentações: "Acompanhe cada entrada e saída do seu estoque.",
  Categorias: "Uma organização simples para encontrar tudo.",
  "Lojas e depósitos": "Cada unidade com seu estoque, tudo conectado.",
  "Assistente IA": "Respostas úteis para cuidar melhor do seu negócio.",
  Configurações: "Organize sua empresa e suas preferências.",
  Ajuda: "Um jeito fácil de começar.",
};
export default function StockApp({
  initialData,
  initialEmail,
}: {
  initialData: Data;
  initialEmail?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<Data>(initialData);
  const [view, setView] = useState(
    initialData.companies.length ? "Visão geral" : "Configurações",
  );
  const [tenant, setTenant] = useState(initialData.companies[0]?.id || "");
  const [location, setLocation] = useState(initialData.locations[0]?.id || "");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [period, setPeriod] = useState("7");
  const [modal, setModal] = useState(
    initialData.companies.length ? "" : "company",
  );
  const [edit, setEdit] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<{ role: string; text: string }[]>(
    [],
  );
  const [user] = useState(initialEmail?.split("@")[0] || "Olá");
  useEffect(() => {
    if (notice) {
      toast.success(notice);
      const t = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setView("Produtos");
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
    setView(v);
    setSearch("");
    setFilter("all");
    setError("");
  }
  function open(type: string, item: any = null) {
    setEdit(item);
    setModal(type);
    setError("");
  }
  async function change(
    action: string,
    payload: any,
  ) {
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
        if (!tenant) setTenant(next.companies[0]?.id || "");
        if (!location) setLocation(next.locations[0]?.id || "");
      setModal("");
      setDeleting(null);
      setNotice("Tudo certo! Alteração salva.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const id = edit?.id || uid();
    if (modal === "product") {
      const p: Product = {
        id,
        tenant_id: tenant,
        name: String(f.name).trim(),
        barcode: String(f.barcode).trim(),
        category_id: String(f.category_id),
        unit: String(f.unit),
        cost_price: Number(f.cost_price),
        sale_price: Number(f.sale_price),
        min_quantity: Number(f.min_quantity),
        active: true,
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
      change("product", { item: p });
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
    const text =
      "\ufeff" +
      rows
        .map((r) =>
          r
            .map(
              (c) =>
                '"' +
                String(c ?? "")
                  .replace(/"/g, '""')
                  .replace(/^[=+@-]/, "'$&") +
                '"',
            )
            .join(";"),
        )
        .join("\r\n");
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
      (p.name + " " + p.barcode).toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "low" && qty(p.id) <= p.min_quantity) ||
        (filter === "zero" && qty(p.id) === 0) ||
        p.category_id === filter),
  );
  const totalUnits = products.reduce((s, p) => s + qty(p.id), 0);
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
                    <span
                      className={"product-icon cat-" + p.category_id.slice(-1)}
                    >
                      <Package size={19} />
                    </span>
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
            <h3>{compact ? "Estoque em dia!" : "Nenhum produto encontrado"}</h3>
            <p>
              {compact
                ? "Nenhum produto precisa de reposição."
                : "Cadastre um produto ou altere os filtros."}
            </p>
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
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Sparkles size={20} />
            </span>
            <strong>Uma mãozinha para o seu negócio</strong>
            <p>Tire dúvidas sobre seu estoque com o assistente Stockinho.</p>
            <button onClick={() => go("Assistente IA")}>
              Vamos conversar <ArrowUpRight size={16} />
            </button>
          </div>
          <button className="profile" onClick={() => go("Configurações")}>
            <span className="avatar">{user.slice(0, 1).toUpperCase()}T</span>
            <span>
              <strong>{user === "Fabio" ? "Fabio Teles" : user}</strong>
              <small>Minha conta</small>
            </span>
            <Settings size={17} />
          </button>
        </SidebarFooter>
      </Sidebar>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger className="mobile-trigger" />
            <span>Meu negócio</span>
            <ChevronRight size={14} />
            <b>{view}</b>
          </div>
          <div className="top-actions">
            <div className="top-search">
              <Search size={17} />
              <input
                aria-label="Buscar produtos"
                placeholder="Buscar no Stockinho..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setView("Produtos");
                }}
              />
              <kbd>⌘ K</kbd>
            </div>
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
            <span className="top-avatar">FT</span>
          </div>
        </header>
        <main className="workspace">
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
          {view === "Produtos" && (
            <>
              <div className="list-toolbar">
                <div className="input-search">
                  <Search size={18} />
                  <input
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
                <button className="btn primary" onClick={() => open("product")}>
                  <Plus size={18} />
                  Novo produto
                </button>
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
                <button
                  className="btn primary"
                  onClick={() => open("category")}
                >
                  <Plus size={18} />
                  Nova categoria
                </button>
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
                <button
                  className="btn primary"
                  onClick={() => open("location")}
                >
                  <Plus size={18} />
                  Nova unidade
                </button>
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
                      <button
                        className="icon-button"
                        aria-label={"Editar " + l.name}
                        onClick={() => open("location", l)}
                      >
                        <Pencil size={16} />
                      </button>
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
                  </div>
                ))}
                <button className="btn primary" onClick={() => open("company")}>
                  <Plus size={17} />
                  Adicionar empresa
                </button>
                <div className="team-section">
                  <h2>Equipe da empresa</h2>
                  <p>
                    Adicione pessoas com conta confirmada no Stockinho.
                    Operadores consultam e movimentam estoque; administradores
                    também gerenciam cadastros.
                  </p>
                  <button className="btn" onClick={() => open("member")}>
                    <Plus size={17} />
                    Adicionar membro
                  </button>
                </div>
              </section>
              <section className="panel settings-panel">
                <IconBox icon={Settings} tone="blue" />
                <h2>Conta e conexão</h2>
                <p>
                  Sua conta está conectada ao Supabase. Os dados são isolados por empresa e salvos na nuvem.
                </p>
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
                        ? "Adicionar membro"
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
                      step="0.01"
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
