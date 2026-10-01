terraform {
  required_version = ">= 1.9"
  required_providers { google = { source = "hashicorp/google", version = "~> 7.0" } }
  backend "gcs" {} # configured via backend.hcl
}
provider "google" {
  project = var.project_id
  region  = var.region
}
variable "project_id" { type = string }
variable "region" {
  type    = string
  default = "us-central1"
}
variable "github_repository" { type = string }
variable "authorized_cidrs" {
  type    = list(object({ cidr = string, label = string }))
  default = []
}

module "network" {
  source = "../../modules/gcp-network"
  name   = "pnc-risk-prod"
  region = var.region
}
module "gke" {
  source           = "../../modules/gke"
  name             = "pnc-risk-prod"
  project_id       = var.project_id
  region           = var.region
  network          = module.network.network
  subnetwork       = module.network.subnetwork
  authorized_cidrs = var.authorized_cidrs
  node_min         = 2
  node_max         = 10
}
module "github_oidc" {
  source            = "../../modules/github-oidc-gcp"
  name              = "pnc-risk-prod"
  project_id        = var.project_id
  github_repository = var.github_repository
}
output "cluster_name" { value = module.gke.cluster_name }
output "workload_identity_provider" { value = module.github_oidc.workload_identity_provider }
output "deploy_service_account" { value = module.github_oidc.service_account }
