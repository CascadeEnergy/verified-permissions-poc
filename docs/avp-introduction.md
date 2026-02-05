# AWS Verified Permissions Introduction

## Overview

This POC demonstrates how AWS Verified Permissions (AVP) can be used to manage Gazebo's authorization model. AVP provides a centralized, policy-based authorization service that evaluates access decisions based on Cedar policies.

## Key Concepts

### Cedar Policy Language

Cedar is a domain-specific language for defining authorization policies. Key features:

- **Default Deny**: If no policy permits an action, it's denied
- **Hierarchical Resources**: Resources can be organized in hierarchies (Site → Region → Organization)
- **Template Policies**: Reusable policy templates that can be instantiated with specific principals and resources

### Entity Hierarchy

The POC uses a hierarchical entity model:

```
System (gazebo)
├── Organization
│   └── Region
│       └── Site
│           └── Project/Model
└── Client
    └── Program
        └── Cohort
            └── Participation
```

**All entities ultimately belong to System**, which is the root of the hierarchy. This enables global admin access by assigning an administrator to the System entity.

## Authorization Model

### Template-Linked Policies (Primary Access Control)

All access is controlled through **template-linked policies**. These bind a specific user to a specific resource via a policy template:

```json
{
  "template": "coordinator",
  "principal": { "entityType": "Gazebo::User", "entityId": "alice@example.com" },
  "resource": { "entityType": "Gazebo::Site", "entityId": "portland-manufacturing" }
}
```

This creates a policy that grants Alice coordinator-level access to the Portland Manufacturing site and everything within it.

### Permission Levels (Templates)

| Level        | View | Edit | Create | Delete | Admin |
|--------------|------|------|--------|--------|-------|
| Viewer       |  ✓   |      |        |        |       |
| Contributor  |  ✓   |  ✓   |        |        |       |
| Champion     |  ✓   |  ✓   |  ✓     |        |       |
| Facilitator  |  ✓   |  ✓   |  ✓     |        |       |
| Coordinator  |  ✓   |  ✓   |  ✓     |  ✓     |       |
| Administrator|  ✓   |  ✓   |  ✓     |  ✓     |  ✓    |

### Global Admin Access

Global admin is implemented as a template-linked policy that assigns the **administrator template to the System entity**:

```json
{
  "id": "GlobalAdmin",
  "template": "administrator",
  "principal": { "entityType": "Gazebo::User", "entityId": "admin@cascade.com" },
  "resource": { "entityType": "Gazebo::System", "entityId": "gazebo" }
}
```

Since all Organizations and Clients are `memberOf` System, this grants full access to everything.

**Why not use roles?** Role-based access (where users claim a "globalAdmin" role) is less secure because:
- Users could potentially forge role claims
- Access is controlled by user claims, not the policy store
- It requires trusting the authentication token's role claims

With template-linked policies, access is **always controlled by the policy store** - users cannot claim access they don't have.

### Static Policies

Two static policies are always active:

1. **Creator Privilege**: Users can View and Edit resources they created
   ```cedar
   permit (
       principal,
       action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
       resource
   ) when {
       resource has createdBy && resource.createdBy == principal
   };
   ```

2. **Cycles Readable**: Any authenticated user can View Cycle entities (reference data)
   ```cedar
   permit (
       principal,
       action == Gazebo::Action::"View",
       resource is Gazebo::Cycle
   );
   ```

## Hierarchy Traversal

When a user is assigned a permission level at a higher level in the hierarchy, they gain access to all resources within that scope:

- **Site-level assignment**: Access to the Site and its Projects/Models
- **Region-level assignment**: Access to all Sites in the Region
- **Organization-level assignment**: Access to all Regions and Sites in the Organization
- **System-level assignment**: Access to everything (global admin)

Example: Dan has contributor access to Region 10 (West Region). This grants him View and Edit access to:
- Region 10 itself
- All Sites in Region 10 (portland-manufacturing, seattle-hq)
- All Projects/Models in those Sites

## Example Assignments

| User | Template | Target | Access Scope |
|------|----------|--------|--------------|
| admin@cascade.com | administrator | System::gazebo | Everything |
| alice@example.com | coordinator | Site::portland-manufacturing | Site + children |
| dan@cascade.com | contributor | Region::10 | Region + all sites within |
| eve@cascade.com | viewer | Organization::1 | Org + all regions/sites within |

## API Endpoints

- `POST /authorize` - Check single authorization
- `POST /authorize/batch` - Check multiple authorizations
- `POST /permissions/assign` - Create template-linked policy
- `DELETE /permissions/assign/{policyId}` - Remove policy
- `GET /permissions/list` - List policies

## Testing

Health check tests are in `packages/health/` and validate:
- Global admin access via System assignment
- Users without assignment are denied
- Creator privilege
- Hierarchy traversal (Site → Region → Organization)
- Permission level capabilities

Run with: `API_URL=<your-api-url> npm run health -w packages/health`
