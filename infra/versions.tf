terraform {
  required_version = ">= 1.17"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.73"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.8"
    }
  }

  # State is local until the production account is chosen. For a team, move it to
  # an S3 bucket in that account (S3-native locking, no DynamoDB table needed):
  #
  # backend "s3" {
  #   bucket       = "<state-bucket>"
  #   key          = "insure-portal/terraform.tfstate"
  #   region       = "me-central-1"
  #   use_lockfile = true
  #   encrypt      = true
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}
