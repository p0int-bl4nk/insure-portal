#!/usr/bin/env bash
# Builds the web app and uploads it to the bucket created by Terraform, then
# invalidates CloudFront. Run after `terraform -chdir=infra apply`.
set -euo pipefail

cd "$(dirname "$0")/.."

bucket=$(terraform -chdir=infra output -raw site_bucket)
distribution=$(terraform -chdir=infra output -raw distribution_id)

pnpm --filter web build

# Vite fingerprints everything under assets/, so it can be cached for a year.
aws s3 sync apps/web/dist/assets "s3://${bucket}/assets" \
  --delete --cache-control "public, max-age=31536000, immutable"
# index.html and other root files must always be revalidated.
aws s3 sync apps/web/dist "s3://${bucket}" \
  --delete --exclude "assets/*" --cache-control "no-cache"

aws cloudfront create-invalidation --distribution-id "$distribution" \
  --paths "/index.html" "/" >/dev/null

echo "Deployed to $(terraform -chdir=infra output -raw site_url)"
