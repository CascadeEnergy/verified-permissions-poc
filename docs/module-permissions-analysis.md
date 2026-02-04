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