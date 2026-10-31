"use client";

import { Check, ArrowRight } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    code: "free",
    name: "Free",
    price: "R$ 0",
    description: "Para começar a organizar seu negócio.",
    features: ["50 produtos ativos", "1 membro e 1 local", "Entradas e saídas ilimitadas", "Alertas de estoque mínimo", "Exportação CSV"],
  },
  {
    code: "pro",
    name: "Pro",
    price: "R$ 29,90",
    description: "Para negócios que precisam crescer com controle.",
    features: ["2.000 produtos ativos", "Até 3 membros", "Histórico completo e relatórios", "Importação e exportação CSV", "50 consultas de IA por mês"],
  },
];

export default function PricingPage() {
  return (
    <main className="billing-public">
      <header className="billing-public-header">
        <Link className="billing-brand" href="/">stockinho<i>.</i></Link>
        <Link className="billing-login" href="/login">Entrar</Link>
      </header>
      <section className="billing-hero">
        <span>PLANOS SIMPLES, SEM SURPRESA</span>
        <h1>Seu estoque organizado. Seu negócio crescendo.</h1>
        <p>Comece gratuitamente e evolua quando precisar de mais recursos.</p>
      </section>
      <section className="pricing-grid" aria-label="Planos">
        {plans.map((plan) => (
          <article className={"pricing-card " + (plan.code === "pro" ? "recommended" : "")} key={plan.code}>
            {plan.code === "pro" && <strong className="pricing-recommended">RECOMENDADO</strong>}
            <h2>{plan.name}</h2>
            <p>{plan.description}</p>
            <div className="pricing-price">{plan.price}<small>/mês</small></div>
            <ul>{plan.features.map((feature) => <li key={feature}><Check size={16} />{feature}</li>)}</ul>
            <Link className={"billing-action " + (plan.code === "pro" ? "primary" : "")} href={plan.code === "pro" ? "/login?intent=pro" : "/login"}>
              {plan.code === "pro" ? "Começar com Pro" : "Começar grátis"} <ArrowRight size={16} />
            </Link>
          </article>
        ))}
      </section>
      <p className="billing-note">Cobrança mensal pelo Asaas. O plano Pro só é ativado após a confirmação do pagamento. Você pode cancelar a qualquer momento.</p>
    </main>
  );
}
