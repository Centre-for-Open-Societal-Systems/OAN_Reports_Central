#!/usr/bin/env bash
# Write a kubeconfig for the reports-ci service account (ci/k8s/reports-ci-dev.yaml),
# for the reports-dev-kubeconfig Jenkins credential. Run with an admin KUBECONFIG
# for New Dev:
#
#   KUBECONFIG=<admin kubeconfig> ./ci/k8s/make-reports-ci-kubeconfig.sh > reports-ci.kubeconfig
#
# Then in Jenkins: Manage Jenkins → Credentials → (global) → Add Credentials →
# Kind "Secret file", file reports-ci.kubeconfig, ID reports-dev-kubeconfig — and
# delete the local copy.
set -euo pipefail
SERVER="${SERVER:-https://10.0.1.58:6443}"
NS="${NS:-reports}"
SA="${SA:-reports-ci}"

TOKEN="$(kubectl -n "$NS" get secret "${SA}-token" -o jsonpath='{.data.token}' | base64 -d)"
CA="$(kubectl -n "$NS" get secret "${SA}-token" -o jsonpath='{.data.ca\.crt}')"
[ -n "$TOKEN" ] && [ -n "$CA" ] || { echo "no token yet in ${NS}/${SA}-token" >&2; exit 1; }

cat <<KUBECONFIG
apiVersion: v1
kind: Config
clusters:
  - name: gen2-dev
    cluster:
      server: ${SERVER}
      certificate-authority-data: ${CA}
users:
  - name: ${SA}
    user:
      token: ${TOKEN}
contexts:
  - name: ${SA}@gen2-dev
    context: {cluster: gen2-dev, user: ${SA}, namespace: ${NS}}
current-context: ${SA}@gen2-dev
KUBECONFIG
