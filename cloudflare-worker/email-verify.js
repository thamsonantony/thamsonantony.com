// Two jobs, one Worker:
//   1. Verify an email isn't disposable (proxies QuickEmailVerification, keeps the API key server-side).
//   2. On /send-resume, do that check and — if it passes — email the requester the resume PDF,
//      fetched live from the GitHub Pages site so a `git push` updates what gets sent with no redeploy.

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
  const [htmlRes, textRes, pdfRes] = await Promise.all([
    fetch(env.RESUME_EMAIL_HTML_URL),
    fetch(env.RESUME_EMAIL_TEXT_URL),
    fetch(env.RESUME_PDF_URL),
  ]);
  if (!htmlRes.ok) throw new Error('Could not load resume email template');
  if (!textRes.ok) throw new Error('Could not load resume email text');
  if (!pdfRes.ok) throw new Error('Could not load resume PDF');

  const rawHtml = await htmlRes.text();
  const text = await textRes.text();
  const pdfBytes = await pdfRes.arrayBuffer();

  // The HTML was exported with image src paths relative to its own folder
  // (e.g. "images/foo.png") — rewrite those to absolute URLs, since email
  // clients have no "current page" to resolve relative paths against.
  const html = rawHtml.replace(/src="images\//g, `src="${env.RESUME_EMAIL_IMAGES_BASE_URL}`);

  await env.EMAIL.send({
    to: email,
    from: { email: env.RESUME_FROM_ADDRESS, name: env.RESUME_FROM_NAME },
    subject: `${env.RESUME_FROM_NAME} — Resume`,
    html,
    text,
    attachments: [{
      content: pdfBytes,
      filename: 'Thamson Antony Arockiasamy.pdf',
      type: 'application/pdf',
      disposition: 'attachment',
    }],
  });
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
