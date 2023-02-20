terraform {
  backend "s3" {
    bucket = "eventbird-state"
    key    = "eventbird-tf-state"
    region = "eu-west-1"
  }
}

provider "aws" {
  region  = "eu-west-1"
}

variable "github_sha" {
  default = "latest"
  type    = "string"
}

variable "api_token" {
  type = "string"
}

variable "db_url" {
  type = "string"
}

variable "telegram_announce_broadcast_channel" {
  type = "string"
}

variable "telegram_daily_broadcast_channel" {
  type = "string"
}

variable "event_api_token" {
  type = "string"
}

data "aws_vpc" "tekis_vpc" {
  filter {
    name   = "tag:Name"
    values = ["tekis-VPC"]
  }
}

data "aws_subnet_ids" "private_subnet_ids" {
  vpc_id = "${data.aws_vpc.tekis_vpc.id}"
  filter {
    name   = "tag:Name"
    values = ["tekis-private-subnet-1a", "tekis-private-subnet-1b"]
  }
}

data "archive_file" "eventbird_package_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../build"
  output_path = "${path.module}/../eventbird.zip"
  excludes = [
    "eventbird.zip",
    "package.json",
    "yarn.lock",
    "nodemon.json",
    "deploy",
    ".travis",
    ".git",
    "Dockerfile",
    ".gitignore",
    "README.md",
    "scripts",
    ".env",
    ".env.example",
    ".eslint.js"
  ]
}

resource "aws_s3_bucket" "eventbird_package_bucket" {
  bucket = "eventbird-package-bucket"
  acl    = "private"
}


resource "aws_s3_bucket_object" "eventbird_package_object" {
  bucket     = "eventbird-package-bucket"
  key        = "eventbird-package-${var.github_sha}.zip"
  source     = "../eventbird.zip"
  depends_on = ["aws_s3_bucket.eventbird_package_bucket"]
}

resource "aws_security_group" "eventbird_lambda_sg" {
  name   = "eventbird_lambda_sg"
  vpc_id = "${data.aws_vpc.tekis_vpc.id}"
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_cloudwatch_log_group" "eventbird_log_group" {
  name              = "/aws/lambda/eventbird"
  retention_in_days = 14
}
resource "aws_iam_policy" "eventbird_lambda_policy" {
  name = "eventbird_lambda_polivy"
  path = "/"

  policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "ssm:GetParameters",
        "ssm:GetParameter",
        "s3:PutObject",
        "s3:ListBucket",
        "ec2:DescribeNetworkInterfaces",
        "ec2:CreateNetworkInterface",
        "ec2:DeleteNetworkInterface",
        "ec2:DescribeInstances",
        "ec2:AttachNetworkInterface"
      ],
      "Resource": "*",
      "Effect": "Allow"
    }
  ]
}
EOF
}

resource "aws_iam_role" "eventbird_iam_role" {
  name = "eventbird-iam-role"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF
}

resource "aws_iam_role_policy_attachment" "eventbird_lambda_policy_attachment" {
  role       = "${aws_iam_role.eventbird_iam_role.name}"
  policy_arn = "${aws_iam_policy.eventbird_lambda_policy.arn}"
}

resource "aws_lambda_function" "eventbird_lambda" {
  function_name = "eventbird-${var.github_sha}"
  s3_bucket     = "eventbird-package-bucket"
  s3_key        = "eventbird-package-${var.github_sha}.zip"
  handler       = "index.handler"
  role          = "${aws_iam_role.eventbird_iam_role.arn}"
  runtime       = "nodejs12.x"
  timeout       = 5

  environment {
    variables = {
      API_TOKEN                                  = "${var.api_token}"
      TELEGRAM_ANNOUNCEMENT_BROADCAST_CHANNEL_ID = "${var.telegram_announce_broadcast_channel}"
      TELEGRAM_DAILY_BROADCAST_CHANNEL_ID        = "${var.telegram_daily_broadcast_channel}"
      EVENT_API_TOKEN                            = "${var.event_api_token}"
      DATABASE_URL                               = "${var.db_url}"
    }
  }

  vpc_config {
    security_group_ids = ["${aws_security_group.eventbird_lambda_sg.id}"]
    subnet_ids         = "${data.aws_subnet_ids.private_subnet_ids.ids}"
  }

  depends_on = [
    "aws_iam_role_policy_attachment.eventbird_lambda_policy_attachment",
    "aws_cloudwatch_log_group.eventbird_log_group",
    "aws_s3_bucket.eventbird_package_bucket",
    "aws_s3_bucket_object.eventbird_package_object"
  ]
}

resource "aws_cloudwatch_event_rule" "eventbird_poll_events_event" {
  name                = "eventbird-poll-events"
  is_enabled          = true
  schedule_expression = "cron(/15 * * * ? *)"
}

resource "aws_cloudwatch_event_target" "eventbird_poll_events_event_target" {
  target_id = "eventbird_lambda"
  arn       = "${aws_lambda_function.eventbird_lambda.arn}"
  rule      = "${aws_cloudwatch_event_rule.eventbird_poll_events_event.name}"
  input     = <<EOF
{
  "jobMode": "pollEvents"
}
EOF
}

resource "aws_lambda_permission" "eventbird_poll_events_event_permission" {
  statement_id  = "AllowExecutionFromCloudWatchForEventPoll"
  action        = "lambda:InvokeFunction"
  function_name = "${aws_lambda_function.eventbird_lambda.function_name}"
  principal     = "events.amazonaws.com"
  source_arn    = "${aws_cloudwatch_event_rule.eventbird_poll_events_event.arn}"
}

resource "aws_cloudwatch_event_rule" "eventbird_todays_events_event" {
  name                = "eventbird-todays-events"
  is_enabled          = true
  schedule_expression = "cron(0 4 * * ? *)"
}

resource "aws_cloudwatch_event_target" "eventbird_todays_events_event_target" {
  target_id = "eventbird_lambda"
  arn       = "${aws_lambda_function.eventbird_lambda.arn}"
  rule      = "${aws_cloudwatch_event_rule.eventbird_todays_events_event.name}"
  input     = <<EOF
{
  "jobMode": "todaysEvents"
}
EOF
}

resource "aws_lambda_permission" "eventbird_todays_events_event_permission" {
  statement_id  = "AllowExecutionFromCloudWatchForTodaysEvents"
  action        = "lambda:InvokeFunction"
  function_name = "${aws_lambda_function.eventbird_lambda.function_name}"
  principal     = "events.amazonaws.com"
  source_arn    = "${aws_cloudwatch_event_rule.eventbird_todays_events_event.arn}"
}

resource "aws_cloudwatch_event_rule" "eventbird_todays_food_event" {
  name                = "eventbird-todays-food"
  is_enabled          = true
  schedule_expression = "cron(0 7 ? * MON-FRI *)"
}

resource "aws_cloudwatch_event_target" "eventbird_todays_food_event_target" {
  target_id = "eventbird_lambda"
  arn       = "${aws_lambda_function.eventbird_lambda.arn}"
  rule      = "${aws_cloudwatch_event_rule.eventbird_todays_food_event.name}"
  input     = <<EOF
{
  "jobMode": "postFood"
}
EOF
}

resource "aws_lambda_permission" "eventbird_todays_food_event_permissions" {
  statement_id  = "AllowExecutionFromCloudWatchForTodaysFood"
  action        = "lambda:InvokeFunction"
  function_name = "${aws_lambda_function.eventbird_lambda.function_name}"
  principal     = "events.amazonaws.com"
  source_arn    = "${aws_cloudwatch_event_rule.eventbird_todays_food_event.arn}"
}
