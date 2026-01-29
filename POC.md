# Proof of Concept Implementation

A self-contained POC to demonstrate AWS Verified Permissions with Gazebo-like permissions. This allows the team to see how the real system will translate before committing to a full migration.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         React App (Vite)                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  Permission     │  │  Auth Check     │  │  Test Scenarios         │  │
│  │  Manager UI     │  │  Playground     │  │  Dashboard              │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
└───────────┼────────────────────┼────────────────────────┼───────────────┘
            │                    │                        │
            ▼                    ▼                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│                      API Gateway (HTTP API)                            │
│    /permissions/*           /authorize              /scenarios         │
└───────────────────────────────────────────────────────────────────────┘
            │                    │                        │
            ▼                    ▼                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│                         Lambda Functions                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │ permissions-api │  │ authorize-api   │  │ scenarios-api           │ │
│  │ - assignRole    │  │ - isAuthorized  │  │ - runScenario           │ │
│  │ - removeRole    │  │ - batchCheck    │  │ - listScenarios         │ │
│  │ - listUsers     │  │                 │  │                         │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────────────┘ │
└───────────┼────────────────────┼────────────────────────────────────────┘
            │                    │
            ▼                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                    AWS Verified Permissions                            │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                      Policy Store                                │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │  │
│  │  │   Schema    │  │  Policies   │  │  Entities (runtime)     │  │  │
│  │  │  - User     │  │  - globalAdmin│ │  - Users + roles        │  │  │
│  │  │  - Site     │  │  - admin    │  │  - Sites + hierarchy    │  │  │
│  │  │  - Org      │  │  - viewer   │  │  - Organizations        │  │  │
│  │  │  - RoleGroup│  │  - creator  │  │                         │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
verified-permissions-poc/
├── frontend/                    # React + Vite app
│   ├── src/
│   │   ├── components/
│   │   │   ├── PermissionManager.tsx    # Assign/remove roles UI
│   │   │   ├── AuthChecker.tsx          # Test authorization decisions
│   │   │   ├── EntityViewer.tsx         # View current entities
│   │   │   ├── ScenarioRunner.tsx       # Run test scenarios
│   │   │   └── PolicyViewer.tsx         # View Cedar policies
│   │   ├── api/
│   │   │   └── client.ts                # API client
│   │   ├── types/
│   │   │   └── gazebo.ts                # TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── infrastructure/              # CDK infrastructure
│   ├── lib/
│   │   ├── policy-store-stack.ts        # AVP Policy Store + policies
│   │   ├── api-stack.ts                 # API Gateway + Lambdas
│   │   └── frontend-stack.ts            # S3 + CloudFront (optional)
│   ├── bin/
│   │   └── app.ts
│   └── package.json
│
├── lambdas/                     # Lambda function code
│   ├── permissions-api/
│   │   └── index.ts                     # CRUD for role assignments
│   ├── authorize-api/
│   │   └── index.ts                     # Authorization checks
│   └── shared/
│       ├── avp-client.ts                # Verified Permissions client
│       ├── entities.ts                  # Entity builders
│       └── types.ts                     # Shared types
│
├── authorization/               # Cedar policies and schema
│   ├── schema.json                      # Gazebo-like schema
│   └── policies/
│       ├── global-admin.cedar
│       ├── site-roles.cedar
│       ├── creator-privilege.cedar
│       └── module-access.cedar
│
├── PLAN.md
├── POC.md                       # This file
└── REFERENCE.md
```

## Cedar Schema (Gazebo-like)

```json
{
  "Gazebo": {
    "entityTypes": {
      "User": {
        "shape": {
          "type": "Record",
          "attributes": {
            "email": { "type": "String", "required": false }
          }
        },
        "memberOfTypes": ["RoleGroup"]
      },
      "RoleGroup": {
        "shape": {
          "type": "Record",
          "attributes": {
            "name": { "type": "String", "required": false }
          }
        }
      },
      "Organization": {
        "shape": {
          "type": "Record",
          "attributes": {
            "name": { "type": "String", "required": false }
          }
        }
      },
      "Region": {
        "shape": {
          "type": "Record",
          "attributes": {
            "name": { "type": "String", "required": false }
          }
        },
        "memberOfTypes": ["Organization"]
      },
      "Site": {
        "shape": {
          "type": "Record",
          "attributes": {
            "name": { "type": "String", "required": false }
          }
        },
        "memberOfTypes": ["Region", "Organization"]
      },
      "Project": {
        "shape": {
          "type": "Record",
          "attributes": {
            "name": { "type": "String", "required": false },
            "createdBy": { "type": "Entity", "name": "User", "required": false }
          }
        },
        "memberOfTypes": ["Site"]
      },
      "Model": {
        "shape": {
          "type": "Record",
          "attributes": {
            "name": { "type": "String", "required": false },
            "createdBy": { "type": "Entity", "name": "User", "required": false }
          }
        },
        "memberOfTypes": ["Site"]
      },
      "Module": {
        "shape": {
          "type": "Record",
          "attributes": {
            "name": { "type": "String", "required": false }
          }
        }
      }
    },
    "actions": {
      "View": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Site", "Project", "Model", "Module"]
        }
      },
      "Edit": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Site", "Project", "Model"]
        }
      },
      "Create": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Site"]
        }
      },
      "Delete": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Site", "Project", "Model"]
        }
      },
      "Admin": {
        "appliesTo": {
          "principalTypes": ["User"],
          "resourceTypes": ["Site", "Organization"]
        }
      }
    }
  }
}
```

## Cedar Policies

### global-admin.cedar
Gazebo team has full access:
```cedar
// globalAdmin role grants full access to everything
permit (
    principal in Gazebo::RoleGroup::"globalAdmin",
    action,
    resource
);
```

### site-roles.cedar
Role-based access at sites:
```cedar
// Administrator: full access at assigned sites
permit (
    principal in Gazebo::RoleGroup::"administrator",
    action,
    resource is Gazebo::Site
);

permit (
    principal in Gazebo::RoleGroup::"administrator",
    action,
    resource
) when {
    resource in Gazebo::Site::"*"
};

// Coordinator: create and edit, but not delete or admin
permit (
    principal in Gazebo::RoleGroup::"coordinator",
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create"],
    resource
);

// Contributor: edit projects and view everything
permit (
    principal in Gazebo::RoleGroup::"contributor",
    action == Gazebo::Action::"View",
    resource
);

permit (
    principal in Gazebo::RoleGroup::"contributor",
    action == Gazebo::Action::"Edit",
    resource is Gazebo::Project
);

// Viewer: read-only access
permit (
    principal in Gazebo::RoleGroup::"viewer",
    action == Gazebo::Action::"View",
    resource
);
```

### creator-privilege.cedar
If you created it, you can edit it:
```cedar
// Users can always edit resources they created
permit (
    principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
    resource
) when {
    resource has createdBy && resource.createdBy == principal
};
```

### module-access.cedar
Module visibility:
```cedar
// Users can view modules they have access to via RoleGroup
permit (
    principal,
    action == Gazebo::Action::"View",
    resource is Gazebo::Module
) when {
    principal in resource
};
```

## Lambda: permissions-api

```typescript
// lambdas/permissions-api/index.ts
import {
  VerifiedPermissionsClient,
  CreatePolicyCommand,
  DeletePolicyCommand,
  ListPoliciesCommand,
  GetPolicyCommand,
} from "@aws-sdk/client-verifiedpermissions";
import { APIGatewayProxyHandlerV2 } from "aws-lambda";

const client = new VerifiedPermissionsClient({});
const POLICY_STORE_ID = process.env.POLICY_STORE_ID!;

// Role assignment creates a policy template instance
// that links User to RoleGroup at a specific Site/Org

interface RoleAssignment {
  userId: string;
  role: "globalAdmin" | "administrator" | "coordinator" | "contributor" | "viewer";
  targetType: "Site" | "Organization";
  targetId: string;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  try {
    // POST /permissions/assign - Assign role to user
    if (method === "POST" && path === "/permissions/assign") {
      const body: RoleAssignment = JSON.parse(event.body || "{}");

      // Create a policy that puts this user in the role group for this target
      // Using template-linked policy for role assignment
      const policyStatement = `
        permit (
          principal == Gazebo::User::"${body.userId}",
          action,
          resource in Gazebo::${body.targetType}::"${body.targetId}"
        ) when {
          principal in Gazebo::RoleGroup::"${body.role}"
        };
      `;

      const command = new CreatePolicyCommand({
        policyStoreId: POLICY_STORE_ID,
        definition: {
          static: {
            statement: policyStatement,
            description: `${body.role} for user ${body.userId} at ${body.targetType}:${body.targetId}`,
          },
        },
      });

      const result = await client.send(command);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          policyId: result.policyId,
          assignment: body,
        }),
      };
    }

    // DELETE /permissions/assign/{policyId} - Remove role assignment
    if (method === "DELETE" && path.startsWith("/permissions/assign/")) {
      const policyId = path.split("/").pop()!;

      await client.send(
        new DeletePolicyCommand({
          policyStoreId: POLICY_STORE_ID,
          policyId,
        })
      );

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, deleted: policyId }),
      };
    }

    // GET /permissions/list - List all role assignments
    if (method === "GET" && path === "/permissions/list") {
      const command = new ListPoliciesCommand({
        policyStoreId: POLICY_STORE_ID,
      });

      const result = await client.send(command);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policies: result.policies,
        }),
      };
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Not found" }),
    };
  } catch (error: any) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
```

## Lambda: authorize-api

```typescript
// lambdas/authorize-api/index.ts
import {
  VerifiedPermissionsClient,
  IsAuthorizedCommand,
  BatchIsAuthorizedCommand,
  Decision,
} from "@aws-sdk/client-verifiedpermissions";
import { APIGatewayProxyHandlerV2 } from "aws-lambda";

const client = new VerifiedPermissionsClient({});
const POLICY_STORE_ID = process.env.POLICY_STORE_ID!;

interface AuthRequest {
  userId: string;
  action: "View" | "Edit" | "Create" | "Delete" | "Admin";
  resourceType: "Site" | "Project" | "Model" | "Module" | "Organization";
  resourceId: string;
  // Additional context
  resourceCreatedBy?: string;
  resourceParentSite?: string;
  userRoles?: string[]; // Roles this user has
}

interface BatchAuthRequest {
  requests: AuthRequest[];
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  try {
    // POST /authorize - Single authorization check
    if (method === "POST" && path === "/authorize") {
      const body: AuthRequest = JSON.parse(event.body || "{}");

      // Build entities for the request
      const entities = buildEntities(body);

      const command = new IsAuthorizedCommand({
        policyStoreId: POLICY_STORE_ID,
        principal: {
          entityType: "Gazebo::User",
          entityId: body.userId,
        },
        action: {
          actionType: "Gazebo::Action",
          actionId: body.action,
        },
        resource: {
          entityType: `Gazebo::${body.resourceType}`,
          entityId: body.resourceId,
        },
        entities,
      });

      const result = await client.send(command);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: result.decision,
          allowed: result.decision === Decision.ALLOW,
          determiningPolicies: result.determiningPolicies,
          errors: result.errors,
          request: body,
        }),
      };
    }

    // POST /authorize/batch - Multiple authorization checks
    if (method === "POST" && path === "/authorize/batch") {
      const body: BatchAuthRequest = JSON.parse(event.body || "{}");

      const requests = body.requests.map((req) => ({
        principal: {
          entityType: "Gazebo::User",
          entityId: req.userId,
        },
        action: {
          actionType: "Gazebo::Action",
          actionId: req.action,
        },
        resource: {
          entityType: `Gazebo::${req.resourceType}`,
          entityId: req.resourceId,
        },
        entities: buildEntities(req),
      }));

      const command = new BatchIsAuthorizedCommand({
        policyStoreId: POLICY_STORE_ID,
        requests,
      });

      const result = await client.send(command);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: result.results?.map((r, i) => ({
            request: body.requests[i],
            decision: r.decision,
            allowed: r.decision === Decision.ALLOW,
            determiningPolicies: r.determiningPolicies,
            errors: r.errors,
          })),
        }),
      };
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Not found" }),
    };
  } catch (error: any) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};

function buildEntities(req: AuthRequest) {
  const entities: any[] = [];

  // Add user entity with role memberships
  const userEntity: any = {
    identifier: { entityType: "Gazebo::User", entityId: req.userId },
    attributes: {},
    parents: [],
  };

  // Add role group memberships
  if (req.userRoles) {
    userEntity.parents = req.userRoles.map((role) => ({
      entityType: "Gazebo::RoleGroup",
      entityId: role,
    }));
  }

  entities.push(userEntity);

  // Add resource entity
  const resourceEntity: any = {
    identifier: {
      entityType: `Gazebo::${req.resourceType}`,
      entityId: req.resourceId,
    },
    attributes: {},
    parents: [],
  };

  // Add createdBy if provided
  if (req.resourceCreatedBy) {
    resourceEntity.attributes.createdBy = {
      entityIdentifier: {
        entityType: "Gazebo::User",
        entityId: req.resourceCreatedBy,
      },
    };
  }

  // Add parent site if provided (for Projects, Models)
  if (req.resourceParentSite && req.resourceType !== "Site") {
    resourceEntity.parents.push({
      entityType: "Gazebo::Site",
      entityId: req.resourceParentSite,
    });
  }

  entities.push(resourceEntity);

  // Add role group entities (needed for policy evaluation)
  const roleGroups = ["globalAdmin", "administrator", "coordinator", "contributor", "viewer"];
  roleGroups.forEach((role) => {
    entities.push({
      identifier: { entityType: "Gazebo::RoleGroup", entityId: role },
      attributes: { name: { string: role } },
    });
  });

  return { entityList: entities };
}
```

## React Frontend Components

### PermissionManager.tsx
Assign roles to users:
```tsx
// frontend/src/components/PermissionManager.tsx
import { useState } from "react";
import { api } from "../api/client";

const ROLES = ["globalAdmin", "administrator", "coordinator", "contributor", "viewer"];
const TARGET_TYPES = ["Site", "Organization"];

export function PermissionManager() {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState(ROLES[1]);
  const [targetType, setTargetType] = useState(TARGET_TYPES[0]);
  const [targetId, setTargetId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const assignRole = async () => {
    setLoading(true);
    try {
      const res = await api.assignRole({ userId, role, targetType, targetId });
      setResult(res);
    } catch (err: any) {
      setResult({ error: err.message });
    }
    setLoading(false);
  };

  return (
    <div className="card">
      <h2>Assign Role</h2>
      <div className="form-group">
        <label>User ID</label>
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="e.g., user-123"
        />
      </div>
      <div className="form-group">
        <label>Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>Target Type</label>
        <select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
          {TARGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>Target ID</label>
        <input
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          placeholder="e.g., site-456"
        />
      </div>
      <button onClick={assignRole} disabled={loading}>
        {loading ? "Assigning..." : "Assign Role"}
      </button>
      {result && (
        <pre className="result">{JSON.stringify(result, null, 2)}</pre>
      )}
    </div>
  );
}
```

### AuthChecker.tsx
Test authorization decisions:
```tsx
// frontend/src/components/AuthChecker.tsx
import { useState } from "react";
import { api } from "../api/client";

const ACTIONS = ["View", "Edit", "Create", "Delete", "Admin"];
const RESOURCE_TYPES = ["Site", "Project", "Model", "Module", "Organization"];
const ROLES = ["globalAdmin", "administrator", "coordinator", "contributor", "viewer"];

export function AuthChecker() {
  const [userId, setUserId] = useState("");
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [action, setAction] = useState(ACTIONS[0]);
  const [resourceType, setResourceType] = useState(RESOURCE_TYPES[0]);
  const [resourceId, setResourceId] = useState("");
  const [resourceCreatedBy, setResourceCreatedBy] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const toggleRole = (role: string) => {
    setUserRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const checkAuth = async () => {
    setLoading(true);
    try {
      const res = await api.checkAuthorization({
        userId,
        action,
        resourceType,
        resourceId,
        resourceCreatedBy: resourceCreatedBy || undefined,
        userRoles,
      });
      setResult(res);
    } catch (err: any) {
      setResult({ error: err.message });
    }
    setLoading(false);
  };

  return (
    <div className="card">
      <h2>Check Authorization</h2>

      <div className="form-group">
        <label>User ID</label>
        <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="e.g., user-123" />
      </div>

      <div className="form-group">
        <label>User Roles</label>
        <div className="checkbox-group">
          {ROLES.map((role) => (
            <label key={role} className="checkbox-label">
              <input
                type="checkbox"
                checked={userRoles.includes(role)}
                onChange={() => toggleRole(role)}
              />
              {role}
            </label>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>Action</label>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label>Resource Type</label>
        <select value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
          {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label>Resource ID</label>
        <input value={resourceId} onChange={(e) => setResourceId(e.target.value)} placeholder="e.g., site-456" />
      </div>

      <div className="form-group">
        <label>Resource Created By (optional)</label>
        <input value={resourceCreatedBy} onChange={(e) => setResourceCreatedBy(e.target.value)} placeholder="e.g., user-789" />
      </div>

      <button onClick={checkAuth} disabled={loading}>
        {loading ? "Checking..." : "Check Authorization"}
      </button>

      {result && (
        <div className={`result ${result.allowed ? "allowed" : "denied"}`}>
          <div className="decision">{result.allowed ? "✓ ALLOWED" : "✗ DENIED"}</div>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
```

### ScenarioRunner.tsx
Pre-built test scenarios:
```tsx
// frontend/src/components/ScenarioRunner.tsx
import { useState } from "react";
import { api } from "../api/client";

const SCENARIOS = [
  {
    name: "Global Admin can do anything",
    requests: [
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Delete", resourceType: "Site", resourceId: "any-site" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Admin", resourceType: "Organization", resourceId: "any-org" },
    ],
    expectedAll: true,
  },
  {
    name: "Viewer can only view",
    requests: [
      { userId: "viewer-1", userRoles: ["viewer"], action: "View", resourceType: "Site", resourceId: "site-1" },
      { userId: "viewer-1", userRoles: ["viewer"], action: "Edit", resourceType: "Site", resourceId: "site-1" },
      { userId: "viewer-1", userRoles: ["viewer"], action: "Delete", resourceType: "Site", resourceId: "site-1" },
    ],
    expected: [true, false, false],
  },
  {
    name: "Creator can edit their own resources",
    requests: [
      { userId: "user-1", userRoles: [], action: "Edit", resourceType: "Project", resourceId: "proj-1", resourceCreatedBy: "user-1" },
      { userId: "user-1", userRoles: [], action: "Edit", resourceType: "Project", resourceId: "proj-2", resourceCreatedBy: "user-2" },
    ],
    expected: [true, false],
  },
  {
    name: "Contributor can edit projects but not sites",
    requests: [
      { userId: "contrib-1", userRoles: ["contributor"], action: "Edit", resourceType: "Project", resourceId: "proj-1" },
      { userId: "contrib-1", userRoles: ["contributor"], action: "Edit", resourceType: "Site", resourceId: "site-1" },
      { userId: "contrib-1", userRoles: ["contributor"], action: "View", resourceType: "Site", resourceId: "site-1" },
    ],
    expected: [true, false, true],
  },
];

export function ScenarioRunner() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const runAllScenarios = async () => {
    setLoading(true);
    const scenarioResults = [];

    for (const scenario of SCENARIOS) {
      const res = await api.batchCheckAuthorization({ requests: scenario.requests });
      const actuals = res.results.map((r: any) => r.allowed);
      const expected = scenario.expected || scenario.requests.map(() => scenario.expectedAll);
      const passed = actuals.every((a: boolean, i: number) => a === expected[i]);

      scenarioResults.push({
        name: scenario.name,
        passed,
        results: res.results,
        expected,
      });
    }

    setResults(scenarioResults);
    setLoading(false);
  };

  return (
    <div className="card">
      <h2>Test Scenarios</h2>
      <button onClick={runAllScenarios} disabled={loading}>
        {loading ? "Running..." : "Run All Scenarios"}
      </button>

      {results.map((scenario, i) => (
        <div key={i} className={`scenario ${scenario.passed ? "passed" : "failed"}`}>
          <h3>{scenario.passed ? "✓" : "✗"} {scenario.name}</h3>
          <div className="scenario-results">
            {scenario.results.map((r: any, j: number) => (
              <div key={j} className={`check ${r.allowed === scenario.expected[j] ? "match" : "mismatch"}`}>
                {r.request.action} {r.request.resourceType}:
                {r.allowed ? " ALLOWED" : " DENIED"}
                {r.allowed !== scenario.expected[j] && " (expected " + scenario.expected[j] + ")"}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

## CDK Infrastructure

```typescript
// infrastructure/lib/poc-stack.ts
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
    const schema = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../authorization/schema.json"), "utf-8")
    );

    // Create Policy Store
    const policyStore = new verifiedpermissions.CfnPolicyStore(this, "PolicyStore", {
      validationSettings: { mode: "STRICT" },
      schema: { cedarJson: JSON.stringify(schema) },
      description: "Gazebo POC Policy Store",
    });

    // Load and create Cedar policies
    const policiesDir = path.join(__dirname, "../../authorization/policies");
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

    // Routes
    httpApi.addRoutes({
      path: "/permissions/{proxy+}",
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        "PermissionsIntegration",
        permissionsLambda
      ),
    });

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
    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.url! });
    new cdk.CfnOutput(this, "PolicyStoreId", { value: policyStore.attrPolicyStoreId });
  }
}
```

## Running the POC

```bash
# 1. Deploy infrastructure
cd infrastructure
npm install
cdk deploy

# 2. Note the API URL from outputs

# 3. Run frontend locally
cd ../frontend
npm install
echo "VITE_API_URL=<api-url-from-step-2>" > .env.local
npm run dev

# 4. Open http://localhost:5173
```

## What the POC Demonstrates

1. **Role Assignment** - Add users to roles at specific sites/organizations
2. **Authorization Checks** - Test "Can user X do action Y on resource Z?"
3. **Gazebo Role Mapping**:
   - `globalAdmin` → Full access everywhere
   - `administrator` → Full access at assigned locations
   - `coordinator` → Create/edit but not delete
   - `contributor` → Edit projects, view everything
   - `viewer` → Read-only
4. **Creator Privilege** - Users can always edit what they created
5. **Hierarchy** - Resources belong to sites, sites belong to organizations
