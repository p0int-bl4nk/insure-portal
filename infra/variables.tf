variable "project" {
  description = "Name prefix for all resources."
  type        = string
  default     = "insure-portal"
}

variable "region" {
  description = "Region for everything except CloudFront (global). UAE region by default."
  type        = string
  default     = "me-central-1"
}

variable "spreadsheet_id" {
  description = "Google Sheet the Lambda appends leads to (the long ID in the sheet URL)."
  type        = string
}

variable "domain_name" {
  description = "Optional custom domain for the site. Requires certificate_arn."
  type        = string
  default     = null
}

variable "certificate_arn" {
  description = "ACM certificate for domain_name. CloudFront requires it to be in us-east-1."
  type        = string
  default     = null

  validation {
    condition     = var.certificate_arn == null || can(regex("^arn:aws:acm:us-east-1:", var.certificate_arn))
    error_message = "CloudFront certificates must be issued in us-east-1."
  }
}

variable "reserved_concurrency" {
  description = "Max concurrent Lambda executions. Caps cost and Google Sheets quota use during a flood."
  type        = number
  default     = 5
}

variable "throttle_rate_limit" {
  description = "API-wide steady-state requests per second (not per IP: there is no WAF)."
  type        = number
  default     = 5
}

variable "throttle_burst_limit" {
  description = "API-wide burst size."
  type        = number
  default     = 10
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the Lambda."
  type        = number
  default     = 30
}
