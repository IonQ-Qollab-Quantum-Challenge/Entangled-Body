# Entangled Body AWS Terraform

This Terraform configuration manages the current AWS deployment:

- S3 stores the static Next export from `apps/web`.
- CloudFront serves the S3 frontend as the default origin.
- CloudFront routes `/api/*` to the App Runner FastAPI origin.
- The frontend can keep calling `/api/quantum/...`; Next.js does not proxy API traffic in production.
- Route 53 and ACM attach a custom HTTPS domain such as `entangledbody.com`.
- `www.<domain>` can also be attached and redirected to the apex domain.

## Prerequisites

1. Build and push the API Docker image to private ECR.
2. Terraform creates a default App Runner ECR access role unless you pass an existing role ARN as `apprunner_access_role_arn`.
3. Authenticate AWS locally with credentials that can manage S3, CloudFront, and App Runner.
4. For a custom domain, either have an existing public Route 53 hosted zone or let Terraform create one.

## Deploy API Image

Private ECR is recommended for the API image:

```text
<account-id>.dkr.ecr.us-east-1.amazonaws.com/entangled-body-api:latest
```

Create the ECR repository once if it does not already exist:

```bash
aws ecr create-repository \
  --repository-name entangled-body-api \
  --region us-east-1
```

Log in Docker to ECR:

```bash
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
```

App Runner expects a Linux amd64 container image. On Apple Silicon Macs, build and push with `buildx`:

```bash
docker buildx build \
  --platform linux/amd64 \
  -t <account-id>.dkr.ecr.us-east-1.amazonaws.com/entangled-body-api:latest \
  -f apps/api/Dockerfile \
  --push .
```

If the image is built without `--platform linux/amd64`, App Runner may fail with:

```text
exec /usr/local/bin/uvicorn: exec format error
```

Optional: enable ECR scan on push:

```bash
aws ecr put-image-scanning-configuration \
  --repository-name entangled-body-api \
  --image-scanning-configuration scanOnPush=true \
  --region us-east-1
```

## Apply Infrastructure

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

For private ECR, set these values in `terraform.tfvars`:

```hcl
api_image_identifier      = "<account-id>.dkr.ecr.us-east-1.amazonaws.com/entangled-body-api:latest"
api_image_repository_type = "ECR"
apprunner_access_role_arn = null
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

If the domain was registered in Route 53 and Route 53 created the hosted zone, leave `route53_zone_id` unset and `create_route53_zone` as `false`; Terraform will look up the existing hosted zone by domain name.

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

## Redeploy Changes

For frontend-only changes:

```bash
npm run build
aws s3 sync apps/web/out "s3://$(terraform -chdir=infra/terraform output -raw frontend_bucket_name)" --delete
aws cloudfront create-invalidation \
  --distribution-id "$(terraform -chdir=infra/terraform output -raw cloudfront_distribution_id)" \
  --paths "/*"
```

For API changes:

```bash
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

docker buildx build \
  --platform linux/amd64 \
  -t <account-id>.dkr.ecr.us-east-1.amazonaws.com/entangled-body-api:latest \
  -f apps/api/Dockerfile \
  --push .
```

App Runner has `auto_deployments_enabled = true`, so pushing a new ECR image can trigger a backend redeploy. If it does not update immediately, trigger an App Runner redeploy from the AWS console or CLI.

## Useful Commands

Show all Terraform outputs:

```bash
terraform -chdir=infra/terraform output
```

Show specific outputs:

```bash
terraform -chdir=infra/terraform output -raw frontend_bucket_name
terraform -chdir=infra/terraform output -raw cloudfront_distribution_id
terraform -chdir=infra/terraform output -raw cloudfront_domain_name
terraform -chdir=infra/terraform output -raw apprunner_service_url
```

Check the API through CloudFront:

```bash
curl https://<frontend-domain>/api/health
```

Check the API directly through App Runner:

```bash
curl https://$(terraform -chdir=infra/terraform output -raw apprunner_service_url)/health
```

## Git Safety

Commit:

- Terraform configuration files, such as `main.tf`, `variables.tf`, `outputs.tf`, and `versions.tf`.
- `terraform.tfvars.example`.
- `.terraform.lock.hcl`.

Do not commit:

- `terraform.tfvars`
- `terraform.tfstate`
- `terraform.tfstate.backup`
- `.terraform/`

`terraform.tfvars` contains local environment values. `terraform.tfstate` contains deployed resource state and should be protected. For team usage, move Terraform state to a remote backend such as S3 with state locking.

## CI/CD Notes

This deployment is currently manual. A future GitHub Actions setup can automate:

- Frontend build, S3 sync, and CloudFront invalidation.
- API `linux/amd64` Docker build, ECR push, and App Runner redeploy.
- AWS authentication through GitHub OIDC instead of long-lived AWS access keys.

Keep Terraform `apply` manual at first. A safer early CI workflow is to run `terraform plan` automatically and apply infrastructure changes only after human review.
