import * as cdk from "aws-cdk-lib";
import * as verifiedpermissions from "aws-cdk-lib/aws-verifiedpermissions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigatewayv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as fs from "fs";
import * as path from "path";
import { Construct } from "constructs";

export class PocStack extends cdk.Stack {
  public readonly apiUrlOutput: cdk.CfnOutput;
  public readonly websiteUrlOutput: cdk.CfnOutput;
  public readonly bucketNameOutput: cdk.CfnOutput;
  public readonly distributionIdOutput: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Load Cedar schema
    const schemaPath = path.join(__dirname, "../../../authorization/schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

    // Create Policy Store
    const policyStore = new verifiedpermissions.CfnPolicyStore(this, "PolicyStore", {
      validationSettings: { mode: "STRICT" },
      schema: { cedarJson: JSON.stringify(schema) },
      description: "Gazebo POC Policy Store",
    });

    // Load and create Cedar policies
    const policiesDir = path.join(__dirname, "../../../authorization/policies");
    const policyFiles = fs.readdirSync(policiesDir).filter((f) => f.endsWith(".cedar"));

    policyFiles.forEach((file) => {
      const content = fs.readFileSync(path.join(policiesDir, file), "utf-8");
      // Use filename (without extension) as logical ID for stable updates
      const logicalId = "Policy" + file.replace(".cedar", "").replace(/-/g, "");
      new verifiedpermissions.CfnPolicy(this, logicalId, {
        policyStoreId: policyStore.attrPolicyStoreId,
        definition: {
          static: {
            statement: content,
            description: file,
          },
        },
      });
    });

    // Create policy templates for scoped roles
    // Templates define permission LEVELS - they can be applied to any resource (Site, Region, Organization, etc.)
    // Role hierarchy (lowest to highest): Viewer < Contributor < Champion < Facilitator < Coordinator < Administrator

    const viewerTemplate = new verifiedpermissions.CfnPolicyTemplate(this, "ViewerTemplate", {
      policyStoreId: policyStore.attrPolicyStoreId,
      statement: `permit(
  principal == ?principal,
  action == Gazebo::Action::"View",
  resource in ?resource
);`,
      description: "Viewer (Evaluator, Program Sponsor): View and export data only",
    });

    const contributorTemplate = new verifiedpermissions.CfnPolicyTemplate(this, "ContributorTemplate", {
      policyStoreId: policyStore.attrPolicyStoreId,
      statement: `permit(
  principal == ?principal,
  action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
  resource in ?resource
);`,
      description: "Contributor (Energy Team Member): View + add data, edit projects/resources/markers",
    });

    const championTemplate = new verifiedpermissions.CfnPolicyTemplate(this, "ChampionTemplate", {
      policyStoreId: policyStore.attrPolicyStoreId,
      statement: `permit(
  principal == ?principal,
  action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create"],
  resource in ?resource
);`,
      description: "Champion (Energy Champion): Contributor + edit models, manage savings claims",
    });

    const facilitatorTemplate = new verifiedpermissions.CfnPolicyTemplate(this, "FacilitatorTemplate", {
      policyStoreId: policyStore.attrPolicyStoreId,
      statement: `permit(
  principal == ?principal,
  action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create"],
  resource in ?resource
);`,
      description: "Facilitator (Technical Lead, Coach): Champion + import projects, overwrite data, share views",
    });

    const coordinatorTemplate = new verifiedpermissions.CfnPolicyTemplate(this, "CoordinatorTemplate", {
      policyStoreId: policyStore.attrPolicyStoreId,
      statement: `permit(
  principal == ?principal,
  action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create", Gazebo::Action::"Delete"],
  resource in ?resource
);`,
      description: "Coordinator (Lead Coach, Program Specialist): Facilitator + manage users, sites, data streams, groups",
    });

    const administratorTemplate = new verifiedpermissions.CfnPolicyTemplate(this, "AdministratorTemplate", {
      policyStoreId: policyStore.attrPolicyStoreId,
      statement: `permit(
  principal == ?principal,
  action,
  resource in ?resource
);`,
      description: "Administrator (Cascade only): Full admin access to all features",
    });

    // Permissions API Lambda
    const permissionsLambda = new lambdaNodejs.NodejsFunction(this, "PermissionsApi", {
      entry: path.join(__dirname, "../../lambdas/permissions-api/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        POLICY_STORE_ID: policyStore.attrPolicyStoreId,
        TEMPLATE_VIEWER: viewerTemplate.attrPolicyTemplateId,
        TEMPLATE_CONTRIBUTOR: contributorTemplate.attrPolicyTemplateId,
        TEMPLATE_CHAMPION: championTemplate.attrPolicyTemplateId,
        TEMPLATE_COORDINATOR: coordinatorTemplate.attrPolicyTemplateId,
        TEMPLATE_FACILITATOR: facilitatorTemplate.attrPolicyTemplateId,
        TEMPLATE_ADMINISTRATOR: administratorTemplate.attrPolicyTemplateId,
      },
      timeout: cdk.Duration.seconds(30),
      bundling: {
        externalModules: ["@aws-sdk/*"],
        forceDockerBundling: false,
      },
    });

    // Authorize API Lambda
    const authorizeLambda = new lambdaNodejs.NodejsFunction(this, "AuthorizeApi", {
      entry: path.join(__dirname, "../../lambdas/authorize-api/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        POLICY_STORE_ID: policyStore.attrPolicyStoreId,
      },
      timeout: cdk.Duration.seconds(30),
      bundling: {
        externalModules: ["@aws-sdk/*"],
        forceDockerBundling: false,
      },
    });

    // Grant Verified Permissions access
    const avpPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "verifiedpermissions:IsAuthorized",
        "verifiedpermissions:BatchIsAuthorized",
        "verifiedpermissions:CreatePolicy",
        "verifiedpermissions:DeletePolicy",
        "verifiedpermissions:ListPolicies",
        "verifiedpermissions:GetPolicy",
        "verifiedpermissions:GetPolicyTemplate",
        "verifiedpermissions:ListPolicyTemplates",
      ],
      resources: [policyStore.attrArn, `${policyStore.attrArn}/*`],
    });

    permissionsLambda.addToRolePolicy(avpPolicy);
    authorizeLambda.addToRolePolicy(avpPolicy);

    // HTTP API
    const httpApi = new apigatewayv2.HttpApi(this, "HttpApi", {
      apiName: "gazebo-poc-api",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigatewayv2.CorsHttpMethod.ANY],
        allowHeaders: ["*"],
      },
    });

    // Permissions routes
    httpApi.addRoutes({
      path: "/permissions/assign",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        "PermissionsAssignIntegration",
        permissionsLambda
      ),
    });

    httpApi.addRoutes({
      path: "/permissions/assign/{policyId}",
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        "PermissionsDeleteIntegration",
        permissionsLambda
      ),
    });

    httpApi.addRoutes({
      path: "/permissions/list",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        "PermissionsListIntegration",
        permissionsLambda
      ),
    });

    // Authorize routes
    httpApi.addRoutes({
      path: "/authorize",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        "AuthorizeIntegration",
        authorizeLambda
      ),
    });

    httpApi.addRoutes({
      path: "/authorize/batch",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        "AuthorizeBatchIntegration",
        authorizeLambda
      ),
    });

    // S3 bucket for frontend
    const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      bucketName: `gazebo-poc-frontend-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    // Outputs
    this.apiUrlOutput = new cdk.CfnOutput(this, "ApiUrl", {
      value: httpApi.url!,
      description: "API Gateway URL",
    });

    new cdk.CfnOutput(this, "PolicyStoreId", {
      value: policyStore.attrPolicyStoreId,
      description: "Verified Permissions Policy Store ID",
    });

    this.bucketNameOutput = new cdk.CfnOutput(this, "WebsiteBucketName", {
      value: websiteBucket.bucketName,
      description: "S3 bucket for frontend",
    });

    this.websiteUrlOutput = new cdk.CfnOutput(this, "WebsiteUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "CloudFront URL for frontend",
    });

    this.distributionIdOutput = new cdk.CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
      description: "CloudFront Distribution ID",
    });
  }
}
