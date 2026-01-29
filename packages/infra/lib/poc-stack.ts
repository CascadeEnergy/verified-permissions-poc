import * as cdk from "aws-cdk-lib";
import * as verifiedpermissions from "aws-cdk-lib/aws-verifiedpermissions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigatewayv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as iam from "aws-cdk-lib/aws-iam";
import * as fs from "fs";
import * as path from "path";
import { Construct } from "constructs";

export class PocStack extends cdk.Stack {
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

    policyFiles.forEach((file, index) => {
      const content = fs.readFileSync(path.join(policiesDir, file), "utf-8");
      new verifiedpermissions.CfnPolicy(this, `Policy${index}`, {
        policyStoreId: policyStore.attrPolicyStoreId,
        definition: {
          static: {
            statement: content,
            description: file,
          },
        },
      });
    });

    // Permissions API Lambda
    const permissionsLambda = new lambdaNodejs.NodejsFunction(this, "PermissionsApi", {
      entry: path.join(__dirname, "../../lambdas/permissions-api/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        POLICY_STORE_ID: policyStore.attrPolicyStoreId,
      },
      timeout: cdk.Duration.seconds(30),
      bundling: {
        externalModules: ["@aws-sdk/*"],
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

    // Outputs
    new cdk.CfnOutput(this, "ApiUrl", {
      value: httpApi.url!,
      description: "API Gateway URL",
    });

    new cdk.CfnOutput(this, "PolicyStoreId", {
      value: policyStore.attrPolicyStoreId,
      description: "Verified Permissions Policy Store ID",
    });
  }
}
