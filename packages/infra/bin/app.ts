#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PocStack } from "../lib/poc-stack";
import { PipelineStack } from "../lib/pipeline-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-west-2",
};

// Main POC stack (for standalone deployment without pipeline)
new PocStack(app, "GazeboPocStack", {
  env,
  description: "Gazebo Verified Permissions POC",
});

// Pipeline stack - self-mutating pipeline that deploys the POC stack
// Deploy with: npx cdk deploy GazeboPocPipeline -c repoOwner=... -c repoName=...
const repoOwner = app.node.tryGetContext("repoOwner");
const repoName = app.node.tryGetContext("repoName");

if (repoOwner && repoName) {
  new PipelineStack(app, "GazeboPocPipeline", {
    env,
    description: "CI/CD Pipeline for Gazebo Verified Permissions POC",
    repoOwner,
    repoName,
    branch: app.node.tryGetContext("branch") || "main",
  });
}

app.synth();
