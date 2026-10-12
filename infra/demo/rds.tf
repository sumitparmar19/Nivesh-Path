# The demo's Postgres ledger: small, encrypted, private (no public address, reachable only from web tasks).
# Nobody types its password: RDS generates it and keeps it in Secrets Manager (manage_master_user_password), and
# ECS hands it to the containers as DB_USER/DB_PASSWORD. Built to be destroyed: no final snapshot, no deletion
# protection, 1 day of backups - it holds only demo data, and the live ledger is Neon (docs/AWS.md).

resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "ledger" {
  #checkov:skip=CKV_AWS_157:Single-AZ: a demo database that is destroyed after use; Multi-AZ doubles the price.
  #checkov:skip=CKV_AWS_161:The app connects with the RDS-managed password over TLS; IAM auth would need token refresh in Prisma.
  #checkov:skip=CKV_AWS_118:Enhanced monitoring adds cost; CloudWatch basic metrics (CPU, connections) are on the dashboard and alarmed.
  #checkov:skip=CKV_AWS_129:Postgres log export costs per GB; the app logs every query error itself.
  #checkov:skip=CKV_AWS_293:Deletion protection is off on purpose: the demo workflow destroys this stack after each demo.
  #checkov:skip=CKV_AWS_354:Performance Insights is off (cost), so there is nothing to encrypt with a customer key.
  #checkov:skip=CKV_AWS_353:Performance Insights is off; CPU and connections are on the dashboard and CPU is alarmed.
  #checkov:skip=CKV2_AWS_30:Query logging costs per GB for a short-lived demo database.
  identifier     = "${local.name}-ledger"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name                     = "nivesh"
  username                    = "nivesh"
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period    = 1
  skip_final_snapshot        = true
  deletion_protection        = false
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true
  apply_immediately          = true

  performance_insights_enabled = false
}
