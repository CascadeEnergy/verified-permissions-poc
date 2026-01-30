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
- `WebsiteUrl` - The CloudFront URL for the frontend
- `WebsiteBucketName` - S3 bucket for frontend assets

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

## CI/CD Pipeline

Set up a self-mutating CodePipeline for automatic deployments on push to main.

### Prerequisites

1. Give the repo access to your GitHub machine users group (in GitHub console)
2. The `CascadeEnergy` secret in AWS Secrets Manager must have access to the repo

### Deploy the Pipeline

```bash
cd packages/infra
npm install

npx cdk deploy GazeboPocPipeline --profile sandbox \
  -c repoOwner="CascadeEnergy" \
  -c repoName="verified-permissions-poc"
```

The pipeline is self-mutating - it will:
1. Update itself when pipeline code changes
2. Deploy the CDK infrastructure (API, Lambdas, Verified Permissions, S3, CloudFront)
3. Build the frontend with the correct API URL
4. Deploy frontend to S3 and invalidate CloudFront cache

### What Gets Deployed

On every push to `main`:
- **GazeboPocStack**: API Gateway, Lambdas, Verified Permissions Policy Store, S3, CloudFront
- **Frontend**: Built and deployed to S3/CloudFront

### Manual Deploy (without pipeline)

For local development or one-off deployments:
```bash
npx cdk deploy GazeboPocStack --profile sandbox
```

## Cleanup

```bash
cd packages/infra
npx cdk destroy GazeboPocPipelineStack --profile sandbox  # Remove pipeline
npx cdk destroy GazeboPocStack --profile sandbox          # Remove POC
```
