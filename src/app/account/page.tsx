import type { Metadata } from "next";
import { Account } from "@/components/billing/account";

export const metadata: Metadata = { title: "Account · Marquee TV" };

// J10: plan, billing portal, sign out, delete my data.
export default function AccountPage() {
  return <Account />;
}
