import type { Metadata } from "next";
import type { ReactNode } from "react";
import { archivo } from "@/components/ui/font";
import { LegalLinks } from "@/components/ui/legal-links";
import { Toaster } from "@/components/ui/toast";
import { Wordmark } from "@/components/ui/wordmark";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marquee TV",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="flex flex-col">
        <Toaster>
          <header className="flex items-center justify-between gap-4 border-b border-fg p-5">
            <Wordmark />
          </header>
          {children}
          <footer className="mt-auto flex flex-col gap-2 border-t border-fg px-5 pt-6 pb-7 text-meta tracking-normal text-muted">
            <span className="font-medium text-fg">@marquee.tv</span>
            <p className="m-0">Not affiliated with YouTube or any publisher.</p>
            <LegalLinks />
          </footer>
        </Toaster>
      </body>
    </html>
  );
}
