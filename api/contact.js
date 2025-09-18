'use strict';

// Vercel Serverless function (Node runtime)
// POST /api/contact
// Accetta JSON o form-encoded { name, email, message, _honeypot? }
// - Validazione campi obbligatori e email semplice
// - Honeypot: se presente e non vuoto -> ok immediato (anti-spam)
// - Rate limit in-memory per IP: max 6 richieste / 10 minuti
// - Invio primario: Resend API (ENV: RESEND_API_KEY, FROM_EMAIL, TO_EMAIL)
// - Fallback: Nodemailer SMTP (ENV: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
// - Risponde sempre JSON { ok: true } o { error: '...' }

const querystring = require('querystring');

// =====================
// Config & Rate Limit
// =====================
const envNum = (val, fallback) => {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const RATE_LIMIT_DISABLED = String(process.env.RATE_LIMIT_DISABLED || '').toLowerCase() === 'true';
const RATE_LIMIT_WINDOW_MS = envNum(process.env.RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000); // 10 minuti
const RATE_LIMIT_MAX = envNum(process.env.RATE_LIMIT_MAX, 6); // per IP
// In-memory store: volatile ed effimero su serverless
const rateLimitStore = new Map(); // ip -> number[] (timestamps)

// =====================
// Helpers
// =====================
const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const getClientIp = (req) => {
  const xfwd = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers['x-vercel-forwarded-for'];
  if (typeof xfwd === 'string' && xfwd.length > 0) {
    return xfwd.split(',')[0].trim();
  }
  const remote = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';
  return remote || 'unknown';
};

const isRateLimited = (ip) => {
  if (RATE_LIMIT_DISABLED) return false;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = rateLimitStore.get(ip) || [];
  const recent = timestamps.filter((t) => t >= windowStart);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitStore.set(ip, recent); // pulizia
    return true;
  }
  recent.push(now);
  rateLimitStore.set(ip, recent);
  return false;
};

const readRawBody = (req) => new Promise((resolve, reject) => {
  try {
    const chunks = [];
    let total = 0;
    const MAX = 1 * 1024 * 1024; // 1MB
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX) {
        reject(new Error('Payload troppo grande'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      resolve(buf.toString('utf8'));
    });
    req.on('error', reject);
  } catch (err) {
    reject(err);
  }
});

const parseBody = async (req) => {
  const raw = await readRawBody(req);
  const type = (req.headers['content-type'] || '').toLowerCase();
  if (type.includes('application/json')) {
    try {
      return JSON.parse(raw || '{}');
    } catch (err) {
      throw new Error('JSON non valido');
    }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return querystring.parse(raw);
  }
  // Prova best-effort JSON, altrimenti vuoto
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
};

const isValidEmail = (email) => {
  const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  return re.test(String(email || '').toLowerCase());
};

const buildTextBody = ({ name, email, message }, ip) => {
  return [
    'Nuova richiesta informazioni:',
    '',
    `Nome: ${name}`,
    `Email: ${email}`,
    '',
    'Messaggio:',
    message,
    '',
    `IP: ${ip}`,
  ].join('\n');
};

const sendViaResend = async ({ from, to, replyTo, subject, text }) => {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY non configurata' };
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text, reply_to: replyTo }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    return { ok: false, error: `Resend API error ${resp.status}: ${txt}` };
  }
  return { ok: true };
};

const sendViaSmtp = async ({ from, to, replyTo, subject, text }) => {
  // Import dinamico: il fallback funziona solo se "nodemailer" è installato nelle dipendenze
  let nodemailer = null;
  try {
    nodemailer = require('nodemailer');
  } catch (err) {
    return { ok: false, error: 'Nodemailer non disponibile: aggiungere la dipendenza per SMTP' };
  }
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return { ok: false, error: 'Credenziali SMTP mancanti' };
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transporter.sendMail({ from, to, subject, text, replyTo });
  return { ok: true };
};

// =====================
// Handler
// =====================
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Metodo non consentito' });
    }

    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
      res.setHeader('Retry-After', Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
      return sendJson(res, 429, { error: 'Too many requests' });
    }

    let data;
    try {
      data = await parseBody(req);
    } catch (err) {
      console.error('Errore parse body:', err);
      return sendJson(res, 400, { error: 'Body non valido' });
    }

    const name = (data.name || '').toString().trim();
    const email = (data.email || '').toString().trim();
    const message = (data.message || '').toString().trim();
    const honey = (data._honeypot || '').toString().trim();

    // Honeypot: rispondi ok senza inviare
    if (honey) {
      return sendJson(res, 200, { ok: true });
    }

    // Validazione
    if (!name) return sendJson(res, 400, { error: 'Il campo name è obbligatorio' });
    if (!email) return sendJson(res, 400, { error: 'Il campo email è obbligatorio' });
    if (!isValidEmail(email)) return sendJson(res, 400, { error: 'Email non valida' });
    if (!message) return sendJson(res, 400, { error: 'Il campo message è obbligatorio' });

    const FROM_EMAIL = process.env.FROM_EMAIL;
    const TO_EMAIL = process.env.TO_EMAIL;
    if (!TO_EMAIL) return sendJson(res, 500, { error: 'TO_EMAIL non configurata' });
    if (!FROM_EMAIL) return sendJson(res, 500, { error: 'FROM_EMAIL non configurata' });

    const subject = 'Richiesta info';
    const text = buildTextBody({ name, email, message }, ip);

    // Prova Resend
    const resendResult = await sendViaResend({ from: FROM_EMAIL, to: TO_EMAIL, replyTo: email, subject, text });
    if (resendResult.ok) {
      return sendJson(res, 200, { ok: true });
    }
    console.error('Resend fallito:', resendResult.error);

    // Fallback SMTP
    const smtpResult = await sendViaSmtp({ from: FROM_EMAIL, to: TO_EMAIL, replyTo: email, subject, text });
    if (smtpResult.ok) {
      return sendJson(res, 200, { ok: true });
    }
    console.error('SMTP fallito:', smtpResult.error);
    return sendJson(res, 502, { error: 'Invio email non riuscito' });
  } catch (err) {
    console.error('Errore generico handler:', err);
    return sendJson(res, 500, { error: 'Errore interno' });
  }
};


