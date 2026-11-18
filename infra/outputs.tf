output "site_url" {
  value = local.custom_domain ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "site_bucket" {
  description = "Upload target for apps/web/dist (see scripts/deploy-web.sh)."
  value       = aws_s3_bucket.site.bucket
}

output "distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "app_secret_arn" {
  description = "Put the real secret JSON here after the first apply."
  value       = aws_secretsmanager_secret.app.arn
}
