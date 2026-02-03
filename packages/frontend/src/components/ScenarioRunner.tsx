import { useState } from "react";
import { api } from "../api/client";
import { AuthRequest, RoleAssignment } from "../types/gazebo";

interface PolicyInfo {
  name: string;
  type: "static" | "template";
  code: string;
}

interface Scenario {
  name: string;
  description: string;
  requests: AuthRequest[];
  expected: boolean[];
  policies: PolicyInfo[];
  hierarchyNote?: string;
}

/**
 * Mock hierarchy (same as backend mockData.ts):
 *
 * Organizations:
 *   1 = Cascade Energy
 *   200 = Goodwill Industries
 *
 * Regions:
 *   10 = West Region (parent: Cascade Energy)
 *   11 = East Region (parent: Cascade Energy)
 *   201 = Portland Metro (parent: Goodwill)
 *
 * Sites:
 *   portland-manufacturing → Region 10 (West) → Org 1 (Cascade)
 *   seattle-hq → Region 10 (West) → Org 1 (Cascade)
 *   boston-office → Region 11 (East) → Org 1 (Cascade)
 *   goodwill-happy-valley → Region 201 (Portland Metro) → Org 200 (Goodwill)
 */

/**
 * Test role assignments that will be created before running hierarchy scenarios.
 * These create real template-linked policies in AVP.
 */
const TEST_ROLE_ASSIGNMENTS: RoleAssignment[] = [
  // Dan has contributor access to West Region (Region:10)
  // Should be able to access portland-manufacturing and seattle-hq
  // Should NOT be able to access boston-office (East Region) or goodwill sites
  {
    userId: "dan@cascade.com",
    role: "contributor",
    targetType: "Region",
    targetId: "10",
  },
  // Eve has viewer access to Cascade Energy (Organization:1)
  // Should be able to access ALL Cascade sites (portland, seattle, boston)
  // Should NOT be able to access goodwill sites
  {
    userId: "eve@cascade.com",
    role: "viewer",
    targetType: "Organization",
    targetId: "1",
  },
  // Alice has coordinator access to portland-manufacturing only (Site-level)
  // Should be able to access portland-manufacturing
  // Should NOT be able to access seattle-hq or other sites
  {
    userId: "alice@example.com",
    role: "coordinator",
    targetType: "Site",
    targetId: "portland-manufacturing",
  },
];

const SCENARIOS: Scenario[] = [
  {
    name: "Global Admin - Full Access",
    description: "Users with globalAdmin role can perform any action on any resource (only truly global role)",
    requests: [
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "View", resourceType: "Site", resourceId: "portland-manufacturing" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Delete", resourceType: "Site", resourceId: "portland-manufacturing" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Admin", resourceType: "Organization", resourceId: "1" },
    ],
    expected: [true, true, true],
    policies: [
      {
        name: "global-admin.cedar",
        type: "static",
        code: `permit (
    principal in Gazebo::Role::"globalAdmin",
    action,
    resource
);`,
      },
    ],
  },
  {
    name: "Roles Without Assignment - Denied",
    description: "Roles like administrator, coordinator, viewer have NO global access. They require template-based resource assignments.",
    requests: [
      { userId: "admin-2", userRoles: ["administrator"], action: "View", resourceType: "Site", resourceId: "portland-manufacturing" },
      { userId: "coord-1", userRoles: ["coordinator"], action: "View", resourceType: "Site", resourceId: "portland-manufacturing" },
      { userId: "viewer-1", userRoles: ["viewer"], action: "View", resourceType: "Site", resourceId: "portland-manufacturing" },
    ],
    expected: [false, false, false],
    policies: [],
  },
  {
    name: "Creator Privilege - Own Resources",
    description: "Users can view and edit resources they created, regardless of role",
    requests: [
      {
        userId: "user-1", userRoles: [], action: "View", resourceType: "Project", resourceId: "proj-1",
        resourceCreatedBy: "user-1", resourceParentSite: "portland-manufacturing"
      },
      {
        userId: "user-1", userRoles: [], action: "Edit", resourceType: "Project", resourceId: "proj-1",
        resourceCreatedBy: "user-1", resourceParentSite: "portland-manufacturing"
      },
      {
        userId: "user-1", userRoles: [], action: "Edit", resourceType: "Project", resourceId: "proj-2",
        resourceCreatedBy: "user-2", resourceParentSite: "portland-manufacturing"
      },
    ],
    expected: [true, true, false],
    policies: [
      {
        name: "creator-privilege.cedar",
        type: "static",
        code: `permit (
    principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
    resource
) when {
    resource has createdBy && resource.createdBy == principal
};`,
      },
    ],
  },
  {
    name: "No Role, No Creator - Denied",
    description: "Users without roles and not the creator are denied (default deny)",
    requests: [
      { userId: "norole-1", userRoles: [], action: "View", resourceType: "Site", resourceId: "portland-manufacturing" },
      { userId: "norole-1", userRoles: [], action: "Edit", resourceType: "Project", resourceId: "proj-1", resourceParentSite: "portland-manufacturing" },
    ],
    expected: [false, false],
    policies: [],
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // HIERARCHY SCENARIOS - Test that Site → Region → Organization chain works
  // These require template-linked policies to be created first (see TEST_ROLE_ASSIGNMENTS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "Hierarchy: Site-Level Access (Alice)",
    description: "Alice has coordinator on portland-manufacturing ONLY. Can access that site but not others.",
    hierarchyNote: "alice@example.com → coordinator → Site::portland-manufacturing",
    requests: [
      // Alice CAN access her assigned site
      {
        userId: "alice@example.com", userRoles: [], action: "View",
        resourceType: "Site", resourceId: "portland-manufacturing"
      },
      // Alice CAN access projects in her site
      {
        userId: "alice@example.com", userRoles: [], action: "Edit",
        resourceType: "Project", resourceId: "hvac-project",
        resourceParentSite: "portland-manufacturing"
      },
      // Alice CANNOT access seattle-hq (different site, same region)
      {
        userId: "alice@example.com", userRoles: [], action: "View",
        resourceType: "Site", resourceId: "seattle-hq"
      },
    ],
    expected: [true, true, false],
    policies: [
      {
        name: "Template-linked policy (created at runtime)",
        type: "template",
        code: `// Created via API: POST /permissions/assign
// {
//   userId: "alice@example.com",
//   role: "coordinator",
//   targetType: "Site",
//   targetId: "portland-manufacturing"
// }
//
// This instantiates the site-coordinator template:
permit (
    principal == Gazebo::User::"alice@example.com",
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit",
               Gazebo::Action::"Create", Gazebo::Action::"Delete"],
    resource in Gazebo::Site::"portland-manufacturing"
);`,
      },
    ],
  },
  {
    name: "Hierarchy: Region-Level Access (Dan)",
    description: "Dan has contributor on West Region. Can access ALL sites in West Region, but NOT East Region.",
    hierarchyNote: "dan@cascade.com → contributor → Region::10 (West Region)",
    requests: [
      // Dan CAN access portland-manufacturing (in West Region)
      {
        userId: "dan@cascade.com", userRoles: [], action: "View",
        resourceType: "Site", resourceId: "portland-manufacturing"
      },
      // Dan CAN access seattle-hq (also in West Region)
      {
        userId: "dan@cascade.com", userRoles: [], action: "Edit",
        resourceType: "Site", resourceId: "seattle-hq"
      },
      // Dan CAN access projects in West Region sites
      {
        userId: "dan@cascade.com", userRoles: [], action: "Edit",
        resourceType: "Project", resourceId: "hvac-project",
        resourceParentSite: "portland-manufacturing"
      },
      // Dan CANNOT access boston-office (in East Region)
      {
        userId: "dan@cascade.com", userRoles: [], action: "View",
        resourceType: "Site", resourceId: "boston-office"
      },
      // Dan CANNOT access goodwill site (different org entirely)
      {
        userId: "dan@cascade.com", userRoles: [], action: "View",
        resourceType: "Site", resourceId: "goodwill-happy-valley"
      },
    ],
    expected: [true, true, true, false, false],
    policies: [
      {
        name: "Template-linked policy (created at runtime)",
        type: "template",
        code: `// Created via API: POST /permissions/assign
// {
//   userId: "dan@cascade.com",
//   role: "contributor",
//   targetType: "Region",
//   targetId: "10"
// }
//
// This instantiates the site-contributor template bound to Region:
permit (
    principal == Gazebo::User::"dan@cascade.com",
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
    resource in Gazebo::Region::"10"
);

// Cedar traverses: Site::"portland-manufacturing"
//   → memberOf Region::"10" ✓ MATCH`,
      },
    ],
  },
  {
    name: "Hierarchy: Organization-Level Access (Eve)",
    description: "Eve has viewer on Cascade Energy (Org). Can view ALL Cascade sites across ALL regions.",
    hierarchyNote: "eve@cascade.com → viewer → Organization::1 (Cascade Energy)",
    requests: [
      // Eve CAN view portland-manufacturing (West Region → Cascade)
      {
        userId: "eve@cascade.com", userRoles: [], action: "View",
        resourceType: "Site", resourceId: "portland-manufacturing"
      },
      // Eve CAN view boston-office (East Region → Cascade)
      {
        userId: "eve@cascade.com", userRoles: [], action: "View",
        resourceType: "Site", resourceId: "boston-office"
      },
      // Eve CANNOT edit (viewer only has View)
      {
        userId: "eve@cascade.com", userRoles: [], action: "Edit",
        resourceType: "Site", resourceId: "portland-manufacturing"
      },
      // Eve CANNOT view goodwill (different organization)
      {
        userId: "eve@cascade.com", userRoles: [], action: "View",
        resourceType: "Site", resourceId: "goodwill-happy-valley"
      },
    ],
    expected: [true, true, false, false],
    policies: [
      {
        name: "Template-linked policy (created at runtime)",
        type: "template",
        code: `// Created via API: POST /permissions/assign
// {
//   userId: "eve@cascade.com",
//   role: "viewer",
//   targetType: "Organization",
//   targetId: "1"
// }
//
// This instantiates the site-viewer template bound to Organization:
permit (
    principal == Gazebo::User::"eve@cascade.com",
    action == Gazebo::Action::"View",
    resource in Gazebo::Organization::"1"
);

// Cedar traverses: Site::"boston-office"
//   → memberOf Region::"11"
//     → memberOf Organization::"1" ✓ MATCH`,
      },
    ],
  },
];

export function ScenarioRunner() {
  const [results, setResults] = useState<
    Array<{
      name: string;
      passed: boolean;
      results: Array<{ allowed: boolean; request: AuthRequest }>;
      expected: boolean[];
      policies: PolicyInfo[];
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [expandedScenario, setExpandedScenario] = useState<number | null>(null);

  // Track created test policies for cleanup
  const [testPolicyIds, setTestPolicyIds] = useState<string[]>([]);
  const [setupComplete, setSetupComplete] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [existingPoliciesCount, setExistingPoliciesCount] = useState(0);

  /**
   * Create test role assignments before running hierarchy scenarios.
   * This creates real template-linked policies in AVP.
   * If a policy already exists (same principal/resource/template), we treat it as success.
   */
  const setupTestPolicies = async () => {
    setLoading(true);
    setSetupError(null);
    const createdPolicyIds: string[] = [];
    const existingCount = { value: 0 };

    try {
      for (const assignment of TEST_ROLE_ASSIGNMENTS) {
        try {
          const result = await api.assignRole(assignment);
          if (result.policyId) {
            createdPolicyIds.push(result.policyId);
          }
        } catch (error: any) {
          // If policy already exists, that's fine - we can use it
          if (error.message?.includes("identical template-linked policy") ||
              error.message?.includes("already exists")) {
            existingCount.value++;
            console.log(`Policy already exists for ${assignment.userId} → ${assignment.targetType}::${assignment.targetId}`);
          } else {
            throw error; // Re-throw other errors
          }
        }
      }

      setTestPolicyIds(createdPolicyIds);
      setExistingPoliciesCount(existingCount.value);
      setSetupComplete(true);
    } catch (error: any) {
      setSetupError(error.message);
      // Clean up any policies that were created before the error
      for (const policyId of createdPolicyIds) {
        try {
          await api.removeRole(policyId);
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    setLoading(false);
  };

  /**
   * Remove test role assignments after running scenarios.
   */
  const teardownTestPolicies = async () => {
    setLoading(true);

    for (const policyId of testPolicyIds) {
      try {
        await api.removeRole(policyId);
      } catch {
        // Ignore errors - policy may already be deleted
      }
    }

    setTestPolicyIds([]);
    setExistingPoliciesCount(0);
    setSetupComplete(false);
    setLoading(false);
  };

  const runAllScenarios = async () => {
    setLoading(true);
    const scenarioResults = [];

    for (const scenario of SCENARIOS) {
      try {
        // Run individual auth checks instead of batch (batch endpoint has issues)
        const results = await Promise.all(
          scenario.requests.map(async (req) => {
            const res = await api.checkAuthorization(req);
            return {
              request: req,
              allowed: res.allowed,
              decision: res.decision,
            };
          })
        );

        const actuals = results.map((r) => r.allowed);
        const passed = actuals.every((a, i) => a === scenario.expected[i]);

        scenarioResults.push({
          name: scenario.name,
          description: scenario.description,
          hierarchyNote: scenario.hierarchyNote,
          passed,
          results,
          expected: scenario.expected,
          policies: scenario.policies,
        });
      } catch (err: any) {
        scenarioResults.push({
          name: scenario.name,
          description: scenario.description,
          hierarchyNote: scenario.hierarchyNote,
          passed: false,
          results: [],
          expected: scenario.expected,
          policies: scenario.policies,
          error: err.message,
        });
      }
    }

    setResults(scenarioResults);
    setLoading(false);
  };

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  const toggleScenario = (index: number) => {
    setExpandedScenario(expandedScenario === index ? null : index);
  };

  return (
    <div className="scenario-runner">
      <div className="card">
        <h2>Phase 1: Organization Hierarchy Scenarios</h2>
        <p style={{ color: "#666", marginBottom: "16px" }}>
          Test scenarios validating role behaviors and hierarchy traversal (Organization → Region → Site → Project).
          Click on a scenario to see the Cedar policies that apply.
        </p>

        <div style={{
          background: "#e8f4f8",
          border: "1px solid #b8d4e3",
          borderRadius: "4px",
          padding: "12px",
          marginBottom: "16px",
          fontSize: "13px"
        }}>
          <strong>Hierarchy in these tests:</strong>
          <pre style={{ margin: "8px 0 0 0", fontSize: "12px" }}>
{`Cascade Energy (Org:1)
├── West Region (Region:10)
│   ├── portland-manufacturing (Site)
│   └── seattle-hq (Site)
└── East Region (Region:11)
    └── boston-office (Site)

Goodwill Industries (Org:200)
└── Portland Metro (Region:201)
    └── goodwill-happy-valley (Site)`}
          </pre>
        </div>

        {/* Setup/Teardown Controls */}
        <div style={{
          background: setupComplete ? "#e8f5e9" : "#fff8e1",
          border: `1px solid ${setupComplete ? "#81c784" : "#ffcc80"}`,
          borderRadius: "4px",
          padding: "12px",
          marginBottom: "16px"
        }}>
          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
            Test Setup: {setupComplete ? "✓ Ready" : "Not configured"}
          </div>
          <p style={{ fontSize: "13px", margin: "0 0 12px 0", color: "#666" }}>
            Hierarchy scenarios require template-linked policies to be created first.
            These are real policies in AVP that grant test users access to specific Regions/Organizations.
          </p>

          {setupError && (
            <div style={{ color: "#d32f2f", marginBottom: "12px", fontSize: "13px" }}>
              Error: {setupError}
            </div>
          )}

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={setupTestPolicies}
              disabled={loading || setupComplete}
              style={{ background: setupComplete ? "#9e9e9e" : "#ff9800" }}
            >
              {loading ? "Creating..." : setupComplete ? "Setup Complete" : "Create Test Policies"}
            </button>

            {setupComplete && (
              <button
                onClick={teardownTestPolicies}
                disabled={loading}
                style={{ background: "#f44336" }}
              >
                {loading ? "Removing..." : "Remove Test Policies"}
              </button>
            )}
          </div>

          {setupComplete && (
            <div style={{ marginTop: "12px", fontSize: "12px", color: "#666" }}>
              {testPolicyIds.length > 0 && existingPoliciesCount === 0 && (
                <div>Created {testPolicyIds.length} template-linked policies:</div>
              )}
              {existingPoliciesCount > 0 && testPolicyIds.length > 0 && (
                <div>{existingPoliciesCount} policies already existed, {testPolicyIds.length} newly created:</div>
              )}
              {existingPoliciesCount > 0 && testPolicyIds.length === 0 && (
                <div>All {existingPoliciesCount} policies already existed (ready to use):</div>
              )}
              <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                {TEST_ROLE_ASSIGNMENTS.map((a, i) => (
                  <li key={i}>{a.userId} → {a.role} on {a.targetType}::{a.targetId}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button onClick={runAllScenarios} disabled={loading} style={{ marginBottom: "16px" }}>
          {loading ? "Running..." : "Run All Scenarios"}
        </button>

        {!setupComplete && (
          <div style={{
            background: "#ffebee",
            border: "1px solid #ef9a9a",
            borderRadius: "4px",
            padding: "8px 12px",
            marginBottom: "16px",
            fontSize: "13px"
          }}>
            <strong>Warning:</strong> Hierarchy scenarios will fail without test setup.
            Click "Create Test Policies" above first.
          </div>
        )}

        {results.length > 0 && (
          <div style={{ marginTop: "16px", marginBottom: "16px", fontWeight: "bold", fontSize: "18px" }}>
            Results: {passedCount}/{totalCount} passed
          </div>
        )}

        {results.map((scenario, i) => (
          <div key={i} className={`scenario ${scenario.passed ? "passed" : "failed"}`}>
            <div
              className="scenario-header"
              onClick={() => toggleScenario(i)}
              style={{ cursor: "pointer" }}
            >
              <h3>
                <span className={`expand-icon ${expandedScenario === i ? "expanded" : ""}`}>▶</span>
                {scenario.passed ? "✓ PASS" : "✗ FAIL"} - {scenario.name}
              </h3>
            </div>

            {(scenario as any).hierarchyNote && (
              <div style={{
                background: "#fff3e0",
                border: "1px solid #ffcc80",
                borderRadius: "4px",
                padding: "8px 12px",
                marginBottom: "8px",
                fontSize: "12px"
              }}>
                <strong>Hierarchy:</strong> {(scenario as any).hierarchyNote}
              </div>
            )}

            <div className="scenario-results">
              {scenario.results.map((r: any, j: number) => (
                <div
                  key={j}
                  className={`check-item ${r.allowed === scenario.expected[j] ? "" : "mismatch"}`}
                >
                  <div className="check-result">
                    <span className={`result-badge ${r.allowed ? "allowed" : "denied"}`}>
                      {r.allowed ? "ALLOWED" : "DENIED"}
                    </span>
                    {r.allowed !== scenario.expected[j] && (
                      <span className="expected-badge">expected {scenario.expected[j] ? "ALLOW" : "DENY"}</span>
                    )}
                  </div>
                  <div className="check-request">
                    <div className="request-row">
                      <span className="request-label">Principal:</span>
                      <code>Gazebo::User::"{r.request.userId}"</code>
                      {r.request.userRoles?.length > 0 && (
                        <span className="role-membership">
                          memberOf [{r.request.userRoles.map((role: string) => `Role::"${role}"`).join(", ")}]
                        </span>
                      )}
                    </div>
                    <div className="request-row">
                      <span className="request-label">Action:</span>
                      <code>Gazebo::Action::"{r.request.action}"</code>
                    </div>
                    <div className="request-row">
                      <span className="request-label">Resource:</span>
                      <code>Gazebo::{r.request.resourceType}::"{r.request.resourceId}"</code>
                      {r.request.resourceParentSite && (
                        <span className="resource-attr" style={{ marginLeft: "8px", color: "#1976d2" }}>
                          in Site::"{r.request.resourceParentSite}"
                        </span>
                      )}
                      {r.request.resourceCreatedBy && (
                        <span className="resource-attr">
                          .createdBy = User::"{r.request.resourceCreatedBy}"
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {expandedScenario === i && (
              <div className="scenario-policies">
                <h4>Applicable Policies</h4>
                {scenario.policies.length === 0 ? (
                  <p className="no-policies">
                    No policies match this user/action/resource combination → DENY by default
                  </p>
                ) : (
                  <div className="policy-list">
                    {scenario.policies.map((policy, j) => (
                      <div key={j} className={`policy-card ${policy.type}`}>
                        <div className="policy-header">
                          <span className="policy-name">{policy.name}</span>
                          <span className={`policy-type-badge ${policy.type}`}>
                            {policy.type === "static" ? "Static Policy" : "Template"}
                          </span>
                        </div>
                        <pre className="policy-code">{policy.code}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {results.length === 0 && (
          <div className="scenarios-preview">
            <h3>Available Scenarios</h3>
            {SCENARIOS.map((scenario, i) => (
              <div key={i} className="scenario-preview">
                <div className="scenario-preview-header">
                  <strong>{scenario.name}</strong>
                  <span className="policy-count">
                    {scenario.policies.length} {scenario.policies.length === 1 ? "policy" : "policies"}
                  </span>
                </div>
                <p>{scenario.description}</p>
                {scenario.hierarchyNote && (
                  <p style={{ fontSize: "12px", color: "#e65100", margin: "4px 0 0 0" }}>
                    <strong>Hierarchy:</strong> {scenario.hierarchyNote}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
