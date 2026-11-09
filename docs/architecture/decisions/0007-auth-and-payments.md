# 0007. Supabase Auth for sign-in, Stripe Checkout and webhooks for entitlements

- Status: accepted
- Date: 2026-11-08
- Draws from: architecture 4 (claiming), 5.4, 7.3, 9.1, 9.2, 12 rows 7 and 16; PRD 7.6, 7.7, 11, 12, 13, 16.1, 18.1; journeys J7, J10

## Context

A guest's second model-backed draft asks for an account and a payment: a $2.99 session pass or a $4.99 monthly subscription. Sign-in has to work from a different browser than the one holding the guest's drafts, and Apple Pay and Google Pay are in P0. Card data must stay off our servers. P1 will need an incremental Google grant for the `youtube` scope.

## Decision

**Sign-in** goes through Supabase Auth, with Google (basic profile scope) or an email link. The email link carries a one-time claim code bound to the guest (ADR 0002). An `app_user` row is created at sign-in, which in J7 comes just before payment. The browser uses Supabase only for auth; all data access stays server-side (ADR 0006).

**Payment** goes through Stripe Checkout: a one-off payment for a session pass, or a monthly subscription. Checkout shows Apple Pay and Google Pay where the device supports them.

**Entitlements** are written only by the Stripe webhook (`checkout.session.completed`, `invoice.paid`, `customer.subscription.updated` and `.deleted`), verified by signature. The redirect back from Checkout only polls for the entitlement. A session pass binds to one draft and ends edits at `period_end`, 7 days later. Subscriptions are monthly only in P0.

**Account management** goes through the Stripe Customer Portal (`POST /api/billing/portal`) for cancel, switch plan and update card. `DELETE /api/account` deletes the user's data, cancels any subscription at Stripe, and keeps `curator_run` rows with the draft link removed.

## Consequences

- No passwords and no card data on our servers.
- A client request can never grant itself an entitlement.
- Between payment and the webhook's arrival, the client waits. The held draft starts generating once the entitlement exists, without retyping.
- A privacy policy and terms must be live before the first sign-in, because the Google consent screen and Stripe both require them.
- P1's Save to my YouTube is an incremental Google grant on the same Supabase Auth identity. No separate account-linking system.
