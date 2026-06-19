# Resume request Worker

A Cloudflare Worker (`qev-proxy`) that powers the "Want the Director's Cut?" resume-request form on the contact page. It does two things on `POST /send-resume`:

1. Verifies the submitted email isn't disposable, by proxying to QuickEmailVerification (keeps that API key off the client).
2. If it passes, emails the requester the resume PDF — fetched live from `assets/Thamson Antony Arockiasamy.pdf`, with the HTML/text body from `assets/resume-email/email.html` and `email.txt` — using Cloudflare's native Email Sending (no third-party email API, no extra key).

Because the PDF, HTML, and text are all fetched live from the site on every send, updating any of them is just: edit the file, `git push`, done — no Worker redeploy needed.

The email HTML references its two images via relative paths (`images/...`, as exported from a design tool). The Worker rewrites those to absolute URLs (`RESUME_EMAIL_IMAGES_BASE_URL`) before sending, since email clients can't resolve relative paths the way a browser can.

## One-time setup

### 1. Already done

- `wrangler login` — authenticated against your Cloudflare account.
- `wrangler secret put QEV_API_KEY` — QuickEmailVerification key stored as a Worker secret.
- `wrangler deploy` — Worker is live at `https://qev-proxy.vc2vbrm2p4.workers.dev`.

### 2. Enable Email Sending for the domain

Required once, before any email can actually send. This adds SPF/DKIM TXT records to your Cloudflare DNS zone for `thamsonantony.com` (additive — doesn't touch existing records):

```bash
cd cloudflare-worker
wrangler email sending enable thamsonantony.com
wrangler email sending dns get thamsonantony.com   # confirm the records, propagation is usually 5-15 min
```

### 3. Push the resume PDF and email template

Both are already in the working tree (`assets/Thamson Antony Arockiasamy.pdf` and `assets/resume-email/`) — just untracked. Commit and push:

```bash
git add "assets/Thamson Antony Arockiasamy.pdf" assets/resume-email/
git commit -m "Add resume PDF and email template"
git push
```

GitHub Pages picks it up within ~a minute; the Worker always fetches the latest version, no redeploy required. Same goes for future edits to either — just edit, push, done.

### 4. Redeploy the Worker

The `wrangler.toml` now includes the `send_email` binding and resume-related vars — redeploy once to pick those up:

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

Use a real address you control — check your inbox for the resume PDF.

## Notes

- `ALLOWED_ORIGIN` in `wrangler.toml` restricts browser CORS to `https://thamsonantony.com`.
- `RESUME_FROM_ADDRESS` (`resume@thamsonantony.com`) doesn't need a real inbox to *send* — it just needs to belong to a domain onboarded for Email Sending. Replies will land wherever you configure later (e.g. via Email Routing, or just point that address at your real inbox).
- QuickEmailVerification's free tier is 100 credits/day — each resume-request submission uses one credit.
- Binary attachments (the PDF) only work on the deployed Worker — `wrangler dev --remote` doesn't support `ArrayBuffer` attachments locally, so test against the live URL above.
