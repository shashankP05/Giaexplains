// Serverless lead-form handler for GiaExplains.
// Receives the contact form POST and emails it to hi@giaexplains.com
// via Brevo SMTP using Nodemailer.
//
// SECURITY:
//  - SMTP credentials are read ONLY from environment variables (never in client code).
//  - Honeypot field ("company") blocks basic spam bots.
//  - A tiny in-memory rate limit slows down abuse from a single IP.
//  - All fields are length-capped and the reply-to is set to the lead's email.
//
// Required environment variables (set these in Vercel → Project → Settings → Environment Variables):
//   BREVO_SMTP_USER  = your Brevo login email (SMTP & API → SMTP → "Login")
//   BREVO_SMTP_KEY   = your Brevo SMTP key   (starts with "xsmtpsib-...")
//   MAIL_TO          = hi@giaexplains.com                (where leads are delivered)
//   MAIL_FROM        = hi@giaexplains.com                (verified sender/domain in Brevo)

const nodemailer = require('nodemailer');

// --- very small in-memory rate limiter (per warm instance) ---------------
const HITS = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_PER_WINDOW = 5;    // max submissions per IP per minute

function rateLimited(ip) {
  const now = Date.now();
  const entry = HITS.get(ip) || { count: 0, start: now };
  if (now - entry.start > WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  HITS.set(ip, entry);
  return entry.count > MAX_PER_WINDOW;
}

// --- helpers --------------------------------------------------------------
const clamp = (v, max) => String(v == null ? '' : v).slice(0, max).trim();
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // Body can arrive parsed (Vercel) or as a raw string — handle both.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Honeypot: real users never fill this. Silently accept so bots can't tell.
  if (clamp(body.hp_check, 200) !== '') {
    return res.status(200).json({ ok: true });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
  }

  const site  = clamp(body.site, 500);
  const email = clamp(body.email, 200);
  const phone = clamp(body.phone, 60);
  const query = clamp(body.query, 3000);

  if (!site || !email) {
    return res.status(400).json({ error: 'Please add your store link and email.' });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const { BREVO_SMTP_USER, BREVO_SMTP_KEY, MAIL_TO, MAIL_FROM } = process.env;
  if (!BREVO_SMTP_USER || !BREVO_SMTP_KEY || !MAIL_TO || !MAIL_FROM) {
    console.error('Missing email environment variables.');
    return res.status(500).json({ error: 'Server not configured. Please email hi@giaexplains.com directly.' });
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false, // STARTTLS on 587
    auth: { user: BREVO_SMTP_USER, pass: BREVO_SMTP_KEY }
  });

  const text =
    `New enquiry from giaexplains.com\n\n` +
    `Store / website: ${site}\n` +
    `Email: ${email}\n` +
    `Phone: ${phone || '—'}\n\n` +
    `Query:\n${query || '—'}\n`;

  const html =
    `<h2 style="font-family:sans-serif">New enquiry from giaexplains.com</h2>` +
    `<p style="font-family:sans-serif"><b>Store / website:</b> ${esc(site)}<br>` +
    `<b>Email:</b> ${esc(email)}<br>` +
    `<b>Phone:</b> ${esc(phone) || '—'}</p>` +
    `<p style="font-family:sans-serif"><b>Query:</b><br>${esc(query || '—').replace(/\n/g, '<br>')}</p>`;

  try {
    await transporter.sendMail({
      from: `"GiaExplains site" <${MAIL_FROM}>`,
      to: MAIL_TO,
      replyTo: email,       // reply goes straight to the lead
      subject: `New enquiry — ${site}`,
      text,
      html
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('sendMail failed:', err && err.message);
    return res.status(502).json({ error: 'Could not send right now. Please email hi@giaexplains.com directly.' });
  }
};
