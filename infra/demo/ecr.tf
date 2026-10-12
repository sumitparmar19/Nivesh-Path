# One image repository per service. Tags are the git commit (immutable, so a tag always means the same code);
# the newest 10 images are kept. force_delete lets `terraform destroy` remove repositories that still hold images.

locals {
  services = ["web", "ai"]
}

resource "aws_ecr_repository" "app" {
  #checkov:skip=CKV_AWS_136:AES-256 encryption at rest (ECR default); a customer-managed KMS key adds cost for public code.
  for_each             = toset(local.services)
  name                 = "${local.name}/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "keep_last_10" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the newest 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
