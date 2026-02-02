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

const SCENARIOS: Scenario[] = [
  {
    name: "Global Admin - Full Access",
    description: "Users with globalAdmin role can perform any action on any resource (only truly global role)",
    requests: [
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "View", resourceType: "Site", resourceId: "site-1" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Delete", resourceType: "Site", resourceId: "site-1" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Admin", resourceType: "Organization", resourceId: "org-1" },
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
      { userId: "admin-2", userRoles: ["administrator"], action: "View", resourceType: "Site", resourceId: "site-1" },
      { userId: "coord-1", userRoles: ["coordinator"], action: "View", resourceType: "Site", resourceId: "site-1" },
      { userId: "viewer-1", userRoles: ["viewer"], action: "View", resourceType: "Site", resourceId: "site-1" },
    ],
    expected: [false, false, false],
    policies: [],
  },
  {
    name: "Creator Privilege - Own Resources",
    description: "Users can view and edit resources they created, regardless of role",
    requests: [
      { userId: "user-1", userRoles: [], action: "View", resourceType: "Project", resourceId: "proj-1", resourceCreatedBy: "user-1" },
      { userId: "user-1", userRoles: [], action: "Edit", resourceType: "Project", resourceId: "proj-1", resourceCreatedBy: "user-1" },
      { userId: "user-1", userRoles: [], action: "Edit", resourceType: "Project", resourceId: "proj-2", resourceCreatedBy: "user-2" },
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
      { userId: "norole-1", userRoles: [], action: "View", resourceType: "Site", resourceId: "site-1" },
      { userId: "norole-1", userRoles: [], action: "Edit", resourceType: "Project", resourceId: "proj-1" },
    ],
    expected: [false, false],
    policies: [],
  },
];

// Policy templates for scoped role assignments
// Role hierarchy (lowest to highest): Viewer < Contributor < Champion < Facilitator < Coordinator < Administrator
const ROLE_TEMPLATES: PolicyInfo[] = [
  {
    name: "Viewer",
    type: "template",
    code: `permit (
    principal == ?principal,
    action == Gazebo::Action::"View",
    resource in ?resource
);`,
  },
  {
    name: "Contributor",
    type: "template",
    code: `permit (
    principal == ?principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
    resource in ?resource
);`,
  },
  {
    name: "Champion",
    type: "template",
    code: `permit (
    principal == ?principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create"],
    resource in ?resource
);`,
  },
  {
    name: "Facilitator",
    type: "template",
    code: `permit (
    principal == ?principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create"],
    resource in ?resource
);`,
  },
  {
    name: "Coordinator",
    type: "template",
    code: `permit (
    principal == ?principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create", Gazebo::Action::"Delete"],
    resource in ?resource
);`,
  },
  {
    name: "Administrator",
    type: "template",
    code: `permit (
    principal == ?principal,
    action,
    resource in ?resource
);`,
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
  const [showTemplates, setShowTemplates] = useState(false);

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
        <h2>Test Scenarios</h2>
        <p style={{ color: "#666", marginBottom: "16px" }}>
          Run pre-defined test scenarios to validate Gazebo role behaviors.
          Click on a scenario to see the Cedar policies that apply.
        </p>

        <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
          <button onClick={runAllScenarios} disabled={loading}>
            {loading ? "Running..." : "Run All Scenarios"}
          </button>
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            style={{ background: showTemplates ? "#1976d2" : "#666" }}
          >
            {showTemplates ? "Hide" : "Show"} Role Templates
          </button>
        </div>

        {showTemplates && (
          <div className="templates-section">
            <h3>Role Templates</h3>
            <p style={{ color: "#666", fontSize: "13px", marginBottom: "12px" }}>
              These templates define permission levels for Gazebo roles. They can be applied to any resource
              (Site, Region, Organization). Instantiated with ?principal and ?resource placeholders filled in.
            </p>
            <div className="policy-list">
              {ROLE_TEMPLATES.map((template, i) => (
                <div key={i} className="policy-card template">
                  <div className="policy-header">
                    <span className="policy-name">{template.name}</span>
                    <span className="policy-type-badge template">Template</span>
                  </div>
                  <pre className="policy-code">{template.code}</pre>
                </div>
              ))}
            </div>
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
