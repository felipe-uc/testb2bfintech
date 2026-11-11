import type { Metadata } from "next";
import { Suspense } from "react";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "./nav";
import { Footer } from "./ui";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Tienda Aurora · Activation Lab",
  description:
    "Tienda ficticia para probar un pago por transferencia de punta a punta, medido paso a paso. Entorno de prueba, sin dinero real. No afiliado a Fintoc.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <Nav />
        </Suspense>
        {children}
        <Footer />
      </body>
    </html>
  );
}
