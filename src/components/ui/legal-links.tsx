import Link from "next/link";

// /privacy and /terms, in the footer and under the sign-in controls.
export function LegalLinks() {
  return (
    <div className="flex gap-4 text-meta tracking-normal text-muted">
      <Link href="/privacy" className="underline underline-offset-4">
        Privacy
      </Link>
      <Link href="/terms" className="underline underline-offset-4">
        Terms
      </Link>
    </div>
  );
}
