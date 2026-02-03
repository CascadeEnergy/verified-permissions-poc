# Hierarchy Management: Current State vs AVP Migration

## Executive Summary

**Key Finding:** The hierarchy data you need for AVP **already exists** in your current services. You don't need a new data store—you need to query your existing services (company-service, site-service) at authorization time and pass that context to AVP.

---

## Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CURRENT PERMISSION SYSTEM                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌────────────────────┐     ┌───────────────────────┐ │
│  │ Application  │────▶│ authorization-     │────▶│ permission-service    │ │
│  │              │     │ service            │     │ (Elasticsearch)       │ │
│  │ "Can user 13 │     │                    │     │                       │ │
│  │  edit site   │     │ 1. Load all perms  │     │ permissions-          │ │
│  │  52?"        │     │    into memory     │     │ relationship-read     │ │
│  │              │     │ 2. BFS graph       │     │                       │ │
│  │              │     │    traversal       │     │ permissions-role-read │ │
│  │              │◀────│ 3. Return bitmask  │     │                       │ │
│  └──────────────┘     └────────────────────┘     └───────────────────────┘ │
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐                                     │
│  │ company-     │     │ site-service │   Hierarchy data lives HERE         │
│  │ service      │     │ (OpenSearch) │   but is NOT used for authz         │
│  │ (DynamoDB)   │     │              │                                     │
│  │              │     │ site.        │                                     │
│  │ company.     │     │ companyId    │                                     │
│  │ parentId     │     │   ↓          │                                     │
│  │   ↓          │     │ references   │                                     │
│  │ hierarchy    │     │ org or group │                                     │
│  └──────────────┘     └──────────────┘                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Current Data Model Details

### 1. Permission Relationships (Elasticsearch)

**Index:** `permissions-relationship-read`

```json
{
  "source": { "type": "user", "id": "13" },
  "target": { "type": "site", "id": "52" },
  "permissionMap": {
    "$self": 3,        // 3 = read (1) + write (2)
    "$default": 3,     // default for child types
    "measurable": 7    // 7 = read + write + admin
  },
  "roleList": ["administrator"]
}
```

**Permission Bits:**
| Bit | Value | Meaning |
|-----|-------|---------|
| 001 | 1 | Read |
| 010 | 2 | Write |
| 100 | 4 | Admin |
| 111 | 7 | Full access |

### 2. How Hierarchy Works Today

The authorization-service does **graph traversal** at query time:

```javascript
// From authorization-service/lib/computePermissions.js
// BFS traversal: user → cohort → company → site → measurable

User:13
  └─→ Cohort:22 (permissionMap: {$self: 1, $default: 1})
        └─→ Company:31 (permissionMap: {$self: 6, site: 3})
              └─→ Site:52 (permissionMap: {$self: 3, measurable: 7})
                    └─→ Measurable:62 (terminal node)

// Effective permission for user:13 on site:52:
// Walk the path, AND permissions at each level, OR multiple paths
```

**Critical Insight:** The hierarchy is stored IN THE PERMISSION GRAPH, not in company/site services. Each edge in the graph represents both:
1. A permission grant
2. An implicit hierarchy relationship

### 3. Company Entity (DynamoDB)

**Table:** `production-organization`

```javascript
{
  id: "42",
  companyId: 42,
  name: "Cascade Energy",
  parentId: 1,           // ← Hierarchy! Points to parent company
  createdBy: "1",
  created: "2017-01-01T00:00:00.000Z",
  modified: "2017-01-01T00:00:00.000Z",
  deleted: null
}
```

### 4. Site Entity (OpenSearch)

**Index:** `site-read`

```javascript
{
  siteId: "52",
  name: "Portland Manufacturing",
  companyId: "1000332",     // ← Hierarchy! Can be "organization:X" or "region:X"
  timezone: "America/Los_Angeles",
  createdTimestamp: "2024-01-15T00:00:00.000Z",
  // ...
}
```

---

## The Gap: Why Hierarchy Isn't Flowing to AVP

Currently, the POC passes only the **immediate parent**:

```javascript
// Current: packages/lambdas/shared/entities.ts
if (req.resourceParentSite) {
  resourceEntity.parents.push({
    entityType: "Gazebo::Site",
    entityId: req.resourceParentSite,
  });
}
// Site entity is added but WITHOUT its parents (region, org)
```

**Result:** Cedar can't traverse `Project → Site → Region → Organization`

---

## Migration Architecture: AVP with Hierarchy Lookup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AVP PERMISSION SYSTEM                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌────────────────────┐     ┌───────────────────────┐ │
│  │ Application  │────▶│ authorization-     │────▶│ AWS Verified          │ │
│  │              │     │ service (new)      │     │ Permissions           │ │
│  │ "Can user 13 │     │                    │     │                       │ │
│  │  edit site   │     │ 1. Lookup hierarchy│     │ Policies:             │ │
│  │  52?"        │     │    from existing   │     │ - Static policies     │ │
│  │              │     │    services        │     │ - Template-linked     │ │
│  │              │     │ 2. Build entity    │     │   policies (role      │ │
│  │              │◀────│    context         │     │   assignments)        │ │
│  │              │     │ 3. Call AVP        │     │                       │ │
│  └──────────────┘     └────────────────────┘     └───────────────────────┘ │
│                                │                                            │
│                                │ queries                                    │
│                                ▼                                            │
│  ┌──────────────┐     ┌──────────────┐                                     │
│  │ company-     │     │ site-service │   SAME services, now queried        │
│  │ service      │     │              │   for hierarchy at authz time       │
│  │ (DynamoDB)   │     │ (OpenSearch) │                                     │
│  └──────────────┘     └──────────────┘                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## What Replaces What

| Current System | AVP Equivalent |
|----------------|----------------|
| `permissions-relationship-read` edges | Template-linked policies |
| `permissions-role-read` role definitions | Policy templates |
| `permissionMap` bitwise values | Actions (View, Edit, Admin) |
| Graph traversal in authorization-service | Cedar `resource in ?resource` with entity hierarchy |
| `$self`, `$default` inheritance | Entity `parents` array passed to AVP |

---

## Implementation: Hierarchy Lookup Service

### Option A: Query Existing Services Directly

```typescript
// packages/lambdas/shared/hierarchyLookup.ts

interface HierarchyNode {
  type: "Site" | "Region" | "Organization";
  id: string;
  parents: Array<{ type: "Region" | "Organization"; id: string }>;
}

/**
 * Fetches hierarchy from existing company-service and site-service.
 * This data ALREADY EXISTS - we just need to query it.
 *
 * Hierarchy model:
 *   Organization = company with parentId = null
 *   Region = company with parentId = <org_id>
 *   Site.companyId = "organization:X" or "region:Y"
 */
export class HierarchyLookupService {

  constructor(
    private companyServiceUrl: string,  // e.g., "http://company.energysensei.services"
    private siteServiceUrl: string       // e.g., "http://site.energysensei.services"
  ) {}

  /**
   * Get the full ancestor chain for a site.
   * Returns: Site → Region → Organization  OR  Site → Organization
   */
  async getSiteHierarchy(siteId: string): Promise<HierarchyNode[]> {
    const nodes: HierarchyNode[] = [];

    // 1. Fetch site from site-service
    const site = await this.fetchSite(siteId);

    // 2. Parse companyId: "organization:123" or "region:456"
    const parentRef = this.parseCompanyId(site.companyId);

    // 3. Fetch the parent company record
    const company = await this.fetchCompany(parentRef.id);

    if (company.parentId) {
      // It's a Region (has a parent) → Site belongs to Region → Region belongs to Org
      nodes.push({
        type: "Site",
        id: siteId,
        parents: [{ type: "Region", id: parentRef.id }]
      });

      nodes.push({
        type: "Region",
        id: parentRef.id,
        parents: [{ type: "Organization", id: String(company.parentId) }]
      });

      nodes.push({
        type: "Organization",
        id: String(company.parentId),
        parents: []  // Organizations are root nodes
      });
    } else {
      // It's an Organization (no parent) → Site belongs directly to Org
      nodes.push({
        type: "Site",
        id: siteId,
        parents: [{ type: "Organization", id: parentRef.id }]
      });

      nodes.push({
        type: "Organization",
        id: parentRef.id,
        parents: []
      });
    }

    return nodes;
  }

  private async fetchSite(siteId: string): Promise<{ companyId: string }> {
    const response = await fetch(`${this.siteServiceUrl}/site/${siteId}`);
    if (!response.ok) throw new Error(`Site ${siteId} not found`);
    return response.json();
  }

  private async fetchCompany(companyId: string): Promise<{ parentId: number | null }> {
    const response = await fetch(`${this.companyServiceUrl}/company/${companyId}`);
    if (!response.ok) throw new Error(`Company ${companyId} not found`);
    return response.json();
  }

  private parseCompanyId(companyId: string): { type: "organization" | "region"; id: string } {
    // Format: "organization:123" or "region:456"
    const [type, id] = companyId.split(":");
    if (type === "organization" || type === "region") {
      return { type, id };
    }
    throw new Error(`Invalid companyId format: ${companyId}`);
  }
}
```

### Option B: Cache Hierarchy Data

For performance, cache the hierarchy lookups:

```typescript
// packages/lambdas/shared/hierarchyCache.ts

import NodeCache from "node-cache";

export class CachedHierarchyService {
  private cache: NodeCache;
  private lookupService: HierarchyLookupService;

  constructor(lookupService: HierarchyLookupService) {
    this.lookupService = lookupService;
    this.cache = new NodeCache({
      stdTTL: 300,        // 5 minute TTL (hierarchy changes rarely)
      checkperiod: 60,
    });
  }

  async getSiteHierarchy(siteId: string): Promise<HierarchyNode[]> {
    const cacheKey = `site:${siteId}`;

    const cached = this.cache.get<HierarchyNode[]>(cacheKey);
    if (cached) return cached;

    const hierarchy = await this.lookupService.getSiteHierarchy(siteId);
    this.cache.set(cacheKey, hierarchy);

    return hierarchy;
  }

  // Invalidate when hierarchy changes (called from company-service/site-service webhooks)
  invalidateSite(siteId: string): void {
    this.cache.del(`site:${siteId}`);
  }
}
```

---

## Updated Entity Builder

```typescript
// packages/lambdas/shared/entities.ts (updated)

import { HierarchyLookupService } from "./hierarchyLookup";

export async function buildEntities(
  req: AuthRequest,
  hierarchyService: HierarchyLookupService
) {
  const entities: any[] = [];
  const addedEntities = new Set<string>();

  const addEntity = (entity: any) => {
    const key = `${entity.identifier.entityType}::${entity.identifier.entityId}`;
    if (!addedEntities.has(key)) {
      addedEntities.add(key);
      entities.push(entity);
    }
  };

  // Add user entity
  addEntity({
    identifier: { entityType: "Gazebo::User", entityId: req.userId },
    attributes: {},
    parents: req.userRoles?.map(role => ({
      entityType: "Gazebo::Role",
      entityId: role,
    })) || [],
  });

  // Add resource entity with immediate parent
  const resourceParents: any[] = [];
  if (req.resourceParentSite && req.resourceType !== "Site") {
    resourceParents.push({
      entityType: "Gazebo::Site",
      entityId: req.resourceParentSite,
    });
  }

  addEntity({
    identifier: {
      entityType: `Gazebo::${req.resourceType}`,
      entityId: req.resourceId,
    },
    attributes: req.resourceCreatedBy ? {
      createdBy: {
        entityIdentifier: {
          entityType: "Gazebo::User",
          entityId: req.resourceCreatedBy,
        },
      },
    } : {},
    parents: resourceParents,
  });

  // ══════════════════════════════════════════════════════════════════
  // NEW: Fetch and add the full hierarchy chain
  // ══════════════════════════════════════════════════════════════════

  const siteId = req.resourceType === "Site"
    ? req.resourceId
    : req.resourceParentSite;

  if (siteId) {
    const hierarchyChain = await hierarchyService.getSiteHierarchy(siteId);

    for (const node of hierarchyChain) {
      addEntity({
        identifier: {
          entityType: `Gazebo::${node.type}`,
          entityId: node.id,
        },
        attributes: {},
        parents: node.parents.map(p => ({
          entityType: `Gazebo::${p.type}`,
          entityId: p.id,
        })),
      });
    }
  }

  // Add role entities
  ROLES.forEach((role) => {
    addEntity({
      identifier: { entityType: "Gazebo::Role", entityId: role },
      attributes: { name: { string: role } },
    });
  });

  return { entityList: entities };
}
```

---

## Example: Complete Authorization Request

**Scenario:** Can Dan (who has coordinator role on west-region) edit a project in Portland Manufacturing?

### Step 1: Application Makes Request

```javascript
POST /authorize
{
  userId: "dan@cascade.com",
  action: "Edit",
  resourceType: "Project",
  resourceId: "my-new-project",
  resourceParentSite: "portland-manufacturing"
}
```

### Step 2: Authorization Service Fetches Hierarchy

```javascript
// Query site-service
GET /site/portland-manufacturing
→ { siteId: "portland-manufacturing", companyId: "region:west-region", ... }

// Query company-service for region
GET /company/west-region
→ { companyId: "west-region", parentId: 1, name: "West Region", ... }

// Query company-service for organization
GET /company/1
→ { companyId: 1, parentId: null, name: "Cascade Energy", ... }
```

### Step 3: Build Complete Entity Context

```json
{
  "entities": {
    "entityList": [
      {
        "identifier": { "entityType": "Gazebo::User", "entityId": "dan@cascade.com" },
        "parents": []
      },
      {
        "identifier": { "entityType": "Gazebo::Project", "entityId": "my-new-project" },
        "parents": [{ "entityType": "Gazebo::Site", "entityId": "portland-manufacturing" }]
      },
      {
        "identifier": { "entityType": "Gazebo::Site", "entityId": "portland-manufacturing" },
        "parents": [{ "entityType": "Gazebo::Region", "entityId": "west-region" }]
      },
      {
        "identifier": { "entityType": "Gazebo::Region", "entityId": "west-region" },
        "parents": [{ "entityType": "Gazebo::Organization", "entityId": "1" }]
      },
      {
        "identifier": { "entityType": "Gazebo::Organization", "entityId": "1" },
        "parents": []
      }
    ]
  }
}
```

### Step 4: Cedar Evaluates

Dan has a template-linked policy:
```cedar
permit(
    principal == Gazebo::User::"dan@cascade.com",
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create"],
    resource in Gazebo::Region::"west-region"
);
```

Cedar traversal:
```
Is Project::"my-new-project" in Region::"west-region"?

Project::"my-new-project"
  → memberOf → Site::"portland-manufacturing"
    → memberOf → Region::"west-region"  ✓ MATCH!

Result: ALLOW
```

---

## Comparison: Before and After

### Before (Current System)

```
┌─────────────────────────────────────────────────────────────────┐
│  Request: Can user 13 edit site 52?                             │
├─────────────────────────────────────────────────────────────────┤
│  1. authorization-service loads ALL permissions into memory     │
│     (scrolls through entire permissions-relationship-read)      │
│                                                                 │
│  2. Performs BFS graph traversal from user:13                   │
│     user:13 → cohort:22 → company:31 → site:52                  │
│                                                                 │
│  3. At each edge, applies permission masking (AND)              │
│     Multiple paths get combined (OR)                            │
│                                                                 │
│  4. Returns effective permission bitmask: 3 (read + write)      │
│                                                                 │
│  5. Application checks: (3 & 2) > 0? → Yes, ALLOW               │
└─────────────────────────────────────────────────────────────────┘
```

### After (AVP System)

```
┌─────────────────────────────────────────────────────────────────┐
│  Request: Can user 13 edit site 52?                             │
├─────────────────────────────────────────────────────────────────┤
│  1. authorization-service queries site-service for site 52      │
│     Gets: companyId = "region:west-region"                      │
│                                                                 │
│  2. Queries company-service for region hierarchy                │
│     Gets: west-region → parentId: 1 (Cascade Energy)            │
│                                                                 │
│  3. Builds entity context with full hierarchy:                  │
│     Site:52 → Region:west-region → Organization:1               │
│                                                                 │
│  4. Calls AVP IsAuthorized with entities                        │
│                                                                 │
│  5. AVP evaluates policies:                                     │
│     - Finds template-linked policy for user:13 on Region        │
│     - Cedar traverses: Site:52 in Region:west-region? YES       │
│     - Returns: ALLOW                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Migration Steps

### Phase 1: Implement Hierarchy Lookup (No AVP Changes)
1. Create `HierarchyLookupService` that queries existing company/site services
2. Add caching layer for performance
3. Test hierarchy resolution independently

### Phase 2: Update Entity Builder
1. Integrate hierarchy lookup into `buildEntities()`
2. Update authorize Lambda to use async entity building
3. Test with existing policies

### Phase 3: Migrate Permission Relationships
1. For each edge in `permissions-relationship-read`:
   - Create equivalent template-linked policy in AVP
2. Map permission bits to actions:
   - `1` (read) → `View` action
   - `2` (write) → `Edit` action
   - `4` (admin) → `Admin` action

### Phase 4: Parallel Run
1. Run both systems simultaneously
2. Compare decisions for all requests
3. Resolve discrepancies

### Phase 5: Cutover
1. Switch traffic to AVP
2. Deprecate permission-service and old authorization-service
3. Keep company-service and site-service (hierarchy data source)

---

## Clarifications (Resolved)

1. **Group = Region:** Same concept, different names in different parts of the codebase. We'll use "Region" in AVP.

2. **Hierarchy is flat:** Organization → Region → Site. One level only.

3. **Organization vs Region:** Both are records in `production-organization` table (company-service):
   - **Organization:** `parentId = null`
   - **Region:** `parentId = <organization_id>` (a Region is an Organization with a parent)

4. **Site's companyId format:**
   - `"organization:123"` → Site belongs directly to Organization 123
   - `"region:456"` → Site belongs to Region 456 (which has a parent Organization)

---

## Simplified Hierarchy Model

```
┌─────────────────────────────────────────────────────────────────┐
│  production-organization table (DynamoDB)                       │
├─────────────────────────────────────────────────────────────────┤
│  { companyId: 1, name: "Cascade Energy", parentId: null }       │  ← Organization
│  { companyId: 2, name: "West Region", parentId: 1 }             │  ← Region (parent = Org)
│  { companyId: 3, name: "East Region", parentId: 1 }             │  ← Region (parent = Org)
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  site-read index (OpenSearch)                                   │
├─────────────────────────────────────────────────────────────────┤
│  { siteId: "52", name: "Portland Mfg", companyId: "region:2" }  │  ← Site in Region
│  { siteId: "53", name: "Seattle HQ", companyId: "organization:1" }│ ← Site directly in Org
└─────────────────────────────────────────────────────────────────┘
```

**Hierarchy traversal logic:**

```
Given: Site with companyId = "region:2"

1. Parse companyId → type: "region", id: "2"
2. Fetch company 2 → { parentId: 1 } → It's a Region, parent is Org 1
3. Fetch company 1 → { parentId: null } → It's an Organization (root)

Result chain: Site:52 → Region:2 → Organization:1
```

```
Given: Site with companyId = "organization:1"

1. Parse companyId → type: "organization", id: "1"
2. Fetch company 1 → { parentId: null } → It's an Organization (root)

Result chain: Site:53 → Organization:1  (no Region in between)
```

---

## Open Questions

1. **Permission inheritance differences:** The current system uses AND masking at each level. AVP uses simpler "in" traversal. Are there edge cases where behavior differs?

2. **Role definitions:** Current roles have complex `permissionMap` with different bits per resource type. How do we map this to AVP actions?
