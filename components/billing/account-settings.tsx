"use client";

import { useEffect, useState, type FormEvent } from "react";
import { accountSchema, type AccountProfile } from "@/lib/billing/account";
import { formatDocument } from "@/lib/format-document";

export default function AccountSettings() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof AccountProfile, string>>>({});
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const data = await response.json() as { profile: AccountProfile; error?: string };
      if (!response.ok) throw new Error(data.error);
      setProfile({ ...data.profile, cpf_cnpj: formatDocument(data.profile.cpf_cnpj) });
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [attempt]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profile || busy) return;
    const parsed = accountSchema.safeParse(profile);
    if (!parsed.success) {
      const errors: Partial<Record<keyof AccountProfile, string>> = {};
      for (const issue of parsed.error.issues) errors[issue.path[0] as keyof AccountProfile] = issue.message;
      setFieldErrors(errors);
      document.getElementById(`account-${parsed.error.issues[0].path[0]}`)?.focus();
      return;
    }
    setFieldErrors({});
    setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch("/api/account", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
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
    {error && <div role="alert"><p className="billing-error">{error}</p>{!profile && <button className="billing-action" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Tentar novamente</button>}</div>}
    {profile ? <form className="account-form" onSubmit={save} aria-busy={busy}>
      {([
        ["name", "Nome completo ou razão social", "text", "name"],
        ["email", "E-mail de cobrança", "email", "email"],
        ["cpf_cnpj", "CPF ou CNPJ", "text", "off"],
      ] as const).map(([key, label, type, autoComplete]) => <label key={key}>
        {label}<input id={`account-${key}`} name={key} disabled={busy} required type={type} autoComplete={autoComplete} value={profile[key]}
          maxLength={key === "name" ? 150 : key === "email" ? 254 : 18}
          inputMode={key === "cpf_cnpj" ? "numeric" : undefined}
          aria-invalid={Boolean(fieldErrors[key])}
          aria-describedby={fieldErrors[key] ? `account-${key}-error` : key === "cpf_cnpj" ? "document-hint" : undefined}
          placeholder={key === "cpf_cnpj" ? "123.456.789-10" : undefined}
          onChange={(event) => { setSaved(false); setFieldErrors((errors) => ({ ...errors, [key]: undefined })); setProfile({ ...profile, [key]: key === "cpf_cnpj" ? formatDocument(event.target.value) : event.target.value }); }} />
      {fieldErrors[key] && <small id={`account-${key}-error`} className="field-error">{fieldErrors[key]}</small>}
        {key === "cpf_cnpj" && <small id="document-hint" className="field-hint">Digite 11 dígitos para CPF ou 14 para CNPJ. A pontuação é automática.</small>}
      </label>)}
      <button className="billing-action primary" disabled={busy}>{busy ? "Salvando..." : "Salvar dados"}</button>
      {saved && <p className="form-success" role="status">Dados salvos com sucesso.</p>}
    </form> : !error && <p role="status">Carregando dados...</p>}
  </section>;
}
