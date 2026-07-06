# Lead form setup — GiaExplains

The contact form on `index.html` posts to a serverless function (`api/lead.js`)
which emails each submission to **hi@giaexplains.com** via **Brevo SMTP**
(using Nodemailer). Email credentials live only in server-side environment
variables — never in the web page.

## What you need to do (one time)

### 1. Create the Brevo SMTP key
1. Sign up free at https://www.brevo.com
2. Go to **SMTP & API → SMTP** tab.
3. Note the **Login** (an email) and generate/copy the **SMTP key** (`xsmtpsib-...`).

### 2. Verify your domain in Brevo (so mail doesn't hit spam)
1. Brevo → **Senders, Domains & Dedicated IPs → Domains → Add** `giaexplains.com`.
2. Add the SPF / DKIM / DMARC DNS records Brevo shows you at your **domain registrar**
   (where giaexplains.com's DNS is managed — not inside Gmail).
   These sit alongside the existing Google Workspace records; they won't clash.
3. Wait for Brevo to mark the domain **verified**.

### 3. Deploy on Vercel
1. Push this folder to a Git repo (GitHub/GitLab) or run `vercel` from the Vercel CLI.
2. In Vercel → **Project → Settings → Environment Variables**, add (see `.env.example`):
   - `BREVO_SMTP_USER` — your Brevo login email
   - `BREVO_SMTP_KEY`  — your Brevo SMTP key
   - `MAIL_TO`         — `hi@giaexplains.com`
   - `MAIL_FROM`       — `hi@giaexplains.com` (must be verified in Brevo)
3. Vercel auto-installs `nodemailer` from `package.json` and serves `api/lead.js`
   at `/api/lead`. The static `index.html` is served automatically.

### 4. Test
- Open the deployed site, submit the form, confirm the email arrives at hi@giaexplains.com.
- Replying to that email goes straight to the lead (reply-to is set to their address).

## Security notes
- Credentials are only in Vercel env vars — not in the HTML/JS.
- Honeypot field (`company`) + a per-IP rate limit block basic spam bots.
- All inputs are length-capped and HTML-escaped before emailing.
- `.env` is gitignored so secrets never get committed.

## Free-tier limits (Brevo)
- 300 emails/day (far more than a lead form needs).
- Brevo logo appears in the email footer on the free plan.

## Netlify instead of Vercel?
Move `api/lead.js` to `netlify/functions/lead.js`, change `export`/handler
signature to Netlify's `exports.handler = async (event) => {...}` (parse
`event.body`, return `{ statusCode, body }`), set the form action to
`/.netlify/functions/lead`, and add the same env vars in Netlify. Ask if you
want this version.
