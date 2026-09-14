"use client";
import { useEffect, useState, FormEvent } from "react";
import { Package, ArrowUpRight, Leaf, ArrowRight } from "lucide-react";
export default function Login() {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d: any) => setConfigured(d.configured))
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
      const d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      if (d.confirmation) setMessage(d.message);
      else window.location.href = "/";
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a className="brand" href="/">
          <span>
            <Package size={26} />
          </span>
          stockinho<span className="brand-dot">.</span>
        </a>
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
              A conexão com o Supabase ainda precisa ser configurada. Enquanto
              isso, você pode explorar a demonstração.
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
          <a href="/" className="auth-demo">
            Explorar demonstração <ArrowUpRight size={15} />
          </a>
        </div>
      </section>
    </main>
  );
}
