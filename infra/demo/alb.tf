# Application Load Balancer in the public subnets: the only way in from the internet. HTTP on port 80, or, when
# certificate_arn is set (an issued ACM certificate for aws.<domain>), HTTPS on 443 with 80 redirecting to it.
# idle_timeout is above the app's 120 s AI timeout, so a slow Advisor answer isn't cut off at the default 60 s.

resource "aws_lb" "main" {
  #checkov:skip=CKV_AWS_91:Access logs need a log bucket; the ALB metrics and the app's own request logs cover the demo.
  #checkov:skip=CKV_AWS_150:Deletion protection is off on purpose: the stack is destroyed after each demo.
  #checkov:skip=CKV2_AWS_28:WAF costs at least $5/month plus per rule; the app has its own rate limits on the expensive routes.
  #checkov:skip=CKV2_AWS_20:HTTP is redirected to HTTPS whenever a certificate is configured; without a domain there is no certificate (docs/AWS.md).
  name                       = local.name
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = aws_subnet.public[*].id
  drop_invalid_header_fields = true
  idle_timeout               = 130
}

resource "aws_lb_target_group" "web" {
  #checkov:skip=CKV_AWS_378:TLS ends at the load balancer; ALB -> task traffic stays inside the VPC on a security-group-restricted port.
  name                 = "${local.name}-web"
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 15

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "http" {
  #checkov:skip=CKV_AWS_2:HTTP only until a certificate exists; with certificate_arn set, this listener only redirects to HTTPS.
  #checkov:skip=CKV_AWS_103:TLS policy applies to the HTTPS listener (TLS 1.2+); this one is plain HTTP by design.
  #checkov:skip=CKV2_AWS_20:Redirects to HTTPS whenever a certificate is configured.
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = local.https ? "redirect" : "forward"
    target_group_arn = local.https ? null : aws_lb_target_group.web.arn

    dynamic "redirect" {
      for_each = local.https ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = local.https ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}
