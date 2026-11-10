import type { Metadata } from "next";
import { LegalPage } from "./legal-page";

export const metadata: Metadata = { title: "Privacy · Marquee TV" };

export default function PrivacyPage() {
  return <LegalPage file="privacy.md" />;
}
