import { useState } from "react";
import { api } from "../api/client";
import { AuthRequest } from "../types/gazebo";

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
}

const PHASE2_SCENARIOS: Scenario[] = [
  {
    name: "Cycles Are Broadly Readable",
    description: "Any authenticated user can View Cycles (time period definitions are reference data)",
    requests: [
      { userId: "user-1", userRoles: [], action: "View", resourceType: "Cycle", resourceId: "fy2024-q1" },
      { userId: "user-2", userRoles: ["viewer"], action: "View", resourceType: "Cycle", resourceId: "fy2024-q2" },
      { userId: "admin-1", userRoles: ["administrator"], action: "View", resourceType: "Cycle", resourceId: "fy2024-annual" },
    ],
    expected: [true, true, true],
    policies: [
      {
        name: "cycles-readable.cedar",
        type: "static",
        code: `// Cycles are broadly readable reference data
permit (
    principal,
    action == Gazebo::Action::"View",
    resource is Gazebo::Cycle
);`,
      },
    ],
  },
  {
    name: "Cycles - Edit Denied Without Assignment",
    description: "Users cannot Edit Cycles without explicit permission (View-only by default)",
    requests: [
      { userId: "user-1", userRoles: [], action: "Edit", resourceType: "Cycle", resourceId: "fy2024-q1" },
      { userId: "coord-1", userRoles: ["coordinator"], action: "Edit", resourceType: "Cycle", resourceId: "fy2024-q1" },
    ],
    expected: [false, false],
    policies: [],
  },
  {
    name: "Global Admin - Program Hierarchy Access",
    description: "globalAdmin role has full access to all Program Layer entities",
    requests: [
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "View", resourceType: "Client", resourceId: "energy-trust" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Edit", resourceType: "Program", resourceId: "industrial-sem" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Admin", resourceType: "Cohort", resourceId: "cohort-2024" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Delete", resourceType: "Participation", resourceId: "part-001" },
    ],
    expected: [true, true, true, true],
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
    name: "Program Hierarchy - Roles Without Assignment Denied",
    description: "Like Org hierarchy, roles require template-based assignments for Program entities",
    requests: [
      { userId: "coord-1", userRoles: ["coordinator"], action: "View", resourceType: "Client", resourceId: "energy-trust" },
      { userId: "admin-2", userRoles: ["administrator"], action: "View", resourceType: "Program", resourceId: "industrial-sem" },
      { userId: "fac-1", userRoles: ["facilitator"], action: "View", resourceType: "Cohort", resourceId: "cohort-2024" },
    ],
    expected: [false, false, false],
    policies: [],
  },
  {
    name: "Implementer Entity - Reference Data Only",
    description: "Implementer entities are metadata; staff get direct role assignments to Cohorts instead",
    requests: [
      { userId: "staff-1", userRoles: [], action: "View", resourceType: "Implementer", resourceId: "stillwater-energy" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "View", resourceType: "Implementer", resourceId: "stillwater-energy" },
    ],
    expected: [false, true],
    policies: [
      {
        name: "global-admin.cedar",
        type: "static",
        code: `// Only globalAdmin can access Implementer entities directly
permit (
    principal in Gazebo::Role::"globalAdmin",
    action,
    resource
);`,
      },
    ],
  },
  {
    name: "Claim Access via Site (Phase 2 Entity)",
    description: "Claims belong to Sites; Site administrators can manage Claims",
    requests: [
      { userId: "user-1", userRoles: [], action: "View", resourceType: "Claim", resourceId: "claim-001" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "View", resourceType: "Claim", resourceId: "claim-001" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Edit", resourceType: "Claim", resourceId: "claim-001" },
    ],
    expected: [false, true, true],
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
];

export function Phase2ScenarioRunner() {
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

  const runAllScenarios = async () => {
    setLoading(true);
    const scenarioResults = [];

    for (const scenario of PHASE2_SCENARIOS) {
      try {
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
          passed,
          results,
          expected: scenario.expected,
          policies: scenario.policies,
        });
      } catch (err: any) {
        scenarioResults.push({
          name: scenario.name,
          description: scenario.description,
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
        <h2>Phase 2: Program Layer Test Scenarios</h2>
        <p style={{ color: "#666", marginBottom: "16px" }}>
          Test scenarios for the new Program Layer entities: Client, Program, Cohort, Cycle, Participation, and Claim.
          These demonstrate how the program hierarchy integrates with existing Gazebo authorization.
        </p>

        <div style={{
          background: "#e8f4f8",
          border: "1px solid #b8d4e3",
          borderRadius: "4px",
          padding: "12px",
          marginBottom: "16px"
        }}>
          <strong>New Entity Hierarchy:</strong>
          <pre style={{ margin: "8px 0 0 0", fontSize: "12px" }}>
{`Client
  └── Program (memberOf: Client)
      └── Cohort (memberOf: Program)
          ├── Cycle (memberOf: Cohort)
          └── Participation (memberOf: Cohort)
              └── Site (memberOf: Participation) [cross-hierarchy bridge]`}
          </pre>
        </div>

        <button onClick={runAllScenarios} disabled={loading} style={{ marginBottom: "16px" }}>
          {loading ? "Running..." : "Run All Phase 2 Scenarios"}
        </button>

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
            <h3>Available Phase 2 Scenarios</h3>
            {PHASE2_SCENARIOS.map((scenario, i) => (
              <div key={i} className="scenario-preview">
                <div className="scenario-preview-header">
                  <strong>{scenario.name}</strong>
                  <span className="policy-count">
                    {scenario.policies.length} {scenario.policies.length === 1 ? "policy" : "policies"}
                  </span>
                </div>
                <p>{scenario.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
