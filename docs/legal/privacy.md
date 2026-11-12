# Privacy policy

Last updated November 10, 2026.

Marquee TV ("we") builds playlists of live performances that play on YouTube. This policy says what we collect, why, how long we keep it, and how to delete it.

## Without an account

You can build and play a playlist without signing in. We collect:

- **A guest token.** A random identifier your browser keeps in local storage and sends with each request, so your drafts stay yours. We store only a hash of it. It is not a cookie.
- **Your drafts.** What you type or tap to describe a set, the playlists we build from it, and the changes you make. We keep drafts on our servers so they survive reloads and a second device.
- **Events.** What happens in the app, such as a playlist created, played or shared, recorded by us with your guest token or account, never by a third-party tracker.
- **A hash of your IP address.** Used to limit how often one network can generate playlists. We do not store the address itself.

Drafts you never sign in to keep are deleted 30 days after you last use them.

We use no tracking cookies and no third-party analytics or advertising.

## With an account

You need an account to buy a session pass or a subscription. When you sign in we collect:

- **Your email address**, from the email link you request or from Google sign-in. With Google we ask only for your basic profile.
- **Your library.** The drafts you made as a guest move to your account when you sign in.

## Payments

Payments are handled by Stripe. Your card details go to Stripe and never reach our servers. We keep the Stripe customer, subscription and payment IDs, your plan, its status and its end date. Stripe's privacy policy is at https://stripe.com/privacy.

## YouTube

Marquee TV uses YouTube API Services. Playlists open on YouTube, and what you watch there is governed by YouTube. Google's privacy policy is at https://policies.google.com/privacy.

From the YouTube API we store a video's title, duration, upload date and availability. We refresh this data every week and delete any of it older than 30 days. Thumbnails are shown from YouTube's own servers and never stored. We store our own records of which videos are live performances and who performs in them. None of the YouTube data is about you.

### Save to my YouTube

Only if you choose Save to my YouTube do we ask Google for access to your YouTube account. Google's consent screen names the permission: manage your YouTube account. We use it only to create a private playlist of your set in your account, one playlist each time you save a version of a set. We do not read your videos, subscriptions or history.

Google gives us a refresh token, which we store encrypted on our servers and never send to your browser. We also keep the ID of each playlist we created, so a second save of the same set returns it instead of making another.

Disconnect, in Account, revokes the access at Google and deletes the token at once. Delete my data does the same. You can also revoke it yourself at https://security.google.com/settings/security/permissions; the next time we try to use the token, Google refuses it and we delete it.

## Who processes your data

- **Vercel** hosts the app.
- **Supabase** runs our database and sign-in.
- **Stripe** takes payments.
- **Resend** sends sign-in emails.
- **Anthropic** runs the model that turns your description into a playlist. It receives what you type and our catalog data, never your email address.

## Deleting your data

Delete my data, in Account, deletes your account, your plan records, your drafts and their history, your share links, and any YouTube access you granted (revoked at Google first) at once. It cancels any active subscription at Stripe first. We keep a record of each playlist the model built, with what was asked and which videos it chose, but no longer linked to you or to a draft, so we can measure and improve the curator. Events stay without your account attached.

Stripe keeps its own payment records as the law requires.

## Contact

Questions or requests: ops@getmarquee.tv.
