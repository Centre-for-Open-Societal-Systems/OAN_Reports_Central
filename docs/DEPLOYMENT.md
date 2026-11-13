# Deployment guide — local to Kubernetes on AWS

How the Report Center goes from a developer laptop to the **dev** environment: a single-node k3s cluster on EC2 in `oan-vpc` (ap-south-1, Mumbai), installed with Helm and pulling images from Amazon ECR.

| | |
|---|---|
| **Environment** | dev |
| **Dashboard** | https://oan-reports.development.oanstaging.com/ |
| **API health** | https://oan-reports.development.oanstaging.com/api/health |
| **DNS** | Route 53 zone `oanstaging.com`: `A oan-reports.development` → `13.201.33.90` (k3s host, no external nginx) |
| **TLS** | Let's Encrypt via cert-manager (HTTP-01 through Traefik), auto-renewed; HTTP → HTTPS 301 |
| **AWS account / region** | `379220350808` / `ap-south-1` |
| **Kubernetes** | k3s v1.37 on EC2 `i-0db62f72ecc1a7df0`, namespace `oan-dev`, Helm release `oan` |
| **Images** | `379220350808.dkr.ecr.ap-south-1.amazonaws.com/oan-reports-central/{api,web}:0.0.1` |

---

## 1. Architecture

```
     oan-reports.development.oanstaging.com  (Route 53 A → host public IP)
                         │  :443 HTTPS (Let's Encrypt) · :80 → 301 to HTTPS
            ┌────────────▼─────────────────────────────────────────┐
            │ EC2 t3.medium · Ubuntu 24.04 · k3s (oan-public-subnet) │
            │                                                        │
            │  Traefik ingress (TLS secret oan-reports-tls)          │
            │   ├── /api ─────────► api Service ──► FastAPI pod      │
            │   └── /    ─────────► web Service ──► nginx pod (SPA)  │
            │                                     └─ /api proxy ─┘   │
            │                       FastAPI ──► PostgreSQL 16 (PVC)  │
            │                                                        │
            │  CronJob ecr-refresh (every 6h) ──► Secret ecr-pull-secret
            │        │ instance role via IMDSv2                       │
            └────────┼───────────────────────────────────────────────┘
                     ▼
               Amazon ECR  oan-reports-central/api, oan-reports-central/web
```

| Component | Source | Kubernetes object |
|-----------|--------|-------------------|
| API (FastAPI + SQLAlchemy) | `backend/` | Deployment + Service, probes on `/api/health` |
| Web (Vue 3 SPA on nginx) | `frontend/` | Deployment + Service, non-root nginx on :8080 |
| Database setup | `backend/app/services/reports.py` | Job (Helm post-install/upgrade hook) |
| PostgreSQL 16 | `postgres:16-alpine` | StatefulSet + 10 Gi PVC (`local-path`) |
| ECR token refresh | `alpine/k8s` (aws-cli + kubectl) | CronJob + pre-install hook Job + RBAC |
| TLS certificates | cert-manager v1.21.3 (`cert-manager` namespace) | ClusterIssuers `letsencrypt-prod` / `letsencrypt-staging`, Certificate `oan-reports-tls` |
| HTTP → HTTPS redirect | k3s-bundled Traefik 3.7 | `HelmChartConfig` `kube-system/traefik` |

---

## 2. What was added to the repository

| Path | Purpose |
|------|---------|
| `frontend/Dockerfile` | Two-stage build: Node 22 builds the SPA, `nginx-unprivileged` serves `dist/` |
| `frontend/docker/default.conf.template` | nginx config: SPA history fallback, `/api` proxy to `$API_UPSTREAM`, `/healthz`, asset caching |
| `frontend/.dockerignore`, `backend/.dockerignore` | Keep `node_modules`, `.env`, local DBs out of images |
| `helm/oan-reports-central/` | Helm chart (see [§7](#7-deploy-with-helm)) |
| `helm/oan-reports-central/values-dev.yaml` | Values for the dev EC2 environment |
| `helm/oan-reports-central/README.md` | Chart reference |
| `infra/terraform/dev/` | Terraform: ECR, key pair, security group, EC2 host |
| `infra/k8s/cert-manager/cluster-issuers.yaml` | Let's Encrypt prod + staging ClusterIssuers (HTTP-01, Traefik) |
| `infra/k8s/traefik/helmchartconfig.yaml` | k3s Traefik override: redirect HTTP to HTTPS |
| `Jenkinsfile` | CI/CD: build, push to ECR, package chart, deploy to dev, publish to oan-helm (see [§7a](#7a-cicd-jenkins)) |
| `infra/k8s/jenkins/` | Namespace-scoped deployer ServiceAccount and kubeconfig script for Jenkins |

The existing `backend/Dockerfile` and `docker-compose.yml` were not changed.

---

## 3. Local setup

### Prerequisites

| Tool | Version used |
|------|--------------|
| Docker | 29.x |
| Node.js | 22.x (Vite 8 needs ≥ 20.19) |
| Python | 3.12 (only for running the API without Docker) |
| Helm | 4.x |
| kubectl, minikube | for the local Kubernetes check |
| Terraform | ≥ 1.6 (1.14 used) |
| AWS CLI | v2, profile with access to account `379220350808` |

### Run with Docker Compose (API + Postgres) and Vite

```bash
cp .env.example .env
docker compose up --build          # Postgres 16 + API on :8000, seeds 43 reports
# API:  http://localhost:8000/api/health   Docs: http://localhost:8000/docs

cd frontend
npm install
npm run dev                         # http://127.0.0.1:5173, /api proxied to :8000
```

> `docs/FRONTEND.md` says the Vite proxy targets port 8001; `frontend/vite.config.js` actually targets **8000**.
> On Linux use `PYTHONPATH=. uvicorn app.main:app --reload --port 8000` (from `backend/`) instead of the Windows `set PYTHONPATH=.`.

Reports show **"No data"** with an *Upstream not configured* banner until the `UPSTREAM_*_BASE_URL` variables point at real services — this is intentional (no fake KPIs).

---

## 4. Build images and test on local Kubernetes (minikube)

```bash
docker build -t oan-reports-central-api:0.0.1 backend
docker build -t oan-reports-central-web:0.0.1 frontend

minikube start
minikube image load oan-reports-central-api:0.0.1
minikube image load oan-reports-central-web:0.0.1

helm install oan helm/oan-reports-central -n oan-dev --create-namespace --wait
kubectl -n oan-dev port-forward svc/oan-oan-reports-central-web 8080:80
# open http://127.0.0.1:8080/
```

Verified on minikube:

- API healthy on Postgres, 43 system reports seeded (Credit 11, Farmer Registry 8, Livestock 6, Crop Sown 6, Grievance 12).
- All 13 SPA routes render with no console errors; deep links (e.g. `/reports/grievance-summary`) return 200.
- Editing a system report (`PATCH`) shows in the UI and `POST …/reset` restores it.
- Data survives an API restart; `helm upgrade` re-runs the seed job and keeps the Postgres password.

Clean up: `helm uninstall oan -n oan-dev` (the Postgres password Secret is kept on purpose — delete it and the PVC to start fresh).

---

## 5. Provision AWS infrastructure (Terraform)

Code: `infra/terraform/dev/`.

### What it creates

| Resource | Name / value |
|----------|--------------|
| ECR repositories | `oan-reports-central/api`, `oan-reports-central/web` — scan on push, AES256, `MUTABLE` tags |
| ECR lifecycle | expire untagged after 7 days, keep the latest 30 images |
| EC2 key pair | `oan-reports-central-dev` — public half of `id_ed25519` (private `.pem` stays local) |
| Security group | `oan-reports-central-dev` (`sg-024b95dc0cd1beb99`) in `oan-vpc` |
| EC2 instance | `oan-reports-central-dev`, t3.medium, Ubuntu 24.04, 30 GiB gp3 encrypted, IMDSv2 (hop limit 2) |

It **uses, does not create**:

- VPC `oan-vpc` (`vpc-098db793507cb54ea`, 10.0.0.0/16)
- Subnet `oan-public-subnet` (`subnet-044c70eb69042c9b6`, ap-south-1a)
- Instance profile `EC2-ECR-Read-Role` (ECR read for the token CronJob)

Security group rules:

| Port | Source | Use |
|------|--------|-----|
| 22 | `admin_cidrs` | SSH |
| 6443 | `admin_cidrs` | Kubernetes API (kubectl / helm from a laptop) |
| 80, 443 | 0.0.0.0/0 | Dashboard via Traefik |
| egress all | 0.0.0.0/0 | packages, ECR, upstream APIs |

First boot (`user_data.sh`) installs k3s (with Traefik and the `local-path` storage class) and Helm, and adds the instance's public IP to the API server certificate.

### Run it

```bash
cd infra/terraform/dev
cp terraform.tfvars.example terraform.tfvars
# edit: admin_cidrs = ["<your-ip>/32"]   (curl -s https://checkip.amazonaws.com)
#       subnet_id   = "subnet-044c70eb69042c9b6"   (an ID, not the Name tag)

export AWS_PROFILE=cosaws              # the only valid profile on the admin laptop
export TF_REGISTRY_CLIENT_TIMEOUT=60   # slow DNS / broken IPv6 on the office network

terraform init
terraform plan -out=dev.tfplan         # expect only "to add" on first run
terraform apply dev.tfplan
terraform output
```

Outputs: `registry`, `repository_urls`, `instance_id`, `public_ip`, `ssh_command`, `security_group_id`.

### Access the host

```bash
ssh -i /home/simret/Downloads/helm/id_ed25519.pem ubuntu@13.201.33.90
kubectl get nodes        # k3s + helm are ready ~2 minutes after boot
```

Remote kubeconfig for a laptop (only from an IP in `admin_cidrs`):

```bash
ssh -i <key.pem> ubuntu@<public_ip> cat /etc/rancher/k3s/k3s.yaml \
  | sed 's#https://127.0.0.1:6443#https://<public_ip>:6443#' > ~/.kube/oan-dev
chmod 600 ~/.kube/oan-dev
export KUBECONFIG=~/.kube/oan-dev
```

> State is local (`infra/terraform/dev/terraform.tfstate`). Do not delete it; move to the commented S3 backend in `versions.tf` before others run Terraform. `terraform.tfvars` and state files are git-ignored.

---

> **Dynamic office IP.** `admin_cidrs` is a single /32; the ISP changes it (196.190.62.85 → 196.189.144.238 on 2026-11-10). When SSH or kubectl time out, check `curl -s https://checkip.amazonaws.com`, update `admin_cidrs` in `terraform.tfvars`, and `terraform apply` (only the two SG rules change).

## 6. Push images to ECR

```bash
export AWS_PROFILE=cosaws
REGISTRY=379220350808.dkr.ecr.ap-south-1.amazonaws.com
TAG=0.0.1

aws ecr get-login-password --region ap-south-1 \
  | docker login --username AWS --password-stdin $REGISTRY

for c in api web; do
  docker tag oan-reports-central-$c:$TAG $REGISTRY/oan-reports-central/$c:$TAG
  docker push $REGISTRY/oan-reports-central/$c:$TAG
done
```

Pushed for this release: `api:0.0.1` (71 MB compressed), `web:0.0.1` (21 MB).

---

## 7. Deploy with Helm

```bash
export KUBECONFIG=~/.kube/oan-dev
helm upgrade --install oan helm/oan-reports-central \
  -n oan-dev --create-namespace \
  -f helm/oan-reports-central/values-dev.yaml \
  --wait --timeout 10m
```

What happens, in order:

1. **pre-install hooks** — ServiceAccount/Role/RoleBinding, then a Job that runs `aws ecr get-login-password` (credentials from `EC2-ECR-Read-Role` via IMDSv2) and writes the `ecr-pull-secret` docker-registry Secret.
2. **Resources** — Postgres StatefulSet, API and web Deployments (all pods use `ecr-pull-secret`), Services, Traefik Ingress, ECR refresh CronJob.
3. API pods wait for Postgres in an init container; they start with `SEED_ON_STARTUP=false`.
4. **post-install hook** — seed Job creates tables and upserts the 43 system reports (idempotent; customised reports are not overwritten).

### `values-dev.yaml` summary

| Key | Value |
|-----|-------|
| `ecr.enabled` / `registry` / `region` | `true` / `379220350808.dkr.ecr.ap-south-1.amazonaws.com` / `ap-south-1` |
| `ecr.awsCredentialsSecret` | empty → use the instance role |
| `api.image`, `web.image` | ECR repositories, tag `0.0.1` |
| `api.upstreams.*` | empty (set to enable live data) |
| `ingress` | `traefik`, host `oan-reports.development.oanstaging.com`, annotation `cert-manager.io/cluster-issuer: letsencrypt-prod`, TLS secret `oan-reports-tls` |
| `postgresql.persistence` | 10 Gi on `local-path` |

### Main chart values

| Value | Default | Notes |
|-------|---------|-------|
| `api.replicaCount`, `api.autoscaling.*` | 1 / off | HPA on CPU when enabled |
| `api.env`, `api.extraEnv` | `APP_ENV`, `CORS_ORIGINS`, timeout | non-secret config → ConfigMap |
| `api.upstreams.{a2c,grievance,farmer,livestock,crop,gateway}` | `""` | `UPSTREAM_*_BASE_URL` |
| `seedJob.enabled` | `true` | disable to seed on API startup instead |
| `postgresql.enabled` | `true` | bundled DB for dev/staging |
| `postgresql.auth.password` / `existingSecret` | generated | generated password is kept across upgrades/uninstall |
| `externalDatabase.url` / `existingSecret` | — | required when `postgresql.enabled=false` |
| `ecr.schedule` | `0 */6 * * *` | ECR tokens expire after 12 h |
| `ingress.host` | `reports.example.org` | empty = any host |

### Domain and TLS (one-time, per cluster)

The Route 53 record `oan-reports.development.oanstaging.com` points straight at the k3s host; Traefik on the host terminates TLS.

```bash
helm repo add jetstack https://charts.jetstack.io && helm repo update
helm upgrade --install cert-manager jetstack/cert-manager --version v1.21.3 \
  -n cert-manager --create-namespace --set crds.enabled=true --wait
kubectl apply -f infra/k8s/cert-manager/cluster-issuers.yaml     # letsencrypt-prod / -staging (no contact email)
kubectl apply -f infra/k8s/traefik/helmchartconfig.yaml         # HTTP -> HTTPS 301
helm upgrade oan helm/oan-reports-central -n oan-dev -f helm/oan-reports-central/values-dev.yaml
kubectl -n oan-dev get certificate oan-reports-tls               # READY True within ~30 s
```

- The redirect key for the k3s v1.37 Traefik chart (41.x) is `ports.web.http.redirections` — the older `ports.web.redirections` is silently ignored.
- Renewal with the redirect in place was tested by issuing a staging certificate for the same host.
- Current certificate: issuer Let's Encrypt `YR2`, valid until 2027-02-08; cert-manager renews ~30 days before expiry.

### Verified on the EC2 host

| Check | Result |
|-------|--------|
| Pods | api, web, postgresql `Running`; images pulled from ECR |
| `GET /api/health` | `status: ok`, `database: postgres` |
| `https://oan-reports.development.oanstaging.com/` | 200 with a valid Let's Encrypt certificate; `http://` → 301 to `https://` |
| `GET /api/reports` | 43 reports |
| SPA | `/` and deep links return 200; JS/CSS bundles and dashboard API calls return 200 |
| ECR refresh | manual run of the CronJob: `refreshed ecr-pull-secret` |

---

## 7a. CI/CD (Jenkins)

`Jenkinsfile` at the repository root, for a multibranch job on https://jenkins.oanstaging.com/ (same pattern as farmer-registry).

| Stage | Runs on | What it does |
|-------|---------|--------------|
| Build | every branch and PR | `docker build` of `backend` (api) and `frontend` (web), images `oan/oan_reports_central/oan-report-central-api` and `…/oan-report-central-ui` (the registries' `oan/<repository>/<image>` naming), tagged `<Chart.yaml appVersion>.develop.<build number>`, e.g. `0.0.0.develop.42` |
| Push to ECR | `developer` | pushes both to ECR, records each `tag@digest` |
| Package chart | `developer`, agent `oan-ci-deploy` | oan-helm `scripts/ci/package_chart.py`: copies `helm/oan-reports-central`, writes the images into its `values.yaml`, adds the `oan.org/*` annotations, version `0.0.0-develop.<commit count>` |
| Deploy to dev | `developer`, agent `oan-ci-deploy` | `helm upgrade --install oan-reports-central <archive> -n reports -f values-dev-registries.yaml --atomic --wait` on New Dev (the registries cluster, Istio `VirtualService` on `istio-system/development`), then `GET /api/health` against New Dev's IP |
| Publish chart to oan-helm | `developer`, after a good deploy | oan-helm `scripts/ci/publish_chart.py` adds the same archive to `repository/develop/`; oan-helm's workflow updates the index, CHANGELOG and rollback history. A failure here marks the build UNSTABLE only |

Dev runs exactly the archive published to oan-helm. `values-dev.yaml` sets no image tags, the packaged chart carries them.

**Network.** The deploy agent `oan-ci-deploy-agent-1` (security group `oan-sg`) is in `oan-vpc` with the host, and reaches the Kubernetes API on the host's private IP. Terraform rule `k8s_api_ci` (variable `ci_security_group_ids`) allows 6443 from that group only.

**Jenkins credentials.**

| ID | Kind | Notes |
|----|------|-------|
| `aws-ecr-creds` | AWS credentials | existing (farmer-registry); needs push to `oan/reports-central/*` |
| `oan-helm-fork-token` | Username + password | existing (farmer-registry); push access to oan-helm |
| `reports-dev-kubeconfig` | Secret file | new; namespace-scoped deployer of namespace `reports` on New Dev (`oan-reports-dev-kubeconfig` was the old k3s host's) |

Create the kubeconfig once (re-run to rotate):

```bash
cd infra/k8s/jenkins
scp -i <key>.pem deployer.yaml make-kubeconfig.sh ubuntu@<host>:
ssh -i <key>.pem ubuntu@<host> 'sudo bash make-kubeconfig.sh' > oan-reports-dev-kubeconfig.yaml
# Jenkins → Manage Credentials → Secret file, ID oan-reports-dev-kubeconfig; then delete the local file
```

**Rollback.** `--atomic` rolls a failed upgrade back automatically. To go back to an earlier build: `helm rollback oan <revision> -n oan-dev`, or install an older archive from oan-helm `repository/develop/` (command in `releases/history/develop/oan-reports-central.md`).

---

## 8. Day-2 operations

| Task | Command |
|------|---------|
| Release a new version | push to `developer`: Jenkins builds, pushes, deploys and publishes (§7a) |
| Connect live data | set `api.upstreams.*` in `values-dev.yaml` → `helm upgrade` (ConfigMap checksum restarts the API) |
| Status | `kubectl -n oan-dev get pods,jobs,cronjob,ingress` |
| Logs | `kubectl -n oan-dev logs deploy/oan-oan-reports-central-api` (or `-web`) |
| Refresh ECR token now | `kubectl -n oan-dev create job --from=cronjob/oan-oan-reports-central-ecr-refresh ecr-refresh-manual` |
| Roll back | `helm history oan -n oan-dev` → `helm rollback oan <revision> -n oan-dev` |
| DB shell | `kubectl -n oan-dev exec -it oan-oan-reports-central-postgresql-0 -- psql -U oan oan_reports` |
| Re-seed system reports | `helm upgrade` (seed hook runs every upgrade) |
| New public IP after stop/start | `terraform apply -refresh-only` → `terraform output public_ip`; **update the Route 53 A record**; update kubeconfig (the k3s API cert only lists the first-boot IP — use SSH or add the new IP as a `--tls-san`) |
| Certificate status | `kubectl -n oan-dev get certificate,certificaterequest,challenge` |
| Office IP changed | update `admin_cidrs` → `terraform apply` |

---

## 9. Known limitations

- **Open to the internet without login.** Ports 80/443 are public and the app has no authentication; anyone with the URL can read and edit reports. Restrict `0.0.0.0/0` on 80/443 or add auth before sharing.
- **Auto-assigned public IP.** The account was at its Elastic IP quota (5); the IP changes on stop/start, and the Route 53 A record must then be updated by hand.
- **Single node, bundled Postgres.** Fine for dev; use a managed database (`externalDatabase`) and multiple nodes for staging/prod.
- **API image runs as root** (unchanged `backend/Dockerfile`).
- **No data yet.** Every report shows *Upstream not configured* until `api.upstreams.*` are set.

---

## 10. Troubleshooting (issues hit during setup)

| Symptom | Cause | Fix |
|---------|-------|-----|
| `terraform init`: *could not connect to registry.terraform.io … context deadline exceeded* | Slow DNS (5–10 s) and broken IPv6 on the local network | `export TF_REGISTRY_CLIENT_TIMEOUT=60` and retry |
| `aws sts get-caller-identity`: *InvalidClientTokenId* | `default` / `ecr-role` profiles have invalid keys | `export AWS_PROFILE=cosaws` |
| `AddressLimitExceeded` creating an Elastic IP | Region at the 5-EIP quota | Use the auto-assigned IP, or request a quota increase |
| `AccessDenied` on `iam:CreateUser` / `iam:ListRolePolicies` | `Simret_Proteans` has limited IAM rights | Reuse existing `EC2-ECR-Read-Role`; ask an admin for anything else |
| `subnet_id` rejected | Name tag given instead of ID | Use `subnet-044c70eb69042c9b6` |
| First `docker build` failed in `npm ci` / `pip install` | Network hiccup while minikube was starting in parallel | Re-run the build |
| Pods `ImagePullBackOff` from ECR | `ecr-pull-secret` missing or expired | Run the refresh Job manually (see §8); check the instance profile is attached |
| Seed Job fails | DB not reachable | `kubectl -n oan-dev logs job/oan-oan-reports-central-seed -c wait-for-db` |
| SSH / kubectl suddenly time out | Office public IP changed; SG only allows the old /32 | Update `admin_cidrs`, `terraform apply` |
| `http://` not redirecting after editing `HelmChartConfig` | Wrong values path for the Traefik chart version | Use `ports.web.http.redirections`; check `kubectl -n kube-system get deploy traefik -o yaml \| grep redirections` |
| Domain pointed at the nginx box was expected | Route 53 A record targets the k3s host directly | Intentional: no external nginx; Traefik serves the domain |
