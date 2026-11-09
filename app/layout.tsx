import type { Metadata } from "next";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stockinho · Controle de estoque",
  description: "Seu estoque organizado. Seu negócio em boas mãos.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  manifest: "/manifest.webmanifest",
  themeColor: "#12805e",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Stockinho",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
