# Verified Permissions + Program Layer: Conceptual Design

## Overview

This document outlines how the new Program Layer entities will integrate with AWS Verified Permissions (Cedar) for authorization in Gazebo.

---

## Phase Summary

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | Parity with current Gazebo (Org → Region → Site → Project/Model) | Current POC |
| **Phase 2** | Program Layer (Client → Program → Cohort → Participation) | This design |
| **Phase 3** | Future TBD (high-level planning features) | Not covered |

---

## Current State (Phase 1)

**Entity Hierarchy:**
```
Organization
└── Region (memberOf: Organization)
    └── Site (memberOf: Region, Organization)
        └── Project/Model (memberOf: Site)
```

**Roles:** globalAdmin, administrator, coordinator, facilitator, champion, contributor, viewer

**Access Model:** Permissions flow down the hierarchy. A user with "coordinator" role on an Organization has that access to all Regions and Sites within it.

---

## Phase 2: Program Layer Design

### New Entity Hierarchy

**Program Hierarchy (permissions flow down):**
```
Client
└── Program (memberOf: Client)
    └── Cohort (memberOf: Program)
        ├── Cycle (memberOf: Cohort)
        └── Participation (memberOf: Cohort)
            └── Site (memberOf: Participation) ← Access flows to Site!
                ├── Project/Model
                └── Claim
```

**Site Hierarchy (existing, unchanged):**
```
Organization
└── Region (memberOf: Organization)
    └── Site (memberOf: Region, Organization)
        ├── Project/Model (memberOf: Site)
        └── Claim (memberOf: Site)
```

**Key:** A Site can be accessed via EITHER hierarchy (union model). Sites have multiple parents: Region, Organization, and any Participations they're part of.

**Implementer** is a separate entity that gets assigned to Programs/Cohorts (not part of the hierarchy itself).

### Entity Definitions

| Entity | Description | Parent (memberOf) | Key Attributes |
|--------|-------------|-------------------|----------------|
| **Client** | Container for programs (utility, corporation, implementer) | — | name, dataStewardUserId |
| **Program** | SEM program, corporate initiative, etc. | Client | name, implementerId |
| **Cohort** | Group of sites in a program with timeframe | Program | name, startDate, endDate, implementerId |
| **Cycle** | Time period for tracking (year, quarter, month) | Cohort | name, type, startDate, endDate, parentCycleId |
| **Participation** | A site's involvement in a cohort | **Cohort** | joinDate, leaveDate |
| **Site** (updated) | Facility/location | **Region, Organization, Participation** | name |
| **Claim** | Energy savings claim | **Site** | participationId, cycleId |
| **Implementer** | Organization that implements programs | — | name |

**Note:** Site now has an additional parent type (Participation), enabling program hierarchy access to flow down to Sites.

### The Participation Cross-Hierarchy Model

**Participation** bridges the two hierarchies and enables **bidirectional permission flow**:

```
┌─────────────────────┐              ┌─────────────────────┐
│   Program Hierarchy │              │    Site Hierarchy   │
├─────────────────────┤              ├─────────────────────┤
│       Client        │              │    Organization     │
│         │           │              │         │           │
│       Program       │              │       Region        │
│         │           │              │         │           │
│       Cohort        │              │                     │
│         │           │              │                     │
│         ▼           │              │                     │
│   Participation ────┼──────────────┼──────► Site         │
│                     │              │         │           │
│       Cycle         │              │   Project/Model     │
│                     │              │       Claim         │
└─────────────────────┘              └─────────────────────┘
```

**Key Insight:** Program hierarchy permissions flow DOWN through Participation to the Site itself. This enables implementers working on a Cohort to access the Sites in that Cohort.

**Access Paths to a Site:**
1. **Via Organization hierarchy:** Organization → Region → Site (existing)
2. **Via Program hierarchy:** Client → Program → Cohort → Participation → Site (new)

**In Cedar, this requires Site to be memberOf Participation:**
```
Participation { memberOf: [Cohort] }
Site { memberOf: [Region, Organization, Participation] }
```

A Site can have multiple Participations (in different Cohorts), so it would be memberOf multiple Participations. Cedar handles this naturally.

**Granular Permissions:** More specific permissions can still be applied at lower levels:
- Assign a role directly to a Participation (access to that participation only, not the whole Cohort)
- Assign a role directly to a Site (doesn't affect other Sites in the Cohort)

### Claims: Simple Site Inheritance

Claims remain simple - they belong to Sites and inherit Site permissions:
- `Claim { memberOf: [Site] }`
- Site administrators can manage all Claims for their site
- Claims have `participationId` and `cycleId` as attributes for linking to program data
- Application logic uses these links for YoY reporting aggregation

This keeps Claims straightforward while still enabling program-level reporting through queries that join Claims to Participations.

### Role Mapping

Reusing existing roles on the new entities:

| Role | At Client Level | At Program Level | At Cohort Level |
|------|-----------------|------------------|-----------------|
| **administrator** | Full client control | Full program control | Full cohort control |
| **coordinator** | Manage all programs | Manage program operations | Manage cohort day-to-day |
| **facilitator** | — | Work across cohorts | Work with participants |
| **champion** | — | — | Site engagement lead |
| **contributor** | — | Edit program data | Edit participation data |
| **viewer** | View all programs | View program details | View cohort details |

### Actions

Same actions apply to new entities:
- **View** - Read access
- **Edit** - Modify existing data
- **Create** - Create child entities
- **Delete** - Remove entities
- **Admin** - Administrative operations

### Example Access Scenarios

**Scenario 1: Program Manager**
- Alice is `coordinator` on "Energy Trust Industrial SEM" (Program)
- She can View/Edit/Create/Delete all Cohorts under that Program
- She can see all Participations and Cycles in those Cohorts
- She can access all Sites in those Cohorts (via Participation)
- She can access Claims on those Sites

**Scenario 2: Site Administrator**
- Bob is `administrator` on "Portland Manufacturing" (Site)
- He can see all Participations for Portland Manufacturing
- He can see all Claims for his site
- He can see which Cohorts/Programs his site is in

**Scenario 3: Implementer Staff**
- Carol works for "Stillwater Energy" (Implementer)
- She is assigned `facilitator` on Cohorts that Stillwater implements
- She can work with Sites in those Cohorts (full Site access via Participation)
- She can see Cycles for tracking purposes
- She has no access to other Cohorts in the same Program

**Scenario 4: Energy Champion at a Site**
- Dan is the Energy Champion at "Portland Manufacturing" (Site)
- He is assigned `champion` role on the Site
- He can View, Edit, and Create Projects/Claims at his site
- He can see his site's Participations (which programs his site is in)
- He cannot access other Sites, even if they're in the same Cohort
- His access comes from the Site hierarchy, not the Program hierarchy

**Scenario 5: Granular Participation Access**
- Eve is assigned `viewer` directly on a specific Participation (not the whole Cohort)
- She can access that one Site through the Participation
- She cannot see other Sites in the same Cohort
- She CAN see Cycles (broadly readable reference data)

---

## Design Decisions

1. **Implementer entity access:** Implementer is metadata only. Staff get direct role assignments to Cohorts they work on. This keeps the permission model simple and explicit.

2. **Cycle access:** Cycles are broadly readable reference data. A static policy grants View on all Cycles to any authenticated user. This is appropriate since Cycles are just time period definitions (e.g., "FY2024 Q1"), not sensitive data.

3. **Goal entity (future):** Goal will be memberOf its parent entity (Client, Program, Cohort, or Participation); inherits that entity's permissions.

4. **Data Steward:** The `dataStewardUserId` on Client is application logic for approval workflows, not an authorization concern. No Cedar policy needed.

5. **Claim access:** Claims belong to Sites only (simple inheritance). Program-level reporting uses application queries that join Claims to Participations via the `participationId` attribute.

---

## Implementation Notes (for when we update the POC)

### UI Organization

**Important:** Keep Phase 1 and Phase 2 clearly separated in the POC UI so users don't get overwhelmed looking at everything at once.

- **Phase 1 tab/section:** Organization → Region → Site hierarchy (current)
- **Phase 2 tab/section:** Client → Program → Cohort hierarchy (program layer)

This allows reviewers to focus on one concept at a time and understand how each maps to current Gazebo functionality.

### Schema Changes

Add to `authorization/schema.json`:

```json
{
  "entityTypes": {
    "Client": {
      "shape": {
        "type": "Record",
        "attributes": {
          "name": { "type": "String", "required": false }
        }
      }
    },
    "Program": {
      "shape": {
        "type": "Record",
        "attributes": {
          "name": { "type": "String", "required": false }
        }
      },
      "memberOfTypes": ["Client"]
    },
    "Cohort": {
      "shape": {
        "type": "Record",
        "attributes": {
          "name": { "type": "String", "required": false }
        }
      },
      "memberOfTypes": ["Program"]
    },
    "Cycle": {
      "shape": {
        "type": "Record",
        "attributes": {
          "name": { "type": "String", "required": false },
          "type": { "type": "String", "required": false }
        }
      },
      "memberOfTypes": ["Cohort"]
    },
    "Participation": {
      "shape": {
        "type": "Record",
        "attributes": {}
      },
      "memberOfTypes": ["Cohort"]
    },
    "Implementer": {
      "shape": {
        "type": "Record",
        "attributes": {
          "name": { "type": "String", "required": false }
        }
      }
    }
  }
}
```

**Update existing Site entity** to add Participation as a parent:

```json
{
  "Site": {
    "memberOfTypes": ["Region", "Organization", "Participation"]
  }
}
```

Note: Claim already exists in Phase 1 as `memberOf: [Site]` - no changes needed. Cycles inherit from Cohort.

### Policy Templates

- Existing templates should work unchanged (they use `resource in ?resource`)
- The hierarchy traversal works automatically for both paths

### New Static Policy: Cycles Are Readable

Add a static policy that makes Cycles broadly viewable:

```cedar
// cycles-readable.cedar
permit(
  principal,
  action == Gazebo::Action::"View",
  resource is Gazebo::Cycle
);
```

This treats Cycles as reference data (time period definitions) that anyone can read.

### Test Scenarios to Add

1. **Program hierarchy access** - Client → Program → Cohort flows
2. **Cross-hierarchy Participation access** - via Cohort OR Site
3. **Implementer staff patterns** - Direct role assignments to Cohorts
4. **Site-only Claim access** - Verify Claims require Site permission

---

## Comparison: Current Gazebo vs Verified Permissions

| Aspect | Current Gazebo | Verified Permissions |
|--------|---------------|---------------------|
| **Permission storage** | DynamoDB + cache per ECS task | Centralized in AVP |
| **Hierarchy traversal** | Custom code in authorization-service | Cedar `in` operator |
| **Cross-hierarchy** | Complex joins/queries | Natural with dual memberOf |
| **Consistency** | Eventual (2.5s cache refresh) | Strong |
| **Audit** | Custom logging | CloudTrail built-in |
| **Policy changes** | Code deployment | Policy update (no deploy) |