import { useState } from "react";
import { api } from "../api/client";
import { AuthRequest } from "../types/gazebo";

interface Scenario {
  name: string;
  description: string;
  requests: AuthRequest[];
  expected: boolean[];
}

const SCENARIOS: Scenario[] = [
  {
    name: "Global Admin can do anything",
    description: "Users with globalAdmin role should have full access",
    requests: [
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Delete", resourceType: "Site", resourceId: "any-site" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Admin", resourceType: "Organization", resourceId: "any-org" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Edit", resourceType: "Project", resourceId: "any-project" },
    ],
    expected: [true, true, true],
  },
  {
    name: "Viewer can only view",
    description: "Viewers should only have read access",
    requests: [
      { userId: "viewer-1", userRoles: ["viewer"], action: "View", resourceType: "Site", resourceId: "site-1" },
      { userId: "viewer-1", userRoles: ["viewer"], action: "Edit", resourceType: "Site", resourceId: "site-1" },
      { userId: "viewer-1", userRoles: ["viewer"], action: "Delete", resourceType: "Site", resourceId: "site-1" },
    ],
    expected: [true, false, false],
  },
  {
    name: "Creator can edit their own resources",
    description: "Users can always edit resources they created",
    requests: [
      { userId: "user-1", userRoles: [], action: "Edit", resourceType: "Project", resourceId: "proj-1", resourceCreatedBy: "user-1" },
      { userId: "user-1", userRoles: [], action: "View", resourceType: "Project", resourceId: "proj-1", resourceCreatedBy: "user-1" },
      { userId: "user-1", userRoles: [], action: "Edit", resourceType: "Project", resourceId: "proj-2", resourceCreatedBy: "user-2" },
    ],
    expected: [true, true, false],
  },
  {
    name: "Contributor can edit projects but not sites",
    description: "Contributors have limited edit access",
    requests: [
      { userId: "contrib-1", userRoles: ["contributor"], action: "Edit", resourceType: "Project", resourceId: "proj-1" },
      { userId: "contrib-1", userRoles: ["contributor"], action: "Edit", resourceType: "Site", resourceId: "site-1" },
      { userId: "contrib-1", userRoles: ["contributor"], action: "View", resourceType: "Site", resourceId: "site-1" },
    ],
    expected: [true, false, true],
  },
  {
    name: "Coordinator can create but not delete",
    description: "Coordinators can create and edit but not delete",
    requests: [
      { userId: "coord-1", userRoles: ["coordinator"], action: "Create", resourceType: "Site", resourceId: "site-1" },
      { userId: "coord-1", userRoles: ["coordinator"], action: "Edit", resourceType: "Project", resourceId: "proj-1" },
      { userId: "coord-1", userRoles: ["coordinator"], action: "Delete", resourceType: "Project", resourceId: "proj-1" },
    ],
    expected: [true, true, false],
  },
  {
    name: "Administrator has full access",
    description: "Administrators can do anything",
    requests: [
      { userId: "admin-1", userRoles: ["administrator"], action: "Delete", resourceType: "Site", resourceId: "site-1" },
      { userId: "admin-1", userRoles: ["administrator"], action: "Admin", resourceType: "Site", resourceId: "site-1" },
      { userId: "admin-1", userRoles: ["administrator"], action: "Create", resourceType: "Site", resourceId: "site-1" },
    ],
    expected: [true, true, true],
  },
];

export function ScenarioRunner() {
  const [results, setResults] = useState<
    Array<{
      name: string;
      passed: boolean;
      results: Array<{ allowed: boolean; request: AuthRequest }>;
      expected: boolean[];
    }>
  >([]);
  const [loading, setLoading] = useState(false);

  const runAllScenarios = async () => {
    setLoading(true);
    const scenarioResults = [];

    for (const scenario of SCENARIOS) {
      try {
        const res = await api.batchCheckAuthorization({ requests: scenario.requests });
        const actuals = res.results.map((r) => r.allowed);
        const passed = actuals.every((a, i) => a === scenario.expected[i]);

        scenarioResults.push({
          name: scenario.name,
          description: scenario.description,
          passed,
          results: res.results,
          expected: scenario.expected,
        });
      } catch (err: any) {
        scenarioResults.push({
          name: scenario.name,
          description: scenario.description,
          passed: false,
          results: [],
          expected: scenario.expected,
          error: err.message,
        });
      }
    }

    setResults(scenarioResults);
    setLoading(false);
  };

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  return (
    <div className="card">
      <h2>Test Scenarios</h2>
      <p style={{ color: "#666", marginBottom: "16px" }}>
        Run pre-defined test scenarios to validate Gazebo role behaviors.
      </p>

      <button onClick={runAllScenarios} disabled={loading}>
        {loading ? "Running..." : "Run All Scenarios"}
      </button>

      {results.length > 0 && (
        <div style={{ marginTop: "16px", fontWeight: "bold" }}>
          Results: {passedCount}/{totalCount} passed
        </div>
      )}

      {results.map((scenario, i) => (
        <div key={i} className={`scenario ${scenario.passed ? "passed" : "failed"}`}>
          <h3>
            {scenario.passed ? "PASS" : "FAIL"} - {scenario.name}
          </h3>
          <div className="scenario-results">
            {scenario.results.map((r: any, j: number) => (
              <div
                key={j}
                className={`check ${r.allowed === scenario.expected[j] ? "" : "mismatch"}`}
              >
                [{r.request.userRoles?.join(", ") || "no roles"}] {r.request.action}{" "}
                {r.request.resourceType}: {r.allowed ? "ALLOWED" : "DENIED"}
                {r.allowed !== scenario.expected[j] && ` (expected ${scenario.expected[j]})`}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
