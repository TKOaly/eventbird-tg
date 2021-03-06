#!/bin/bash
pip install awscli
export PATH=$PATH:$HOME/.local/bin
echo "Logging into AWS ECR..."
eval $(aws ecr get-login --region eu-west-1 --no-include-email)
echo "Pushing container image to AWS ECR"
docker build . -t eventbird-tg
docker tag eventbird-tg:latest $AWS_ECR_URL:latest
docker push $AWS_ECR_URL:latest