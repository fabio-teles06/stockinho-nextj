import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stockinho · Controle de estoque",
  description: "Seu estoque organizado. Seu negócio em boas mãos.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
