/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  PHASE 1: ORGANIZATION HIERARCHY AUTHORIZATION SCENARIOS                     ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  These tests validate authorization for the Organization hierarchy:          ║
 * ║                                                                              ║
 * ║      Organization → Region → Site → Project/Model                            ║
 * ║                                                                              ║
 * ║  Key concepts demonstrated:                                                  ║
 * ║  • Static policies (globalAdmin, creator privilege)                          ║
 * ║  • Template-linked policies (per-resource role assignments)                  ║
 * ║  • Hierarchy traversal (access at Region grants access to Sites within)      ║
 * ║  • Default deny (no matching policy = denied)                                ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

/**
 * TEST HIERARCHY STRUCTURE
 * ========================
 *
 * The mock data creates this organization structure:
 *
 *   Cascade Energy (Organization:1)
 *   ├── West Region (Region:10)
 *   │   ├── portland-manufacturing (Site)
 *   │   └── seattle-hq (Site)
 *   └── East Region (Region:11)
 *       └── boston-office (Site)
 *
 *   Goodwill Industries (Organization:200)
 *   └── Portland Metro (Region:201)
 *       └── goodwill-happy-valley (Site)
 *
 * This structure tests:
 * - Cross-region isolation within same organization
 * - Cross-organization isolation
 * - Hierarchy inheritance (Region access → Site access)
 */

/**
 * CEDAR POLICIES OVERVIEW
 * =======================
 *
 * Static Policies (always active):
 *
 * 1. Global Admin - unrestricted access:
 *    ```cedar
 *    permit (
 *        principal in Gazebo::Role::"globalAdmin",
 *        action,
 *        resource
 *    );
 *    ```
 *
 * 2. Creator Privilege - access to own resources:
 *    ```cedar
 *    permit (
 *        principal,
 *        action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
 *        resource
 *    ) when {
 *        resource has createdBy && resource.createdBy == principal
 *    };
 *    ```
 *
 * Template Policies (instantiated per user-resource assignment):
 *
 * 3. Viewer Template - View only:
 *    ```cedar
 *    permit (
 *        principal == ?principal,
 *        action == Gazebo::Action::"View",
 *        resource in ?resource
 *    );
 *    ```
 *
 * 4. Contributor Template - View + Edit:
 *    ```cedar
 *    permit (
 *        principal == ?principal,
 *        action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
 *        resource in ?resource
 *    );
 *    ```
 *
 * 5. Coordinator Template - View + Edit + Create + Delete:
 *    ```cedar
 *    permit (
 *        principal == ?principal,
 *        action in [Gazebo::Action::"View", Gazebo::Action::"Edit",
 *                   Gazebo::Action::"Create", Gazebo::Action::"Delete"],
 *        resource in ?resource
 *    );
 *    ```
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { checkAuth } from "./api.js";

describe("Phase 1: Organization Hierarchy Authorization", () => {
  /**
   * ════════════════════════════════════════════════════════════════════════════
   * SECTION 1: GLOBAL ADMIN ACCESS
   * ════════════════════════════════════════════════════════════════════════════
   *
   * The globalAdmin role is the ONLY truly global role. It's defined as a static
   * policy that permits any action on any resource.
   *
   * All other roles (administrator, coordinator, facilitator, champion,
   * contributor, viewer) have NO inherent access - they require template-based
   * assignments to specific resources.
   *
   * Cedar Policy:
   * ```cedar
   * permit (
   *     principal in Gazebo::Role::"globalAdmin",
   *     action,
   *     resource
   * );
   * ```
   */
  describe("Global Admin - Full Access", () => {
    it("can View any Site", async () => {
      const response = await checkAuth({
        userId: "admin-1",
        userRoles: ["globalAdmin"],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });

    it("can Delete any Site", async () => {
      const response = await checkAuth({
        userId: "admin-1",
        userRoles: ["globalAdmin"],
        action: "Delete",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });

    it("can perform Admin actions on Organizations", async () => {
      const response = await checkAuth({
        userId: "admin-1",
        userRoles: ["globalAdmin"],
        action: "Admin",
        resourceType: "Organization",
        resourceId: "1",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });

    it("can access resources in ANY organization", async () => {
      // Goodwill is a completely separate organization
      const response = await checkAuth({
        userId: "admin-1",
        userRoles: ["globalAdmin"],
        action: "Edit",
        resourceType: "Site",
        resourceId: "goodwill-happy-valley",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });
  });

  /**
   * ════════════════════════════════════════════════════════════════════════════
   * SECTION 2: ROLES WITHOUT ASSIGNMENT ARE DENIED
   * ════════════════════════════════════════════════════════════════════════════
   *
   * This is a critical concept: roles like "administrator", "coordinator",
   * "facilitator", "champion", "contributor", and "viewer" do NOT grant any
   * inherent access.
   *
   * These roles are PERMISSION LEVELS, not job titles. They define what
   * capabilities a user has WHEN assigned to a specific resource via a
   * template-linked policy.
   *
   * Without an explicit assignment, these roles provide zero access.
   * This is AWS Verified Permissions' default-deny behavior.
   */
  describe("Roles Without Assignment - Denied", () => {
    it("administrator role has NO inherent access", async () => {
      // Having "administrator" role doesn't mean anything without an assignment
      const response = await checkAuth({
        userId: "admin-2",
        userRoles: ["administrator"],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });

    it("coordinator role has NO inherent access", async () => {
      const response = await checkAuth({
        userId: "coord-1",
        userRoles: ["coordinator"],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });

    it("facilitator role has NO inherent access", async () => {
      const response = await checkAuth({
        userId: "facilitator-1",
        userRoles: ["facilitator"],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });

    it("viewer role has NO inherent access", async () => {
      const response = await checkAuth({
        userId: "viewer-1",
        userRoles: ["viewer"],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });
  });

  /**
   * ════════════════════════════════════════════════════════════════════════════
   * SECTION 3: CREATOR PRIVILEGE
   * ════════════════════════════════════════════════════════════════════════════
   *
   * Users automatically have View and Edit access to resources they created.
   * This is implemented as a static policy that checks the `createdBy` attribute.
   *
   * Cedar Policy:
   * ```cedar
   * permit (
   *     principal,
   *     action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
   *     resource
   * ) when {
   *     resource has createdBy && resource.createdBy == principal
   * };
   * ```
   *
   * Key points:
   * - Works for ANY user, regardless of roles
   * - Only grants View and Edit (not Delete, Admin, etc.)
   * - Requires the resource to have a `createdBy` attribute
   */
  describe("Creator Privilege - Own Resources", () => {
    it("user can View their own Project (even without any roles)", async () => {
      const response = await checkAuth({
        userId: "user-1",
        userRoles: [], // No roles at all!
        action: "View",
        resourceType: "Project",
        resourceId: "proj-1",
        resourceCreatedBy: "user-1", // This user created the project
        resourceParentSite: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });

    it("user can Edit their own Project", async () => {
      const response = await checkAuth({
        userId: "user-1",
        userRoles: [],
        action: "Edit",
        resourceType: "Project",
        resourceId: "proj-1",
        resourceCreatedBy: "user-1",
        resourceParentSite: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });

    it("user CANNOT Edit someone else's Project", async () => {
      const response = await checkAuth({
        userId: "user-1",
        userRoles: [],
        action: "Edit",
        resourceType: "Project",
        resourceId: "proj-2",
        resourceCreatedBy: "user-2", // Different creator!
        resourceParentSite: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });

    it("creator privilege does NOT grant Delete access", async () => {
      const response = await checkAuth({
        userId: "user-1",
        userRoles: [],
        action: "Delete",
        resourceType: "Project",
        resourceId: "proj-1",
        resourceCreatedBy: "user-1",
        resourceParentSite: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });
  });

  /**
   * ════════════════════════════════════════════════════════════════════════════
   * SECTION 4: DEFAULT DENY
   * ════════════════════════════════════════════════════════════════════════════
   *
   * AWS Verified Permissions uses a default-deny model. If no policy explicitly
   * permits an action, it is denied.
   *
   * This means:
   * - Users with no roles and no creator relationship = DENIED
   * - Users with roles but no resource assignment = DENIED
   * - Any action not explicitly permitted = DENIED
   */
  describe("Default Deny - No Matching Policy", () => {
    it("user with no roles cannot View a Site", async () => {
      const response = await checkAuth({
        userId: "random-user",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });

    it("user with no roles cannot Edit a Project they didn't create", async () => {
      const response = await checkAuth({
        userId: "random-user",
        userRoles: [],
        action: "Edit",
        resourceType: "Project",
        resourceId: "proj-1",
        resourceParentSite: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });
  });

  /**
   * ════════════════════════════════════════════════════════════════════════════
   * SECTION 5: HIERARCHY SCENARIOS - TEMPLATE-LINKED POLICIES
   * ════════════════════════════════════════════════════════════════════════════
   *
   * These scenarios demonstrate how template-linked policies enable hierarchical
   * access control. When a user is assigned a role on a Region, they gain access
   * to all Sites within that Region due to Cedar's hierarchy traversal.
   *
   * Template-Linked Policy Creation:
   * When we call POST /permissions/assign with:
   *   { userId: "dan@cascade.com", role: "contributor", targetType: "Region", targetId: "10" }
   *
   * AVP creates a policy from the contributor template:
   * ```cedar
   * permit (
   *     principal == Gazebo::User::"dan@cascade.com",
   *     action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
   *     resource in Gazebo::Region::"10"
   * );
   * ```
   *
   * The `resource in Gazebo::Region::"10"` clause means:
   * - Direct access to Region::"10" itself
   * - Access to any Site that is memberOf Region::"10"
   * - Access to any Project/Model that is memberOf a Site in Region::"10"
   */
  describe("Hierarchy: Site-Level Access (Alice)", () => {
    /**
     * Alice's Assignment:
     * - Role: coordinator
     * - Target: Site::portland-manufacturing
     *
     * Expected access:
     * ✓ portland-manufacturing (directly assigned)
     * ✓ Projects/Models in portland-manufacturing
     * ✗ seattle-hq (different site, same region)
     * ✗ boston-office (different region)
     * ✗ goodwill sites (different organization)
     *
     * Template-Linked Policy created:
     * ```cedar
     * permit (
     *     principal == Gazebo::User::"alice@example.com",
     *     action in [Gazebo::Action::"View", Gazebo::Action::"Edit",
     *                Gazebo::Action::"Create", Gazebo::Action::"Delete"],
     *     resource in Gazebo::Site::"portland-manufacturing"
     * );
     * ```
     */

    it("Alice can View her assigned Site", async () => {
      const response = await checkAuth({
        userId: "alice@example.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });

    it("Alice can Edit Projects in her Site (coordinator has Edit)", async () => {
      const response = await checkAuth({
        userId: "alice@example.com",
        userRoles: [],
        action: "Edit",
        resourceType: "Project",
        resourceId: "hvac-project",
        resourceParentSite: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });

    it("Alice can Create Projects in her Site (coordinator has Create)", async () => {
      const response = await checkAuth({
        userId: "alice@example.com",
        userRoles: [],
        action: "Create",
        resourceType: "Project",
        resourceId: "new-project",
        resourceParentSite: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });

    it("Alice CANNOT access seattle-hq (different Site, same Region)", async () => {
      // Site-level assignment does NOT cascade to sibling sites
      const response = await checkAuth({
        userId: "alice@example.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "seattle-hq",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });

    it("Alice CANNOT access boston-office (different Region)", async () => {
      const response = await checkAuth({
        userId: "alice@example.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "boston-office",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });
  });

  describe("Hierarchy: Region-Level Access (Dan)", () => {
    /**
     * Dan's Assignment:
     * - Role: contributor
     * - Target: Region::10 (West Region)
     *
     * Expected access:
     * ✓ portland-manufacturing (in West Region)
     * ✓ seattle-hq (in West Region)
     * ✓ Projects in any West Region site
     * ✗ boston-office (in East Region)
     * ✗ goodwill sites (different organization)
     *
     * Template-Linked Policy created:
     * ```cedar
     * permit (
     *     principal == Gazebo::User::"dan@cascade.com",
     *     action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
     *     resource in Gazebo::Region::"10"
     * );
     * ```
     *
     * How Cedar evaluates "resource in Region::10":
     *   Site::"portland-manufacturing"
     *     → parents: [Region::"10"]
     *       → Region::"10" matches! ✓
     */

    it("Dan can View portland-manufacturing (Site in West Region)", async () => {
      const response = await checkAuth({
        userId: "dan@cascade.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });

    it("Dan can Edit seattle-hq (also in West Region)", async () => {
      const response = await checkAuth({
        userId: "dan@cascade.com",
        userRoles: [],
        action: "Edit",
        resourceType: "Site",
        resourceId: "seattle-hq",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });

    it("Dan can Edit Projects in West Region sites", async () => {
      const response = await checkAuth({
        userId: "dan@cascade.com",
        userRoles: [],
        action: "Edit",
        resourceType: "Project",
        resourceId: "hvac-project",
        resourceParentSite: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });

    it("Dan CANNOT access boston-office (in East Region)", async () => {
      // Region-level assignment does NOT cross to other regions
      const response = await checkAuth({
        userId: "dan@cascade.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "boston-office",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });

    it("Dan CANNOT access goodwill-happy-valley (different Organization)", async () => {
      const response = await checkAuth({
        userId: "dan@cascade.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "goodwill-happy-valley",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });

    it("Dan CANNOT Delete (contributor only has View + Edit)", async () => {
      // Contributor role doesn't include Delete permission
      const response = await checkAuth({
        userId: "dan@cascade.com",
        userRoles: [],
        action: "Delete",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });
  });

  describe("Hierarchy: Organization-Level Access (Eve)", () => {
    /**
     * Eve's Assignment:
     * - Role: viewer
     * - Target: Organization::1 (Cascade Energy)
     *
     * Expected access:
     * ✓ View portland-manufacturing (West Region → Cascade)
     * ✓ View seattle-hq (West Region → Cascade)
     * ✓ View boston-office (East Region → Cascade)
     * ✗ Edit anything (viewer only has View)
     * ✗ goodwill sites (different organization)
     *
     * Template-Linked Policy created:
     * ```cedar
     * permit (
     *     principal == Gazebo::User::"eve@cascade.com",
     *     action == Gazebo::Action::"View",
     *     resource in Gazebo::Organization::"1"
     * );
     * ```
     *
     * How Cedar evaluates "resource in Organization::1":
     *   Site::"boston-office"
     *     → parents: [Region::"11"]
     *       → Region::"11".parents: [Organization::"1"]
     *         → Organization::"1" matches! ✓
     */

    it("Eve can View portland-manufacturing (West Region → Cascade)", async () => {
      const response = await checkAuth({
        userId: "eve@cascade.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });

    it("Eve can View boston-office (East Region → Cascade)", async () => {
      // Organization-level access spans ALL regions within that org
      const response = await checkAuth({
        userId: "eve@cascade.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "boston-office",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });

    it("Eve can View Projects in any Cascade site", async () => {
      const response = await checkAuth({
        userId: "eve@cascade.com",
        userRoles: [],
        action: "View",
        resourceType: "Project",
        resourceId: "east-coast-project",
        resourceParentSite: "boston-office",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, true);
    });

    it("Eve CANNOT Edit (viewer only has View permission)", async () => {
      // Viewer template only permits View action
      const response = await checkAuth({
        userId: "eve@cascade.com",
        userRoles: [],
        action: "Edit",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });

    it("Eve CANNOT access goodwill-happy-valley (different Organization)", async () => {
      // Organization boundary is absolute
      const response = await checkAuth({
        userId: "eve@cascade.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "goodwill-happy-valley",
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.allowed, false);
    });
  });

  /**
   * ════════════════════════════════════════════════════════════════════════════
   * SECTION 6: PERMISSION LEVEL CAPABILITIES
   * ════════════════════════════════════════════════════════════════════════════
   *
   * This section documents what each permission level (role) can do when
   * assigned to a resource. Permission levels form a hierarchy:
   *
   *   Viewer → Contributor → Champion → Facilitator → Coordinator → Administrator
   *
   * Each level includes all capabilities of lower levels plus additional ones.
   *
   * | Level        | View | Edit | Create | Delete | Admin |
   * |--------------|------|------|--------|--------|-------|
   * | Viewer       |  ✓   |      |        |        |       |
   * | Contributor  |  ✓   |  ✓   |        |        |       |
   * | Champion     |  ✓   |  ✓   |  ✓     |        |       |
   * | Facilitator  |  ✓   |  ✓   |  ✓     |        |       |
   * | Coordinator  |  ✓   |  ✓   |  ✓     |  ✓     |       |
   * | Administrator|  ✓   |  ✓   |  ✓     |  ✓     |  ✓    |
   */
  describe("Permission Level Capabilities", () => {
    // These tests use globalAdmin with different simulated permission levels
    // to demonstrate what each level allows

    it("Viewer can only View", async () => {
      // Testing against a user with viewer assignment
      const viewResponse = await checkAuth({
        userId: "eve@cascade.com", // Has viewer on Cascade org
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(viewResponse.body.allowed, true);

      const editResponse = await checkAuth({
        userId: "eve@cascade.com",
        userRoles: [],
        action: "Edit",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(editResponse.body.allowed, false);
    });

    it("Contributor can View and Edit", async () => {
      // Testing against a user with contributor assignment
      const viewResponse = await checkAuth({
        userId: "dan@cascade.com", // Has contributor on West Region
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(viewResponse.body.allowed, true);

      const editResponse = await checkAuth({
        userId: "dan@cascade.com",
        userRoles: [],
        action: "Edit",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(editResponse.body.allowed, true);

      const deleteResponse = await checkAuth({
        userId: "dan@cascade.com",
        userRoles: [],
        action: "Delete",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(deleteResponse.body.allowed, false);
    });

    it("Coordinator can View, Edit, Create, and Delete", async () => {
      // Testing against a user with coordinator assignment
      const viewResponse = await checkAuth({
        userId: "alice@example.com", // Has coordinator on portland-manufacturing
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      });
      assert.strictEqual(viewResponse.body.allowed, true);

      const deleteResponse = await checkAuth({
        userId: "alice@example.com",
        userRoles: [],
        action: "Delete",
        resourceType: "Project",
        resourceId: "some-project",
        resourceParentSite: "portland-manufacturing",
      });
      assert.strictEqual(deleteResponse.body.allowed, true);
    });
  });
});
