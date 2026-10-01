# Terraform

Two clouds, same shape: **network → managed Kubernetes → keyless GitHub deploy identity**.

| Path | Purpose |
|---|---|
| `modules/aws-network` | VPC, 3 AZ public/private subnets, NAT, flow logs |
| `modules/eks` | Private-by-default EKS, IMDSv2, encrypted nodes, audit logs |
| `modules/github-oidc-aws` | OIDC provider + deploy role trusted for **one repo and one GitHub environment** |
| `modules/gcp-network` | VPC, subnet with pod/service ranges, Cloud NAT, deny-all ingress |
| `modules/gke` | Private GKE, Dataplane V2, Workload Identity, shielded nodes, Binary Authorization |
| `modules/github-oidc-gcp` | Workload Identity Federation pool restricted by repository attribute |
| `envs/{aws,gcp}-{dev,prod}` | Thin compositions; prod uses HA NAT and larger node ranges |

```bash
cd infra/terraform/envs/aws-dev
cp backend.hcl.example backend.hcl            # point at your state bucket
terraform init -backend-config=backend.hcl
terraform plan -var github_repository=sm2774us/pnc-risk-console-ts
```

Least privilege: the deploy identities can describe one cluster and push images to `pnc-risk-console-*` repositories; they cannot administer IAM or networking. State lives in an encrypted remote backend; never commit `*.tfstate` or `backend.hcl`.

> CI runs `terraform fmt -check` and `validate` (backend disabled). A real `plan` needs your cloud credentials and is not part of CI.
