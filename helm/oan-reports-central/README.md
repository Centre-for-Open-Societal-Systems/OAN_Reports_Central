# oan-reports-central Helm chart

Deploys the Report Center to Kubernetes:

| Component | Kind | Notes |
|-----------|------|-------|
| API (FastAPI) | Deployment + Service | probes on `/api/health`, waits for the DB in an init container |
| Web (Vue SPA) | Deployment + Service | unprivileged nginx on :8080, proxies `/api` to the API |
| Seed | Job (post-install/upgrade hook) | creates tables + seeds the 43 system reports; API runs with `SEED_ON_STARTUP=false` |
| PostgreSQL | StatefulSet (optional) | `postgres:16-alpine`, for dev/staging — use `externalDatabase` in production |
| ECR token refresh | CronJob + hook Job (optional) | keeps the ECR `imagePullSecret` valid (tokens expire after 12h) |

## 1. Registry (ECR)

Terraform in `infra/terraform/dev/` creates the `oan-reports-central/api` and `oan-reports-central/web` repositories and a single-node k3s host in `oan-vpc` that uses the existing `EC2-ECR-Read-Role` instance profile.

```bash
cd infra/terraform/dev
cp terraform.tfvars.example terraform.tfvars   # set aws_region
terraform init && terraform apply
terraform output                               # registry, repository_urls, public_ip, ssh_command
```

Build and push the images:

```bash
REGISTRY=$(terraform -chdir=infra/terraform/dev output -raw registry)
REGION=<aws_region>
TAG=0.0.1
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY

docker build -t $REGISTRY/oan-reports-central/api:$TAG backend
docker build -t $REGISTRY/oan-reports-central/web:$TAG frontend
docker push $REGISTRY/oan-reports-central/api:$TAG
docker push $REGISTRY/oan-reports-central/web:$TAG
```

## 2. AWS credentials for the token CronJob

**On the dev EC2 host (default):** nothing to do. Leave `ecr.awsCredentialsSecret` empty; the CronJob
uses the host's `EC2-ECR-Read-Role` instance profile (IMDSv2, hop limit 2).

**Anywhere else:** get an access key for an IAM identity with ECR read access and store it **before** installing:

```bash
kubectl create namespace oan-dev
kubectl -n oan-dev create secret generic ecr-aws-credentials \
  --from-literal=AWS_ACCESS_KEY_ID=... \
  --from-literal=AWS_SECRET_ACCESS_KEY=...
# then set ecr.awsCredentialsSecret=ecr-aws-credentials
```

## 2b. Dev host (EC2 in oan-vpc)

`infra/terraform/dev` also creates a single-node k3s host in `oan-public-subnet` of `oan-vpc` (ap-south-1). It has an auto-assigned
public IP (the account is at its Elastic IP limit), which changes if the instance is stopped and started:
re-run `terraform apply` to refresh the outputs.

```bash
terraform -chdir=infra/terraform/dev output ssh_command
ssh -i /home/simret/Downloads/helm/id_ed25519.pem ubuntu@<public_ip>
kubectl get nodes        # k3s + helm are installed on first boot (~2 min)
```

k3s ships Traefik, so use `ingress.className: traefik` there.

## 3. Install

```yaml
# values-dev.yaml
ecr:
  enabled: true
  registry: 123456789012.dkr.ecr.ap-south-1.amazonaws.com
  region: ap-south-1
api:
  image:
    repository: 123456789012.dkr.ecr.ap-south-1.amazonaws.com/oan-reports-central/api
    tag: "0.0.1"
  upstreams:
    grievance: https://grievance.example.org
web:
  image:
    repository: 123456789012.dkr.ecr.ap-south-1.amazonaws.com/oan-reports-central/web
    tag: "0.0.1"
ingress:
  enabled: true
  className: traefik
  host: reports-dev.example.org
```

```bash
helm upgrade --install oan helm/oan-reports-central -n oan-dev -f values-dev.yaml --wait
```

On install/upgrade a hook Job writes the `ecr-pull-secret` before any app pod starts; the CronJob (`ecr.schedule`, default every 6h) keeps it fresh. Run a refresh by hand with:

```bash
kubectl -n oan-dev create job --from=cronjob/oan-oan-reports-central-ecr-refresh ecr-refresh-manual
```

## Database

- **Bundled** (`postgresql.enabled=true`, default): password is generated once and kept across upgrades and uninstalls (`helm.sh/resource-policy: keep`). Set `postgresql.auth.existingSecret` to supply your own.
- **External**: `postgresql.enabled=false` plus `externalDatabase.url` or `externalDatabase.existingSecret` (key `DATABASE_URL`).

## Local check (minikube)

```bash
docker build -t oan-reports-central-api:0.0.1 backend
docker build -t oan-reports-central-web:0.0.1 frontend
minikube image load oan-reports-central-api:0.0.1
minikube image load oan-reports-central-web:0.0.1
helm install oan helm/oan-reports-central -n oan-dev --create-namespace --wait
kubectl -n oan-dev port-forward svc/oan-oan-reports-central-web 8080:80
```
