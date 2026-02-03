import * as cdk from "aws-cdk-lib";
import * as pipelines from "aws-cdk-lib/pipelines";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { PocStack } from "./poc-stack";

interface PipelineStackProps extends cdk.StackProps {
  repoOwner: string;
  repoName: string;
  branch?: string;
}

/**
 * Stage that deploys the POC application
 */
class PocStage extends cdk.Stage {
  public readonly apiUrl: cdk.CfnOutput;
  public readonly websiteUrl: cdk.CfnOutput;
  public readonly bucketName: cdk.CfnOutput;
  public readonly distributionId: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    const stack = new PocStack(this, "GazeboPocStack", {
      description: "Gazebo Verified Permissions POC",
    });

    // Expose outputs for use in pipeline steps
    this.apiUrl = stack.apiUrlOutput;
    this.websiteUrl = stack.websiteUrlOutput;
    this.bucketName = stack.bucketNameOutput;
    this.distributionId = stack.distributionIdOutput;
  }
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { repoOwner, repoName, branch = "main" } = props;

    // Self-mutating pipeline using CDK Pipelines
    const pipeline = new pipelines.CodePipeline(this, "Pipeline", {
      pipelineName: "gazebo-poc-pipeline",
      synth: new pipelines.ShellStep("Synth", {
        input: pipelines.CodePipelineSource.gitHub(`${repoOwner}/${repoName}`, branch, {
          authentication: cdk.SecretValue.secretsManager("CascadeEnergy"),
        }),
        installCommands: [
          "n 20",  // Use Node 20
        ],
        commands: [
          "cd packages/infra",
          "npm ci",
          "npx cdk synth",
        ],
        primaryOutputDirectory: "packages/infra/cdk.out",
      }),
      dockerEnabledForSynth: false,
    });

    // Add deployment stage
    const deploy = new PocStage(this, "Deploy", {
      env: {
        account: this.account,
        region: this.region,
      },
    });

    const deployStage = pipeline.addStage(deploy);

    // Deploy frontend - needs IAM permissions for S3 and CloudFront
    const deployFrontendStep = new pipelines.CodeBuildStep("DeployFrontend", {
      envFromCfnOutputs: {
        API_URL: deploy.apiUrl,
        BUCKET_NAME: deploy.bucketName,
        DISTRIBUTION_ID: deploy.distributionId,
      },
      installCommands: [
        "n 20",  // Use Node 20
      ],
      commands: [
        "cd packages/frontend",
        "npm ci",
        "echo \"VITE_API_URL=$API_URL\" > .env.production",
        "npm run build",
        "aws s3 sync dist s3://$BUCKET_NAME --delete",
        "aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths '/*'",
      ],
      rolePolicyStatements: [
        new iam.PolicyStatement({
          actions: [
            "s3:ListBucket",
            "s3:GetBucketLocation",
          ],
          resources: [`arn:aws:s3:::gazebo-poc-frontend-${this.account}-${this.region}`],
        }),
        new iam.PolicyStatement({
          actions: [
            "s3:PutObject",
            "s3:GetObject",
            "s3:DeleteObject",
          ],
          resources: [`arn:aws:s3:::gazebo-poc-frontend-${this.account}-${this.region}/*`],
        }),
        new iam.PolicyStatement({
          actions: [
            "cloudfront:CreateInvalidation",
          ],
          resources: ["*"],
        }),
      ],
    });

    // Run Cypress E2E tests against the deployed UI
    const testStep = new pipelines.ShellStep("E2ETests", {
      envFromCfnOutputs: {
        API_URL: deploy.apiUrl,
        WEBSITE_URL: deploy.websiteUrl,
      },
      installCommands: [
        "n 20",  // Use Node 20
      ],
      commands: [
        "cd packages/frontend",
        "npm ci",
        // Create cypress.env.json with URLs
        "echo '{\"API_URL\": \"'$API_URL'\", \"WEBSITE_URL\": \"'$WEBSITE_URL'\"}' > cypress.env.json",
        // Run Cypress tests against the deployed UI
        "npx cypress run --browser chrome --config baseUrl=$WEBSITE_URL",
      ],
    });

    // Deploy frontend first, then run E2E tests
    testStep.addStepDependency(deployFrontendStep);
    deployStage.addPost(deployFrontendStep, testStep);
  }
}
