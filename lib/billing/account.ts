import { z } from "zod";

export const accountSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome completo.").max(150),
  email: z.string().trim().email("Informe um e-mail válido.").max(254),
  cpf_cnpj: z.string().transform((value) => value.replace(/\D/g, "")).refine(
    (value) => value.length === 11 || value.length === 14,
    "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).",
  ),
});

export type AccountProfile = z.infer<typeof accountSchema>;
