# Keys, secrets and deployment guide

You don't need to change any code to change keys. The app reads every secret from environment
variables:

| Where the app runs | Where the keys go |
|---|---|
| Your laptop | the `.env` file in the project root (git-ignored, never committed) |
| DigitalOcean | App → Settings → each component → Environment Variables (marked "Encrypt") |

Never paste keys into code, commits, GitHub issues or chat messages.

---

## Part 1 - Replace the leaked keys (about 15 minutes)

The old values were committed to GitHub in `.env` and `public/client.js`, so treat them as public.

### 1. Stripe secret key
1. Go to <https://dashboard.stripe.com> and make sure **Test mode** is on (toggle at the top right).
2. Open **Developers → API keys**.
3. Next to **Secret key**, click **⋯ → Roll key**. Set expiration to **Now**, then confirm.
4. Copy the new key (`sk_test_...`). It is shown only once.
5. Put it in `.env` as `STRIPE_SECRET_KEY=sk_test_...`

The **publishable key** (`pk_test_...`) in `public/*.js` is meant to be public, so you don't need
to change it. If you ever switch to a different Stripe account, replace it in those files.

### 2. MongoDB Atlas password
The old connection string contains the username and password `dhrumil / dhrumil7pat`.
1. Go to <https://cloud.mongodb.com>, sign in and open your project.
2. In the left menu, open **Security → Database Access**.
3. Find the user `dhrumil`, click **Edit → Edit Password**, then **Autogenerate Secure Password**.
   Copy it and click **Update User**.
4. Build the new connection string. Go to **Database → Connect → Drivers** and copy the string,
   then replace `<password>` with the new password:
   `mongodb+srv://dhrumil:NEW_PASSWORD@niveshpathcluster.egrir.mongodb.net/Nivesh?retryWrites=true&w=majority`
5. Put it in `.env` as `MONGO_URL=mongodb+srv://...`
6. For DigitalOcean, go to **Security → Network Access → Add IP Address** and choose
   **Allow access from anywhere** (`0.0.0.0/0`). App Platform has no fixed IP, so this is the
   simple option; the strong password protects the database.

### 3. Finnhub API key
1. Go to <https://finnhub.io/dashboard> and sign in.
2. If you see a **Regenerate** option, use it. If not, create a new free account and use its key.
3. Put it in `.env` as `FINNHUB_API_KEY=...`

### 4. New keys you'll also need
| Variable | Where to get it |
|---|---|
| `JWT_SECRET` | Any long random string. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ANTHROPIC_API_KEY` | <https://console.anthropic.com> → **API Keys → Create Key**. Add billing credit first. Without this key the AI Advisor still works, but only gives rule-based answers. |
| `SENTRY_DSN` (optional) | <https://sentry.io> (free with the GitHub Student Pack) → create a Node project → copy the DSN |

### 5. Your final local `.env`
```
PORT=3000
PUBLIC_BASE_URL=http://localhost:3000
FINNHUB_API_KEY=your_new_finnhub_key
MONGO_URL=mongodb+srv://dhrumil:NEW_PASSWORD@niveshpathcluster.egrir.mongodb.net/Nivesh?retryWrites=true&w=majority
STRIPE_SECRET_KEY=sk_test_new_key
JWT_SECRET=long_random_string
AI_SERVICE_URL=http://localhost:8001
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-opus-5-5
```
Check that it works: run `npm install && npm run dev`, open <http://localhost:3000/health>, and
confirm it shows `"db":"connected"`.

---

## Part 2 - Deploy to DigitalOcean (about 20 minutes)

### 1. Claim the free credit
GitHub Student Pack: <https://education.github.com/pack> → find **DigitalOcean** → claim the
$200 credit. Then create or sign in to your DigitalOcean account. Your card is verified, but the
app runs on the credit.

### 2. Create the app
1. Go to <https://cloud.digitalocean.com/apps> and click **Create App**.
2. Choose **GitHub** as the source and click **Manage Access**. Authorize DigitalOcean for the
   `sumitparmar19/Nivesh-Path` repository.
3. Select the repo and the branch `main`, and tick **Autodeploy**. Click **Next**.
4. DigitalOcean shows an auto-detected component. Replace that with our spec: click **Edit App
   Spec** (or go to **Settings → App Spec → Edit**), delete everything, and paste the full contents
   of [`.do/app.yaml`](../.do/app.yaml). Click **Save**.
5. You should now see two components: **web** (Node, public) and **ai** (Python, internal).

### 3. Add the secrets
For each component, open **Settings → (component) → Environment Variables → Edit**. Paste the
values and tick **Encrypt** on each one:

| Component | Variables |
|---|---|
| web | `MONGO_URL`, `FINNHUB_API_KEY`, `STRIPE_SECRET_KEY`, `JWT_SECRET`, `SENTRY_DSN` (optional) |
| ai | `ANTHROPIC_API_KEY`, `SENTRY_DSN` (optional) |

`AI_SERVICE_URL`, `PUBLIC_BASE_URL` and `CLAUDE_MODEL` are already filled in by the spec.

### 4. Deploy and check
1. Click **Create Resources** (or **Deploy**). The first build takes about 5-10 minutes; watch the
   **Activity** tab.
2. When it shows **Live**, open the URL, for example `https://nivesh-path-xxxxx.ondigitalocean.app`:
   - `/health` should show `"status":"ok","db":"connected","payments":true`
   - `/advisor.html` → click **Analyze**. The badge should say **"AI insight · claude-opus-5-5"**.
3. Put the live URL in `README.md` (the "Live demo" line) and on your resume.

### If something fails
| Symptom | Fix |
|---|---|
| Build fails on the **ai** component with "Dockerfile not found" | In the App Spec, change `dockerfile_path: ai-service/Dockerfile` to `dockerfile_path: Dockerfile` (the path is relative to `source_dir`) and save |
| `/health` shows `"db":"disconnected"` | Check `MONGO_URL` and the Atlas Network Access step (Part 1, step 2.6) |
| Advisor badge says "Rule-based insight" | `ANTHROPIC_API_KEY` is missing or invalid on the **ai** component, or the account has no credit |
| Stripe checkout errors | `STRIPE_SECRET_KEY` is missing on **web**, or you rolled the key and forgot to update it |

### Cost
`web` (0.5 GB) costs about $5/month and `ai` (1 GB) about $10/month, which the student credit
covers for over a year. To pause billing, destroy the app; you can recreate it from the spec any time.
