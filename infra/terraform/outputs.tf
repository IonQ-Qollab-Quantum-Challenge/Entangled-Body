output "frontend_bucket_name" {
  description = "S3 bucket where the static Next export should be uploaded."
  value       = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID used for cache invalidation."
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name."
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "custom_domain_name" {
  description = "Configured apex custom domain name, if enabled."
  value       = var.custom_domain_name
}

output "custom_www_domain_name" {
  description = "Configured www custom domain name, if enabled."
  value       = local.has_custom_domain && var.custom_domain_include_www ? local.www_domain_name : null
}

output "route53_zone_id" {
  description = "Route 53 hosted zone ID used for custom domain DNS records, if enabled."
  value       = local.route53_zone_id
}

output "route53_name_servers" {
  description = "Name servers for the Terraform-created hosted zone. Set these at your registrar if create_route53_zone is true."
  value       = try(aws_route53_zone.custom_domain[0].name_servers, null)
}

output "cloudfront_certificate_arn" {
  description = "ACM certificate ARN used by CloudFront, if custom domain is enabled."
  value       = local.certificate_arn
}

output "apprunner_service_arn" {
  description = "App Runner service ARN for the FastAPI backend."
  value       = aws_apprunner_service.api.arn
}

output "apprunner_service_url" {
  description = "Direct App Runner service URL. CloudFront routes /api/* to this origin."
  value       = aws_apprunner_service.api.service_url
}

output "apprunner_access_role_arn" {
  description = "IAM role ARN App Runner uses for private ECR pulls, if applicable."
  value       = local.apprunner_access_role_arn
}
