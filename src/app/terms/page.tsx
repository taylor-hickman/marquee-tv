import type { Metadata } from "next";
import { LegalPage } from "../privacy/legal-page";

export const metadata: Metadata = { title: "Terms · Marquee TV" };

export default function TermsPage() {
  return <LegalPage file="terms.md" />;
}
