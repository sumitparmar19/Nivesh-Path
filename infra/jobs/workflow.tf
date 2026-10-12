# The nightly workflow (Step Functions, standard) and its weekday schedule (EventBridge Scheduler, New York time).
#   ListHeldTickers -> SnapshotEachTicker (Map, 2 at a time, 2 s pause each, retries with backoff; one stock's
#   failure is recorded and the rest continue) -> ConcentrationCheck -> any snapshot failed? email + Fail : Succeed.
# Any other failure (web down after retries, token rejected) emails the alert topic and ends the run as failed.

locals {
  invoke = "arn:${local.partition}:states:::lambda:invoke"

  # WebUnavailable (5xx, timeouts, network) and Lambda service hiccups are retried; TokenRejected and BadInput aren't.
  retry = [{
    ErrorEquals     = ["WebUnavailable", "Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException", "States.Timeout"]
    IntervalSeconds = 10
    MaxAttempts     = 4
    BackoffRate     = 2
    JitterStrategy  = "FULL"
  }]
  catch_all = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "NotifyFailure" }]

  definition = {
    Comment        = "Nivesh-Path nightly job: daily closes for held stocks, then the overconcentration check for every user."
    TimeoutSeconds = 1800
    StartAt        = "ListHeldTickers"
    States = {
      ListHeldTickers = {
        Type           = "Task"
        Resource       = local.invoke
        Parameters     = { FunctionName = aws_lambda_function.runner.arn, Payload = { action = "list" } }
        ResultSelector = { "symbols.$" = "$.Payload.symbols" }
        ResultPath     = "$.held"
        Retry          = local.retry
        Catch          = local.catch_all
        Next           = "SnapshotEachTicker"
      }
      SnapshotEachTicker = {
        Type           = "Map"
        ItemsPath      = "$.held.symbols"
        MaxConcurrency = var.snapshot_concurrency
        ItemSelector   = { "symbol.$" = "$$.Map.Item.Value" }
        ItemProcessor = {
          ProcessorConfig = { Mode = "INLINE" }
          StartAt         = "SaveClose"
          States = {
            SaveClose = {
              Type           = "Task"
              Resource       = local.invoke
              Parameters     = { FunctionName = aws_lambda_function.runner.arn, Payload = { action = "snapshot", "symbol.$" = "$.symbol" } }
              ResultSelector = { "symbol.$" = "$.Payload.symbol", "saved.$" = "$.Payload.saved", failed = false }
              Retry          = local.retry
              Catch          = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "SnapshotFailed" }]
              Next           = "Pace"
            }
            # Keeps the job under Finnhub's 60 calls a minute: at most snapshot_concurrency calls per ~2 s.
            Pace = { Type = "Wait", Seconds = 2, End = true }
            SnapshotFailed = {
              Type       = "Pass"
              Parameters = { "symbol.$" = "$.symbol", failed = true, "error.$" = "$.error.Error" }
              End        = true
            }
          }
        }
        ResultPath = "$.snapshots"
        Catch      = local.catch_all
        Next       = "ConcentrationCheck"
      }
      ConcentrationCheck = {
        Type           = "Task"
        Resource       = local.invoke
        Parameters     = { FunctionName = aws_lambda_function.runner.arn, Payload = { action = "concentration" } }
        ResultSelector = { "result.$" = "$.Payload" }
        ResultPath     = "$.concentration"
        Retry          = local.retry
        Catch          = local.catch_all
        Next           = "ListFailedSnapshots"
      }
      ListFailedSnapshots = {
        Type       = "Pass"
        Parameters = { "symbols.$" = "$.snapshots[?(@.failed == true)].symbol" }
        ResultPath = "$.failedSnapshots"
        Next       = "CountFailedSnapshots"
      }
      CountFailedSnapshots = {
        Type       = "Pass"
        Parameters = { "count.$" = "States.ArrayLength($.failedSnapshots.symbols)" }
        ResultPath = "$.failedCount"
        Next       = "AnySnapshotFailed"
      }
      AnySnapshotFailed = {
        Type    = "Choice"
        Choices = [{ Variable = "$.failedCount.count", NumericGreaterThan = 0, Next = "NotifyPartial" }]
        Default = "Done"
      }
      NotifyPartial = {
        Type     = "Task"
        Resource = "arn:${local.partition}:states:::sns:publish"
        Parameters = {
          TopicArn    = data.aws_sns_topic.alerts.arn
          Subject     = "Nivesh-Path nightly job: some closes were not saved"
          "Message.$" = "States.Format('The nightly job ran at {}, but these stocks have no close for today: {}. The overconcentration check still ran. Rule v3 falls back to Finnhub for them.', $$.Execution.StartTime, States.JsonToString($.failedSnapshots.symbols))"
        }
        ResultPath = null
        Next       = "PartlyFailed"
      }
      PartlyFailed = { Type = "Fail", Error = "SomeSnapshotsFailed", Cause = "See the email or the Map step's output." }
      NotifyFailure = {
        Type     = "Task"
        Resource = "arn:${local.partition}:states:::sns:publish"
        Parameters = {
          TopicArn    = data.aws_sns_topic.alerts.arn
          Subject     = "Nivesh-Path nightly job failed"
          "Message.$" = "States.Format('The nightly job started at {} failed. Error: {}. Cause: {}', $$.Execution.StartTime, $.error.Error, $.error.Cause)"
        }
        ResultPath = null
        Next       = "Failed"
      }
      Failed = { Type = "Fail", Error = "NightlyJobFailed", Cause = "See the email or the execution history." }
      Done   = { Type = "Succeed" }
    }
  }
}

resource "aws_cloudwatch_log_group" "workflow" {
  #checkov:skip=CKV_AWS_158:CloudWatch encrypts logs by default; a customer-managed KMS key adds cost. Execution data isn't logged.
  #checkov:skip=CKV_AWS_338:14 days is enough to debug a nightly job.
  name              = "/${local.name}/state-machine"
  retention_in_days = 14
}

data "aws_iam_policy_document" "states_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "workflow" {
  name                 = "${local.name}-workflow"
  description          = "Nightly job state machine: invoke the runner Lambda, email failures, write its error log."
  assume_role_policy   = data.aws_iam_policy_document.states_trust.json
  permissions_boundary = local.boundary_arn
}

data "aws_iam_policy_document" "workflow" {
  statement {
    sid       = "InvokeRunner"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.runner.arn, "${aws_lambda_function.runner.arn}:*"]
  }

  statement {
    sid       = "EmailFailures"
    actions   = ["sns:Publish"]
    resources = [data.aws_sns_topic.alerts.arn]
  }

  # Step Functions log delivery: these actions only accept "*".
  statement {
    sid = "LogDelivery"
    actions = [
      "logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery", "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries", "logs:PutResourcePolicy", "logs:DescribeResourcePolicies", "logs:DescribeLogGroups",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "workflow" {
  #checkov:skip=CKV_AWS_290:Step Functions log-delivery actions only accept "*" (the role's boundary caps them too).
  #checkov:skip=CKV_AWS_355:Same: log-delivery actions are not resource-scoped.
  name   = "invoke-email-log"
  role   = aws_iam_role.workflow.id
  policy = data.aws_iam_policy_document.workflow.json
}

resource "aws_sfn_state_machine" "nightly" {
  #checkov:skip=CKV_AWS_284:X-Ray tracing adds cost for a once-a-day job; the execution history shows every step.
  #checkov:skip=CKV_AWS_285:Logging is on (level ERROR) to the log group above; execution data is left out on purpose.
  name       = "${local.name}-nightly"
  type       = "STANDARD"
  role_arn   = aws_iam_role.workflow.arn
  definition = jsonencode(local.definition)

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.workflow.arn}:*"
    include_execution_data = false
    level                  = "ERROR"
  }

  depends_on = [aws_iam_role_policy.workflow]
}

data "aws_iam_policy_document" "scheduler_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name                 = "${local.name}-scheduler"
  description          = "Weekday schedule: start the nightly state machine, nothing else."
  assume_role_policy   = data.aws_iam_policy_document.scheduler_trust.json
  permissions_boundary = local.boundary_arn
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    actions   = ["states:StartExecution"]
    resources = [aws_sfn_state_machine.nightly.arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "start-nightly"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

resource "aws_scheduler_schedule" "nightly" {
  #checkov:skip=CKV_AWS_297:The schedule's only payload is {"source":"schedule"}; AWS-owned encryption is enough, and a customer-managed key adds $1/month.
  name                         = "${local.name}-nightly"
  description                  = "Weekdays after the US market close: daily closes + overconcentration check."
  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.schedule_timezone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_sfn_state_machine.nightly.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ source = "schedule" })

    retry_policy {
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }
  }
}

# A run that hits the 30-minute limit never reaches its own failure email, so CloudWatch watches for that case.
resource "aws_cloudwatch_metric_alarm" "timed_out" {
  alarm_name          = "${local.name}-timed-out"
  alarm_description   = "The nightly job ran past 30 minutes and was stopped."
  namespace           = "AWS/States"
  metric_name         = "ExecutionsTimedOut"
  dimensions          = { StateMachineArn = aws_sfn_state_machine.nightly.arn }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
}
