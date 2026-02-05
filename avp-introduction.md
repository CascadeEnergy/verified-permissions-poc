# AWS Verified Permissions Introduction

## What is AWS Verified Permissions?

AWS Verified Permissions (AVP) is a managed authorization service that uses **Cedar**, a policy language developed by Amazon. Instead of hardcoding permission checks in your application, you define policies externally and ask AVP: *"Can this user do this action on this resource?"*

---

## Core Concepts

### 1. Policy Store

A container that holds your schema, policies, and policy templates. Think of it as a "permissions database" for your application. Each application typically has one policy store.

```
Policy Store
├── Schema                      (entity types, actions, relationships)
├── Static Policies             (fixed rules from .cedar files)
├── Policy Templates            (reusable patterns with ?placeholders)
└── Template-Linked Policies    (user→site assignments, created via API)
```

### 2. Schema

Defines the **types** in your authorization model: what entities exist (Users, Sites, Projects), what actions are possible (View, Edit, Delete), and how entities relate to each other.

**Gazebo Schema (simplified):**
```json
{
  "entityTypes": {
    "User": { "memberOfTypes": ["Role"] },
    "Site": { "memberOfTypes": ["Region", "Organization"] },
    "Project": { "memberOfTypes": ["Site"] },
    "Model": { "memberOfTypes": ["Site"] }
  },
  "actions": {
    "View": { "appliesTo": { "principalTypes": ["User"], "resourceTypes": ["Site", "Project", "Model"] } },
    "Edit": { "appliesTo": { "principalTypes": ["User"], "resourceTypes": ["Site", "Project", "Model"] } }
  }
}
```

> **Key insight:** The `memberOfTypes` creates a hierarchy. A Project belongs to a Site, so granting access to a Site automatically includes its Projects and Models.

### 3. Policies (Static)

Rules that grant or deny access. Written in Cedar's declarative syntax. Static policies are fixed rules that apply broadly.

**Example: Global admin can do anything**
```cedar
permit (
  principal in Gazebo::Role::"globalAdmin",
  action,
  resource
);
```

**Example: Viewers can only view**
```cedar
permit (
  principal in Gazebo::Role::"viewer",
  action == Gazebo::Action::"View",
  resource
);
```

### 4. Policy Templates

Reusable policy patterns with **placeholders** (`?principal`, `?resource`). Templates are defined once in the policy store.

**Template: Site Viewer**
```cedar
permit (
  principal == ?principal,
  action == Gazebo::Action::"View",
  resource in ?resource
);
```

### 5. Template-Linked Policies

When you assign a user to a site, you **instantiate** a template by binding specific values to the placeholders. This creates a template-linked policy that lives in the policy store alongside static policies.

**Creating a template-linked policy (API call):**
```json
{
  "policyTemplateId": "site-viewer-template",
  "principal": { "entityType": "Gazebo::User", "entityId": "alice" },
  "resource": { "entityType": "Gazebo::Site", "entityId": "building-a" }
}
```

> This effectively creates a policy: "Alice can View resources in Building A." The template-linked policy is stored in the policy store and evaluated just like static policies during authorization checks.

### 6. Entity Data & Hierarchy (You Must Provide It!)

**AVP doesn't store your entity data or hierarchy.** You must provide the full hierarchy chain with each authorization request. This includes:

- Entity attributes (like `createdBy`)
- Parent relationships (Project → Site → Region → Organization)

**Policy using hierarchy: User has access to Region**
```cedar
permit (
  principal == ?principal,
  action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
  resource in ?resource   // ?resource = Region::"west-region"
);
```

For Cedar to evaluate `resource in Region::"west-region"`, it needs to traverse: Project → Site → Region. **You must provide this chain:**

**Authorization request with FULL hierarchy chain:**
```json
{
  "principal": { "entityType": "Gazebo::User", "entityId": "dan@cascade.com" },
  "action": { "actionType": "Gazebo::Action", "actionId": "Edit" },
  "resource": { "entityType": "Gazebo::Project", "entityId": "my-project" },
  "entities": {
    "entityList": [
      {
        "identifier": { "entityType": "Gazebo::Project", "entityId": "my-project" },
        "parents": [{ "entityType": "Gazebo::Site", "entityId": "portland-mfg" }]
      },
      {
        "identifier": { "entityType": "Gazebo::Site", "entityId": "portland-mfg" },
        "parents": [{ "entityType": "Gazebo::Region", "entityId": "west-region" }]
      },
      {
        "identifier": { "entityType": "Gazebo::Region", "entityId": "west-region" },
        "parents": [{ "entityType": "Gazebo::Organization", "entityId": "cascade" }]
      },
      {
        "identifier": { "entityType": "Gazebo::Organization", "entityId": "cascade" },
        "parents": []
      }
    ]
  }
}
```

> ⚠️ **Critical:** If you only provide the Site without its Region parent, Cedar cannot traverse the hierarchy and policies scoped to Region will NOT match. The authorization service must fetch hierarchy from your existing data stores (company-service, site-service) and include it in every request.

### 7. Resources Don't Need to Exist in AVP

**AVP is a policy evaluation engine, not a resource database.** When you create a new Project in Gazebo, you don't need to register it with AVP. Instead, you provide the resource context at authorization time.

**Authorization request with resource hierarchy:**
```json
{
  "principal": { "entityType": "Gazebo::User", "entityId": "alice@example.com" },
  "action": { "actionType": "Gazebo::Action", "actionId": "View" },
  "resource": { "entityType": "Gazebo::Project", "entityId": "brand-new-project" },
  "entities": {
    "entityList": [
      {
        "identifier": { "entityType": "Gazebo::Project", "entityId": "brand-new-project" },
        "parents": [{ "entityType": "Gazebo::Site", "entityId": "portland-manufacturing" }]
      }
    ]
  }
}
```

The `parents` field tells AVP that this project belongs to the site. AVP then evaluates: "Does any policy permit this user on this project (which is in this site)?"

> **Key insight:** Resources are "implied" at evaluation time. AVP doesn't care if a resource "exists" — it just evaluates policies against what you tell it. This means:
> - No sync needed between your database and AVP
> - New resources work immediately with existing policies
> - You control exactly what context AVP sees for each request

---

## How This Maps to Gazebo

> **Important:** These role names (Viewer, Contributor, etc.) are *permission levels*, not job titles. They define what capabilities a user has on a specific resource. A single person can have different permission levels on different resources — for example, Administrator on Site A, but only Viewer on Site B.

Permission hierarchy from lowest to highest: **Viewer → Contributor → Champion → Facilitator → Coordinator → Administrator**

| Permission Level | Capabilities |
|------------------|--------------|
| Global Admin | Static policy — full access everywhere (only truly global permission) |
| Administrator | Full access to a resource and its children (Cascade only) |
| Coordinator | Facilitator + manage users, sites, data streams, groups |
| Facilitator | Champion + import projects, overwrite data, share views |
| Champion | Contributor + edit models, manage savings claims |
| Contributor | Viewer + add data, edit projects/resources/markers |
| Viewer | View and export data only |
| Creator Access | Static policy — view/edit resources you created (automatic) |

> **Key insight:** All permission levels except Global Admin are assigned per-resource using policy templates. When you assign a user as "Coordinator" on a Site, they get Coordinator access to that Site and all its children (Projects, Models). The same user might have "Viewer" access to a different Site.

---

## Authorization Flow

```
┌─────────────┐    ┌──────────────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  1. Request │ → │ 2. Build Hierarchy│ → │ 3. Call  │ → │ 4. Eval  │ → │ 5. Decide│
│             │    │                  │    │    AVP   │    │          │    │          │
│ "Can Dan    │    │ Auth service     │    │ Send     │    │ Cedar    │    │ ALLOW    │
│  edit       │    │ queries site-    │    │ request  │    │ traverses│    │ (Dan's   │
│  Project?"  │    │ service &        │    │ with     │    │ Project→ │    │ template │
│             │    │ company-service  │    │ full     │    │ Site→    │    │ permits  │
│             │    │ to get:          │    │ entity   │    │ Region   │    │ Edit on  │
│             │    │ Site→Region→Org  │    │ hierarchy│    │          │    │ Region)  │
└─────────────┘    └──────────────────┘    └──────────┘    └──────────┘    └──────────┘
```

**Step 2: Hierarchy lookup (from existing services)**
```
// site-service: GET /site/portland-mfg
{ "siteId": "portland-mfg", "companyId": "region:10" }

// company-service: GET /company/10  (West Region)
{ "companyId": 10, "name": "West Region", "parentId": 1 }

// company-service: GET /company/1   (Cascade Energy)
{ "companyId": 1, "name": "Cascade Energy", "parentId": null }

// Result: Site:portland-mfg → Region:10 → Organization:1
```

---

## Try It Out

Use the tabs above to:

- **Policy Store** – Explore the schema, static policies, templates, and any user assignments
- **Phase 1 Scenarios** – Test the Organization hierarchy (Org → Region → Site → Project/Model)
- **Phase 2 Scenarios** – Test the Program Layer hierarchy (Client → Program → Cohort → Participation → Site)
- **Playground** – Interactive walkthrough of creating projects and testing authorization