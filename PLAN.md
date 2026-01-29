# AWS Verified Permissions - Migration Plan

> **Related Documents:**
> - [POC.md](./POC.md) - Proof of concept implementation details
> - [REFERENCE.md](./REFERENCE.md) - Generic integration patterns and examples

---

## 1. What is AWS Verified Permissions?

AWS Verified Permissions is a **fine-grained authorization service** that uses **Cedar**, an open-source policy language, to define and evaluate authorization policies.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Policy Store** | Container for policies, schema, and configuration |
| **Policies** | Cedar statements defining who can do what on which resources |
| **Schema** | Defines the structure of principals, actions, and resources |
| **Entities** | Runtime data about users, groups, and resources |

### How It Works

```
Request → Verified Permissions → Decision (ALLOW/DENY)
              ↓
         Policy Store
         (Policies + Schema)
```

### Cedar Example

```cedar
// Allow admins to perform any action
permit (
    principal in Group::"Admins",
    action,
    resource
);

// Allow users to edit their own resources
permit (
    principal,
    action == Action::"Edit",
    resource
) when {
    resource.owner == principal
};
```

---

## 2. Current Gazebo Permission System

### Overview

| Service | Purpose | Status |
|---------|---------|--------|
| **permission-service** | Write operations, relationship CRUD | Active (source of truth) |
| **authorization-service** | Fast cached reads, transitive closure | Problematic (cache sync issues) |

### Architecture

```
Writes:  Admin → permission-service → OpenSearch
Reads:   Apps  → authorization-service (cache) → OpenSearch
```

### Data Model

**Object Types:** User, Organization, Region, Site, RoleGroup, Module, Measurable, Project

**Relationship:**
```javascript
{
  source: { type: "user", id: "1000962" },
  target: { type: "site", id: "1360" },
  roleList: ["accountManager", "coordinator"]
}
```

**Roles:** globalAdmin, administrator, coordinator, accountManager, facilitator, champion, contributor, viewer

### Current Problems

1. **Cache sync across tasks** - Each ECS task has its own cache, can diverge
2. **Slow initial load** - Must scroll through entire OpenSearch index
3. **Memory pressure** - Full graph in memory per task
4. **Stale reads** - 2.5s polling window + propagation delay

---

## 3. Mapping to Cedar/Verified Permissions

### Conceptual Mapping

| Current | Cedar Equivalent |
|---------|------------------|
| User | Principal (`User` entity) |
| Site, Organization | Resource (entity types) |
| Role (administrator, viewer) | Group membership + policies |
| roleList on relationships | User membership in RoleGroup |
| Graph traversal | Cedar's `in` hierarchy |

### Cedar Schema for Gazebo

```json
{
  "Gazebo": {
    "entityTypes": {
      "User": { "memberOfTypes": ["RoleGroup", "Organization", "Region", "Site"] },
      "RoleGroup": { "memberOfTypes": ["Module"] },
      "Organization": {},
      "Region": { "memberOfTypes": ["Organization"] },
      "Site": { "memberOfTypes": ["Region", "Organization"] },
      "Project": { "memberOfTypes": ["Site"], "attributes": { "createdBy": "User" } },
      "Module": {}
    },
    "actions": {
      "View": { "resourceTypes": ["Site", "Project", "Module"] },
      "Edit": { "resourceTypes": ["Site", "Project"] },
      "Create": { "resourceTypes": ["Site"] },
      "Delete": { "resourceTypes": ["Site", "Project"] },
      "Admin": { "resourceTypes": ["Site", "Organization"] }
    }
  }
}
```

### Key Cedar Policies

```cedar
// globalAdmin - full access
permit (principal in Gazebo::RoleGroup::"globalAdmin", action, resource);

// viewer - read only
permit (principal in Gazebo::RoleGroup::"viewer", action == Gazebo::Action::"View", resource);

// creator privilege
permit (principal, action in [Gazebo::Action::"View", Gazebo::Action::"Edit"], resource)
when { resource has createdBy && resource.createdBy == principal };
```

### What Changes

| Aspect | Current | With Verified Permissions |
|--------|---------|---------------------------|
| Permission model | Complex (bitmasks + roles) | Pure role-based |
| Read latency | 10-200ms (cache dependent) | ~10-50ms (AWS managed) |
| Cache consistency | Problematic | Strongly consistent |
| Graph traversal | Custom BFS code | Built into Cedar `in` |
| Policy logic | Hardcoded in services | Declarative Cedar |
| Auditability | Manual logging | Built-in CloudTrail |

### What Stays vs. Retires

**Keep:**
- permission-service write endpoints (add AVP sync)
- User Admin UI

**Retire:**
- authorization-service
- In-memory caching
- Custom transitive closure code
- OpenSearch read indices (eventually)

---

## 4. Migration Strategy

### Phase 1: Dual-Write
```
permission-service
  ├─→ OpenSearch (existing)
  └─→ Verified Permissions (new)
```

### Phase 2: Shadow Mode
```
App Request
  ├─→ authorization-service (primary)
  └─→ Verified Permissions (shadow, compare)
```

### Phase 3: Gradual Cutover
- Route 10% → 50% → 100% to AVP
- Keep authorization-service as fallback

### Phase 4: Retirement
- Remove authorization-service
- Simplify permission-service
- Archive OpenSearch read indices

### Data Sync

**Sync to AVP:**
- Users (with role assignments)
- Organizations, Regions, Sites (hierarchy)
- RoleGroups, Modules

**Don't sync:**
- Individual measurables (too many - use site-level check)
- Legacy bitmask values

---

## 5. Next Steps

### Immediate (POC)
1. [ ] Set up AWS Verified Permissions in dev account
2. [ ] Deploy POC (see [POC.md](./POC.md))
3. [ ] Test Cedar policies with Gazebo scenarios
4. [ ] Demo to team

### Short-term (Shadow Mode)
5. [ ] Modify permission-service for dual-write
6. [ ] Create `hapi-gazebo-avp` plugin
7. [ ] Deploy shadow comparison
8. [ ] Fix parity issues

### Medium-term (Cutover)
9. [ ] Feature flag for AVP vs authorization-service
10. [ ] Gradual rollout: 10% → 50% → 100%
11. [ ] Update `gazebo-hapi-chassis`

### Long-term (Cleanup)
12. [ ] Deprecate authorization-service
13. [ ] Simplify permission-service
14. [ ] Archive OpenSearch read indices

---

## 6. Resources

- [AWS Verified Permissions Docs](https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/what-is-avp.html)
- [Cedar Language Reference](https://docs.cedarpolicy.com/)
- [Cedar Playground](https://www.cedarpolicy.com/en/playground)
- [AWS CDK - Verified Permissions](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_verifiedpermissions-readme.html)
