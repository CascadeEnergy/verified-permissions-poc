# Plan: Advanced Permission Patterns in Cedar

## Summary

Conceptual analysis of how advanced Gazebo permission patterns map to Cedar/AWS Verified Permissions.

## Permission Patterns to Analyze

1. Default deny
2. Scope-based inheritance with data restrictions (evaluator sees facilities, not consumption data)
3. Contextual role-based permissions (different views per role)
4. Resource-level explicit allows/denys (deny datastreams to evaluators)
5. Data sharing agreements between orgs
6. Time-based access (expires with engagement)

---

## Pattern Analysis

### 1. Default Deny ✅ Already Covered

Cedar has **implicit default deny**. If no `permit` policy matches, access is denied. No configuration needed.

```cedar
// This is built into Cedar - no policy needed
// If nothing permits, access is DENIED
```

---

### 2. Scope-Based Inheritance with Data Restrictions

**Scenario:** Energy Trust evaluator can see all facilities in a program but shouldn't see consumption/production data.

**Cedar Approach:** Use `forbid` policies to carve out exceptions to broad access.

```cedar
// First: Grant evaluator VIEW access to everything in the Program
permit(
    principal == ?principal,
    action == Gazebo::Action::"View",
    resource in ?resource  // Binds to Program or Cohort
);

// Then: FORBID access to sensitive resource types
forbid(
    principal == ?principal,
    action,
    resource is Gazebo::DataStream
) when {
    resource.dataType in ["consumption", "production"]
};
```

**Key Insight:** Cedar evaluates `forbid` policies AFTER `permit`. A single `forbid` can override any number of `permit` policies.

**Schema Addition Needed:**
```json
"DataStream": {
  "shape": {
    "attributes": {
      "dataType": { "type": "String" }  // "consumption", "production", "weather", etc.
    }
  },
  "memberOfTypes": ["Site"]
}
```

**Alternative: Role-based forbid (no template needed):**
```cedar
// Static policy: Evaluators can never see consumption data
forbid(
    principal,
    action,
    resource is Gazebo::DataStream
) when {
    principal.role == "evaluator" &&
    resource.dataType in ["consumption", "production"]
};
```

---

### 3. Contextual Role-Based Permissions

**Scenario:**
- Utility staff sees aggregate performance
- Consultant sees how actions change performance per site
- Facility operator/champion sees everything about their site

**Cedar Approach:** Different templates for different role contexts, each granting access to different resource types.

```cedar
// Template: utility-program-viewer.cedar
// Utility staff on a Program - sees aggregates only
permit(
    principal == ?principal,
    action == Gazebo::Action::"View",
    resource in ?resource  // Binds to Program
) when {
    resource is Gazebo::Report &&
    resource.reportType == "aggregate"
};

// Template: consultant-cohort-viewer.cedar
// Consultant on a Cohort - sees site-level performance
permit(
    principal == ?principal,
    action == Gazebo::Action::"View",
    resource in ?resource  // Binds to Cohort/Participation
) when {
    resource is Gazebo::Report ||
    resource is Gazebo::Project ||
    resource is Gazebo::Model
};

// Template: site-champion.cedar
// Champion on a Site - sees everything at their site
permit(
    principal == ?principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create"],
    resource in ?resource  // Binds to Site
);
```

**Key Insight:** The "context" is determined by WHICH template you instantiate and WHERE you bind it. Same user, different contexts = different template-linked policies.

---

### 4. Resource-Level Explicit Allows/Denys

**Scenario:** Deny specific datastreams to certain user types (e.g., evaluator can't see utility meter data).

**Cedar Approach:** Explicit `forbid` policies at the resource level.

```cedar
// Static policy: Evaluators denied access to specific datastream types
forbid(
    principal,
    action,
    resource is Gazebo::DataStream
) when {
    principal.role == "evaluator" &&
    resource.streamType == "utility_meter"
};

// OR: Per-resource forbid via template
// This allows denying a specific user from a specific resource
forbid(
    principal == ?principal,
    action,
    resource == ?resource
);
```

**Granular Example - Deny Alice from a specific DataStream:**
```
// Template instantiation:
// ?principal = User::"alice@example.com"
// ?resource = DataStream::"site-123-utility-meter"
```

**Key Insight:** You can have BOTH permit and forbid templates. Forbid is evaluated last and wins.

---

### 5. Data Sharing Agreements Between Orgs

**Scenario:** Goodwill Happy Valley shares data with Energy Trust because they participate in SEM, but Goodwill's other locations (paid by Goodwill corporate) are NOT shared.

**Cedar Approach:** The Participation entity IS the data sharing agreement. Access flows through Participation, not through the Org.

```
Energy Trust (Client)
  └── Industrial SEM (Program)
      └── 2024 Cohort (Cohort)
          └── Participation-001 (links to Goodwill Happy Valley Site)
              └── Site: "Goodwill Happy Valley" ← Energy Trust can access via Participation

Goodwill Corporate (Organization)
  └── Portland Region (Region)
      ├── Site: "Goodwill Happy Valley" ← Goodwill staff access via Org hierarchy
      ├── Site: "Goodwill Downtown" ← NOT in SEM, Energy Trust has no access
      └── Site: "Goodwill SE" ← NOT in SEM, Energy Trust has no access
```

**The Cross-Hierarchy Model Already Handles This:**
- Energy Trust staff with access to the Cohort can see Goodwill Happy Valley (via Participation)
- They CANNOT see Goodwill Downtown or Goodwill SE (no Participation exists)
- Goodwill staff with Org access see all their sites
- The Participation IS the data sharing agreement - when you create it, you're sharing

**Explicit Data Sharing Agreement Entity (if needed for more control):**
```json
"DataSharingAgreement": {
  "shape": {
    "attributes": {
      "sharingOrgId": { "type": "String" },
      "receivingOrgId": { "type": "String" },
      "scope": { "type": "String" },  // "full", "aggregates_only", "projects_only"
      "startDate": { "type": "String" },
      "endDate": { "type": "String" }
    }
  }
}
```

Then policies can check:
```cedar
permit(
    principal,
    action == Gazebo::Action::"View",
    resource in ?resource
) when {
    context.dataSharingAgreement.scope == "full" ||
    (context.dataSharingAgreement.scope == "aggregates_only" && resource is Gazebo::Report)
};
```

---

### 6. Time-Based Access

**Scenario:** Consultant/evaluator access ends when the engagement ends.

**Cedar Approach:** Application-managed policy lifecycle.

The application removes the template-linked policy when the engagement ends:
- When consultant engagement starts → Create template-linked policy
- When consultant engagement ends → Delete template-linked policy

```
// On engagement start:
CreateTemplateLinkedPolicy(
  template: "consultant-cohort-access",
  principal: User::"carol@consultant.com",
  resource: Cohort::"sem-2024"
)

// On engagement end:
DeletePolicy(policyId)
```

**Key Insight:** This is cleaner than date checks in Cedar policies because it doesn't require passing dates in every authorization request. The policy simply doesn't exist after the engagement ends.

---

## New Entity Types Potentially Needed

| Entity | Purpose | memberOfTypes |
|--------|---------|---------------|
| **DataStream** | Utility meter data, weather data, etc. | Site |
| **Report** | Aggregate/detailed reports | Site, Cohort, Program |
| **Note** | Private/shared notes | Site, Project |
| **DataSharingAgreement** | Explicit cross-org sharing terms | (standalone) |

---

## New Actions Potentially Needed

| Action | Purpose |
|--------|---------|
| **ViewAggregate** | See summarized data only |
| **ViewDetail** | See line-item data |
| **Share** | Share resources with other users/orgs |

---

## Private Notes Pattern (from your example)

**Scenario:** Consultant has notes that are private to them and the utility sponsor, plus notes visible to everyone.

**Cedar Approach:** Note entity with visibility attribute.

```json
"Note": {
  "shape": {
    "attributes": {
      "visibility": { "type": "String" },  // "private", "sponsor", "all"
      "createdBy": { "type": "Entity", "name": "User" }
    }
  },
  "memberOfTypes": ["Site", "Project"]
}
```

```cedar
// Anyone with site access can see "all" notes
permit(
    principal,
    action == Gazebo::Action::"View",
    resource is Gazebo::Note
) when {
    resource.visibility == "all"
};

// Creator can always see their own notes
permit(
    principal,
    action == Gazebo::Action::"View",
    resource is Gazebo::Note
) when {
    resource.createdBy == principal
};

// Sponsor role can see "sponsor" visibility notes
permit(
    principal,
    action == Gazebo::Action::"View",
    resource is Gazebo::Note
) when {
    resource.visibility == "sponsor" &&
    principal.role == "sponsor"
};
```

---

## Summary: Cedar Capability Matrix

| Pattern | Cedar Feature | Notes |
|---------|---------------|-------|
| Default deny | Built-in | No policy = deny |
| Scope inheritance | `resource in ?resource` | Hierarchy traversal |
| Data restrictions | `forbid` policies | Evaluated after permit, wins |
| Role context | Different templates | Same user, different bindings |
| Resource-level deny | `forbid` + specific resource | Can deny individuals |
| Data sharing | Participation entity | Cross-hierarchy via memberOf |
| Time-based | Delete policy on engagement end | Application-managed lifecycle |
| Private data | Attributes + `when` clause | visibility, createdBy |

---

## Design Decisions (Confirmed)

1. **DataStream + Actions:** Use BOTH DataStream entity types AND granular actions (ViewConsumption, ViewProduction, ViewAggregate). Maximum flexibility for fine-grained control.

2. **Time-based access:** Application-managed - delete template-linked policies when engagement ends. No date logic needed in every request.

3. **Data sharing:** Participation entity is sufficient. Creating a Participation = data sharing agreement.

---

## Recommended Schema Additions

```json
{
  "entityTypes": {
    "DataStream": {
      "shape": {
        "attributes": {
          "name": { "type": "String", "required": false },
          "dataType": { "type": "String", "required": false },
          "streamType": { "type": "String", "required": false }
        }
      },
      "memberOfTypes": ["Site"]
    },
    "Report": {
      "shape": {
        "attributes": {
          "name": { "type": "String", "required": false },
          "reportType": { "type": "String", "required": false }
        }
      },
      "memberOfTypes": ["Site", "Cohort", "Program"]
    },
    "Note": {
      "shape": {
        "attributes": {
          "visibility": { "type": "String", "required": false },
          "createdBy": { "type": "Entity", "name": "User", "required": false }
        }
      },
      "memberOfTypes": ["Site", "Project"]
    }
  },
  "actions": {
    "ViewConsumption": {
      "appliesTo": {
        "principalTypes": ["User"],
        "resourceTypes": ["DataStream", "Site"]
      }
    },
    "ViewProduction": {
      "appliesTo": {
        "principalTypes": ["User"],
        "resourceTypes": ["DataStream", "Site"]
      }
    },
    "ViewAggregate": {
      "appliesTo": {
        "principalTypes": ["User"],
        "resourceTypes": ["Report", "Site", "Cohort", "Program"]
      }
    }
  }
}
```

---

## Example Policies for Each Pattern

### Evaluator: Can see facilities, NOT consumption data
```cedar
// Template: evaluator-program-viewer.cedar
// Bind to Program - grants access to Sites via Participation
permit(
    principal == ?principal,
    action == Gazebo::Action::"View",
    resource in ?resource
);

// Static forbid: Evaluators cannot see consumption
forbid(
    principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"ViewConsumption"],
    resource is Gazebo::DataStream
) when {
    principal.role == "evaluator" &&
    resource.dataType == "consumption"
};
```

---

## Deliverable

This is a **conceptual analysis document** - no code changes in this session. Captures how advanced permission patterns map to Cedar for future implementation.

The patterns described here can be implemented incrementally as Phase 3+ of the POC.
