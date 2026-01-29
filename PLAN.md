# AWS Verified Permissions - Exploration Plan

## 1. What is AWS Verified Permissions?

AWS Verified Permissions is a **fine-grained authorization service** that helps you implement and manage permissions for your applications. It uses **Cedar**, an open-source policy language developed by AWS, to define and evaluate authorization policies.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Policy Store** | A container for your policies, schema, and configuration. Think of it as your "authorization database" |
| **Policies** | Cedar statements that define who can do what on which resources |
| **Schema** | Defines the structure of principals, actions, and resources in your domain |
| **Entities** | Runtime data about users, groups, and resources used during authorization decisions |

### How It Works

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Request   │────▶│  Verified Permissions │────▶│    Decision     │
│  (API Call) │     │                      │     │ (ALLOW / DENY)  │
└─────────────┘     └──────────────────────┘     └─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   Policy Store   │
                    │  ┌────────────┐  │
                    │  │  Policies  │  │
                    │  │  Schema    │  │
                    │  │  Templates │  │
                    │  └────────────┘  │
                    └──────────────────┘
```

1. **Application sends authorization request** - "Can User X perform Action Y on Resource Z?"
2. **Verified Permissions evaluates** - Checks all relevant policies against the request
3. **Returns decision** - ALLOW or DENY with optional reasons

### Cedar Policy Language

Cedar is a declarative policy language. Example:

```cedar
// Allow admins to perform any action on any resource
permit (
    principal in Group::"Admins",
    action,
    resource
);

// Allow users to read their own profile
permit (
    principal,
    action == Action::"ReadProfile",
    resource
) when {
    principal == resource.owner
};

// Deny access to deleted resources
forbid (
    principal,
    action,
    resource
) when {
    resource.status == "deleted"
};
```

---

## 2. Current Gazebo Permission System

### Overview

Gazebo uses a **graph-based permission system** stored in AWS OpenSearch with two services:

| Service | Purpose | Status |
|---------|---------|--------|
| **permission-service** | Write operations, relationship CRUD, effective permission computation | Active (source of truth for writes) |
| **authorization-service** | Fast cached reads, transitive closure computation | Active but problematic (cache sync issues) |

### Architecture Diagram

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────────────────┐
│  Admin / Apps   │────▶│  permission-service │────▶│  OpenSearch (Write)      │
│  (Writes)       │     │  (Port 9000)        │     │  - permissions-object    │
└─────────────────┘     └─────────────────────┘     │  - permissions-relationship│
                                                    │  - permissions-role       │
┌─────────────────┐     ┌─────────────────────┐     └──────────────────────────┘
│  Apps / Gateway │────▶│ authorization-service│────▶│  OpenSearch (Read)       │
│  (Reads)        │     │  (Port 9000)        │     │  (same indices, read-only)│
└─────────────────┘     │  + In-Memory Cache  │     └──────────────────────────┘
                        └─────────────────────┘
```

### Data Model

**Object Types (Vertices):**
- `user` - Individual users
- `organization` / `company` - Business entities
- `region` - Geographic regions
- `site` - Individual locations
- `roleGroup` - Role collections (e.g., "accountManager", "globalAdmin")
- `module` - UI modules (e.g., "measurable-www", "project-www")
- `measurable` - Data collection points
- `project` / `project-task` - Projects and tasks
- `document` / `resource` - Files and resources

**Relationship Structure (Edges):**
```javascript
{
  source: { type: "user", id: "1000962" },
  target: { type: "site", id: "1360" },
  roleList: ["accountManager", "coordinator"]  // User's roles at this location
}
```

> **Note:** The legacy system also has `permissionMap` with bitmasks, but the new system will be purely role-based. Roles define what actions are allowed.

**Standard Roles:**
- `globalAdmin` - Full system admin (Gazebo team)
- `administrator` - Full admin + proxy at location
- `coordinator` - Limited admin, create/edit all
- `accountManager` - Full admin at assigned locations
- `facilitator` - Create projects, overwrite data
- `champion` - Edit projects, upload data
- `contributor` - Edit projects, view models
- `viewer` - Read-only

### permission-service (Writes)

**Key Endpoints:**
```
PUT  /permission/relationship/{sourceType}/{sourceId}/{targetType}/{targetId}
DELETE /permission/relationship/{sourceType}/{sourceId}/{targetType}/{targetId}
PUT  /permission/object/{type}/{id}
DELETE /permission/object/{type}/{id}
PUT  /permission/role/{roleId}
DELETE /permission/role/{roleId}
GET  /permission/{sourceType}/{sourceId}  (effective permissions - slow)
```

**How Permissions Are Created:**
1. User Admin assigns role to user at a location
2. Calls `PUT /permission/relationship/user/{userId}/site/{siteId}` with roleList
3. Bulk upserts: relationship + source object + target object
4. Uses `wait_for_active_shards: "all"` for consistency

**Key Libraries Used:**
- `hapi-gazebo-auth` - Augments requests with auth info
- `gazebo-hapi-chassis` - Enforces Module permissions on endpoints

### authorization-service (Cached Reads)

**Key Endpoints:**
```
GET /authorization/v1/{sourceType}/{sourceId}
GET /authorization/v1/{sourceType}/{sourceId}/{targetType}
GET /authorization/v1/{sourceType}/{sourceId}/{targetType}/{targetId}
GET /authorization/v1/roles/{sourceType}/{sourceId}/{targetType}/{targetId}
GET /authorization/v1/site-users/{siteId}  (inverse lookup)
```

**Transitive Closure Algorithm:**
1. Start at source (e.g., `user:123`) with full permissions (255)
2. BFS traversal through permission graph
3. At each edge: `effective = (local & limiting) | rolePermissions`
4. Track visited nodes to prevent cycles
5. Multiple paths to same target: OR permissions together
6. Stop at terminal types (`measurable`, `project-task`)

**Caching Strategy:**
- In-memory cache of entire permission graph
- Polls OpenSearch refresh counter every 2.5 seconds
- `consistent=true` blocks until cache refreshed
- `consistent=false` returns stale data, refreshes in background

**Current Problems:**
1. **Cache sync across tasks** - Each ECS task has its own cache, can diverge
2. **Slow initial load** - Must scroll through entire OpenSearch index
3. **Memory pressure** - Full graph in memory per task
4. **Stale reads** - 2.5s polling window + propagation delay

---

## 3. Mapping Current System to Cedar/Verified Permissions

### Conceptual Mapping

| Current Concept | Cedar Equivalent |
|-----------------|------------------|
| User | Principal (Entity type: `User`) |
| Site, Organization, etc. | Resource (Entity types) |
| Role (administrator, viewer) | Group membership + role-based policies |
| roleList on relationships | User membership in RoleGroup entities |
| Relationship graph traversal | Cedar's `in` hierarchy + policies |
| Module access | Action groups or separate resource type |

### Entity Hierarchy in Cedar

```
// Current: user → organization → region → site → measurable
// Cedar equivalent using parent relationships:

User::"user-123"
  in RoleGroup::"accountManager"
  in Organization::"org-456"

Site::"site-789"
  in Region::"region-012"
  in Organization::"org-456"

Measurable::"meas-111"
  in Site::"site-789"
```

### Sample Cedar Schema for Gazebo

```json
{
    "Gazebo": {
    "entityTypes": {
      "User": {
        "shape": {
          "type": "Record",
          "attributes": {
            "email": { "type": "String" },
            "createdAt": { "type": "String" }
          }
        },
        "memberOfTypes": ["RoleGroup", "Organization", "Region", "Site"]
      },
      "RoleGroup": {
        "shape": {
          "type": "Record",
          "attributes": {
            "name": { "type": "String" },
            "description": { "type": "String" }
          }
        },
        "memberOfTypes": ["Module"]
      },
      "Organization": {
        "memberOfTypes": []
      },
      "Region": {
        "memberOfTypes": ["Organization"]
      },
      "Site": {
        "shape": {
          "type": "Record",
          "attributes": {
            "name": { "type": "String" }
          }
        },
        "memberOfTypes": ["Region", "Organization"]
      },
      "Measurable": {
        "shape": {
          "type": "Record",
          "attributes": {
            "createdBy": { "type": "Entity", "name": "User" }
          }
        },
        "memberOfTypes": ["Site"]
      },
      "Project": {
        "shape": {
          "type": "Record",
          "attributes": {
            "createdBy": { "type": "Entity", "name": "User" },
            "status": { "type": "String" }
          }
        },
        "memberOfTypes": ["Site"]
      },
      "Module": {
        "shape": {
          "type": "Record",
          "attributes": {
            "name": { "type": "String" }
          }
        }
      }
    },
    "actions": {
      "Read": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Site", "Measurable", "Project", "Module"]
        }
      },
      "Write": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Site", "Measurable", "Project"]
        }
      },
      "Admin": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Site", "Measurable", "Project"]
        }
      },
      "CreateModel": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Site"]
        }
      },
      "CreateProject": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Site"]
        }
      }
    }
  }
}
```

### Sample Cedar Policies for Gazebo

```cedar
// ============================================
// GLOBAL ADMIN - Trump card
// ============================================
permit (
    principal in Gazebo::RoleGroup::"globalAdmin",
    action,
    resource
);

// ============================================
// ROLE-BASED POLICIES
// ============================================

// Administrators can do anything at their assigned locations
permit (
    principal,
    action,
    resource in Gazebo::Site::"*"
) when {
    principal in resource &&
    principal.hasRole(resource, "administrator")
};

// Coordinators: limited admin, create/edit all objects
permit (
    principal,
    action in [Gazebo::Action::"Read", Gazebo::Action::"Write", Gazebo::Action::"CreateModel", Gazebo::Action::"CreateProject"],
    resource
) when {
    principal in resource.site &&
    principal.hasRole(resource.site, "coordinator")
};

// Contributors: edit projects, view models
permit (
    principal,
    action == Gazebo::Action::"Read",
    resource
) when {
    principal in resource.site &&
    principal.hasRole(resource.site, "contributor")
};

permit (
    principal,
    action == Gazebo::Action::"Write",
    resource is Gazebo::Project
) when {
    principal in resource.site &&
    principal.hasRole(resource.site, "contributor")
};

// Viewers: read-only
permit (
    principal,
    action == Gazebo::Action::"Read",
    resource
) when {
    principal in resource.site &&
    principal.hasRole(resource.site, "viewer")
};

// ============================================
// CREATOR PRIVILEGE
// ============================================
// "If you created it, you can edit it"
permit (
    principal,
    action in [Gazebo::Action::"Read", Gazebo::Action::"Write"],
    resource
) when {
    resource has createdBy &&
    resource.createdBy == principal
};

// ============================================
// MODULE ACCESS
// ============================================
permit (
    principal,
    action == Gazebo::Action::"Read",
    resource is Gazebo::Module
) when {
    principal in resource
};
```

### What Changes With Verified Permissions

| Aspect | Current | With Verified Permissions |
|--------|---------|---------------------------|
| **Permission model** | Bitmasks + roles (complex) | Pure role-based (simple) |
| **Read latency** | 10-200ms (cache dependent) | ~10-50ms (AWS managed) |
| **Cache consistency** | Problematic (per-task caches) | Strongly consistent |
| **Write latency** | Same (OpenSearch) | Milliseconds (AVP API) |
| **Graph traversal** | Custom BFS code | Built into Cedar `in` |
| **Policy logic** | Hardcoded in services | Declarative Cedar policies |
| **Auditability** | Manual logging | Built-in CloudTrail |

### What Needs to Stay

1. **permission-service write endpoints** - Still needed to:
   - Create/update user role assignments
   - Sync to Verified Permissions (new responsibility)
   - Maintain backward compatibility during migration

2. **User Admin UI** - Unchanged, calls permission-service

3. **Site/Org hierarchy management** - Needs to sync to AVP entities

### What Can Be Retired

1. **authorization-service** - Replace with direct AVP calls
2. **In-memory permission caching** - AVP handles this
3. **Custom transitive closure code** - Cedar `in` operator
4. **OpenSearch read indices** - Eventually (after full migration)

---

## 4. Migration Strategy

### Phase 1: Dual-Write Setup
```
User Admin
    ↓
permission-service
    ├─→ OpenSearch (existing)
    └─→ Verified Permissions (new - sync relationships)
```

- Modify permission-service to dual-write
- Create AVP Policy Store with Cedar schema
- Deploy static Cedar policies
- No consumer changes yet

### Phase 2: Shadow Mode
```
App Request
    ├─→ authorization-service (primary, returns response)
    └─→ Verified Permissions (shadow, log comparison)
```

- Add AVP calls alongside existing auth checks
- Compare results, log discrepancies
- Fix policy/data issues
- Build confidence in parity

### Phase 3: Gradual Cutover
- Route percentage of traffic to AVP
- Monitor latency, errors, decision parity
- Increase percentage over time
- Keep authorization-service as fallback

### Phase 4: Retirement
- Remove authorization-service dependency
- Simplify permission-service (remove read path)
- Archive OpenSearch read indices
- Full AVP operation

### Data Sync Considerations

**Entities to sync to AVP:**
- Users (with role assignments per location)
- Organizations, Regions, Sites (with hierarchy)
- RoleGroups (as Cedar groups - users are members based on their roles)
- Modules

**What NOT to sync:**
- Individual measurables (too many - 4096+ per site)
- Use site-level check + application-level filtering instead
- Legacy bitmask permissionMap values (not needed in role-based system)

**Sync trigger options:**
1. **Event-driven** - SNS/SQS from permission-service writes
2. **CDC** - OpenSearch change streams (if available)
3. **Periodic batch** - Full sync every N minutes (simplest start)

---

## 5. Best Practices for Storing Cedar Policies (General)

### Where Should Policies Live?

AWS Verified Permissions policies are stored **in Policy Stores within AWS**, but the source of truth for policy definitions follows different patterns:

### Pattern A: Centralized Organization-Wide (Recommended for Enterprises)

```
organization-policies/
├── shared/
│   ├── base-policies.cedar      # Common deny rules, audit policies
│   └── schema.json              # Organization-wide schema
├── domains/
│   ├── payments/
│   │   └── policies.cedar
│   ├── user-management/
│   │   └── policies.cedar
│   └── inventory/
│       └── policies.cedar
└── environments/
    ├── dev.ts
    ├── staging.ts
    └── prod.ts
```

**Pros:**
- Single source of truth
- Easier to audit and review
- Consistent policy enforcement across services
- Centralized governance

**Cons:**
- Can become a bottleneck
- Requires strong change management
- Cross-team coordination needed

### Pattern B: Per-Service/Repo (Recommended for Microservices)

Each service repository contains its own policies:

```
my-service/
├── src/
├── tests/
├── infrastructure/
│   └── cdk/
└── authorization/
    ├── policies/
    │   ├── admin.cedar
    │   └── user.cedar
    ├── schema.json
    └── tests/
        └── policy-tests.json
```

**Pros:**
- Service teams own their policies
- Faster iteration
- Policies co-located with code they protect

**Cons:**
- Risk of inconsistency
- Harder to audit across organization
- Potential schema conflicts

### Pattern C: Hybrid (Recommended for Most Organizations)

```
# Central repo for shared policies and schema
org-authorization/
├── shared-schema.json           # Base types all services extend
├── shared-policies/
│   └── security-baseline.cedar  # Org-wide security rules
└── policy-store-configs/
    ├── payments-service.json
    └── inventory-service.json

# Individual service repos
payments-service/
└── authorization/
    ├── policies.cedar           # Service-specific policies
    └── schema-extension.json    # Extends shared schema
```

### Policy Store Strategy

| Strategy | When to Use |
|----------|-------------|
| **One Policy Store per Environment** | Simple applications, consistent policies across services |
| **One Policy Store per Service per Environment** | Microservices with distinct authorization domains |
| **One Policy Store per Domain per Environment** | Multiple services share authorization context (e.g., all "payments" services) |

### Deployment Best Practices

1. **Infrastructure as Code** - Use AWS CDK to manage Policy Stores
2. **GitOps** - Policies in Git, CI/CD deploys them
3. **Policy Testing** - Test policies before deployment using Cedar's test framework
4. **Versioning** - Tag policy versions, enable rollback
5. **Separate Environments** - Never share Policy Stores across dev/staging/prod

---

## 6. Integration: API Gateway + Lambda

### Architecture

```
┌──────────┐     ┌─────────────┐     ┌────────────────┐     ┌─────────────┐
│  Client  │────▶│ API Gateway │────▶│ Lambda         │────▶│   Backend   │
└──────────┘     │             │     │ Authorizer     │     │   Lambda    │
                 └─────────────┘     └────────────────┘     └─────────────┘
                                            │
                                            ▼
                                   ┌─────────────────────┐
                                   │ Verified Permissions│
                                   └─────────────────────┘
```

### Lambda Authorizer Implementation

```typescript
// authorizer/index.ts
import {
  VerifiedPermissionsClient,
  IsAuthorizedCommand,
  EntityIdentifier,
} from "@aws-sdk/client-verifiedpermissions";

const client = new VerifiedPermissionsClient({ region: "us-east-1" });
const POLICY_STORE_ID = process.env.POLICY_STORE_ID!;

interface APIGatewayEvent {
  type: string;
  authorizationToken: string;
  methodArn: string;
  requestContext: {
    httpMethod: string;
    resourcePath: string;
  };
}

export const handler = async (event: APIGatewayEvent) => {
  // Extract user info from JWT token
  const token = event.authorizationToken.replace("Bearer ", "");
  const decoded = decodeJwt(token); // Your JWT decoding logic

  // Map API Gateway request to Cedar entities
  const principal: EntityIdentifier = {
    entityType: "User",
    entityId: decoded.sub,
  };

  const action: EntityIdentifier = {
    entityType: "Action",
    entityId: mapHttpMethodToAction(event.requestContext.httpMethod),
  };

  const resource: EntityIdentifier = {
    entityType: "Resource",
    entityId: event.requestContext.resourcePath,
  };

  // Build entities list (user attributes, group memberships, etc.)
  const entities = {
    entityList: [
      {
        identifier: principal,
        attributes: {
          department: { string: decoded.department },
          role: { string: decoded.role },
        },
        parents: decoded.groups.map((g: string) => ({
          entityType: "Group",
          entityId: g,
        })),
      },
    ],
  };

  try {
    const command = new IsAuthorizedCommand({
      policyStoreId: POLICY_STORE_ID,
      principal,
      action,
      resource,
      entities,
    });

    const response = await client.send(command);

    if (response.decision === "ALLOW") {
      return generatePolicy(decoded.sub, "Allow", event.methodArn);
    } else {
      return generatePolicy(decoded.sub, "Deny", event.methodArn);
    }
  } catch (error) {
    console.error("Authorization error:", error);
    return generatePolicy("user", "Deny", event.methodArn);
  }
};

function generatePolicy(principalId: string, effect: string, resource: string) {
  return {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };
}

function mapHttpMethodToAction(method: string): string {
  const mapping: Record<string, string> = {
    GET: "Read",
    POST: "Create",
    PUT: "Update",
    PATCH: "Update",
    DELETE: "Delete",
  };
  return mapping[method] || "Unknown";
}

function decodeJwt(token: string): any {
  // Implement JWT decoding - use a library like jsonwebtoken
  const base64Payload = token.split(".")[1];
  return JSON.parse(Buffer.from(base64Payload, "base64").toString());
}
```

### CDK Stack for API Gateway + Lambda Authorizer

```typescript
// infrastructure/lib/api-gateway-stack.ts
import * as cdk from "aws-cdk-lib";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigatewayv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigatewayv2Authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface ApiGatewayStackProps extends cdk.StackProps {
  policyStoreId: string;
}

export class ApiGatewayStack extends cdk.Stack {
  public readonly api: apigatewayv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    // Lambda Authorizer Function
    const authorizerFn = new lambdaNodejs.NodejsFunction(this, "AuthorizerFunction", {
      entry: "src/authorizer/index.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        POLICY_STORE_ID: props.policyStoreId,
      },
      timeout: cdk.Duration.seconds(10),
    });

    // Grant Verified Permissions access to the authorizer
    authorizerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "verifiedpermissions:IsAuthorized",
          "verifiedpermissions:IsAuthorizedWithToken",
        ],
        resources: [
          `arn:aws:verifiedpermissions:${this.region}:${this.account}:policy-store/${props.policyStoreId}`,
        ],
      })
    );

    // Create the Lambda authorizer
    const authorizer = new apigatewayv2Authorizers.HttpLambdaAuthorizer(
      "VerifiedPermissionsAuthorizer",
      authorizerFn,
      {
        authorizerName: "verified-permissions-authorizer",
        identitySource: ["$request.header.Authorization"],
        responseTypes: [apigatewayv2Authorizers.HttpLambdaResponseType.IAM],
      }
    );

    // HTTP API
    this.api = new apigatewayv2.HttpApi(this, "HttpApi", {
      apiName: "verified-permissions-api",
      defaultAuthorizer: authorizer,
    });

    // Example backend Lambda
    const backendFn = new lambdaNodejs.NodejsFunction(this, "BackendFunction", {
      entry: "src/handlers/index.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_18_X,
    });

    // Add routes
    this.api.addRoutes({
      path: "/documents/{id}",
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        "BackendIntegration",
        backendFn
      ),
    });

    // Outputs
    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.api.url!,
      description: "API Gateway URL",
    });
  }
}
```

### CDK Stack for Verified Permissions Policy Store

```typescript
// infrastructure/lib/policy-store-stack.ts
import * as cdk from "aws-cdk-lib";
import * as verifiedpermissions from "aws-cdk-lib/aws-verifiedpermissions";
import * as fs from "fs";
import * as path from "path";
import { Construct } from "constructs";

export class PolicyStoreStack extends cdk.Stack {
  public readonly policyStore: verifiedpermissions.CfnPolicyStore;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Load schema from file
    const schemaPath = path.join(__dirname, "../../authorization/schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

    // Create Policy Store
    this.policyStore = new verifiedpermissions.CfnPolicyStore(this, "PolicyStore", {
      validationSettings: {
        mode: "STRICT",
      },
      schema: {
        cedarJson: JSON.stringify(schema),
      },
      description: "Policy store for MyApp authorization",
    });

    // Load and create policies from files
    const policiesDir = path.join(__dirname, "../../authorization/policies");
    const policyFiles = fs.readdirSync(policiesDir).filter((f) => f.endsWith(".cedar"));

    policyFiles.forEach((file, index) => {
      const policyContent = fs.readFileSync(path.join(policiesDir, file), "utf-8");

      new verifiedpermissions.CfnPolicy(this, `Policy${index}`, {
        policyStoreId: this.policyStore.attrPolicyStoreId,
        definition: {
          static: {
            statement: policyContent,
            description: `Policy from ${file}`,
          },
        },
      });
    });

    // Outputs
    new cdk.CfnOutput(this, "PolicyStoreId", {
      value: this.policyStore.attrPolicyStoreId,
      description: "Verified Permissions Policy Store ID",
      exportName: "PolicyStoreId",
    });

    new cdk.CfnOutput(this, "PolicyStoreArn", {
      value: this.policyStore.attrArn,
      description: "Verified Permissions Policy Store ARN",
      exportName: "PolicyStoreArn",
    });
  }
}
```

---

## 7. Integration: ECS + Hapi.js

### Architecture

```
┌──────────┐     ┌─────────────┐     ┌────────────────────────────┐
│  Client  │────▶│    ALB      │────▶│   ECS Task (Hapi.js)       │
└──────────┘     └─────────────┘     │  ┌──────────────────────┐  │
                                     │  │ Auth Plugin          │  │
                                     │  │   ↓                  │  │
                                     │  │ Verified Permissions │  │
                                     │  └──────────────────────┘  │
                                     └────────────────────────────┘
```

### Hapi.js Plugin Implementation

```typescript
// src/plugins/verified-permissions.ts
import { Plugin, Request, ResponseToolkit } from "@hapi/hapi";
import {
  VerifiedPermissionsClient,
  IsAuthorizedCommand,
  IsAuthorizedWithTokenCommand,
  EntityIdentifier,
} from "@aws-sdk/client-verifiedpermissions";

interface PluginOptions {
  policyStoreId: string;
  identitySourceId?: string; // For Cognito integration
  region?: string;
}

interface RouteAuthConfig {
  action: string;
  resourceType: string;
  getResourceId?: (request: Request) => string;
  getEntities?: (request: Request) => any[];
}

declare module "@hapi/hapi" {
  interface PluginSpecificConfiguration {
    verifiedPermissions?: RouteAuthConfig;
  }
}

const plugin: Plugin<PluginOptions> = {
  name: "verified-permissions",
  version: "1.0.0",

  register: async (server, options) => {
    const client = new VerifiedPermissionsClient({
      region: options.region || "us-east-1",
    });

    // Register authentication scheme
    server.auth.scheme("verified-permissions", () => {
      return {
        authenticate: async (request: Request, h: ResponseToolkit) => {
          const token = request.headers.authorization?.replace("Bearer ", "");

          if (!token) {
            throw h.unauthenticated(new Error("Missing authorization token"));
          }

          // Decode token to get user info
          const credentials = decodeAndVerifyToken(token);

          return h.authenticated({ credentials, artifacts: { token } });
        },
      };
    });

    // Register authorization extension
    server.ext("onPreHandler", async (request, h) => {
      const routeConfig = request.route.settings.plugins?.verifiedPermissions;

      if (!routeConfig) {
        return h.continue;
      }

      const { action, resourceType, getResourceId, getEntities } = routeConfig;
      const credentials = request.auth.credentials as any;
      const token = request.auth.artifacts?.token as string;

      // Build authorization request
      const principal: EntityIdentifier = {
        entityType: "User",
        entityId: credentials.sub,
      };

      const actionIdentifier: EntityIdentifier = {
        entityType: "Action",
        entityId: action,
      };

      const resourceId = getResourceId
        ? getResourceId(request)
        : request.params.id || "*";

      const resource: EntityIdentifier = {
        entityType: resourceType,
        entityId: resourceId,
      };

      // Option 1: Use IsAuthorizedWithToken (if using Cognito)
      if (options.identitySourceId) {
        const command = new IsAuthorizedWithTokenCommand({
          policyStoreId: options.policyStoreId,
          identityToken: token,
          action: actionIdentifier,
          resource,
          entities: getEntities ? { entityList: getEntities(request) } : undefined,
        });

        const response = await client.send(command);

        if (response.decision !== "ALLOW") {
          return h
            .response({ error: "Forbidden", reasons: response.errors })
            .code(403)
            .takeover();
        }
      }
      // Option 2: Use IsAuthorized with manual entity construction
      else {
        const entities = {
          entityList: [
            {
              identifier: principal,
              attributes: {
                email: { string: credentials.email },
                department: { string: credentials.department || "unknown" },
              },
              parents: (credentials.groups || []).map((g: string) => ({
                entityType: "Group",
                entityId: g,
              })),
            },
            ...(getEntities ? getEntities(request) : []),
          ],
        };

        const command = new IsAuthorizedCommand({
          policyStoreId: options.policyStoreId,
          principal,
          action: actionIdentifier,
          resource,
          entities,
        });

        const response = await client.send(command);

        if (response.decision !== "ALLOW") {
          return h
            .response({
              error: "Forbidden",
              message: "You do not have permission to perform this action"
            })
            .code(403)
            .takeover();
        }
      }

      return h.continue;
    });

    server.auth.strategy("avp", "verified-permissions");
  },
};

function decodeAndVerifyToken(token: string): any {
  // In production, verify the token signature!
  const base64Payload = token.split(".")[1];
  return JSON.parse(Buffer.from(base64Payload, "base64").toString());
}

export default plugin;
```

### Using the Plugin in Routes

```typescript
// src/server.ts
import Hapi from "@hapi/hapi";
import verifiedPermissionsPlugin from "./plugins/verified-permissions";

const init = async () => {
  const server = Hapi.server({
    port: 3000,
    host: "0.0.0.0",
  });

  // Register the plugin
  await server.register({
    plugin: verifiedPermissionsPlugin,
    options: {
      policyStoreId: process.env.POLICY_STORE_ID!,
      region: process.env.AWS_REGION || "us-east-1",
    },
  });

  // Set default auth strategy
  server.auth.default("avp");

  // Define routes with authorization config
  server.route([
    {
      method: "GET",
      path: "/documents/{id}",
      handler: async (request) => {
        return { document: await getDocument(request.params.id) };
      },
      options: {
        plugins: {
          verifiedPermissions: {
            action: "ReadDocument",
            resourceType: "Document",
            getResourceId: (req) => req.params.id,
          },
        },
      },
    },
    {
      method: "PUT",
      path: "/documents/{id}",
      handler: async (request) => {
        return { document: await updateDocument(request.params.id, request.payload) };
      },
      options: {
        plugins: {
          verifiedPermissions: {
            action: "UpdateDocument",
            resourceType: "Document",
            getResourceId: (req) => req.params.id,
            // Include resource attributes for policy evaluation
            getEntities: (req) => [
              {
                identifier: { entityType: "Document", entityId: req.params.id },
                attributes: {
                  owner: { entityIdentifier: { entityType: "User", entityId: "owner-id" } },
                  classification: { string: "confidential" },
                },
              },
            ],
          },
        },
      },
    },
    {
      method: "DELETE",
      path: "/documents/{id}",
      handler: async (request) => {
        await deleteDocument(request.params.id);
        return { success: true };
      },
      options: {
        plugins: {
          verifiedPermissions: {
            action: "DeleteDocument",
            resourceType: "Document",
          },
        },
      },
    },
  ]);

  await server.start();
  console.log("Server running on %s", server.info.uri);
};

init();
```

### CDK Stack for ECS + Hapi.js

```typescript
// infrastructure/lib/ecs-hapi-stack.ts
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

interface EcsHapiStackProps extends cdk.StackProps {
  policyStoreId: string;
  policyStoreArn: string;
}

export class EcsHapiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsHapiStackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: "hapi-service-cluster",
      containerInsights: true,
    });

    // ECR Repository (or use existing)
    const repository = new ecr.Repository(this, "HapiRepository", {
      repositoryName: "hapi-service",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Task Role with Verified Permissions access
    const taskRole = new iam.Role(this, "TaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      roleName: "hapi-service-task-role",
    });

    // Grant Verified Permissions access
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "verifiedpermissions:IsAuthorized",
          "verifiedpermissions:IsAuthorizedWithToken",
        ],
        resources: [props.policyStoreArn],
      })
    );

    // Log Group
    const logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: "/ecs/hapi-service",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Fargate Service with ALB
    const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      "HapiService",
      {
        cluster,
        serviceName: "hapi-service",
        cpu: 256,
        memoryLimitMiB: 512,
        desiredCount: 2,
        taskImageOptions: {
          image: ecs.ContainerImage.fromEcrRepository(repository, "latest"),
          containerPort: 3000,
          taskRole,
          environment: {
            POLICY_STORE_ID: props.policyStoreId,
            AWS_REGION: this.region,
            NODE_ENV: "production",
          },
          logDriver: ecs.LogDrivers.awsLogs({
            streamPrefix: "hapi",
            logGroup,
          }),
        },
        publicLoadBalancer: true,
        healthCheckGracePeriod: cdk.Duration.seconds(60),
      }
    );

    // Configure health check
    fargateService.targetGroup.configureHealthCheck({
      path: "/health",
      healthyHttpCodes: "200",
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
    });

    // Auto-scaling
    const scaling = fargateService.service.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 10,
    });

    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    scaling.scaleOnMemoryUtilization("MemoryScaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // Outputs
    new cdk.CfnOutput(this, "LoadBalancerDNS", {
      value: fargateService.loadBalancer.loadBalancerDnsName,
      description: "ALB DNS Name",
    });

    new cdk.CfnOutput(this, "ServiceUrl", {
      value: `http://${fargateService.loadBalancer.loadBalancerDnsName}`,
      description: "Service URL",
    });
  }
}
```

### CDK App Entry Point

```typescript
// infrastructure/bin/app.ts
import * as cdk from "aws-cdk-lib";
import { PolicyStoreStack } from "../lib/policy-store-stack";
import { ApiGatewayStack } from "../lib/api-gateway-stack";
import { EcsHapiStack } from "../lib/ecs-hapi-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

// Deploy Policy Store first
const policyStoreStack = new PolicyStoreStack(app, "PolicyStoreStack", { env });

// API Gateway with Lambda Authorizer
new ApiGatewayStack(app, "ApiGatewayStack", {
  env,
  policyStoreId: policyStoreStack.policyStore.attrPolicyStoreId,
});

// ECS with Hapi.js
new EcsHapiStack(app, "EcsHapiStack", {
  env,
  policyStoreId: policyStoreStack.policyStore.attrPolicyStoreId,
  policyStoreArn: policyStoreStack.policyStore.attrArn,
});

app.synth();
```

### CDK Configuration

```json
// infrastructure/cdk.json
{
  "app": "npx ts-node --prefer-ts-exts bin/app.ts",
  "watch": {
    "include": ["**"],
    "exclude": [
      "README.md",
      "cdk*.json",
      "**/*.d.ts",
      "**/*.js",
      "tsconfig.json",
      "package*.json",
      "node_modules"
    ]
  },
  "context": {
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true,
    "@aws-cdk/core:target-partitions": ["aws"]
  }
}
```

---

## 8. Generic Sample Cedar Schema

```json
{
  "MyApp": {
    "entityTypes": {
      "User": {
        "shape": {
          "type": "Record",
          "attributes": {
            "email": { "type": "String" },
            "department": { "type": "String" },
            "role": { "type": "String" }
          }
        },
        "memberOfTypes": ["Group"]
      },
      "Group": {
        "shape": {
          "type": "Record",
          "attributes": {
            "name": { "type": "String" }
          }
        }
      },
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
      "ReadDocument": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Document"]
        }
      },
      "UpdateDocument": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Document"]
        }
      },
      "DeleteDocument": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Document"]
        }
      }
    }
  }
}
```

---

## 9. Generic Sample Cedar Policies

```cedar
// policies/base.cedar

// Admins can do anything
permit (
    principal in MyApp::Group::"Admins",
    action,
    resource
);

// Users can read any non-confidential document
permit (
    principal,
    action == MyApp::Action::"ReadDocument",
    resource
) when {
    resource.classification != "confidential"
};

// Users can read/update documents they own
permit (
    principal,
    action in [MyApp::Action::"ReadDocument", MyApp::Action::"UpdateDocument"],
    resource
) when {
    resource.owner == principal
};

// Only admins can delete documents
forbid (
    principal,
    action == MyApp::Action::"DeleteDocument",
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

---

## 10. Next Steps

### Immediate (POC Phase)
1. [ ] Set up AWS Verified Permissions in dev account
2. [ ] Initialize CDK project for Policy Store infrastructure
3. [ ] Define Gazebo Cedar schema (User, Site, Organization, RoleGroup, etc.)
4. [ ] Write Cedar policies for existing roles (globalAdmin, administrator, viewer, etc.)
5. [ ] Test policies in Cedar Playground with sample entities
6. [ ] Build entity sync prototype (permission-service → AVP)

### Short-term (Shadow Mode)
7. [ ] Modify permission-service to dual-write (OpenSearch + AVP)
8. [ ] Create `hapi-gazebo-avp` plugin (parallel to `hapi-gazebo-auth`)
9. [ ] Deploy shadow-mode comparison in non-critical service
10. [ ] Monitor and fix parity issues

### Medium-term (Cutover)
11. [ ] Implement feature flag for AVP vs authorization-service
12. [ ] Gradual rollout: 10% → 50% → 100% traffic to AVP
13. [ ] Update `gazebo-hapi-chassis` to use AVP
14. [ ] Performance benchmarking and optimization

### Long-term (Cleanup)
15. [ ] Deprecate authorization-service
16. [ ] Simplify permission-service (remove read endpoints)
17. [ ] Archive OpenSearch read indices
18. [ ] Full production operation on AVP

---

## 11. Useful Resources

- [AWS Verified Permissions Documentation](https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/what-is-avp.html)
- [Cedar Language Reference](https://docs.cedarpolicy.com/)
- [Cedar Playground](https://www.cedarpolicy.com/en/playground)
- [AWS SDK for JavaScript - Verified Permissions](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-verifiedpermissions/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [AWS CDK API Reference - Verified Permissions](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_verifiedpermissions-readme.html)
