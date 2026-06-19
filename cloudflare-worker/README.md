# Resume request Worker

A Cloudflare Worker (`qev-proxy`) that powers the "Want the Director's Cut?" resume-request form on the contact page. It does two things on `POST /send-resume`:

1. Verifies the submitted email isn't disposable, by proxying to QuickEmailVerification (keeps that API key off the client).
2. If it passes, emails the requester the resume PDF via **Resend's REST API** — body from `assets/resume-email/email.html` / `email.txt`, PDF attached directly from its live URL (`assets/Thamson Antony Arockiasamy.pdf`) via Resend's `path` attachment field, so the Worker never has to download/re-encode it itself.

Because the HTML/text are fetched live from the site on every send (and the PDF is fetched by Resend, not the Worker), updating any of them is just: edit the file, `git push`, done — no Worker redeploy needed.

The email HTML references its two images via relative paths (`images/...`, as exported from a design tool). The Worker rewrites those to absolute URLs (`RESUME_EMAIL_IMAGES_BASE_URL`) before sending, since email clients can't resolve relative paths the way a browser can.

**Why Resend and not Cloudflare's native Email Sending:** Cloudflare's `send_email` Workers binding requires the **Workers Paid plan** to send to arbitrary recipients — on Free, sending is permanently capped to a pre-verified destination-address list (fine for testing, useless for a public form where any visitor's email needs to work). Resend's free tier (3,000 emails/month, 100/day) sends to any recipient once your domain is verified, no paid plan required.

## One-time setup

### 1. Already done

- `wrangler login` — authenticated against your Cloudflare account.
- `wrangler secret put QEV_API_KEY` — QuickEmailVerification key stored as a Worker secret.
- `wrangler deploy` — Worker is live at `https://qev-proxy.vc2vbrm2p4.workers.dev`.
- Resume PDF + email template pushed to the repo (`assets/Thamson Antony Arockiasamy.pdf`, `assets/resume-email/`).

### 2. Sign up for Resend and verify the domain

1. Create a free account at [resend.com](https://resend.com) — no card required.
2. **Domains** → **Add Domain** → enter `thamsonantony.com`.
3. Resend shows a handful of DNS records (SPF/DKIM, similar to what you already added for Cloudflare Email Sending). Add them in the Cloudflare dashboard under **DNS** → **Records** for `thamsonantony.com`. Since DNS is on Cloudflare's own nameservers, these go live almost immediately — no real propagation wait.
4. Wait for the domain status in Resend to flip to **Verified** (usually a minute or two once the records are visible).
5. **API Keys** → **Create API Key** — copy it (shown once).

### 3. Set the Resend API key as a Worker secret

```bash
cd cloudflare-worker
wrangler secret put RESEND_API_KEY
# paste the key from step 2 when prompted
```

### 4. Redeploy the Worker

```bash
wrangler deploy
```

## Test it

```bash
curl -X POST https://qev-proxy.vc2vbrm2p4.workers.dev/send-resume \
  -H "Content-Type: application/json" \
  -H "Origin: https://thamsonantony.com" \
  -d '{"email":"you@example.com"}'
```

Use a few different real addresses you control (not just one) — this time there should be no recipient restriction, since that was the whole point of switching off Cloudflare's native sending.

## Notes

- `ALLOWED_ORIGIN` in `wrangler.toml` restricts browser CORS to `https://thamsonantony.com`.
- `RESUME_FROM_ADDRESS` (`resume@thamsonantony.com`) doesn't need a real inbox to *send* — it just needs to belong to a domain verified on Resend. Replies will land wherever you configure later (e.g. Cloudflare Email Routing, or just point that address at your real inbox).
- QuickEmailVerification's free tier is 100 credits/day; Resend's free tier is 3,000/month and 100/day — each resume-request submission uses one credit from each.
