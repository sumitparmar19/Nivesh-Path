# Phase 3 · PR E full report: the AWS demo stack, for review before merging

**For:** Sumit, and the planning chat, to check everything before PR E ([#15](https://github.com/sumitparmar19/Nivesh-Path/pull/15)) is merged.
**Scope:** Phase 3 Part 2, items B1 (bootstrap), B2 (`infra/demo`) and B3 (GitHub Actions), plus the preparation for B5 (proving it on AWS). Also the two follow-ups the planning chat asked for in its PR C+D review.
**Not in this PR:** B4, the nightly job (`infra/jobs`). That's PR F; the bootstrap already allows for it.

**State:**

| | |
|---|---|
| PR | [#15](https://github.com/sumitparmar19/Nivesh-Path/pull/15), head `6b9a695`, 5 commits, 54 files, +3,039 / −10 |
| CI | **All checks green**: backend (Node + Postgres), pytest, React, both Playwright runs, Docker image, secret scan, k6 load test, and the new Terraform checks. The plan-comment job was *skipped* on purpose (§4.4) |
| Merge state | Clean, no conflicts, no review comments |
| AWS | **Nothing exists yet.** I can't reach AWS from here; the first real run is your step D1 |
| Live site (DigitalOcean) | **Not touched.** Every app change is switched off unless a variable only the AWS stack sets is present |

**Your live changes:** you said you made changes and connections on the live side and will send a report about them. When it arrives, I'll check the steps in §1 against it, for example if the Atlas cluster, database users or keys changed. Nothing in this PR depends on the live site's settings.

---

## 0. Summary

| Area | What you get |
|---|---|
| **One-time setup** (`infra/bootstrap`) | One paste in AWS CloudShell creates: the place Terraform keeps its state; GitHub's sign-in to AWS (no passwords or keys, ever); two roles (deploy, read-only); a permissions limit every future role must carry; two empty secrets you fill in by hand; and the alarm email |
| **Demo stack** (`infra/demo`) | The whole app on AWS: network, load balancer, two container services (web scales 1–3), a private Postgres database, image storage, a dashboard and 4 email alarms. Created for a demo, destroyed after |
| **Workflows** | On every infra PR: format/validate, a security scan, a script check, and a read-only `terraform plan` posted as a comment. Plus four manual buttons: **apply + deploy**, **deploy**, **load test**, **destroy**. Each runs only from `main`, after you approve it |
| **App changes** | All inert on the live site. Build the database URL from the separate username/password RDS provides; an "alarm test" error route that only exists on the demo; What's new labels the demo "Hosted on: AWS (demo stack, temporary)" |
| **Follow-ups from the planning chat** | The redaction rule catches `x_internal_token` / `idempotency_key`; the PR A resume bullet no longer claims rotation is done |

**Tests:** 340 → **350** (Jest 178 → 185, pytest 51 → 52, Vitest 109 → 111, Playwright 2 × 2 ledgers). **No existing test was edited.**
**Infra checks:** `terraform validate` OK for both stacks; **Checkov 252 passed / 0 failed** (43 skips, each with a written reason in the code); ShellCheck and actionlint clean; gitleaks over the full history: no leaks.

---

## 1. Your steps, all in one place (all in a browser)

Never paste a password, key or connection string into any chat (here or the planning chat). They go only into the AWS, Atlas or GitHub screens named below.

**Order:**
1. Finish PR A's credential rotation.
2. Do the ledger cutover.
3. Set up Grafana.
4. Then this.

AWS is the least urgent; none of it affects the live site.

### Where each value comes from

| Value | Where you get it | Where it goes |
|---|---|---|
| `AWS_ROLE_ARN`, `AWS_PLAN_ROLE_ARN`, `AWS_REGION` | Printed at the end of the CloudShell bootstrap (step 2). Not secrets | GitHub → Settings → Secrets and variables → Actions → **Variables** |
| Alert email address | You type it when the bootstrap asks | Stored in AWS SNS; AWS emails you a confirmation link |
| `MONGO_URL` for the demo | Atlas → Connect → the `nivesh-demo` user's connection string, with `/niveshpath_demo` after `.net` | Secrets Manager → `nivesh-path/demo` |
| `JWT_SECRET` (demo) | CloudShell: `openssl rand -hex 32` (a **new** value) | Secrets Manager → `nivesh-path/demo` |
| `FINNHUB_API_KEY` (demo) | finnhub.io. A **second free key** from a separate sign-up is recommended (Q1) | Secrets Manager → `nivesh-path/demo` |
| `ANTHROPIC_API_KEY` (demo) | console.anthropic.com → API keys (leave the value empty for the rule-based Advisor) | Secrets Manager → `nivesh-path/demo` |
| `AI_INTERNAL_TOKEN` (demo) | CloudShell: `openssl rand -hex 32` (**new**, not the live one) | Secrets Manager → `nivesh-path/demo` |
| `AWS_DEMO_CERTIFICATE_ARN` (optional, later) | AWS Certificate Manager, once the domain exists and the certificate shows "Issued" | GitHub → Variables |

### Once

1. **AWS account:**
   - Sign up on the **Free plan**.
   - Turn on **MFA on the root user**.
   - Create **budgets at $10 and $25**: Billing → Budgets → Create → Monthly cost budget → your email.
   - Create an **admin user** for daily use and sign in with it, not root.
   - Pick region **US East (N. Virginia) `us-east-1`** (top right).
2. **CloudShell** (the `>_` icon in the AWS console's top bar) → paste:
   ```
   git clone --depth 1 https://github.com/sumitparmar19/Nivesh-Path.git ~/Nivesh-Path
   bash ~/Nivesh-Path/infra/bootstrap/cloudshell.sh
   ```
   - It asks for the alarm email.
   - It shows what it will create and waits for you to type **`yes`**.
   - It prints `AWS_ROLE_ARN`, `AWS_PLAN_ROLE_ARN` and `AWS_REGION`.
3. **Email:** open "AWS Notification - Subscription Confirmation" and click **Confirm subscription**.
4. **GitHub** → the repo → **Settings**:
   - **Environments → New environment** `aws-demo`:
     - **Required reviewers:** yourself;
     - **Deployment branches and tags:** Selected → add `main`.
   - **Secrets and variables → Actions → Variables → New repository variable**, three times, with the values from step 2.
5. **MongoDB Atlas:**
   - **Network Access:** check that `0.0.0.0/0` is in the list. AWS containers have changing addresses.
   - The `nivesh-demo` database user (`readWrite` on `niveshpath_demo`) is from PR A's Step 1b.7.
6. **Secrets Manager** → `nivesh-path/demo` → **Retrieve secret value** → **Set secret value** → Key/value → add the five keys from the table → **Save**. All five keys must exist (one value may be empty).

### Each demo

7. **D1: create and deploy.**
   - GitHub → Actions → **AWS demo: apply + deploy** → Run workflow (branch `main`) → **Review deployments → Approve**.
   - It takes about 15–20 minutes the first time; the database takes most of it.
   - The run summary shows the **app URL** and the **dashboard** link.
8. **D2: check it.**
   - Open the URL, sign up and buy one share. The Behavioral Mirror note appears.
   - What's new shows **Hosted on: AWS (demo stack, temporary)** and **Money ledger: PostgreSQL (AWS RDS)**.
9. **D3: load test.**
   - Actions → **AWS demo: load test** → Run (defaults: 50 users, 8 minutes, 4 tickers) → Approve.
   - While it runs, open the dashboard and take **two screenshots**: "Web tasks serving" going above 1, and the CPU panel.
10. **D4: fire one alarm.** CloudShell:
    ```
    URL=http://$(aws elbv2 describe-load-balancers --names nivesh-demo --query 'LoadBalancers[0].DNSName' --output text)
    TOKEN=$(aws secretsmanager get-secret-value --secret-id nivesh-path/demo --query SecretString --output text | python3 -c 'import json,sys; print(json.load(sys.stdin)["AI_INTERNAL_TOKEN"])')
    for i in $(seq 1 10); do curl -s -o /dev/null -w "%{http_code} " -H "X-Internal-Token: $TOKEN" "$URL/internal/demo-fault"; done; echo
    ```
    - It prints ten `500`s.
    - Within about 2 minutes, the email **"ALARM: nivesh-demo-5xx"** arrives; about 2 minutes later, "OK". **Screenshot the alarm email.**
11. **D5: destroy.**
    - Actions → **AWS demo: destroy** → type `destroy` → Run → Approve.
    - The summary lists anything left with the tag `Stack=demo` (it should be empty).
12. **Send me** the screenshots and the links to the apply run and the load-test run.

### What to send back

| Item | It proves | Goes into |
|---|---|---|
| Link to the "apply + deploy" run | the stack builds from code and the app works on AWS | PR E report, `docs/AWS.md` |
| Load-test run link + the 2 dashboard screenshots | autoscaling 1 → N tasks, AWS latency | `docs/PERFORMANCE.md` (AWS section), `docs/aws/` |
| Alarm email screenshot | alarms reach you end to end | `docs/aws/` |
| Destroy run summary | nothing is left running | PR E report |

**If something fails:** `docs/AWS.md` §4.4 has a table of symptoms and fixes, for example a missing secret key, the wrong role or a failed migration. Send me the log lines; they contain no secrets.

---

## 2. What the instructions asked for, and where it stands

| # | Requirement (Phase 3, Part 2) | Status | Where |
|---|---|---|---|
| B1 | S3 state bucket (versioned, encrypted, no public access), **native S3 locking** | ✅ Plus a TLS-only policy; old versions expire after 90 days | `infra/bootstrap/state.tf` |
| B1 | GitHub OIDC + deploy role trusted only by this repo on `aws-demo` + `main` | ✅ **Two roles** (review blocking issue 3): `environment:aws-demo` for deploy (GitHub limits the environment to `main` + your approval), `pull_request` for a read-only plan role | `github_oidc.tf` |
| B1 | Permissions scoped to what the stacks create | ✅ By service + region, IAM fenced by a permissions boundary (§4.1) | `deploy_policy.tf`, `boundary.tf` |
| B1 | Empty secret filled by hand, never in state or Git | ✅ **Two** secrets (decision D7): `nivesh-path/demo`, `nivesh-path/jobs` | `shared.tf` |
| B1 | One copy-paste CloudShell block that prints `AWS_ROLE_ARN` | ✅ Two lines. It also installs Terraform (review blocking issue 6: CloudShell has none) and moves its own state into the bucket | `cloudshell.sh` |
| B2.1 | VPC, 2 AZs, 2 public + 2 private subnets, **no NAT**, tasks public behind SGs, RDS private; trade-off in `docs/AWS.md` | ✅ | `network.tf`, `security_groups.tf`, `docs/AWS.md` §2 |
| B2.2 | ECR, one repo per service, last 10 images | ✅ Plus immutable tags and scan on push | `ecr.tf` |
| B2.3 | ECS Fargate web + ai; ai has no LB route; Service Connect **or Cloud Map**; small sizes; execution role + separate task role | ✅ Cloud Map private DNS. web 0.25 vCPU/0.5 GB, ai 0.5/1 GB. Task roles have **no** permissions | `ecs.tf`, `iam.tf` |
| B2.4 | Health checks on both `/health`; HTTPS with ACM if the domain is ready, otherwise HTTP stated plainly | ✅ ALB checks web; ECS container health check for ai (it has no LB). HTTP now; HTTPS by setting one GitHub variable | `alb.tf`, `docs/AWS.md` §4.3 |
| B2.5 | RDS `db.t4g.micro`, encrypted, private, destroyable (both explained); migrations as a one-off ECS task before services update | ✅ The password is generated by RDS; the deploy stops before touching services if migrations fail | `rds.tf`, `infra/scripts/deploy.sh` |
| B2.6 | MongoDB, Redis and external APIs from the secret; propose the cheapest Redis option | ✅ Mongo and the API keys come from the secret. **No Redis**: in-memory cache per task (cheapest, self-contained) | `ecs.tf`, `docs/AWS.md` §1 |
| B2.7 | CloudWatch logs 7 days; dashboard (ALB requests, 5xx, p95, ECS CPU/mem, RDS CPU/conn); alarms → SNS email for 5xx, p95 > 1.5 s, unhealthy targets, RDS CPU > 80%; Container Insights off | ✅ All of it | `monitoring.tf`, `ecs.tf` |
| B2.8 | Web autoscaling 1 → 3 at 60% CPU | ✅ | `autoscaling.tf` |
| B2.9 | Tags on every resource; estimated monthly cost table from the AWS price list | ✅ Provider default tags; costs from the AWS Price List, labelled as estimates | `versions.tf`, `docs/AWS.md` §6 |
| B3 | On infra PRs: fmt, validate, a security scan (no unexplained HIGH), plan as a PR comment | ✅ Checkov with **zero** unexplained findings of any severity, plus a custom rule. The plan comment runs once you've set up AWS | `.github/workflows/infra.yml` |
| B3 | Manual apply, build-and-deploy, destroy, gated by `aws-demo` | ✅ Plus a manual **load test** workflow | `.github/workflows/aws-demo-*.yml` |
| B3 | OIDC only, no AWS keys anywhere | ✅ The deploy role even has an explicit **deny** on creating users or access keys | `deploy_policy.tf` |
| B5 | Apply → app on the ALB → sign up, trade, Mirror; k6 + scaling; alarm fired; destroy; results in `PERFORMANCE.md` + screenshots in `docs/aws/` | ⏳ **Your steps D1–D5.** Everything needed is built: the load-test workflow, the alarm route and the destroy check | §1 |
| B4 | Nightly job | ➡️ PR F (next) | |

**Acceptance (from the instructions):**
- **Plan clean on the PR:** ⏳ once you've set up AWS.
- **apply → working app → destroy leaves only bootstrap (+ jobs):** ⏳ D1–D5. The destroy workflow lists any leftovers.
- **No long-lived AWS keys:** ✅ by design, with an explicit deny.
- **`docs/AWS.md` has the diagram, runbook, cost table and NAT trade-off:** ✅

---

## 3. Security findings and how they're handled

Nothing new was found in this PR. The leaked credentials from the first commit are still the open item from PR A (your Step 1). This PR adds:
- **No secret values in Terraform.** Secrets are created empty, and the RDS password is generated by RDS.
- **The read-only plan role is denied data reads:** secret values, parameters, decrypt, Lambda code, log contents, and objects outside the state bucket.
- **gitleaks over the full history:** no new leaks.

---

## 4. What I did, in detail

### 4.1 `infra/bootstrap/` (run once by you in CloudShell)

| File | What it does |
|---|---|
| `versions.tf` | Terraform ≥ 1.10 (for native S3 locking), AWS provider `~> 6.60`, default tags `Project/Stack/ManagedBy` |
| `variables.tf` | Region (`us-east-1`), project name, the exact GitHub repository, the `aws-demo` environment name, and the alert email (checked to look like an email) |
| `state.tf` | Bucket `nivesh-path-tfstate-<account id>`: versioning on, AES-256 encryption, all public access blocked, owner-enforced, **TLS-only bucket policy**, old versions expire after 90 days |
| `github_oidc.tf` | GitHub OIDC provider, plus two roles. **`github-nivesh-deploy`:** trust requires the token's subject to be exactly `repo:sumitparmar19/Nivesh-Path:environment:aws-demo`; sessions last up to 2 h. **`github-nivesh-plan`:** subject `repo:sumitparmar19/Nivesh-Path:pull_request`; AWS's `ReadOnlyAccess` plus an explicit **deny** on secret values, SSM parameters, `kms:Decrypt`, Lambda code, log contents, and S3 objects outside the state bucket |
| `deploy_policy.tf` | What the deploy role can do (below) |
| `boundary.tf` | The `nivesh-workload-boundary` policy: the ceiling for every role the stacks create (below) |
| `shared.tf` | Secrets `nivesh-path/demo` and `nivesh-path/jobs` (empty, 7-day recovery window, key list in the description); SNS topic `nivesh-path-alerts` + your email subscription |
| `outputs.tf` | The three GitHub values, the bucket name, the topic, the secret names |
| `cloudshell.sh` | Installs Terraform 1.15.9 into `~/bin`, **checked against HashiCorp's SHA-256** for both x86_64 and arm64; applies (you confirm with `yes`); writes `backend.tf` and **moves the state into the bucket**; prints the GitHub values. Safe to re-run |
| `.terraform.lock.hcl` | The exact AWS provider (6.65.0), with checksums for every platform, so CloudShell and GitHub get the same, verified provider |

**The deploy role, fenced three ways** (`deploy_policy.tf`):
1. **Only the services the stacks use, only in `us-east-1`:** EC2/VPC, ECS, ECR, load balancing, RDS, CloudWatch and logs, autoscaling, Cloud Map, Route 53. Read-only SNS, ACM and Secrets Manager metadata. The nightly job's Lambda, Step Functions and Scheduler, but only on resources named `nivesh-jobs-*`.
2. **IAM only on roles named `nivesh-demo-*` / `nivesh-jobs-*`:**
   - creating a role or writing its policy is allowed **only if the role carries `nivesh-workload-boundary`**;
   - passing a role only to ECS tasks, Lambda, Step Functions or Scheduler;
   - creating only the four service-linked roles AWS needs;
   - **explicit deny** on removing or changing a boundary, attaching managed policies, creating policies, and creating users, access keys or console logins.
   - Its own name (`github-…`) doesn't match the pattern, so it can't edit itself.
3. **No `GetSecretValue`.** The containers' execution role reads secrets when a task starts; the pipeline never does.

**The boundary**, the maximum any created role can ever do:
- pull images and write logs to `/nivesh-*` log groups;
- set up Step Functions log delivery;
- read the `nivesh-path/*` secrets and RDS-managed passwords (decrypt only through Secrets Manager);
- invoke and run only `nivesh-jobs-*` Lambdas and state machines;
- publish only to the alert topic.

### 4.2 `infra/demo/` (the demo stack)

| File | What it does |
|---|---|
| `versions.tf` | S3 backend (key `demo/terraform.tfstate`, native lock; bucket passed in by the workflow), default tags with `Stack=demo`; looks up the secret and alert topic by name |
| `variables.tf` | Sizes and settings with defaults (task CPU/memory, 1–3 web tasks, 60% target, `db.t4g.micro`, optional certificate) |
| `network.tf` | VPC `10.20.0.0/16`, 2 public + 2 private subnets, internet gateway, route tables (private ones have **no** internet route), **default security group with no rules**. Subnets don't hand out public IPs automatically; only the tasks request one |
| `security_groups.tf` | internet → ALB :80 (:443 with a certificate); ALB → web :3000; ai → web :3000 (`/internal`); web → ai :8001; web → RDS :5432. RDS has **no outbound rule** |
| `ecr.tf` | `nivesh-demo/web`, `nivesh-demo/ai`: immutable tags, scan on push, AES-256, keep the newest 10, `force_delete` so destroy works |
| `rds.tf` | PostgreSQL 16, `db.t4g.micro`, 20 GB gp3, **encrypted**, **not publicly accessible**, single-AZ, 1-day backups, **password generated and stored by RDS**, `skip_final_snapshot` + no deletion protection (it's destroyed after each demo) |
| `iam.tf` | Execution role (pull images, write logs, read the demo secret + RDS password, **only** those) and two task roles with **no permissions**. All carry the boundary; trust is limited to this account (`aws:SourceAccount`) |
| `ecs.tf` | Log groups (7 days); cluster (Container Insights off); Cloud Map `nivesh.internal` (`web.` / `ai.`); task definitions **web**, **ai**, **migrate**; services with a circuit breaker + rollback |
| `alb.tf` | Internet-facing ALB; invalid headers dropped; **idle timeout 130 s** (the Advisor can take up to 120 s; the default 60 s would cut it off); target group health check `/health` every 15 s; HTTP listener, or HTTPS (TLS 1.2+) with 80 → 443 redirect when a certificate is set |
| `autoscaling.tf` | Web 1–3 tasks, target tracking at 60% average CPU (scale out after 60 s, scale in after 180 s) |
| `monitoring.tf` | Dashboard (6 panels) + 4 alarms → email, with "OK" emails too |
| `outputs.tf` | App URL, cluster, repositories, task families, subnets, security group, dashboard link (used by the deploy script; nothing secret) |

**What each container gets:**
- **web:**
  - plain settings: `NODE_ENV=production`, `LEDGER_BACKEND=postgres`, the ai address, `DB_HOST/PORT/NAME`, `PUBLIC_BASE_URL`, `DEPLOY_PLATFORM=aws-demo`, `DEMO_FAULTS=1`;
  - from Secrets Manager: `MONGO_URL`, `JWT_SECRET`, `FINNHUB_API_KEY`, `AI_INTERNAL_TOKEN`, `DB_USER`, `DB_PASSWORD`.
- **ai:**
  - plain settings: `WEB_INTERNAL_URL`, `CHROMA_PERSIST_DIR`;
  - from Secrets Manager: `ANTHROPIC_API_KEY`, `MONGO_URL`, `AI_INTERNAL_TOKEN`.
- **migrate:** the web image running `node scripts/with-db-url.js npx prisma migrate deploy`, with only the database settings.

**Alarms:**

| Alarm | Fires when |
|---|---|
| `nivesh-demo-5xx` | 5 or more 5xx responses in one minute, from the app or the load balancer |
| `nivesh-demo-p95-latency` | p95 response time above 1.5 s for 5 minutes in a row |
| `nivesh-demo-unhealthy-targets` | a web task fails `/health` for 3 minutes |
| `nivesh-demo-rds-cpu` | RDS CPU above 80% for 15 minutes |

**Dashboard panels:**
- requests per minute;
- 5xx (app and load balancer);
- p50/p95 response time with the alarm line;
- healthy web tasks (this is how scaling shows);
- ECS CPU/memory with the 60% line;
- RDS CPU and connections.

### 4.3 `infra/scripts/deploy.sh` (used by apply + deploy and deploy)
1. Builds the web and ai images for the commit and pushes them to ECR, skipping any tag that already exists.
2. Registers a new **migrate** revision with the new web image and runs it. It waits for it to stop and prints its log. **If the exit code isn't 0, it stops**, so the services never run code newer than their database.
3. Registers new web and ai revisions (copied from the latest revision, so Terraform's settings carry over), updates both services, and waits until they're stable.
4. Checks `/health` and `/api/status` through the load balancer.

### 4.4 Workflows

| Workflow | When | What |
|---|---|---|
| `infra.yml` → **checks** | Every push/PR touching `infra/` or the AWS workflows | `terraform fmt -check`; `init` (lock file read-only) + `validate` for both stacks; **Checkov 3.3.15** with the custom rule; ShellCheck on both scripts |
| `infra.yml` → **plan** | PRs from this repo, **once `AWS_PLAN_ROLE_ARN` exists** | Signs in with the **read-only** role and runs `terraform plan` for the demo stack without taking the state lock. It **posts the plan as one PR comment and keeps that comment up to date.** Skipped today (no AWS yet), so CI stays green |
| **AWS demo: apply + deploy** | Manual, `main` only, approval | `terraform plan` → `apply` → `deploy.sh` → app URL + dashboard link in the summary |
| **AWS demo: deploy** | Manual, `main` only, approval | `deploy.sh` only (code updates) |
| **AWS demo: load test** | Manual, `main` only, approval | k6 read mix against the ALB (users, duration and tickers are inputs); samples the web service's task count every 20 s; summary table + scaling timeline; artifact kept 90 days |
| **AWS demo: destroy** | Manual, `main` only, type `destroy`, approval | `terraform destroy` → deletes the task revisions the deploys created → lists anything still tagged `Stack=demo` |

All four AWS demo workflows share one queue, so two of them can never run at the same time.

**Pinned tool versions, all at least 2 weeks old:**

| Tool | Version | Pinning |
|---|---|---|
| Terraform | 1.15.9 | `cloudshell.sh` verifies HashiCorp's SHA-256 |
| AWS provider | 6.65.0 | lock file with every platform's checksum |
| Checkov | 3.3.15 | exact version |
| k6 | 1.4.0 | SHA-256 |

### 4.5 App changes (all inert on the live site)

| Change | Files | Why |
|---|---|---|
| Build `DATABASE_URL` from `DB_HOST/DB_USER/DB_PASSWORD` when it isn't set, every part percent-encoded, `sslmode=require` | `src/lib/dbUrl.js`, `server.js` (called before config is read), `scripts/with-db-url.js` (for `prisma migrate`), `Dockerfile` (ships the wrapper) | RDS hands the password over separately, and it can contain `#`, `?`, `%`, `:` which would break a URL. DigitalOcean sets `DATABASE_URL`, so nothing changes there |
| `GET /internal/demo-fault` → 500 | `src/routes/internal.js`, `src/app.js` | For the alarm test. Exists **only** with `DEMO_FAULTS=1` (set only by the demo stack) **and** only with the internal token (404 otherwise, like everything under `/internal`) |
| `/api/status` → `platform` | `src/app.js` | Set from `DEPLOY_PLATFORM` (only the demo sets it) |
| What's new: "Hosted on: AWS (demo stack, temporary)"; ledger row "PostgreSQL (AWS RDS)" | `WhatsNew.tsx`, `types/index.ts` | So the demo can't be mistaken for the live site. The live site shows no new row |
| What's new entry "A copy that runs on AWS" | `releases.ts` | Project rule: every shipped feature gets an entry |
| k6 `SYMBOLS=` input | `loadtest/lib.js` | The AWS load test reads only 4 tickers (real Finnhub data there) |

### 4.6 Follow-ups from the planning chat's PR C+D review
- **Redaction:** `SECRET_KEY_RE` in both services is now `x[-_]internal[-_]token` and `idempotency[-_]key`, with one new test in each service. Putting the old pattern back fails both (§7).
- **PR A resume bullet:** "they were rotated" is removed. The bullet says to add it only once you confirm the rotation.

### 4.7 Docs and config
- **`docs/AWS.md`:**
  - architecture diagram (Mermaid) and how a request flows;
  - the NAT trade-off, with an interview answer;
  - the security model;
  - the full runbook;
  - an "if something fails" table;
  - what's in the stack;
  - how a deploy works;
  - costs;
  - limits.
- **`docs/PHASE3_PR_E_REPORT.md`:** the PR report, your steps first.
- **`CLAUDE.md`:** progress, layout, Terraform commands, and the **AWS rules** (OIDC only, boundary on every role, no secret values in Terraform, every Checkov finding fixed or explained, tags).
- **Other:** `docs/PHASE2_PLAN.md` notes; `.env.example` (`DB_*`, `DEPLOY_PLATFORM`, `DEMO_FAULTS` explained); `.gitignore` (Terraform state, plans, `.terraform/` and the CloudShell-written `backend.tf` are never committed).

---

## 5. Every file in the PR (54, plus this report)

**New, infrastructure (25):**
- `infra/bootstrap/`: `versions.tf`, `variables.tf`, `state.tf`, `github_oidc.tf`, `deploy_policy.tf`, `boundary.tf`, `shared.tf`, `outputs.tf`, `cloudshell.sh`, `.terraform.lock.hcl`
- `infra/demo/`: `versions.tf`, `variables.tf`, `network.tf`, `security_groups.tf`, `ecr.tf`, `rds.tf`, `iam.tf`, `ecs.tf`, `alb.tf`, `autoscaling.tf`, `monitoring.tf`, `outputs.tf`, `.terraform.lock.hcl`
- `infra/scripts/deploy.sh`, `infra/checkov/workload_role_boundary.yaml`

**New, workflows (5):** `infra.yml`, `aws-demo-apply.yml`, `aws-demo-deploy.yml`, `aws-demo-loadtest.yml`, `aws-demo-destroy.yml`

**New, app and tests (3):** `src/lib/dbUrl.js`, `scripts/with-db-url.js`, `tests/dbUrl.test.js`

**New, docs (2):** `docs/AWS.md`, `docs/PHASE3_PR_E_REPORT.md`, plus this file

**Changed (19):**
- App and tests: `server.js`, `src/app.js`, `src/routes/internal.js`, `src/lib/redact.js`, `Dockerfile`, `loadtest/lib.js`, `tests/app.test.js`, `tests/telemetry.test.js`
- AI service: `ai-service/telemetry.py`, `ai-service/tests/test_telemetry.py`
- Frontend: `WhatsNew.tsx`, `WhatsNew.test.tsx`, `types/index.ts`, `releases.ts`
- Config and docs: `.env.example`, `.gitignore`, `CLAUDE.md`, `docs/PHASE2_PLAN.md`, `docs/PHASE3_PR_A_REPORT.md`

---

## 6. Tests and checks, before → after

| Suite | Before | After | New |
|---|---|---|---|
| Jest | 178 | **185** | `dbUrl.test.js` (4): an existing URL is untouched; nothing when a part is missing; **a password with `: / ? # % @ & =` and a space survives a round trip**; port/name/`DIRECT_URL`. `app.test.js` (+2): the fault route exists only with the switch **and** the token; status names the platform only when set. `telemetry.test.js` (+1): underscore spellings dropped |
| pytest | 51 | **52** | underscore spellings dropped |
| Vitest | 109 | **111** | the AWS hosting row + "PostgreSQL (AWS RDS)"; no hosting row on the live site |
| Playwright | 2 × 2 ledgers | same | |
| **Total** | **340** | **350** | **No existing test edited** |

**Infrastructure checks (new):**

| Check | Result |
|---|---|
| `terraform fmt -check` | clean |
| `terraform validate` | both stacks valid |
| Checkov 3.3.15 + custom rule | **252 passed, 0 failed, 43 skipped**, each skip with its reason next to the resource |
| ShellCheck | clean (both scripts) |
| actionlint | clean (all 5 new workflows) |
| gitleaks (full history, 69 commits) | no leaks |

**Run locally, the way AWS will start the app:**
- **Postgres setup:** Postgres 16 with **SSL on**, and a user whose password is `p:a/s?s#w%o@r&d=1x`.
- **Using only `DB_*` (no `DATABASE_URL`):**
  - `with-db-url.js … prisma migrate deploy` → "All migrations have been successfully applied";
  - `db-check` → `"ok":true`;
  - Prisma's connection → **`ssl: true, TLSv1.3`**.
- **The server**, started with `NODE_ENV=production` and the demo stack's variables:
  - logged `Ledger: postgres`;
  - `/api/status` → `platform: "aws-demo"`;
  - `/internal/demo-fault` → **404** without the token, **500** with it.

**CI on PR #15's head:** every job green. The plan job was skipped by design.

---

## 7. Bugs planted on purpose

| Planted bug | Caught by | Why it matters |
|---|---|---|
| Removed the permissions boundary from the ECS execution role | **Custom Checkov rule** `CKV2_NIVESH_1`: "FAILED for resource: aws_iam_role.execution" | A role without the boundary could be given any permission. AWS would also refuse it at apply time, but now it fails on the PR |
| Made RDS `publicly_accessible = true` | Checkov `CKV_AWS_17` | The ledger database must never be reachable from the internet |
| Stopped percent-encoding the RDS password | Jest round-trip test | A generated password with `#` or `?` would break the URL and the task would crash at start |
| Put back the dash-only redaction pattern (Node, then Python) | the new underscore tests in both services | Proves the follow-up is real |

All were restored, and all checks pass.

---

## 8. Real numbers, each with its source

| Number | Source |
|---|---|
| Checkov: 252 passed / 0 failed / 43 skipped | `infra/` + `infra/checkov/`, run by `.github/workflows/infra.yml` on every infra PR |
| Tests: 340 → 350 | CI on `6b9a695` |
| Connection through the RDS path: TLS 1.3; migrations applied with a special-character password | the local run (§6) |
| **Cost estimate:** about **$0.107/hour ≈ $2.56/day** with 1 web + 1 ai task. +$0.017/hour per extra web task. About **$78/month if left running by mistake**. About **$1/month always on** (two secrets) | `docs/AWS.md` §6. Unit prices from the **AWS Price List**, us-east-1, fetched 2026-10-12. Estimates, not bills |
| Price breakdown per hour: Fargate web $0.0123, ai $0.0247; ALB $0.0225 + $0.008/LCU; RDS $0.016 + 20 GB gp3 ≈ $0.003; 4 public IPv4 × $0.005 | same |
| AWS latency, scaling 1 → N, alarm email | **pending your D1–D4** |

---

## 9. Where I differed from the instructions or the review (please confirm)

1. **Two roles, not one** (review blocking issue 3, already agreed). GitHub's token can't say both "environment aws-demo" and "branch main", so the deploy role trusts the environment, and GitHub limits that environment to `main` with your approval.
2. **Two secrets, not one `nivesh-path/app`** (decision D7). The nightly job will only read `nivesh-path/jobs`, which holds no Anthropic key and no database credentials.
3. **The bootstrap also creates the alert topic and the permissions boundary.** That way your email confirmation happens once (not after every demo apply), and the boundary exists before any stack makes roles. **It also already allows the nightly job's resources (`nivesh-jobs-*`), so PR F won't need another CloudShell run.**
4. **Cloud Map DNS instead of ECS Service Connect.** The instructions allowed either. Service Connect adds a proxy container to every task, which eats into a 0.5 GB web task.
5. **No Redis on AWS** (the review proposed this): an in-memory cache per task. Consequence: with 3 web tasks, Finnhub sees up to 3× the calls (Q1).
6. **HTTP until a domain exists.** HTTPS is one GitHub variable away (the certificate ARN); no code change is needed.
7. **Deploys register task revisions with the AWS CLI**, and Terraform ignores the services' task definition. The alternative (Terraform owns the image tag) can't run migrations before the services change without `-target` tricks.
8. **Checkov instead of Trivy, and stricter than asked:** zero unexplained findings of *any* severity, not just HIGH. Plus one custom rule.
9. **Added beyond the instructions:**
   - an **AWS load-test workflow** that records the task count, to prove scaling with a file;
   - the **"Hosted on: AWS" label**;
   - the **`DB_*` URL builder**;
   - the **token-only fault route** (the review planned it);
   - **destroy** also removes deploy-created task revisions and lists leftovers.
10. **Cost correction.** The review estimated $1.5–2 a day. The price list gives about **$2.56 a day**, mostly because public IPv4 addresses now cost $0.005/hour each.

## 10. Questions for the planning chat

- **Q1. A second Finnhub key for the demo?** Recommended: a separate free sign-up. Otherwise a demo load test shares the live site's 60 calls/minute, and the live site's quotes could fail for a few minutes. Alternative: lower the load-test users or tickers.
- **Q2. Is the deploy role's "broad within its services" scope acceptable?** For example `ec2:*` and `rds:*`, limited to `us-east-1`, with IAM fenced by the boundary. Per-action least privilege for a Terraform runner would be very long and break on provider updates.
- **Q3. PR F (nightly job): same deploy role and `aws-demo` environment, or a separate `aws-jobs` environment?** The bootstrap already allows the jobs resources on the same role. A separate environment would need one more role and a CloudShell re-run.
- **Q4. ARM (Graviton) Fargate later?** About 20% cheaper, but the images would need building for ARM (slower in CI). I'd leave it for now.

## 11. Limits, said plainly
- **Nothing has run on AWS yet.** A problem only AWS can show (a Free-plan restriction, an IAM action I missed) appears at D1. The error names the action; the fix is one line in `deploy_policy.tf` plus a CloudShell re-run.
- **No NAT:** tasks have public IPs and open outbound traffic. Inbound is closed by security groups (`docs/AWS.md` §2).
- **HTTP only** until a domain and certificate exist.
- **The first apply shows a few minutes of "image not found"** in ECS events. The services exist before the images are pushed; ECS retries by itself.
- **The cache is per task**, so Finnhub calls grow with scale-out (Q1).
- **The cost table is an estimate from unit prices.** The real figure comes from Billing after a demo.
- **The plan comment** appears only after the bootstrap, and never on PRs from forks (no sign-in token there, by design).
- **Free plan:** I can't confirm from here that every service is available to Free-plan accounts. If not, apply says so, and upgrading keeps the credits.

## 12. Resume bullets (measured only; AWS run numbers added after D3/D4)
- Wrote Terraform for a containerised two-service app on AWS: a VPC across 2 AZs, an ALB, ECS Fargate with CPU autoscaling from 1 to 3 tasks, private encrypted RDS Postgres, ECR, and a CloudWatch dashboard plus 4 email alarms. It's created and destroyed by approval-gated GitHub Actions workflows using OIDC, with no long-lived AWS keys.
- Locked down CI/CD access to AWS with an environment-scoped deploy role, a read-only PR plan role, and a permissions boundary on every role the pipeline creates. A custom Checkov rule enforces it on each pull request: 252 checks passed and 0 failed, every exception documented in code.
- *(After your run)* Load-tested the AWS deployment with k6: web scaled from 1 to N Fargate tasks at p95 X ms, and a 5xx alarm was fired and emailed end to end.

## 13. What happens next
1. **You and the planning chat review this.** Answer Q1–Q4. Then say **"merge"**, and I merge PR E.
2. **You send me the report on the live changes and connections you made.** I'll check the steps here, and in the earlier reports, against it.
3. **I start PR F** (the nightly job through `/internal`, `price_snapshots`, rule v3) while you do the live steps. AWS steps D1–D5 can happen any time after the merge.
