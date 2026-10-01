variable "name" { type = string }
variable "github_repository" {
  type        = string
  description = "owner/repo"
}
variable "environment" {
  type        = string
  description = "GitHub environment allowed to assume the role"
}
variable "cluster_arn" { type = string }
variable "create_provider" {
  type        = bool
  default     = true
  description = "false if the account already has the GitHub OIDC provider"
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}
data "aws_iam_openid_connect_provider" "existing" {
  count = var.create_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}
locals { provider_arn = var.create_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.existing[0].arn }

# Trust is pinned to ONE repository and ONE GitHub environment. No long-lived keys exist.
data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:${var.environment}"]
    }
  }
}
resource "aws_iam_role" "deploy" {
  name                 = "${var.name}-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = 3600
}
data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "DescribeOneCluster"
    actions   = ["eks:DescribeCluster"]
    resources = [var.cluster_arn]
  }
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid       = "EcrPushOwnRepos"
    actions   = ["ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage"]
    resources = ["arn:aws:ecr:*:*:repository/pnc-risk-console-*"]
  }
}
resource "aws_iam_role_policy" "deploy" {
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
output "role_arn" { value = aws_iam_role.deploy.arn }
