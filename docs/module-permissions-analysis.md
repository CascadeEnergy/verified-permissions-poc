# Module Permissions Analysis

Research from `admin-www` and `customer-www` repositories on how module permissions work and how they map to Cedar/AWS Verified Permissions.

---

## What Are Module Permissions

Module permissions control access to **functional areas** (modules) of the application. Each module represents a distinct feature set:

| Module ID | Name | Section |
|-----------|------|---------|
| `user-www` | Users | Company Administration |
| `organization-www` | Organizations | Company Administration |
| `site-www` | Sites | Company Administration |
| `measurable-www` | Measurables | Company Administration |
| `measurement-data-www` | Measurement Data Edit | Data Management |
| `epo-www` | EPO Data Management | Data Management |
| `export-www` | Exports | Data Management |
| `device-www` | Device Configuration | Data Management |
| `saved-view-www` | Saved View Edit | Saved Views |
| `push-saved-view-www` | Push Saved Views | Saved Views |
| `saved-view-email-www` | Email Search | Saved Views |
| `dashboard-www` | Dashboards | Dashboards/Reports |
| `article-www` | Articles | Dashboards/Reports |
| `pge-dr-www` | Participation Windows / Manual Load Assets | PGE-DR |
| `file-status-www` | File Status | System Tracking |
| `meter-health-www` | Meter Health Report | System Tracking |
| `permission-www` | Permission Explorer | Internal Tools |
| `utility-bill-www` | Utility Vendors | Internal Tools |
| `admin-www` | ETO UCI / Greenbutton Tools | Internal Tools |
| `customer-www` | Customer App (Explore/Projects) | Application |
| `eis-www` | EIS Module | Application |

---

## Where Module Permissions Are Used

| App | Uses Module Permissions? | Module ID | Notes |
|-----|--------------------------|-----------|-------|
| **admin-www** | ✅ Yes | Various (see table above) | Each route declares its required module |
| **customer-www** | ✅ Yes | `customer-www` | Single module for entire app, then site-level checks within |
| **explore-www** | ❌ No | N/A | Legacy CakePHP app uses Navigation + CompanyNavigation tables |

**customer-www details:**
- All API routes use `hapiSenseiAuth: { target: { type: "module", id: "customer-www" } }`
- This is a single "gate" check - can you access customer-www at all?
- Within handlers, additional site/region/org permission checks are performed

**explore-www details:**
- Uses `Navigation` and `CompanyNavigation` database tables
- Permission flow: User → Authorization Service → Org/Region/Site permissions → CompanyNavigation lookup
- Does NOT use `hapiSenseiAuth` or module targets

---

## How Module Permissions Work

### 1. Role Hierarchy (7 levels)

```
globalAdmin (7)    - Highest level, full system access
administrator (6)  - Organization admin
coordinator (5)    - Regional coordination
facilitator (4)    - Site facilitation
champion (3)       - Site champion
contributor (2)    - Can contribute data
viewer (1)         - Read-only access
```

### 2. Permission Masks (bitmask)

| Mask | Value | Binary |
|------|-------|--------|
| READ | 1 | 001 |
| WRITE | 2 | 010 |
| ADMIN | 4 | 100 |

**Check logic:** `(userMask & requiredMask) === requiredMask`

Example: User has mask `7` (binary `111` = READ + WRITE + ADMIN)
- Check READ: `(7 & 1) === 1` → true
- Check WRITE: `(7 & 2) === 2` → true
- Check ADMIN: `(7 & 4) === 4` → true

### 3. Scope Levels

Permissions are scoped to organizational hierarchy:

- **Organization** - Company-wide access
- **Region** - Geographic region access
- **Site** - Individual facility access

A user can have different roles at different scopes:
```javascript
{
  organization: { "1": ["administrator"] },
  region: { "10": ["coordinator"] },
  site: { "portland-manufacturing": ["champion"] }
}
```

### 4. Authorization Flow

1. User authenticates → JWT token issued
2. Route declares required module:
   ```javascript
   plugins: {
     hapiSenseiAuth: {
       target: { type: "module", id: "dashboard-www" }
     }
   }
   ```
3. `hapiSenseiAuth` middleware intercepts request
4. Calls authorization service: `GET /roles/user/{userId}/module/{moduleId}`
5. Returns permission map with masks per scope
6. Check mask against required level (read/write/admin)
7. Grant or deny access

---

## Implementation Details

### Key Files

**admin-www:**
- `/app/lib/linkList.json` - Module definitions
- `/app/lib/api/permission/userRoleConstants.js` - Role constants
- `/app/lib/middleware/auth/lib/authorization/handlerBuilder.js` - Auth handler
- `/sharedModules/roles.js` - Role hierarchy

**customer-www:**
- `/sharedConstants/userRoles.js` - Role constants
- `/app/types/permission.ts` - TypeScript types
- `/app/lib/internal/permission/*.js` - Permission checking functions
- `/app/lib/middleware/auth/lib/authorization/decorations/*.js` - Request decorators

### Permission Checking Functions

```javascript
// Check if user has ANY of expected roles for a single resource
checkUserRolesOne(userId, targetType, targetId, expectedRoles)

// Check if user has roles for ALL resources
checkUserRolesAll(userId, targetType, targetIds, expectedRoles)

// Check if user has roles for ANY resource
checkUserRolesAny(userId, targetType, targetIds, expectedRoles)

// Check if user has roles ANYWHERE (any scope)
checkUserRolesAnywhere(userId, expectedRoles)
```

### Request Decorators

The auth middleware decorates the request object:
```javascript
request.canAdmin(target)  // Check admin privilege
request.canRead(target)   // Check read permission
request.canWrite(target)  // Check write permission
request.hasPermission(target, mask)  // Check specific mask
request.getPermissionsByType(targetType)  // Get all permissions
```

---

## When Are Module vs Data Permissions Checked?

This is critical for understanding whether we need two AVP calls per request.

### Module Permissions: Application Entry Gate

**When checked:** When user loads the application or navigates to a feature

**Question answered:** "Can this user access the Dashboard module at all?"

**Example flow:**
1. User logs into admin-www
2. Frontend calls `/api/modules` to get list of allowed modules
3. Authorization service checks: Does user have permission to `module:dashboard-www`?
4. If yes → show Dashboard in navigation
5. If no → hide Dashboard from navigation

**Code example (admin-www):**
```javascript
// Route declares required module
plugins: { hapiSenseiAuth: { target: { type: "module", id: "dashboard-www" } } }
```

### Data Permissions: Per-Action Authorization

**When checked:** On each API request that accesses specific data

**Question answered:** "Can this user create a marker on Site X?"

**Example flow:**
1. User clicks "Add Marker" on Portland Manufacturing site
2. Frontend calls `POST /api/markers` with `{ siteId: "portland-manufacturing" }`
3. Handler checks: Does user have write role on site `portland-manufacturing`?
4. If yes → create marker
5. If no → return 403/404

**Code example (customer-www):**
```javascript
// Handler checks site-level permission
const hasSitePermission = await checkUserRolesOne(
  request.auth.credentials.userId,
  "site",
  request.payload.siteId,
  writingRoles  // [ADMINISTRATOR, COORDINATOR, FACILITATOR, CHAMPION, CONTRIBUTOR]
);
if (!hasSitePermission) return Boom.notFound();
```

### Key Insight: Different Contexts, Different Times

| Aspect | Module Permission | Data Permission |
|--------|-------------------|-----------------|
| **When** | App load / navigation | Each API request |
| **Question** | "Can you use this feature?" | "Can you access this resource?" |
| **Granularity** | Coarse (entire module) | Fine (specific site/project) |
| **Frequency** | Once per session/navigation | Every action |
| **Cedar mapping** | `Module` entity type | `Site`/`Project`/etc. hierarchy |

### Do We Need Two AVP Calls?

**No, not typically.** They happen at different times:

1. **On app load:** Check module permission → determines what nav items to show
2. **On each action:** Check data permission → determines if action is allowed

However, if you want to enforce module permissions at the API level (defense in depth), you could:
- Option A: Check module permission in middleware, data permission in handler (current pattern)
- Option B: Combine into single Cedar policy with both constraints

**Single Cedar policy option:**
```cedar
// User must have both module access AND site access
permit(
    principal == ?principal,
    action == Gazebo::Action::"CreateMarker",
    resource in ?resource  // Site
) when {
    // Could add module check here if needed
    // principal has moduleAccess && principal.moduleAccess.contains("customer-www")
};
```

---

## Mapping to Cedar/AWS Verified Permissions

### Option A: Modules as Cedar Resources (Recommended)

Add a `Module` entity type:

```json
"Module": {
  "shape": {
    "attributes": {
      "name": { "type": "String", "required": false }
    }
  }
}
```

Template for granting module access:
```cedar
permit(
    principal == ?principal,
    action in [Gazebo::Action::"Read", Gazebo::Action::"Write", Gazebo::Action::"Admin"],
    resource == ?resource  // Binds to Module::"dashboard-www"
);
```

**Example instantiation:**
```
?principal = User::"alice@example.com"
?resource = Module::"dashboard-www"
→ Alice can access dashboards
```

### Option B: Modules as Actions

Define actions per module:
```json
"AccessDashboard": {
  "appliesTo": {
    "principalTypes": ["User"],
    "resourceTypes": ["Organization", "Region", "Site"]
  }
}
```

Policy:
```cedar
permit(
    principal == ?principal,
    action == Gazebo::Action::"AccessDashboard",
    resource in ?resource  // Binds to Org/Region/Site scope
);
```

### Recommended: Hybrid Approach

Module permissions are **orthogonal** to data hierarchy permissions:
- **Data permissions**: Can user see Site X? (hierarchy-based)
- **Module permissions**: Can user access the Dashboard feature? (feature-based)

**Application makes two AVP calls:**
1. `isAuthorized(user, AccessModule, Module::"dashboard-www")` → Feature access?
2. `isAuthorized(user, View, Site::"portland-manufacturing")` → Data access?

Both must pass for the user to view the dashboard for that site.

---

## Fit Assessment

| Aspect | Fit with Cedar | Notes |
|--------|----------------|-------|
| Role hierarchy | ✅ Good | Model as User attributes or static policies |
| Bitmask permissions | ✅ Good | Map to distinct actions (Read, Write, Admin) |
| Org/Region/Site scopes | ✅ Excellent | Already modeled in POC hierarchy |
| Module as resource | ✅ Good | Add Module entity type |
| Dual authorization | ⚠️ Moderate | Requires 2 AVP calls per request |

---

## Schema Addition for Modules

```json
{
  "entityTypes": {
    "Module": {
      "shape": {
        "attributes": {
          "name": { "type": "String", "required": false }
        }
      }
    }
  },
  "actions": {
    "AccessModule": {
      "appliesTo": {
        "principalTypes": ["User"],
        "resourceTypes": ["Module"]
      }
    },
    "Read": {
      "appliesTo": {
        "principalTypes": ["User"],
        "resourceTypes": ["Module", "Site", "Region", "Organization", "Project", "Model"]
      }
    },
    "Write": {
      "appliesTo": {
        "principalTypes": ["User"],
        "resourceTypes": ["Module", "Site", "Region", "Organization", "Project", "Model"]
      }
    },
    "Admin": {
      "appliesTo": {
        "principalTypes": ["User"],
        "resourceTypes": ["Module", "Site", "Region", "Organization"]
      }
    }
  }
}
```

---

## Migration Path

| Phase | Description |
|-------|-------------|
| **Phase 1** | Keep existing authorization service for modules; use AVP for data hierarchy only |
| **Phase 2** | Add `Module` entity type to AVP schema |
| **Phase 3** | Create template-linked policies for user-module assignments |
| **Phase 4** | Migrate module permission checks from auth service to AVP |
| **Phase 5** | Deprecate authorization service |

---

## Key Differences: Current vs Cedar

| Current System | Cedar Equivalent |
|----------------|------------------|
| Bitmask (1, 2, 4) | Distinct actions (Read, Write, Admin) |
| Authorization service HTTP call | AVP `isAuthorized` API call |
| Role hierarchy (globalAdmin > admin > ...) | User attributes + policy conditions |
| Module target type | Module entity type |
| Permission provider + cache | AVP handles caching internally |

---

# Proposal: Unified Feature & Module Access

## Current State: Three Different Systems

| System | Used By | How It Works | Managed Where |
|--------|---------|--------------|---------------|
| **Module Permissions** | admin-www, customer-www | Authorization service checks `module:{id}` | Permission service DB |
| **Navigation Tables** | explore-www | `Navigation` + `CompanyNavigation` DB tables | MySQL/sensei-core |
| **Feature Flags** | All apps | ConfigCat via `@sensei/cascade-features-sdk` | ConfigCat dashboard |

**Problems:**
1. Inconsistent patterns across apps
2. Module permissions require DB changes to add new modules
3. Navigation tables are legacy and hard to maintain
4. No clear separation between "feature availability" and "user authorization"
5. Three places to manage access control

---

## Proposed Model: Separate Concerns

### The Three Questions

| Question | Concern | Managed By | Check Frequency |
|----------|---------|------------|-----------------|
| **"Is this feature enabled?"** | Feature rollout | ConfigCat | App load |
| **"Can this user access this feature?"** | Feature authorization | AVP (Cedar) | App load / nav |
| **"Can this user access this resource?"** | Data authorization | AVP (Cedar) | Every action |

### Why Separate?

**Feature Flags (ConfigCat)** answer: "Should this feature exist in the app right now?"
- Gradual rollouts (10% of users)
- A/B testing
- Kill switches
- Environment-specific (staging vs prod)
- Temporary - flags get removed when rollout complete

**Feature Authorization (AVP)** answers: "Is this user allowed to use this feature?"
- Permanent business rules
- Role-based (admins can access Permission Explorer)
- Org-based (Org X has purchased the EIS module)
- Doesn't change frequently

**Data Authorization (AVP)** answers: "Can this user access this specific resource?"
- Site/Region/Org hierarchy
- Fine-grained (user X can edit Site Y)
- Per-request checks

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Application                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. On App Load:                                                │
│     ┌──────────────┐     ┌──────────────┐                       │
│     │  ConfigCat   │     │     AVP      │                       │
│     │  (Features)  │     │  (Modules)   │                       │
│     └──────┬───────┘     └──────┬───────┘                       │
│            │                    │                                │
│            ▼                    ▼                                │
│     "Is EIS enabled?"    "Can user access EIS?"                 │
│            │                    │                                │
│            └────────┬───────────┘                                │
│                     ▼                                            │
│            Show/Hide nav item                                    │
│                                                                  │
│  2. On Each Action:                                             │
│     ┌──────────────┐                                            │
│     │     AVP      │                                            │
│     │   (Data)     │                                            │
│     └──────┬───────┘                                            │
│            │                                                     │
│            ▼                                                     │
│     "Can user edit Site X?"                                     │
│            │                                                     │
│            ▼                                                     │
│     Allow/Deny action                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation: Module Authorization in AVP

### Schema Addition

```json
{
  "entityTypes": {
    "Module": {
      "shape": {
        "attributes": {
          "name": { "type": "String", "required": false },
          "category": { "type": "String", "required": false }
        }
      }
    }
  },
  "actions": {
    "AccessModule": {
      "appliesTo": {
        "principalTypes": ["User"],
        "resourceTypes": ["Module"]
      }
    }
  }
}
```

### Module Entities (seeded once)

```
Module::"user-www"
Module::"dashboard-www"
Module::"eis-www"
Module::"permission-www"
... (one per module)
```

### Policy Templates

**Role-based module access:**
```cedar
// Template: role-module-access.cedar
// Grant a role access to a module
permit(
    principal,
    action == Gazebo::Action::"AccessModule",
    resource == ?resource
) when {
    principal has role && principal.role in ?roles
};
```

**Org-based module access (purchased features):**
```cedar
// Template: org-module-access.cedar
// Grant an org access to a module (e.g., they purchased EIS)
permit(
    principal,
    action == Gazebo::Action::"AccessModule",
    resource == ?resource
) when {
    principal has orgId && principal.orgId == ?orgId
};
```

**User-specific module access:**
```cedar
// Template: user-module-access.cedar
permit(
    principal == ?principal,
    action == Gazebo::Action::"AccessModule",
    resource == ?resource
);
```

### Example Policy Instantiations

```
# Admins can access Permission Explorer
Template: role-module-access
?resource = Module::"permission-www"
?roles = ["globalAdmin", "administrator"]

# Energy Trust has purchased EIS
Template: org-module-access
?resource = Module::"eis-www"
?orgId = "100"

# Alice has special access to Measurement Data
Template: user-module-access
?principal = User::"alice@example.com"
?resource = Module::"measurement-data-www"
```

---

## Migration Path

### Phase 1: Keep Existing, Add AVP for Data

```
Feature Flags  → ConfigCat (no change)
Module Access  → Authorization Service (no change)
Data Access    → AVP (new)
```

### Phase 2: Add Module Entities to AVP

```
Feature Flags  → ConfigCat (no change)
Module Access  → AVP + Authorization Service (parallel run)
Data Access    → AVP (no change)
```

### Phase 3: Migrate Module Access to AVP

```
Feature Flags  → ConfigCat (no change)
Module Access  → AVP (primary)
Data Access    → AVP (no change)
```

### Phase 4: Deprecate Authorization Service

```
Feature Flags  → ConfigCat
Module Access  → AVP
Data Access    → AVP
```

---

## Unified SDK Proposal

Create a unified SDK that abstracts both systems:

```typescript
// @sensei/access-sdk

import { createAccessClient } from "@sensei/access-sdk";

const access = await createAccessClient({
  avpPolicyStoreId: "ps-xxx",
  configCatApiKey: "/ConfigCat/API_KEY",
  environment: "production",
});

// Check if feature is enabled AND user can access it
const canAccessEIS = await access.canAccessFeature("eis-www", {
  userId: "alice@example.com",
  orgId: "100",
  role: "coordinator",
});
// Returns: { enabled: true, authorized: true, allowed: true }
// enabled = ConfigCat says feature is on
// authorized = AVP says user can access module
// allowed = enabled && authorized

// Check data access (AVP only)
const canEditSite = await access.canAccess({
  principal: { type: "User", id: "alice@example.com" },
  action: "Edit",
  resource: { type: "Site", id: "portland-manufacturing" },
});
// Returns: boolean

// Get all accessible modules for nav rendering
const modules = await access.getAccessibleModules({
  userId: "alice@example.com",
  orgId: "100",
  role: "coordinator",
});
// Returns: [
//   { id: "dashboard-www", enabled: true, authorized: true },
//   { id: "eis-www", enabled: true, authorized: true },
//   { id: "permission-www", enabled: true, authorized: false },
// ]
```

---

## Benefits of This Approach

| Benefit | Description |
|---------|-------------|
| **Clear separation** | Feature rollout (ConfigCat) vs authorization (AVP) |
| **Consistent patterns** | All apps use same SDK |
| **Self-service** | PMs manage flags in ConfigCat, admins manage auth in AVP |
| **Auditable** | AVP provides audit trail for authorization decisions |
| **Flexible** | Role-based, org-based, or user-based module access |
| **Gradual migration** | Can run in parallel with existing systems |

---

## Decision Matrix: ConfigCat vs AVP

| Use Case | Use ConfigCat | Use AVP |
|----------|---------------|---------|
| "We're rolling out a new feature to 10% of users" | ✅ | |
| "Only admins should see Permission Explorer" | | ✅ |
| "Org X has purchased the EIS module" | | ✅ |
| "Kill switch for broken feature" | ✅ | |
| "A/B test new dashboard layout" | ✅ | |
| "User X should not access Site Y" | | ✅ |
| "This feature is in beta for staging only" | ✅ | |
| "Coordinators can edit, Viewers can only read" | | ✅ |

---

# Refined Proposal: Expand cascade-features

## Why Expand cascade-features Instead of New SDK?

| Aspect | New SDK | Expand cascade-features |
|--------|---------|-------------------------|
| Infrastructure | Build from scratch | Already has CI/CD, npm, SSM |
| Context model | Define new | Already has userId, orgs, regions, sites, roles |
| Adoption | New dependency for all apps | Apps already use it |
| Naming | Yet another package | One place for "access decisions" |
| Mental model | "features" vs "access" confusion | "cascade-features" becomes "cascade-access" |

**Recommendation:** Expand `cascade-features` → rename to `cascade-access` (or keep name, expand scope).

---

## Should customer-www Have Granular Modules?

### Current State

**admin-www:** 21 distinct modules, each route declares its module
**customer-www:** 1 module (`customer-www`), then site-level checks inside

But customer-www actually has distinct features:
- Explore (charts, data visualization)
- Projects (project management)
- Models (energy models)
- EIS (Energy Information System)
- Home (dashboard/landing)
- Goals
- Tasks
- Workbooks

### The Question

Should we do this?
```
Module::"customer-www"           ← Current (one module)
```

Or this?
```
Module::"explore"                ← Granular modules
Module::"projects"
Module::"models"
Module::"eis"
Module::"goals"
Module::"tasks"
```

### Recommendation: Yes, One Unified System

**Arguments for granular modules everywhere:**

1. **Consistency** - Same pattern in admin-www and customer-www
2. **Flexibility** - Can sell/enable features independently ("Org X gets Projects but not Models")
3. **Simpler mental model** - "Module = feature you can access"
4. **Already exists** - customer-www's Navigation system is basically this, just implemented differently

**The unified model:**

```
┌────────────────────────────────────────────────────────────────┐
│                        CASCADE-ACCESS                          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ConfigCat (Feature Flags)     AVP (Authorization)             │
│  ─────────────────────────     ────────────────────            │
│  • Rollouts                    • Module access                 │
│  • Experiments                 • Data access                   │
│  • Kill switches               • Role-based rules              │
│                                • Org-based rules               │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Unified Module List (All Apps)

| Module ID | App | Description |
|-----------|-----|-------------|
| **Admin Modules** | | |
| `admin:users` | admin-www | User management |
| `admin:organizations` | admin-www | Organization management |
| `admin:sites` | admin-www | Site management |
| `admin:measurables` | admin-www | Measurable management |
| `admin:measurement-data` | admin-www | Measurement data editing |
| `admin:dashboards` | admin-www | Dashboard management |
| `admin:exports` | admin-www | Data exports |
| `admin:devices` | admin-www | Device configuration |
| `admin:saved-views` | admin-www | Saved view management |
| `admin:permissions` | admin-www | Permission explorer |
| `admin:file-status` | admin-www | File status tracking |
| `admin:meter-health` | admin-www | Meter health reports |
| **Customer Modules** | | |
| `customer:explore` | customer-www | Data exploration & charts |
| `customer:projects` | customer-www | Project management |
| `customer:models` | customer-www | Energy models |
| `customer:eis` | customer-www | Energy Information System |
| `customer:home` | customer-www | Home dashboard |
| `customer:goals` | customer-www | Goal tracking |
| `customer:tasks` | customer-www | Task management |
| `customer:workbooks` | customer-www | Workbook reports |
| **Explore Modules** | | |
| `explore:dashboard` | explore-www | Legacy dashboard |
| `explore:reports` | explore-www | Legacy reports |

**Naming convention:** `{app}:{feature}` for clarity

---

## Expanded cascade-features API

```typescript
// @sensei/cascade-features (expanded)

import { createAccessClient } from "@sensei/cascade-features";

const access = await createAccessClient({
  // Existing ConfigCat config
  configCat: {
    apiKeyParameterName: "/ConfigCat/API_KEY",
  },
  // New AVP config
  avp: {
    policyStoreId: "ps-xxxx",
    region: "us-west-2",
  },
  environment: "production",
});

// ─────────────────────────────────────────────────────────────
// FEATURE FLAGS (ConfigCat) - unchanged
// ─────────────────────────────────────────────────────────────

const flags = await access.getFeatureFlags(context);
// Returns: { "new-chart-ui": true, "beta-export": false }

// ─────────────────────────────────────────────────────────────
// MODULE ACCESS (AVP) - new
// ─────────────────────────────────────────────────────────────

// Check single module
const canAccessProjects = await access.canAccessModule("customer:projects", {
  userId: "alice@example.com",
  orgId: "100",
  role: "coordinator",
});
// Returns: boolean

// Get all accessible modules (for nav rendering)
const modules = await access.getAccessibleModules({
  userId: "alice@example.com",
  orgId: "100",
  role: "coordinator",
});
// Returns: ["customer:explore", "customer:projects", "customer:home"]

// ─────────────────────────────────────────────────────────────
// DATA ACCESS (AVP) - new
// ─────────────────────────────────────────────────────────────

// Check resource access
const canEditSite = await access.canAccess({
  principal: { type: "User", id: "alice@example.com" },
  action: "Edit",
  resource: { type: "Site", id: "portland-manufacturing" },
});
// Returns: boolean

// Batch check (for UI rendering)
const permissions = await access.batchCanAccess([
  { action: "View", resource: { type: "Site", id: "site-1" } },
  { action: "Edit", resource: { type: "Site", id: "site-1" } },
  { action: "Delete", resource: { type: "Site", id: "site-1" } },
], { userId: "alice@example.com" });
// Returns: [true, true, false]

// ─────────────────────────────────────────────────────────────
// COMBINED (convenience) - new
// ─────────────────────────────────────────────────────────────

// Get everything needed for app initialization
const appAccess = await access.getAppAccess({
  userId: "alice@example.com",
  orgId: "100",
  role: "coordinator",
});
// Returns: {
//   featureFlags: { "new-chart-ui": true, ... },
//   modules: ["customer:explore", "customer:projects", ...],
//   // Optionally pre-fetch common resource permissions
// }
```

---

## How Apps Would Use It

### customer-www (unified)

**Before (current):**
```javascript
// server.js - one module check for entire app
plugins: { hapiSenseiAuth: { target: { type: "module", id: "customer-www" } } }

// handler - separate site permission check
const hasSitePermission = await checkUserRolesOne(userId, "site", siteId, writingRoles);
```

**After (unified):**
```javascript
// server.js - still need auth, but no module check here
plugins: { hapiSenseiAuth: { ... } }

// navigation handler - get accessible modules
const modules = await access.getAccessibleModules(context);
// Returns ["customer:explore", "customer:projects"] based on AVP policies

// action handler - check data access
const canEdit = await access.canAccess({
  principal: { type: "User", id: userId },
  action: "Edit",
  resource: { type: "Site", id: siteId },
});
```

### admin-www (cleaner)

**Before:**
```javascript
// Different modules per route
plugins: { hapiSenseiAuth: { target: { type: "module", id: "dashboard-www" } } }
plugins: { hapiSenseiAuth: { target: { type: "module", id: "user-www" } } }
```

**After:**
```javascript
// Same pattern, just uses cascade-features
const canAccess = await access.canAccessModule("admin:dashboards", context);
```

---

## Migration: Authorization Service → AVP

### What Lives Where

| Data | Current Location | Future Location |
|------|------------------|-----------------|
| User → Role mappings | Authorization Service DB | AVP (template-linked policies) |
| User → Org/Region/Site access | Authorization Service DB | AVP (template-linked policies) |
| Module definitions | Code (linkList.json) | AVP (Module entities) |
| Module → Role rules | Authorization Service | AVP (static policies) |
| Org → Module purchases | ? | AVP (template-linked policies) |

### The Authorization Service Eventually Goes Away

```
Phase 1: cascade-features calls Auth Service (current)
Phase 2: cascade-features calls AVP in parallel, compares results
Phase 3: cascade-features calls AVP primary, Auth Service fallback
Phase 4: cascade-features calls AVP only, deprecate Auth Service
```

---

## Summary: One System

```
┌─────────────────────────────────────────────────────────────┐
│                     cascade-features                         │
│                  (renamed: cascade-access?)                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐              ┌─────────────┐              │
│   │  ConfigCat  │              │     AVP     │              │
│   │             │              │             │              │
│   │  • Rollouts │              │  • Modules  │              │
│   │  • A/B test │              │  • Data     │              │
│   │  • Kills    │              │  • Roles    │              │
│   └─────────────┘              └─────────────┘              │
│                                                              │
│   getFeatureFlags()            canAccessModule()            │
│                                canAccess()                  │
│                                getAccessibleModules()       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │     All Apps Use Same SDK     │
              │                               │
              │  • admin-www                  │
              │  • customer-www               │
              │  • explore-www                │
              │  • Any new app                │
              └───────────────────────────────┘
```

**Benefits:**
- One SDK, one pattern, one mental model
- ConfigCat for temporary flags, AVP for permanent authorization
- Granular modules everywhere (not just admin-www)
- Eventually deprecate Authorization Service
- Apps don't need to know about AVP vs ConfigCat - just call cascade-features