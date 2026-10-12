# Read by the "AWS jobs" workflow (run now) and shown in its summary. Nothing secret.

output "state_machine_arn" {
  value = aws_sfn_state_machine.nightly.arn
}

output "schedule" {
  value = "${var.schedule_expression} (${var.schedule_timezone})"
}

output "runner_function" {
  value = aws_lambda_function.runner.function_name
}

output "console_url" {
  value = "https://${var.region}.console.aws.amazon.com/states/home?region=${var.region}#/statemachines/view/${aws_sfn_state_machine.nightly.arn}"
}
