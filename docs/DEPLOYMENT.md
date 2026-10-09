# Keys, secrets and deployment guide

You don't need to change any code to change keys or accounts. The app reads every secret from environment
variables:

| Where the app runs | Where the keys go |
|---|---|
| Your laptop | the `.env` file in the project root (git-ignored, never committed) |
| DigitalOcean | App → Settings → each component → Environment Variables (marked "Encrypt") |

Never paste keys into code, commits, GitHub issues or chat messages.

---

## Part 1 - Create your own accounts and keys (about 30 minutes)

The original keys belong to a previous teammate's accounts (the MongoDB user `dhrumil`, plus that
person's Stripe and Finnhub accounts). They were committed to GitHub, so treat them as public and
stop using them. Create your own free accounts below. You'll end up with **7 values** to put in
`.env`.

Tip: open a plain text file (outside the project folder) and paste each value into it as you go.
Delete that file when you're done.

### 1. MongoDB Atlas -> `MONGO_URL` (database)
1. Go to <https://www.mongodb.com/cloud/atlas/register> and sign up with your own email or Google.
2. You'll land on **"Deploy your cluster"**. Choose **M0 (Free)**, provider **AWS**, any nearby
   region. Name it `NiveshPath`, then click **Create Deployment**.
3. A **"Connect to NiveshPath"** popup opens and asks you to create a database user:
   - Username: `niveshpath_app`
   - Password: click **Autogenerate Secure Password**, then **Copy** it into your text file.
   - Click **Create Database User**.
   - (Later you can find this under **Security → Database Access** in the left sidebar.)
4. Allow connections from anywhere (DigitalOcean has no fixed IP):
   - Left sidebar: **Security → Network Access → + Add IP Address → Allow Access from Anywhere**
     (`0.0.0.0/0`) → **Confirm**.
5. Get the connection string:
   - Left sidebar: **Database → Clusters** → on your cluster click **Connect → Drivers**.
   - Copy the string under step 3. It looks like
     `mongodb+srv://niveshpath_app:<db_password>@niveshpath.abc12.mongodb.net/?retryWrites=true&w=majority&appName=NiveshPath`
   - Replace `<db_password>` with your password, and add the database name `niveshpath` after
     `.net/`:
     `mongodb+srv://niveshpath_app:YOURPASS@niveshpath.abc12.mongodb.net/niveshpath?retryWrites=true&w=majority&appName=NiveshPath`
   - If your password contains `@ : / ? # %`, autogenerate a new one without symbols. Those
     characters break the URL.
6. Your `.env` line: `MONGO_URL=mongodb+srv://niveshpath_app:...`

The database starts empty. The app creates its collections (`users`, `purchases`) automatically
on first use.

### 2. Stripe - no longer needed
Since Phase 2A the app is paper trading with $100,000 of virtual cash per user, so Stripe is not used.
If you added `STRIPE_SECRET_KEY` to DigitalOcean you can delete it.

### 3. Finnhub -> `FINNHUB_API_KEY` (live stock prices)
1. Go to <https://finnhub.io/register> and sign up (free plan).
2. After login you land on the **Dashboard** (<https://finnhub.io/dashboard>). Your **API Key** is
   shown at the top. Copy it.
3. Your `.env` line: `FINNHUB_API_KEY=...`

The free plan allows 60 calls per minute. The app caches quotes for 60 seconds, so that's plenty.

### 4. Anthropic (Claude) -> `ANTHROPIC_API_KEY` (AI Advisor)
1. Go to <https://console.anthropic.com> and sign up.
2. Add credit: **Settings → Billing → Buy credits**. $5 is plenty; each analysis costs a few cents.
3. Create the key: **Settings → API Keys → + Create Key**, name it `nivesh-path`, and copy it.
   It starts with `sk-ant-` and is shown only once.
4. Your `.env` line: `ANTHROPIC_API_KEY=sk-ant-...`

Without this key the AI Advisor still works, but only gives rule-based answers.

### 5. JWT secret -> `JWT_SECRET` (login tokens, no account needed)
In a terminal in the project folder, run:
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Copy the output. Your `.env` line: `JWT_SECRET=<that output>`

### 6. Sentry -> `SENTRY_DSN` (optional, error tracking, free with the Student Pack)
1. Go to <https://sentry.io/signup> (or claim it via <https://education.github.com/pack>).
2. **Create Project → Node.js (Express)** → name it `nivesh-path`.
3. Copy the **DSN** shown in the setup instructions (`https://...@...ingest.sentry.io/...`).
   You can find it later under **Settings → Projects → nivesh-path → Client Keys (DSN)**.
4. Your `.env` line: `SENTRY_DSN=https://...`

### 7. Put it all in `.env`
In the project root, open `.env` (or copy `.env.example` to `.env`), delete the old values, and
make it look like this:
```
PORT=3000
PUBLIC_BASE_URL=http://localhost:3000
MONGO_URL=mongodb+srv://niveshpath_app:YOURPASS@niveshpath.abc12.mongodb.net/niveshpath?retryWrites=true&w=majority&appName=NiveshPath
FINNHUB_API_KEY=...
JWT_SECRET=...
AI_SERVICE_URL=http://localhost:8001
SENTRY_DSN=
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-opus-5-5
```
`.env` is git-ignored, so it stays on your computer. **No code changes are needed**: every key is
read from here.

### 8. Check it works locally
```
npm install
npm run dev                      # terminal 1 -> http://localhost:3000/health
cd ai-service && python -m venv .venv
.venv/bin/pip install -r requirements.txt     # Windows: .venv\Scripts\pip
.venv/bin/uvicorn main:app --port 8001        # terminal 2
```
- <http://localhost:3000/health> should show `"db":"connected","payments":true`
- <http://localhost:8001/health> should show `"llm_configured":true`
- <http://localhost:3000/advisor.html> → Analyze → the badge should say **AI insight**
- Sign up, open a company page (e.g. Tesla) → Buy → your cash balance drops and the trade shows on Transactions

### 9. (Optional) Delete the old values everywhere
- Remove any old keys from other copies of the project, notes or chats.
- Ask the previous teammate to rotate or delete their keys. They are still visible in this repo's
  git history.

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
| web | `MONGO_URL`, `FINNHUB_API_KEY`, `JWT_SECRET` (required in production), `AI_INTERNAL_TOKEN`, `SENTRY_DSN` (optional), `RESEND_API_KEY` + `CONTACT_TO_EMAIL` (optional, contact-form email) |
| ai | `ANTHROPIC_API_KEY`, `MONGO_URL` (same value as web), `AI_INTERNAL_TOKEN` (same value as web), `SENTRY_DSN` (optional) |

`AI_INTERNAL_TOKEN` is a shared secret: with it set, the AI service only answers requests from the web component.
Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste the **same** value on
both components. Set it on **ai** and **web** in the same save (or web first): if only **ai** has it, the AI Advisor and
coach stop answering until **web** has it too.

`AI_SERVICE_URL`, `PUBLIC_BASE_URL` and `CLAUDE_MODEL` are already filled in by the spec.

Why the **ai** component needs `MONGO_URL` too: App Platform wipes the container disk on every deploy,
so the AI service's ChromaDB index starts empty. On boot it re-embeds every user's trades from MongoDB
(a few seconds), and behavioral-pattern results are stored in MongoDB's `behavioral_patterns` collection.
Without `MONGO_URL` the advisor still works, but forgets past trades after each deploy.

### 4. Deploy and check
1. Click **Create Resources** (or **Deploy**). The first build takes about 5-10 minutes; watch the
   **Activity** tab.
2. When it shows **Live**, open the URL, for example `https://nivesh-path-xxxxx.ondigitalocean.app`:
   - `/health` should show `"status":"ok","db":"connected"`
   - `/advisor` → click **Analyze**. The badge should say **"AI insight · claude-opus-5-5"**.
3. Put the live URL in `README.md` (the "Live demo" line) and on your resume.

### If something fails
| Symptom | Fix |
|---|---|
| Build fails on the **ai** component with "Dockerfile not found" | In the App Spec, change `dockerfile_path: ai-service/Dockerfile` to `dockerfile_path: Dockerfile` (the path is relative to `source_dir`) and save |
| `/health` shows `"db":"disconnected"` | Check `MONGO_URL` and the Atlas Network Access step (Part 1, section 1, step 4) |
| AI `/health` shows `"vector_index": {"status": "failed"}` or `"disabled"` | `MONGO_URL` is missing or wrong on the **ai** component |
| Advisor badge says "Rule-based insight" | `ANTHROPIC_API_KEY` is missing or invalid on the **ai** component, or the account has no credit |
| "Login required" on every page | `JWT_SECRET` changed (old tokens become invalid) - just log in again |
| A new React page misbehaves | **web** component → Environment Variables → add `REACT_DISABLED` = the route(s), e.g. `/markets,/stock`, and save. The app redeploys and serves the old HTML page for those routes. Remove the variable to switch back |

### Cost
`web` (0.5 GB) costs about $5/month and `ai` (1 GB) about $10/month, which the student credit
covers for over a year. To pause billing, destroy the app; you can recreate it from the spec any time.

---

## Part 3 - Custom domain (free .me from the GitHub Student Pack, ~20 minutes)

1. **Claim the domain:** <https://education.github.com/pack> → **Namecheap** → "Get access" → search for a
   `.me` name (e.g. `niveshpath.me`) → check out with the Student Pack coupon (free for 1 year).
   (Alternative in the same pack: **Name.com** free domain.)
2. **Add it in DigitalOcean:** your app → **Settings** → **Domains** → **Add Domain** → enter `niveshpath.me`
   (and optionally `www.niveshpath.me`) → choose **"You manage your domain"**. DigitalOcean shows a
   **CNAME target** like `nivesh-path-vzeak.ondigitalocean.app`.
3. **Point DNS at it (Namecheap):** Dashboard → **Domain List** → **Manage** next to the domain → **Advanced DNS**:
   - Delete the default "parking page" records.
   - For `www`: **Add New Record** → `CNAME Record` · Host `www` · Value = the CNAME target from step 2 · TTL Automatic.
   - For the root (`niveshpath.me`): add a **CNAME/ALIAS** record with Host `@` and the same target. If Namecheap
     doesn't allow it, either use only `www.niveshpath.me` (and add a **URL Redirect Record** from `@` to
     `https://www.niveshpath.me`), or move DNS to DigitalOcean (Networking → Domains, set Namecheap nameservers to
     `ns1/ns2/ns3.digitalocean.com`).
4. Wait 5-60 minutes. DigitalOcean issues the **HTTPS certificate automatically** (Let's Encrypt) - the domain shows
   "Active" in Settings → Domains.
5. `PUBLIC_BASE_URL` follows the domain automatically (`${APP_URL}`). Update the live link in `README.md`, `CLAUDE.md`,
   your resume and LinkedIn.

