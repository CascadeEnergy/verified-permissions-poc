#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PocStack } from "../lib/poc-stack";

const app = new cdk.App();

new PocStack(app, "GazeboPocStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-west-2",
  },
  description: "Gazebo Verified Permissions POC",
});

app.synth();
