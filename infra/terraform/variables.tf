variable "project_name" {
  description = "Name prefix used for AWS resources."
  type        = string
  default     = "entangled-body"
}

variable "aws_region" {
  description = "AWS region for regional resources such as S3 and App Runner."
  type        = string
  default     = "us-east-1"
}

variable "api_image_identifier" {
  description = "Container image URI for the FastAPI service, for example an ECR or ECR Public image URI."
  type        = string
}

variable "api_image_repository_type" {
  description = "Image repository type for App Runner. Use ECR for private ECR images or ECR_PUBLIC for public images."
  type        = string
  default     = "ECR"

  validation {
    condition     = contains(["ECR", "ECR_PUBLIC"], var.api_image_repository_type)
    error_message = "api_image_repository_type must be ECR or ECR_PUBLIC."
  }
}

variable "apprunner_access_role_arn" {
  description = "Optional IAM role ARN that App Runner uses to pull from private ECR. If null and api_image_repository_type is ECR, Terraform creates one."
  type        = string
  default     = null
}

variable "api_environment_variables" {
  description = "Environment variables passed to the App Runner API container."
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "custom_domain_name" {
  description = "Optional apex custom domain name for CloudFront, for example entangledbody.com."
  type        = string
  default     = null
}

variable "custom_domain_include_www" {
  description = "Whether to also attach www.<custom_domain_name> to CloudFront."
  type        = bool
  default     = true
}

variable "redirect_www_to_apex" {
  description = "Whether CloudFront should redirect www.<custom_domain_name> requests to the apex domain."
  type        = bool
  default     = true
}

variable "route53_zone_id" {
  description = "Existing Route 53 hosted zone ID for custom_domain_name. If null, Terraform looks up or creates a zone depending on create_route53_zone."
  type        = string
  default     = null
}

variable "create_route53_zone" {
  description = "Whether Terraform should create the Route 53 hosted zone for custom_domain_name when route53_zone_id is null."
  type        = bool
  default     = false
}
