variable "name" { type = string }
variable "project_id" { type = string }
variable "region" { type = string }
variable "network" { type = string }
variable "subnetwork" { type = string }
variable "master_cidr" {
  type    = string
  default = "172.16.0.0/28"
}
variable "authorized_cidrs" {
  type    = list(object({ cidr = string, label = string }))
  default = []
}
variable "node_machine_type" {
  type    = string
  default = "e2-standard-4"
}
variable "node_min" {
  type    = number
  default = 1
}
variable "node_max" {
  type    = number
  default = 5
}

resource "google_service_account" "nodes" {
  account_id   = "${var.name}-nodes"
  display_name = "GKE nodes (minimal)"
}
resource "google_project_iam_member" "nodes" {
  for_each = toset(["roles/logging.logWriter", "roles/monitoring.metricWriter", "roles/monitoring.viewer", "roles/artifactregistry.reader"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.nodes.email}"
}

resource "google_container_cluster" "this" {
  name                     = var.name
  location                 = var.region
  network                  = var.network
  subnetwork               = var.subnetwork
  remove_default_node_pool = true
  initial_node_count       = 1
  deletion_protection      = true
  release_channel { channel = "REGULAR" }
  workload_identity_config { workload_pool = "${var.project_id}.svc.id.goog" }
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = var.master_cidr
  }
  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }
  master_authorized_networks_config {
    dynamic "cidr_blocks" {
      for_each = var.authorized_cidrs
      content {
        cidr_block   = cidr_blocks.value.cidr
        display_name = cidr_blocks.value.label
      }
    }
  }
  network_policy { enabled = false }
  datapath_provider = "ADVANCED_DATAPATH" # Dataplane V2 enforces NetworkPolicy
  binary_authorization { evaluation_mode = "PROJECT_SINGLETON_POLICY_ENFORCE" }
  logging_config { enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"] }
}
resource "google_container_node_pool" "default" {
  name     = "default"
  cluster  = google_container_cluster.this.id
  location = var.region
  autoscaling {
    min_node_count = var.node_min
    max_node_count = var.node_max
  }
  management {
    auto_repair  = true
    auto_upgrade = true
  }
  node_config {
    machine_type    = var.node_machine_type
    service_account = google_service_account.nodes.email
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]
    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }
    workload_metadata_config { mode = "GKE_METADATA" }
  }
}
output "cluster_name" { value = google_container_cluster.this.name }
output "cluster_id" { value = google_container_cluster.this.id }
