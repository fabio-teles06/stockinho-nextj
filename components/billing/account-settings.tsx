"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AccountProfile } from "@/lib/billing/account";

export default function AccountSettings() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const data = await response.json() as { profile: AccountProfile; error?: string };
      if (!response.ok) throw new Error(data.error);
      setProfile(data.profile);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch("/api/account", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error);
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  return <section className="billing-panel">
    <h1>Dados da minha conta</h1>
    <p>Configure seus dados para usar nas próximas contratações de assinatura.</p>
    <p>O e-mail de cobrança não altera seu e-mail de acesso.</p>
    {error && <p className="billing-error" role="alert">{error}</p>}
    {profile ? <form className="account-form" onSubmit={save}>
      {([
        ["name", "Nome completo ou razão social", "text", "name"],
        ["email", "E-mail de cobrança", "email", "email"],
        ["cpf_cnpj", "CPF ou CNPJ", "text", "off"],
      ] as const).map(([key, label, type, autoComplete]) => <label key={key}>
        {label}<input required type={type} autoComplete={autoComplete} value={profile[key]}
          maxLength={key === "name" ? 150 : key === "email" ? 254 : 18}
          inputMode={key === "cpf_cnpj" ? "numeric" : undefined}
          onChange={(event) => { setSaved(false); setProfile({ ...profile, [key]: event.target.value }); }} />
      </label>)}
      <button className="billing-action primary" disabled={busy}>{busy ? "Salvando..." : "Salvar dados"}</button>
      {saved && <p role="status">Dados salvos com sucesso.</p>}
    </form> : !error && <p>Carregando dados...</p>}
  </section>;
}
