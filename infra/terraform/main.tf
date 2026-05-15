locals {
  name                      = lower(replace(var.project_name, "_", "-"))
  s3_origin_id              = "${local.name}-frontend-s3"
  api_origin_id             = "${local.name}-api-apprunner"
  api_domain                = replace(replace(aws_apprunner_service.api.service_url, "https://", ""), "http://", "")
  has_custom_domain         = var.custom_domain_name != null && var.custom_domain_name != ""
  www_domain_name           = local.has_custom_domain ? "www.${var.custom_domain_name}" : null
  cloudfront_aliases        = local.has_custom_domain ? concat([var.custom_domain_name], var.custom_domain_include_www ? [local.www_domain_name] : []) : []
  create_ecr_access_role    = var.api_image_repository_type == "ECR" && var.apprunner_access_role_arn == null
  apprunner_access_role_arn = var.api_image_repository_type == "ECR_PUBLIC" ? null : coalesce(var.apprunner_access_role_arn, try(aws_iam_role.apprunner_ecr_access[0].arn, null))
  route53_zone_id           = local.has_custom_domain ? coalesce(var.route53_zone_id, try(aws_route53_zone.custom_domain[0].zone_id, null), try(data.aws_route53_zone.custom_domain[0].zone_id, null)) : null
  certificate_arn           = local.has_custom_domain ? aws_acm_certificate.cloudfront[0].arn : null
  enable_www_redirect       = local.has_custom_domain && var.custom_domain_include_www && var.redirect_www_to_apex
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_route53_zone" "custom_domain" {
  count        = local.has_custom_domain && var.route53_zone_id == null && !var.create_route53_zone ? 1 : 0
  name         = var.custom_domain_name
  private_zone = false
}

resource "aws_route53_zone" "custom_domain" {
  count = local.has_custom_domain && var.route53_zone_id == null && var.create_route53_zone ? 1 : 0
  name  = var.custom_domain_name
}

resource "aws_acm_certificate" "cloudfront" {
  count             = local.has_custom_domain ? 1 : 0
  provider          = aws.us_east_1
  domain_name       = var.custom_domain_name
  validation_method = "DNS"

  subject_alternative_names = var.custom_domain_include_www ? [local.www_domain_name] : []

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cloudfront_certificate_validation" {
  for_each = local.has_custom_domain ? {
    for option in aws_acm_certificate.cloudfront[0].domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = local.route53_zone_id
}

resource "aws_acm_certificate_validation" "cloudfront" {
  count                   = local.has_custom_domain ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cloudfront[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cloudfront_certificate_validation : record.fqdn]
}

resource "aws_cloudfront_function" "redirect_www_to_apex" {
  count   = local.enable_www_redirect ? 1 : 0
  name    = "${local.name}-redirect-www-to-apex"
  runtime = "cloudfront-js-2.0"
  comment = "Redirect www.${var.custom_domain_name} to ${var.custom_domain_name}"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var host = request.headers.host && request.headers.host.value;

      if (host === 'www.${var.custom_domain_name}') {
        var query = Object.keys(request.querystring || {}).map(function(key) {
          var item = request.querystring[key];
          return item.multiValue
            ? item.multiValue.map(function(value) { return key + '=' + value.value; }).join('&')
            : key + '=' + item.value;
        }).filter(Boolean).join('&');

        return {
          statusCode: 301,
          statusDescription: 'Moved Permanently',
          headers: {
            location: {
              value: 'https://${var.custom_domain_name}' + request.uri + (query ? '?' + query : '')
            }
          }
        };
      }

      return request;
    }
  EOT
}

resource "aws_s3_bucket" "frontend" {
  bucket_prefix = "${local.name}-frontend-"
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_iam_role" "apprunner_ecr_access" {
  count = local.create_ecr_access_role ? 1 : 0
  name  = "${local.name}-apprunner-ecr-access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "build.apprunner.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr_access" {
  count      = local.create_ecr_access_role ? 1 : 0
  role       = aws_iam_role.apprunner_ecr_access[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

resource "aws_apprunner_service" "api" {
  service_name = "${local.name}-api"

  source_configuration {
    auto_deployments_enabled = true

    dynamic "authentication_configuration" {
      for_each = local.apprunner_access_role_arn == null ? [] : [local.apprunner_access_role_arn]

      content {
        access_role_arn = authentication_configuration.value
      }
    }

    image_repository {
      image_identifier      = var.api_image_identifier
      image_repository_type = var.api_image_repository_type

      image_configuration {
        port                          = "8000"
        runtime_environment_variables = var.api_environment_variables
      }
    }
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  instance_configuration {
    cpu    = "1024"
    memory = "2048"
  }
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.name}-frontend-oac"
  description                       = "Allow CloudFront to read the ${local.name} frontend bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "${local.name} frontend and API router"
  default_root_object = "index.html"
  aliases             = local.cloudfront_aliases
  price_class         = "PriceClass_100"

  origin {
    origin_id                = local.s3_origin_id
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  origin {
    origin_id   = local.api_origin_id
    domain_name = local.api_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

    dynamic "function_association" {
      for_each = local.enable_www_redirect ? [aws_cloudfront_function.redirect_www_to_apex[0].arn] : []

      content {
        event_type   = "viewer-request"
        function_arn = function_association.value
      }
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = local.api_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id

    dynamic "function_association" {
      for_each = local.enable_www_redirect ? [aws_cloudfront_function.redirect_www_to_apex[0].arn] : []

      content {
        event_type   = "viewer-request"
        function_arn = function_association.value
      }
    }
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = !local.has_custom_domain
    acm_certificate_arn            = local.certificate_arn
    ssl_support_method             = local.has_custom_domain ? "sni-only" : null
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  depends_on = [aws_acm_certificate_validation.cloudfront]
}

resource "aws_route53_record" "custom_domain_apex" {
  count   = local.has_custom_domain ? 1 : 0
  name    = var.custom_domain_name
  type    = "A"
  zone_id = local.route53_zone_id

  alias {
    evaluate_target_health = false
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
  }
}

resource "aws_route53_record" "custom_domain_apex_ipv6" {
  count   = local.has_custom_domain ? 1 : 0
  name    = var.custom_domain_name
  type    = "AAAA"
  zone_id = local.route53_zone_id

  alias {
    evaluate_target_health = false
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
  }
}

resource "aws_route53_record" "custom_domain_www" {
  count   = local.has_custom_domain && var.custom_domain_include_www ? 1 : 0
  name    = local.www_domain_name
  type    = "A"
  zone_id = local.route53_zone_id

  alias {
    evaluate_target_health = false
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
  }
}

resource "aws_route53_record" "custom_domain_www_ipv6" {
  count   = local.has_custom_domain && var.custom_domain_include_www ? 1 : 0
  name    = local.www_domain_name
  type    = "AAAA"
  zone_id = local.route53_zone_id

  alias {
    evaluate_target_health = false
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontRead"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}
