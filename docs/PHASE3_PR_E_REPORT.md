# Phase 3 · PR E report: the AWS demo stack (Terraform, ECS Fargate, RDS, GitHub OIDC)

**Status:**
- **Built and checked locally.** That covers `terraform validate`, Checkov, ShellCheck, actionlint, an RDS-style TLS connection and all the test suites.
- **Nothing exists on AWS yet.** The first apply is your step D1 below.
- **The live site (DigitalOcean) is not touched by any of this.**

**Also in this PR, from the planning chat's review of PR C+D:**
- the redaction rule now drops `x_internal_token` / `idempotency_key` (underscore spellings), with a test in each service;
- the PR A resume bullet no longer says the leaked credentials "were rotated", until you confirm that's done.

---

## 1. Your steps, in order (all in a browser)

The full runbook, with the "if something fails" table, is `docs/AWS.md` §4. **Do PR A's Step 1 (credential rotation) and the ledger cutover first. AWS can wait for them.**

Never paste a password, key or connection string into any chat.

**Once:**
1. **AWS account:**
   - Free plan; **MFA on root**;
   - budgets at **$10 and $25** (Billing → Budgets);
   - an admin user for daily use (don't use root);
   - region **us-east-1**.
2. **CloudShell** (the `>_` icon in the AWS console) → paste:
   ```
   git clone --depth 1 https://github.com/sumitparmar19/Nivesh-Path.git ~/Nivesh-Path
   bash ~/Nivesh-Path/infra/bootstrap/cloudshell.sh
   ```
   - It asks for the alarm email, shows the plan, and waits for `yes`.
   - It ends by printing `AWS_ROLE_ARN`, `AWS_PLAN_ROLE_ARN`, `AWS_REGION`. These are not secret.
3. **Confirm the subscription email** from AWS Notifications.
4. **GitHub → Settings:**
   - **Environments → New** `aws-demo`: required reviewer = you; deployment branches = `main` only.
   - **Secrets and variables → Actions → Variables:** add the three values from step 2.
5. **MongoDB Atlas → Network Access:** check that `0.0.0.0/0` is allowed. Use the `nivesh-demo` user from PR A's Step 1b.7 for the demo database (`niveshpath_demo`).
6. **Secrets Manager** → `nivesh-path/demo` → Retrieve secret value → **Set secret value**. Add five keys:

   | Key | Where the value comes from |
   |---|---|
   | `MONGO_URL` | Atlas → Connect → the `nivesh-demo` user's string, with `/niveshpath_demo` |
   | `JWT_SECRET` | CloudShell: `openssl rand -hex 32` (new) |
   | `FINNHUB_API_KEY` | A **second** free Finnhub key is recommended (separate sign-up), so a load test can't use up the live site's quota |
   | `ANTHROPIC_API_KEY` | console.anthropic.com → API keys (empty value = rule-based Advisor) |
   | `AI_INTERNAL_TOKEN` | CloudShell: `openssl rand -hex 32` (new; **not** the live one) |

**Each demo:**

7. **D1:** Actions → **AWS demo: apply + deploy** → Run (main) → **Approve**. About 15–20 minutes. The summary shows the app URL and the dashboard link.
8. **D2:** open the URL → sign up → buy a share → the Mirror note appears. What's new shows **Hosted on: AWS (demo stack, temporary)** and **PostgreSQL (AWS RDS)**.
9. **D3:** Actions → **AWS demo: load test** → Run → Approve. While it runs, **screenshot** the dashboard's "Web tasks serving" panel (it should go above 1) and the CPU panel.
10. **D4:** fire the 5xx alarm with the 3-line CloudShell block in `docs/AWS.md` §4.2 D4. **Screenshot** the "ALARM: nivesh-demo-5xx" email.
11. **D5:** Actions → **AWS demo: destroy** → type `destroy` → Approve. The summary lists what's left with `Stack=demo` (should be nothing).
12. **Send me** the screenshots and the links to the apply and load-test runs. I'll add the numbers to `docs/PERFORMANCE.md` and the images to `docs/aws/`.

**Optional, once the domain exists:** HTTPS (`docs/AWS.md` §4.3). Request an ACM certificate, add the CNAME at Namecheap, then add the GitHub variable `AWS_DEMO_CERTIFICATE_ARN`.

## 2. What changed

**`infra/bootstrap/`, run once in CloudShell:**
- **The state bucket:**
  - S3 bucket `nivesh-path-tfstate-<account>`: versioned, encrypted, public access blocked, TLS-only policy;
  - old versions expire after 90 days;
  - **native S3 locking** (`use_lockfile`), so there's no DynamoDB table.
- **GitHub OIDC provider and two roles:**
  - `github-nivesh-deploy`: trusted only by `repo:sumitparmar19/Nivesh-Path:environment:aws-demo`;
  - `github-nivesh-plan`: trusted only by `…:pull_request`. It has ReadOnlyAccess, but is **denied** secret values, parameters, decrypt, Lambda code, log contents and objects outside the state bucket.
- **The deploy role's policy** (`deploy_policy.tf`):
  - only the services these stacks use, only in `us-east-1`;
  - IAM only for roles named `nivesh-demo-*`/`nivesh-jobs-*` that carry **`nivesh-workload-boundary`**;
  - an explicit deny on removing or changing boundaries, attaching managed policies, and creating users, access keys or logins;
  - **it never reads secret values.**
- **The boundary** (`boundary.tf`) is the ceiling for every role the stacks create: pull images, write own logs, read `nivesh-path/*` and the RDS password, run the nightly job, publish alerts.
- **Shared resources:**
  - secrets `nivesh-path/demo` and `nivesh-path/jobs`, created **empty** (values typed by you, so never in state, Git or logs);
  - SNS topic `nivesh-path-alerts` with your email subscribed.
- **`cloudshell.sh`:**
  1. installs Terraform 1.15.9 (SHA-256 checked, x86_64 or arm64);
  2. applies;
  3. moves its own state into the bucket;
  4. prints the GitHub values.

  It's safe to run again.

**`infra/demo/`, the demo stack** (details in `docs/AWS.md` §5):
- **Network:** VPC across 2 AZs, 2 public + 2 private subnets, **no NAT** (the trade-off is in `docs/AWS.md` §2). The default security group has no rules.
- **Security groups:** internet → ALB :80/443; ALB → web :3000; ai → web :3000; web → ai :8001; web → RDS :5432.
- **ECS Fargate:**
  - **web:** 0.25 vCPU / 0.5 GB, 1–3 tasks, autoscaling at 60% CPU;
  - **ai:** 0.5 vCPU / 1 GB, no load-balancer route, with a container health check on `/health`;
  - **migrate:** a one-off task;
  - Cloud Map private DNS;
  - a deployment circuit breaker with rollback;
  - separate execution and task roles. The task roles have **no permissions**.
- **RDS PostgreSQL 16** `db.t4g.micro`: encrypted and private, with an **RDS-generated password** in Secrets Manager. It's destroyable: no final snapshot, no deletion protection.
- **ECR:** two repositories with immutable tags, scan on push, newest 10 images kept.
- **ALB:** `/health` checks, invalid headers dropped, and a 130 s idle timeout (above the 120 s AI timeout). Optional HTTPS with TLS 1.2+.
- **CloudWatch:**
  - logs kept 7 days;
  - **a dashboard:** requests, 5xx, p50/p95, healthy web tasks, ECS CPU/memory, RDS CPU/connections;
  - **4 alarms → email:** 5xx ≥ 5/min, p95 > 1.5 s for 5 min, an unhealthy target for 3 min, RDS CPU > 80% for 15 min.
  - Container Insights is off, for cost.
- **Tags:** `Project`, `Stack`, `ManagedBy` on everything.

**Deploy script** (`infra/scripts/deploy.sh`):
1. build and push both images, tagged with the commit;
2. register a migrate revision and run `prisma migrate deploy`. If it fails, the services are **not touched**;
3. register web/ai revisions and roll them out;
4. wait until stable;
5. check `/health` and `/api/status` through the ALB.

**Workflows:**
- **`infra.yml`**, on PRs and pushes touching `infra/` or the AWS workflows:
  - `fmt`, `validate` with the lock file read-only;
  - Checkov 3.3.15 plus a **custom rule** (`infra/checkov/`: every created role must carry the boundary);
  - ShellCheck;
  - on PRs, a **`terraform plan` comment**, made with the read-only role and no state lock. It's skipped until `AWS_PLAN_ROLE_ARN` exists, so CI stays green before AWS does.
- **The four `aws-demo-*` workflows** (apply + deploy, deploy, load test, destroy):
  - manual only, **`main` only**, all in the `aws-demo` environment (your approval);
  - one at a time (a shared concurrency group);
  - destroy needs `destroy` typed, and also deletes the task-definition revisions the deploys registered.
- **The AWS load test:**
  - runs the k6 read mix against the ALB while sampling ECS desired/running task counts every 20 s;
  - the results are a latency table plus a scaling timeline in the run summary.
  - It uses 4 tickers (real Finnhub data on AWS); `loadtest/lib.js` takes `SYMBOLS=` for that.

**App changes, small, and all inert on the live site:**
- `src/lib/dbUrl.js` + `scripts/with-db-url.js`:
  - build `DATABASE_URL` from `DB_HOST/DB_USER/DB_PASSWORD`, with every part percent-encoded and `sslmode=require`;
  - only when `DATABASE_URL` isn't set, which DigitalOcean always sets;
  - `server.js` calls it before the config is read, and the Dockerfile ships the wrapper.
- `GET /internal/demo-fault`:
  - only with `DEMO_FAULTS=1` (set only by the demo stack) **and** the internal token;
  - answers 500, for the alarm test.
- `/api/status` gains `platform` (`DEPLOY_PLATFORM`, set only by the demo stack). What's new then shows **"Hosted on: AWS (demo stack, temporary)"**, and the ledger row says **"PostgreSQL (AWS RDS)"** instead of "(Neon)".
- **What's new:** a new entry, "A copy that runs on AWS".
- **Redaction follow-up:** `SECRET_KEY_RE` in both services accept `-` or `_`.
- **Config and docs:** `.env.example`, `.gitignore` (Terraform state, plans and `backend.tf` never committed), `CLAUDE.md` (progress, layout, commands, AWS rules), plan notes, `docs/AWS.md`.

**Tests (before → after)**

| Suite | Before | After | New |
|---|---|---|---|
| Jest | 178 | **185** | `dbUrl.test.js` (4): existing URL untouched; nothing when a part is missing; **a password with `: / ? # % @ & =` and a space survives a round trip**; port/name/`DIRECT_URL` handling. `app.test.js` (+2): demo-fault exists only with the switch **and** the token; status names the platform only when set. `telemetry.test.js` (+1): underscore spellings dropped |
| pytest | 51 | **52** | underscore spellings dropped |
| Vitest | 109 | **111** | What's new: the AWS hosting row + "PostgreSQL (AWS RDS)"; no hosting row on the live site |
| Playwright | 2 × 2 ledgers | same | |
| **Total** | **340** | **350** | |

**Infrastructure checks (new):**
- `terraform validate` passes for both stacks.
- **Checkov: 252 passed, 0 failed, 43 skipped.** Each skip is written in the code next to the resource, with its reason.
- ShellCheck and actionlint are clean on all new files.

**Run locally, end to end, the way AWS will start the app:**
- **Postgres setup:** a local Postgres 16 with **SSL on**, and a user whose password is `p:a/s?s#w%o@r&d=1x`.
- **Through `DB_*` only (no `DATABASE_URL`):**
  - `node scripts/with-db-url.js npx prisma migrate deploy` → "All migrations have been successfully applied";
  - `db-check` → `"ok":true`;
  - Prisma's own connection reported **`ssl: true, TLSv1.3`**.
- **The server**, started with `NODE_ENV=production`, the demo stack's variables and `DB_*`:
  - logged `Ledger: postgres`;
  - `/api/status` → `platform: "aws-demo"`;
  - `/internal/demo-fault` → 404 without the token, **500** with it.

## 3. Bugs planted on purpose

| Planted bug | Caught by |
|---|---|
| Removed `permissions_boundary` from the ECS execution role | **Checkov custom rule CKV2_NIVESH_1:** "FAILED for resource: aws_iam_role.execution" (251 passed, 1 failed). On AWS the apply would also be refused, because the deploy role can't create a role without the boundary |
| Made RDS `publicly_accessible = true` | Checkov **CKV_AWS_17** "Ensure all data stored in RDS is not publicly accessible" |
| Stopped percent-encoding the RDS password in `dbUrl.js` | Jest round-trip test (1 failed, 3 passed). That's a real bug: RDS-generated passwords can contain `#`, `?`, `%` or `:`, which would break the URL, and the task would crash at start |
| (Follow-up) Put back the dash-only redaction pattern, in Node and in Python | the new underscore tests in both services |

All restored; all pass.

## 4. Real numbers

| Number | Source |
|---|---|
| Checkov: 252 passed / 0 failed / 43 skipped (each skip explained in the code) | `infra/` + `infra/checkov/`; run by `.github/workflows/infra.yml` on every infra PR |
| **Cost estimate:** about **$0.107/hour (≈ $2.56/day)** with 1 web + 1 ai task. +$0.017/hour per extra web task. About **$1/month** always-on (two secrets) | `docs/AWS.md` §6. Unit prices from the AWS Price List (us-east-1, fetched 2026-10-12). Estimates, not bills |
| TLS 1.3 to Postgres through the RDS-style `DB_*` path; migrations applied with a special-character password | the local run above (§2) |
| AWS load test, scaling 1 → N tasks, alarm email | **pending your D1–D4.** `docs/PERFORMANCE.md` will quote the run link |

## 5. Limits, said plainly
- **Nothing has run on AWS yet.** I can't reach AWS from here. A problem only AWS can show (a Free-plan restriction, an IAM action I missed in the deploy policy) appears in D1. The error names the missing action, and the fix is a one-line policy change plus a CloudShell re-run.
- **The deploy role is broad within its services** (`ec2:*`, `rds:*`, … in `us-east-1`). IAM, the escalation path, is fenced by the boundary. Per-action least privilege for a Terraform runner would be very long and fragile.
- **No NAT:** tasks have public IPs and open egress (`docs/AWS.md` §2).
- **HTTP only until there's a domain** and an ACM certificate.
- **The first apply's tasks fail to pull images for a few minutes** (services exist before images do). ECS retries by itself.
- **The in-memory cache is per task,** so Finnhub sees more calls when scaled out. Hence 4 tickers and the second-key recommendation.
- **The cost table is an estimate from unit prices.** The real figure comes from Billing after a demo.
- **The terraform plan comment only appears after the bootstrap**, and never on PRs from forks (no OIDC token there, by design).

## 6. Resume bullets (measured only; AWS numbers get added after your run)
- Wrote Terraform for a containerised two-service app on AWS: a VPC across 2 AZs, an ALB, ECS Fargate with CPU autoscaling from 1 to 3 tasks, private encrypted RDS Postgres, ECR, and a CloudWatch dashboard plus 4 alarms to email. It's created and destroyed by approval-gated GitHub Actions workflows using OIDC, so no long-lived AWS keys exist.
- Locked down CI/CD access to AWS with two OIDC roles (an environment-scoped deploy role and a read-only PR plan role) and a permissions boundary on every role the pipeline creates. A custom Checkov rule enforces the boundary on every pull request: 252 checks passed and 0 failed, with each exception documented in code.
- *(After D3/D4)* Load-tested the AWS deployment with k6. The web service scaled from 1 to N Fargate tasks at p95 X ms, and a 5xx alarm was fired and emailed end to end.
