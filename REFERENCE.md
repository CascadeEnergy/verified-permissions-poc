# AWS Verified Permissions - Reference Guide

Generic integration patterns and examples for AWS Verified Permissions.

> **Related Documents:**
> - [PLAN.md](./PLAN.md) - Migration plan and strategy
> - [POC.md](./POC.md) - Proof of concept implementation

---

## 1. Best Practices for Storing Cedar Policies

### Pattern A: Centralized (Enterprises)

```
organization-policies/
├── shared/
│   ├── base-policies.cedar
│   └── schema.json
├── domains/
│   ├── payments/policies.cedar
│   └── user-management/policies.cedar
└── environments/
    ├── dev.ts
    └── prod.ts
```

**Pros:** Single source of truth, easier audit, consistent enforcement
**Cons:** Can become bottleneck, requires cross-team coordination

### Pattern B: Per-Service (Microservices)

```
my-service/
├── src/
├── infrastructure/cdk/
└── authorization/
    ├── policies/
    ├── schema.json
    └── tests/
```

**Pros:** Service teams own policies, faster iteration
**Cons:** Risk of inconsistency, harder to audit

### Pattern C: Hybrid (Recommended)

Central repo for shared schema + individual service repos for service-specific policies.

### Deployment Best Practices

1. **Infrastructure as Code** - Use AWS CDK
2. **GitOps** - Policies in Git, CI/CD deploys
3. **Policy Testing** - Test before deployment
4. **Versioning** - Tag versions, enable rollback
5. **Separate Environments** - Never share Policy Stores across environments

---

## 2. API Gateway + Lambda Authorizer

### Architecture

```
Client → API Gateway → Lambda Authorizer → Backend Lambda
                            ↓
                    Verified Permissions
```

### Lambda Authorizer

```typescript
import {
  VerifiedPermissionsClient,
  IsAuthorizedCommand,
} from "@aws-sdk/client-verifiedpermissions";

const client = new VerifiedPermissionsClient({ region: "us-east-1" });
const POLICY_STORE_ID = process.env.POLICY_STORE_ID!;

export const handler = async (event: any) => {
  const token = event.authorizationToken.replace("Bearer ", "");
  const decoded = decodeJwt(token);

  const command = new IsAuthorizedCommand({
    policyStoreId: POLICY_STORE_ID,
    principal: { entityType: "User", entityId: decoded.sub },
    action: { entityType: "Action", entityId: mapMethod(event.requestContext.httpMethod) },
    resource: { entityType: "Resource", entityId: event.requestContext.resourcePath },
    entities: {
      entityList: [{
        identifier: { entityType: "User", entityId: decoded.sub },
        parents: decoded.groups.map((g: string) => ({ entityType: "Group", entityId: g })),
      }],
    },
  });

  const response = await client.send(command);

  return generatePolicy(
    decoded.sub,
    response.decision === "ALLOW" ? "Allow" : "Deny",
    event.methodArn
  );
};

function generatePolicy(principalId: string, effect: string, resource: string) {
  return {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [{ Action: "execute-api:Invoke", Effect: effect, Resource: resource }],
    },
  };
}

function mapMethod(method: string): string {
  return { GET: "Read", POST: "Create", PUT: "Update", DELETE: "Delete" }[method] || "Unknown";
}

function decodeJwt(token: string): any {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
}
```

### CDK Stack

```typescript
import * as cdk from "aws-cdk-lib";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigatewayv2Authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";

export class ApiGatewayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: { policyStoreId: string }) {
    super(scope, id);

    const authorizerFn = new lambdaNodejs.NodejsFunction(this, "Authorizer", {
      entry: "src/authorizer/index.ts",
      environment: { POLICY_STORE_ID: props.policyStoreId },
    });

    authorizerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["verifiedpermissions:IsAuthorized"],
      resources: [`arn:aws:verifiedpermissions:${this.region}:${this.account}:policy-store/${props.policyStoreId}`],
    }));

    const authorizer = new apigatewayv2Authorizers.HttpLambdaAuthorizer(
      "AVPAuthorizer", authorizerFn,
      { identitySource: ["$request.header.Authorization"] }
    );

    new apigatewayv2.HttpApi(this, "Api", { defaultAuthorizer: authorizer });
  }
}
```

---

## 3. ECS + Hapi.js Plugin

### Hapi.js Plugin

```typescript
import { Plugin, Request, ResponseToolkit } from "@hapi/hapi";
import { VerifiedPermissionsClient, IsAuthorizedCommand } from "@aws-sdk/client-verifiedpermissions";

interface PluginOptions {
  policyStoreId: string;
  region?: string;
}

interface RouteAuthConfig {
  action: string;
  resourceType: string;
  getResourceId?: (request: Request) => string;
}

const plugin: Plugin<PluginOptions> = {
  name: "verified-permissions",
  version: "1.0.0",

  register: async (server, options) => {
    const client = new VerifiedPermissionsClient({ region: options.region || "us-east-1" });

    server.ext("onPreHandler", async (request, h) => {
      const config = request.route.settings.plugins?.verifiedPermissions as RouteAuthConfig;
      if (!config) return h.continue;

      const credentials = request.auth.credentials as any;

      const command = new IsAuthorizedCommand({
        policyStoreId: options.policyStoreId,
        principal: { entityType: "User", entityId: credentials.sub },
        action: { actionType: "Action", actionId: config.action },
        resource: {
          entityType: config.resourceType,
          entityId: config.getResourceId?.(request) || request.params.id || "*",
        },
      });

      const response = await client.send(command);

      if (response.decision !== "ALLOW") {
        return h.response({ error: "Forbidden" }).code(403).takeover();
      }

      return h.continue;
    });
  },
};

export default plugin;
```

### Using the Plugin

```typescript
server.route({
  method: "GET",
  path: "/documents/{id}",
  handler: async (request) => getDocument(request.params.id),
  options: {
    plugins: {
      verifiedPermissions: {
        action: "ReadDocument",
        resourceType: "Document",
        getResourceId: (req) => req.params.id,
      },
    },
  },
});
```

### CDK Stack for ECS

```typescript
import * as cdk from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as iam from "aws-cdk-lib/aws-iam";

export class EcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: { policyStoreId: string; policyStoreArn: string }) {
    super(scope, id);

    const taskRole = new iam.Role(this, "TaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["verifiedpermissions:IsAuthorized", "verifiedpermissions:IsAuthorizedWithToken"],
      resources: [props.policyStoreArn],
    }));

    new ecsPatterns.ApplicationLoadBalancedFargateService(this, "Service", {
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry("my-image"),
        taskRole,
        environment: { POLICY_STORE_ID: props.policyStoreId },
      },
    });
  }
}
```

---

## 4. Policy Store CDK Stack

```typescript
import * as cdk from "aws-cdk-lib";
import * as verifiedpermissions from "aws-cdk-lib/aws-verifiedpermissions";
import * as fs from "fs";
import * as path from "path";

export class PolicyStoreStack extends cdk.Stack {
  public readonly policyStore: verifiedpermissions.CfnPolicyStore;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const schema = JSON.parse(fs.readFileSync("authorization/schema.json", "utf-8"));

    this.policyStore = new verifiedpermissions.CfnPolicyStore(this, "PolicyStore", {
      validationSettings: { mode: "STRICT" },
      schema: { cedarJson: JSON.stringify(schema) },
    });

    // Load policies from files
    const policiesDir = "authorization/policies";
    fs.readdirSync(policiesDir)
      .filter((f) => f.endsWith(".cedar"))
      .forEach((file, i) => {
        new verifiedpermissions.CfnPolicy(this, `Policy${i}`, {
          policyStoreId: this.policyStore.attrPolicyStoreId,
          definition: {
            static: {
              statement: fs.readFileSync(path.join(policiesDir, file), "utf-8"),
              description: file,
            },
          },
        });
      });

    new cdk.CfnOutput(this, "PolicyStoreId", { value: this.policyStore.attrPolicyStoreId });
  }
}
```

---

## 5. Generic Cedar Schema

```json
{
  "MyApp": {
    "entityTypes": {
      "User": {
        "shape": {
          "type": "Record",
          "attributes": {
            "email": { "type": "String" },
            "department": { "type": "String" }
          }
        },
        "memberOfTypes": ["Group"]
      },
      "Group": {},
      "Document": {
        "shape": {
          "type": "Record",
          "attributes": {
            "owner": { "type": "Entity", "name": "User" },
            "classification": { "type": "String" },
            "status": { "type": "String" }
          }
        }
      }
    },
    "actions": {
      "Read": { "appliesTo": { "principalTypes": ["User"], "resourceTypes": ["Document"] } },
      "Update": { "appliesTo": { "principalTypes": ["User"], "resourceTypes": ["Document"] } },
      "Delete": { "appliesTo": { "principalTypes": ["User"], "resourceTypes": ["Document"] } }
    }
  }
}
```

---

## 6. Generic Cedar Policies

```cedar
// Admins can do anything
permit (
    principal in MyApp::Group::"Admins",
    action,
    resource
);

// Users can read non-confidential documents
permit (
    principal,
    action == MyApp::Action::"Read",
    resource
) when {
    resource.classification != "confidential"
};

// Users can read/update their own documents
permit (
    principal,
    action in [MyApp::Action::"Read", MyApp::Action::"Update"],
    resource
) when {
    resource.owner == principal
};

// Only admins can delete
forbid (
    principal,
    action == MyApp::Action::"Delete",
    resource
) unless {
    principal in MyApp::Group::"Admins"
};

// Nobody can access deleted documents
forbid (
    principal,
    action,
    resource
) when {
    resource.status == "deleted"
};
```
