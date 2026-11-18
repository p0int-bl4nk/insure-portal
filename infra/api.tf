# Lead submission API: HTTP API -> Lambda -> Google Sheets.

locals {
  function_name = "${var.project}-submit-lead"
}

# Holds {"googleServiceAccount": {...}, "turnstileSecretKey": "..."}. Terraform only
# creates the container; set the value outside Terraform so it never lands in state:
#   aws secretsmanager put-secret-value --secret-id <app_secret_arn> --secret-string file://secret.json
resource "aws_secretsmanager_secret" "app" {
  name_prefix = "${var.project}/app-"
  description = "${var.project}: Google service-account key and Turnstile secret"
}

resource "aws_cloudwatch_log_group" "submit_lead" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "submit_lead" {
  name_prefix        = "${var.project}-submit-lead-"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "submit_lead" {
  statement {
    sid       = "WriteLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.submit_lead.arn}:*"]
  }

  statement {
    sid       = "ReadAppSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app.arn]
  }
}

resource "aws_iam_role_policy" "submit_lead" {
  role   = aws_iam_role.submit_lead.id
  policy = data.aws_iam_policy_document.submit_lead.json
}

# Built by `pnpm --filter @insure/api build` (esbuild bundle in apps/api/dist).
data "archive_file" "submit_lead" {
  type        = "zip"
  source_dir  = "${path.module}/../apps/api/dist"
  output_path = "${path.module}/.build/submit-lead.zip"
}

resource "aws_lambda_function" "submit_lead" {
  function_name    = local.function_name
  role             = aws_iam_role.submit_lead.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.submit_lead.output_path
  source_code_hash = data.archive_file.submit_lead.output_base64sha256
  memory_size      = 512
  timeout          = 15

  reserved_concurrent_executions = var.reserved_concurrency

  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.submit_lead.name
  }

  environment {
    variables = {
      APP_SECRET_ID     = aws_secretsmanager_secret.app.arn
      SPREADSHEET_ID    = var.spreadsheet_id
      SHEET_LEADS_TAB   = "Leads"
      SHEET_MEMBERS_TAB = "Members"
      NODE_OPTIONS      = "--enable-source-maps"
    }
  }

  depends_on = [aws_iam_role_policy.submit_lead]
}

resource "aws_apigatewayv2_api" "this" {
  name          = var.project
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "submit_lead" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.submit_lead.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "submit_lead" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "POST /api/lead"
  target    = "integrations/${aws_apigatewayv2_integration.submit_lead.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.throttle_rate_limit
    throttling_burst_limit = var.throttle_burst_limit
  }
}

resource "aws_lambda_permission" "api_invoke" {
  statement_id  = "AllowHttpApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.submit_lead.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

# Alarms show in the CloudWatch console only (no notifications configured).
resource "aws_cloudwatch_metric_alarm" "submission_spike" {
  alarm_name          = "${local.function_name}-submission-spike"
  alarm_description   = "More than 500 lead submissions in an hour"
  namespace           = "AWS/Lambda"
  metric_name         = "Invocations"
  dimensions          = { FunctionName = aws_lambda_function.submit_lead.function_name }
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 500
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "submit_errors" {
  alarm_name          = "${local.function_name}-errors"
  alarm_description   = "Lead Lambda errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.submit_lead.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}
