variable "name" { type = string }
variable "project_id" { type = string }
variable "github_repository" {
  type        = string
  description = "owner/repo"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${var.name}-gh"
}
resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }
  # Only tokens minted for this exact repository are accepted at all.
  attribute_condition = "assertion.repository == '${var.github_repository}'"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}
resource "google_service_account" "deploy" {
  account_id   = "${var.name}-gh-deploy"
  display_name = "GitHub Actions deployer"
}
resource "google_service_account_iam_member" "wif" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}
resource "google_project_iam_member" "deploy" {
  for_each = toset(["roles/container.developer", "roles/artifactregistry.writer"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.deploy.email}"
}
output "workload_identity_provider" { value = google_iam_workload_identity_pool_provider.github.name }
output "service_account" { value = google_service_account.deploy.email }
