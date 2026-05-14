# Entangled Body AWS Terraform

This creates the first deployment shape:

- S3 stores the static Next export from `apps/web`.
- CloudFront serves the S3 frontend as the default origin.
- CloudFront routes `/api/*` to the App Runner FastAPI origin.
- The frontend can keep calling `/api/quantum/...`; Next.js does not proxy API traffic in production.
- Optionally, Route 53 and ACM attach an apex custom domain such as `entangledbody.com`.
- Optionally, `www.<domain>` is attached and redirected to the apex domain.

## Prerequisites

1. Build and push the API Docker image to ECR or ECR Public.
2. If using private ECR, Terraform creates a default App Runner ECR access role unless you pass an existing role ARN as `apprunner_access_role_arn`.
3. Authenticate AWS locally with credentials that can manage S3, CloudFront, and App Runner.
4. For a custom domain, either have an existing public Route 53 hosted zone or let Terraform create one.

## Apply Infrastructure

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

For a custom domain managed in Route 53, add these values to `terraform.tfvars`:

```hcl
custom_domain_name        = "entangledbody.com"
custom_domain_include_www = true
redirect_www_to_apex      = true
```

If the Route 53 hosted zone already exists, Terraform looks it up by domain name.
If there is no hosted zone yet, add:

```hcl
create_route53_zone = true
```

When Terraform creates the hosted zone and the domain was registered outside Route 53, update the registrar's nameservers to the `route53_name_servers` output. If the domain is registered in Route 53 and uses the same hosted zone, no external DNS console is needed.

After apply, Terraform prints:

- `frontend_bucket_name`
- `cloudfront_distribution_id`
- `cloudfront_domain_name`
- `apprunner_service_url`
- `custom_domain_name`
- `custom_www_domain_name`
- `route53_zone_id`
- `route53_name_servers`
- `cloudfront_certificate_arn`

## Deploy Frontend Files

From the repository root:

```bash
npm run build
aws s3 sync apps/web/out "s3://$(terraform -chdir=infra/terraform output -raw frontend_bucket_name)" --delete
aws cloudfront create-invalidation \
  --distribution-id "$(terraform -chdir=infra/terraform output -raw cloudfront_distribution_id)" \
  --paths "/*"
```

Open the CloudFront domain:

```bash
terraform -chdir=infra/terraform output -raw cloudfront_domain_name
```

If a custom domain is configured, open:

```text
https://entangledbody.com
```

API requests should use the same frontend host:

```text
https://<frontend-domain>/api/quantum/health
```

CloudFront forwards those `/api/*` requests to App Runner.
