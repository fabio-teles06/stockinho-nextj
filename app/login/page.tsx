"use client";
import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Leaf, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AuthResponse = {
  configured?: boolean;
  confirmation?: boolean;
  message?: string;
  error?: string;
};

export default function Login() {
  const router = useRouter();
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [resetOpen, setResetOpen] = useState(false),
    [resetBusy, setResetBusy] = useState(false),
    [resetMessage, setResetMessage] = useState(""),
    [resetSuccess, setResetSuccess] = useState(false),
    [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/auth")
      .then(async (r) => (await r.json()) as AuthResponse)
      .then((d) => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const f = Object.fromEntries(new FormData(e.currentTarget));
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, action: signup ? "signup" : "login" }),
      });
      const d = (await r.json()) as AuthResponse;
      if (!r.ok) throw Error(d.error || "Não foi possível entrar.");
      if (d.confirmation) setMessage(d.message || "Confira seu e-mail.");
      else router.push("/painel");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }
  async function submitReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResetBusy(true);
    setResetMessage("");
    setResetSuccess(false);
    try {
      const f = Object.fromEntries(new FormData(e.currentTarget));
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: f.email, action: "reset" }),
      });
      const d = (await r.json()) as AuthResponse;
      if (!r.ok) throw Error(d.error || "Não foi possível enviar o reset.");
      setResetSuccess(true);
      setResetMessage(
        d.message || "Confira seu e-mail para redefinir sua senha.",
      );
    } catch (error: unknown) {
      setResetMessage(
        error instanceof Error ? error.message : "Erro inesperado.",
      );
    } finally {
      setResetBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link className="brand" href="/">
          <span>
            <Package size={26} />
          </span>
          stockinho<span className="brand-dot">.</span>
        </Link>
        <h1>
          Seu estoque organizado.
          <br />
          Seu negócio em boas mãos.
        </h1>
        <p>
          Mais praticidade para cuidar das suas prateleiras e mais tempo para
          quem importa.
        </p>
        <Leaf size={48} strokeWidth={1} />
      </section>
      <section className="auth-box">
        <div className="auth-form">
          <h2>
            {signup ? "Seu negócio começa aqui" : "Que bom ter você por aqui!"}
          </h2>
          <p>
            {signup
              ? "Crie sua conta e organize sua primeira empresa."
              : "Entre para acompanhar o seu negócio."}
          </p>
          {configured === false && (
            <p className="form-error">
              A conexão com o Supabase ainda precisa ser configurada. Fale com
              o responsável pela instalação para liberar o acesso.
            </p>
          )}
          <form className="stock-form" onSubmit={submit}>
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="voce@seumercado.com.br"
              />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                required
                minLength={8}
                placeholder="Pelo menos 8 caracteres"
              />
            </label>
            {!signup && (
              <button
                className="auth-forgot"
                type="button"
                onClick={() => {
                  setResetOpen(true);
                  setResetMessage("");
                  setResetSuccess(false);
                }}
              >
                Esqueci minha senha
              </button>
            )}
            {message && (
              <p className="form-error" role="status">
                {message}
              </p>
            )}
            <button
              className="btn primary"
              disabled={busy || configured !== true}
            >
              {busy
                ? "Aguarde…"
                : signup
                  ? "Criar minha conta"
                  : "Entrar na minha conta"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-switch">
            {signup ? "Já tem uma conta?" : "Primeira vez aqui?"}{" "}
            <button
              onClick={() => {
                setSignup(!signup);
                setMessage("");
              }}
            >
              {signup ? "Entrar" : "Criar conta"}
            </button>
          </div>
        </div>
      </section>
      <Dialog
        open={resetOpen}
        onOpenChange={(open) => {
          setResetOpen(open);
          if (!open) {
            setResetMessage("");
            setResetSuccess(false);
          }
        }}
      >
        <DialogContent className="stock-dialog auth-reset-dialog">
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Informe seu e-mail e enviaremos um link para criar uma nova
              senha.
            </DialogDescription>
          </DialogHeader>
          <form className="stock-form" onSubmit={submitReset}>
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="voce@seumercado.com.br"
                disabled={resetBusy || resetSuccess}
              />
            </label>
            {resetMessage && (
              <p
                className={resetSuccess ? "form-success" : "form-error"}
                role="status"
              >
                {resetMessage}
              </p>
            )}
            <button
              className="btn primary"
              disabled={resetBusy || resetSuccess || configured !== true}
            >
              {resetBusy ? "Enviando…" : "Enviar link de redefinição"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
