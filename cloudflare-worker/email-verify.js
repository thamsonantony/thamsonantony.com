// Two jobs, one Worker:
//   1. Verify an email isn't disposable (proxies QuickEmailVerification, keeps the API key server-side).
//   2. On /send-resume, do that check and — if it passes — email the requester the resume PDF via Resend,
//      with the body/PDF fetched live from the GitHub Pages site so a `git push` updates what gets sent
//      with no redeploy. (Not using Cloudflare's native Email Sending — it requires the Workers Paid plan
//      to send to arbitrary recipients; on Free it's permanently capped to pre-verified destinations.)

export default {
  async fetch(request, env) {
    const headers = corsHeaders(env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, headers);
    }

    let email;
    try {
      ({ email } = await request.json());
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, headers);
    }
    if (!email || typeof email !== 'string') {
      return json({ error: 'Missing email' }, 400, headers);
    }

    const verification = await verifyEmail(email, env);
    if (verification.error) {
      return json({ error: verification.error }, 502, headers);
    }
    if (verification.disposable) {
      return json({ disposable: true, sent: false }, 200, headers);
    }

    if (url.pathname === '/send-resume') {
      try {
        await sendResumeEmail(email, env);
        return json({ disposable: false, sent: true }, 200, headers);
      } catch (err) {
        return json({ disposable: false, sent: false, error: err.message }, 500, headers);
      }
    }

    return json({
      disposable: false,
      valid: verification.valid,
      result: verification.result,
      reason: verification.reason,
    }, 200, headers);
  },
};

async function verifyEmail(email, env) {
  const apiUrl = `https://api.quickemailverification.com/v1/verify?email=${encodeURIComponent(email)}&apikey=${env.QEV_API_KEY}`;
  const qevRes = await fetch(apiUrl);
  if (!qevRes.ok) {
    return { error: 'Verification service unavailable' };
  }
  const data = await qevRes.json();
  return {
    disposable: data.disposable === true || data.disposable === 'true',
    valid: data.result === 'valid',
    result: data.result,
    reason: data.reason,
  };
}

async function sendResumeEmail(email, env) {
  const [htmlRes, textRes] = await Promise.all([
    fetch(env.RESUME_EMAIL_HTML_URL),
    fetch(env.RESUME_EMAIL_TEXT_URL),
  ]);
  if (!htmlRes.ok) throw new Error('Could not load resume email template');
  if (!textRes.ok) throw new Error('Could not load resume email text');

  const rawHtml = await htmlRes.text();
  const text = await textRes.text();

  // The HTML was exported with image src paths relative to its own folder
  // (e.g. "images/foo.png") — rewrite those to absolute URLs, since email
  // clients have no "current page" to resolve relative paths against.
  const html = rawHtml.replace(/src="images\//g, `src="${env.RESUME_EMAIL_IMAGES_BASE_URL}`);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: [email],
      bcc: [env.RESUME_BCC_ADDRESS],
      from: `${env.RESUME_FROM_NAME} <${env.RESUME_FROM_ADDRESS}>`,
      subject: `${env.RESUME_FROM_NAME} — Resume`,
      html,
      text,
      // Resend fetches the PDF directly from this URL — no need to download/base64 it ourselves.
      attachments: [{
        path: env.RESUME_PDF_URL,
        filename: 'Thamson Antony Arockiasamy.pdf',
      }],
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Resend request failed (${res.status})`);
  }
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

function corsHeaders(env) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'https://thamsonantony.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
