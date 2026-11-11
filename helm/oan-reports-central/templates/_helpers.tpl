{{- define "oan.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "oan.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "oan.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "oan.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/* Selector labels; call with (dict "ctx" $ "component" "api") */}}
{{- define "oan.selectorLabels" -}}
app.kubernetes.io/name: {{ include "oan.name" .ctx }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "oan.apiImage" -}}
{{ .Values.api.image.repository }}:{{ .Values.api.image.tag | default .Chart.AppVersion }}
{{- end }}

{{- define "oan.webImage" -}}
{{ .Values.web.image.repository }}:{{ .Values.web.image.tag | default .Chart.AppVersion }}
{{- end }}

{{- define "oan.postgresHost" -}}
{{ include "oan.fullname" . }}-postgresql
{{- end }}

{{- define "oan.postgresSecretName" -}}
{{- .Values.postgresql.auth.existingSecret | default (printf "%s-postgresql" (include "oan.fullname" .)) }}
{{- end }}

{{/*
DATABASE_URL env for API containers. With the bundled database the URL is
assembled from the password Secret via $(DB_PASSWORD) expansion.
*/}}
{{- define "oan.databaseEnv" -}}
{{- if .Values.postgresql.enabled }}
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "oan.postgresSecretName" . }}
      key: password
- name: DATABASE_URL
  value: {{ printf "postgresql+psycopg2://%s:$(DB_PASSWORD)@%s:5432/%s" .Values.postgresql.auth.username (include "oan.postgresHost" .) .Values.postgresql.auth.database | quote }}
{{- else }}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      {{- if .Values.externalDatabase.existingSecret }}
      name: {{ .Values.externalDatabase.existingSecret }}
      key: {{ .Values.externalDatabase.existingSecretKey }}
      {{- else }}
      name: {{ include "oan.fullname" . }}-database
      key: DATABASE_URL
      {{- end }}
{{- end }}
{{- end }}

{{/* Init container that blocks until the database accepts connections */}}
{{- define "oan.waitForDb" -}}
- name: wait-for-db
  image: {{ include "oan.apiImage" . }}
  imagePullPolicy: {{ .Values.api.image.pullPolicy }}
  env:
    {{- include "oan.databaseEnv" . | nindent 4 }}
  command:
    - python
    - -c
    - |
      import os, sys, time
      from sqlalchemy import create_engine, text
      engine = create_engine(os.environ["DATABASE_URL"])
      for attempt in range(60):
          try:
              with engine.connect() as conn:
                  conn.execute(text("SELECT 1"))
              print("database is ready")
              sys.exit(0)
          except Exception as exc:
              print(f"waiting for database ({attempt + 1}/60): {exc.__class__.__name__}")
              time.sleep(5)
      sys.exit(1)
{{- end }}

{{/* imagePullSecrets for all pods, including the ECR secret when enabled */}}
{{- define "oan.imagePullSecrets" -}}
{{- $secrets := list }}
{{- range .Values.imagePullSecrets }}
{{- $secrets = append $secrets . }}
{{- end }}
{{- if .Values.ecr.enabled }}
{{- $secrets = append $secrets (dict "name" .Values.ecr.pullSecretName) }}
{{- end }}
{{- with $secrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}

{{/* Pod template that writes a fresh ECR token into the pull Secret; call with (dict "ctx" $ "name" ...) */}}
{{- define "oan.ecrRefreshPod" -}}
{{- $ecr := .ctx.Values.ecr }}
metadata:
  labels:
    {{- include "oan.selectorLabels" (dict "ctx" .ctx "component" "ecr-refresh") | nindent 4 }}
spec:
  serviceAccountName: {{ .name }}
  restartPolicy: Never
  containers:
    - name: refresh
      image: "{{ $ecr.image.repository }}:{{ $ecr.image.tag }}"
      imagePullPolicy: {{ $ecr.image.pullPolicy }}
      {{- with $ecr.awsCredentialsSecret }}
      envFrom:
        - secretRef:
            name: {{ . }}
      {{- end }}
      env:
        - name: AWS_REGION
          value: {{ $ecr.region | quote }}
        - name: ECR_REGISTRY
          value: {{ $ecr.registry | quote }}
        - name: PULL_SECRET
          value: {{ $ecr.pullSecretName | quote }}
        - name: NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
      command:
        - /bin/sh
        - -ec
        - |
          TOKEN="$(aws ecr get-login-password --region "$AWS_REGION")"
          kubectl -n "$NAMESPACE" create secret docker-registry "$PULL_SECRET" \
            --docker-server="$ECR_REGISTRY" \
            --docker-username=AWS \
            --docker-password="$TOKEN" \
            --dry-run=client -o yaml | kubectl -n "$NAMESPACE" apply -f -
          echo "refreshed $PULL_SECRET for $ECR_REGISTRY"
      {{- with $ecr.resources }}
      resources:
        {{- toYaml . | nindent 8 }}
      {{- end }}
{{- end }}
