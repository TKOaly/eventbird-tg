# tkoalybot

Telegram bot for TKO-äly related things.

## 5 steps to contributing

1. Create your own bot using BotFather. Go to the Telegram API pages for more info.
2. Install postgresql and create a database. You can also use `docker-compose -f local-psql.yml up -d`, and connect via adminer to manage the database http://localhost:8080 (default username is postgres and password example).
3. Run `cp .env.example .env` and fill in the variables is `.env`
4. Run `npm run knex:migrate`
5. Run `JOB_MODE=todaysEvents|todaysFood|pollEvents npm run watch`

## Infrastructure

Trvis CI builds and pushes new versions of the app when pushed to master branch. The app is a lambda function which is being executed by CloudWatch Events.

The infrastructure definition can be found in [main.tf](/deploy/main.tf). You need access to TKO-äly's AWS account and a configured aws-cli to deploy it.

Deployment:

1. Run `terraform plan` and review your changes.
2. Run `terraform apply` which deploys the infrastructure to AWS.
