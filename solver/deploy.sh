#!/usr/bin/env bash
# solver を Google Cloud Run にデプロイする。
#
# 前提: gcloud CLI がインストール・ログイン済み (gcloud auth login)
# 使い方:
#   cd solver
#   ./deploy.sh <GCPプロジェクトID> [リージョン(既定: asia-northeast1)]
#
# デプロイ後に表示される URL を Vercel の環境変数 SOLVER_API_URL に設定する。
set -euo pipefail

PROJECT_ID="${1:?使い方: ./deploy.sh <GCPプロジェクトID> [リージョン]}"
REGION="${2:-asia-northeast1}"
SERVICE="shift-craft-solver"

echo "== Cloud Run にデプロイ: project=${PROJECT_ID} region=${REGION} service=${SERVICE}"

# 必要な API を有効化（初回のみ実質作用）
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  --project "${PROJECT_ID}"

# Dockerfile からソースデプロイ（Cloud Build でビルドされる）
gcloud run deploy "${SERVICE}" \
  --source . \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60 \
  --max-instances 2

URL=$(gcloud run services describe "${SERVICE}" \
  --project "${PROJECT_ID}" --region "${REGION}" \
  --format 'value(status.url)')

echo
echo "== デプロイ完了"
echo "URL: ${URL}"
echo "動作確認: curl ${URL}/health"
echo
echo "次の手順:"
echo "  1. Vercel → Settings → Environment Variables に SOLVER_API_URL=${URL} を追加"
echo "  2. Vercel を Redeploy"
echo "  3. （推奨）本サービスの環境変数 ALLOWED_ORIGINS に Vercel ドメインを設定:"
echo "     gcloud run services update ${SERVICE} --project ${PROJECT_ID} --region ${REGION} \\"
echo "       --set-env-vars ALLOWED_ORIGINS=https://shift-craft-salon.vercel.app"
