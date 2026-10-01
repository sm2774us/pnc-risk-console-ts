terraform {
  required_version = ">= 1.9"
  required_providers { aws = { source = "hashicorp/aws", version = "~> 6.0" } }
  backend "s3" {} # configured via backend.hcl (see backend.hcl.example)
}
provider "aws" {
  region = var.region
  default_tags { tags = { app = "pnc-risk-console", env = "prod", managed_by = "terraform" } }
}
variable "region" {
  type    = string
  default = "us-east-1"
}
variable "github_repository" { type = string }
variable "create_github_oidc_provider" {
  type    = bool
  default = true
}

module "network" {
  source     = "../../modules/aws-network"
  name       = "pnc-risk-prod"
  single_nat = false
}
module "eks" {
  source             = "../../modules/eks"
  name               = "pnc-risk-prod"
  private_subnet_ids = module.network.private_subnet_ids
  node_min           = 3
  node_max           = 10
}
module "github_oidc" {
  source            = "../../modules/github-oidc-aws"
  name              = "pnc-risk-prod"
  github_repository = var.github_repository
  environment       = "prod"
  cluster_arn       = module.eks.cluster_arn
  create_provider   = var.create_github_oidc_provider
}
output "cluster_name" { value = module.eks.cluster_name }
output "deploy_role_arn" { value = module.github_oidc.role_arn }
