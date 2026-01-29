# Gazebo Verified Permissions POC

Proof of concept for migrating Gazebo's permission system to AWS Verified Permissions.

## Project Structure

```
verified-permissions-poc/
├── authorization/           # Cedar policies and schema
│   ├── schema.json         # Gazebo entity types and actions
│   └── policies/           # Cedar policy files
├── packages/
│   ├── frontend/           # React + Vite app
│   │   └── src/
│   │       ├── components/ # UI components
│   │       └── api/        # API client
│   ├── infra/              # AWS CDK
│   │   └── lib/poc-stack.ts
│   └── lambdas/            # Lambda functions
│       ├── permissions-api/# Role assignment CRUD
│       ├── authorize-api/  # Authorization checks
│       └── shared/         # Shared types and utilities
├── PLAN.md                 # Migration plan
├── POC.md                  # POC details
└── REFERENCE.md            # Generic patterns
```

## Quick Start

### 1. Deploy Infrastructure

```bash
cd packages/infra
npm install
npx cdk bootstrap  # First time only
npx cdk deploy
```

Note the outputs:
- `ApiUrl` - The API Gateway URL
- `PolicyStoreId` - The Verified Permissions Policy Store ID

### 2. Run Frontend

```bash
cd packages/frontend
npm install

# Create .env.local with your API URL
echo "VITE_API_URL=https://xxxxx.execute-api.us-west-2.amazonaws.com" > .env.local

npm run dev
```

Open http://localhost:5173

## Features

### Check Authorization
Test if a user with specific roles can perform an action:
- Select user roles (globalAdmin, administrator, coordinator, contributor, viewer)
- Choose an action (View, Edit, Create, Delete, Admin)
- Specify a resource type and ID
- Optionally set "created by" for creator privilege testing

### Manage Permissions
Create and delete role assignment policies dynamically.

### Test Scenarios
Run pre-built scenarios that validate Gazebo role behaviors:
- Global Admin can do anything
- Viewer can only view
- Creator can edit their own resources
- Contributor can edit projects but not sites
- Coordinator can create but not delete
- Administrator has full access

## Cedar Policies

### Roles (from most to least privileged)

| Role | Capabilities |
|------|-------------|
| globalAdmin | Full access to everything |
| administrator | Full access at assigned locations |
| coordinator | View, Edit, Create (no Delete or Admin) |
| contributor | View everything, Edit projects only |
| viewer | View only |

### Special Rules

- **Creator Privilege**: Users can always View/Edit resources they created
- **Hierarchy**: Resources belong to Sites, Sites belong to Regions/Organizations

## Cleanup

```bash
cd packages/infra
npx cdk destroy
```
