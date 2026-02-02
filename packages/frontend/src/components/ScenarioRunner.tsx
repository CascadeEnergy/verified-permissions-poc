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
    name: "Global Admin - Full Access",
    description: "Users with globalAdmin role can perform any action on any resource",
    requests: [
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "View", resourceType: "Site", resourceId: "site-1" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Delete", resourceType: "Site", resourceId: "site-1" },
      { userId: "admin-1", userRoles: ["globalAdmin"], action: "Admin", resourceType: "Organization", resourceId: "org-1" },
    ],
    expected: [true, true, true],
  },
  {
    name: "Administrator - Full Access",
    description: "Administrators have the same permissions as global admins",
    requests: [
      { userId: "admin-2", userRoles: ["administrator"], action: "View", resourceType: "Project", resourceId: "proj-1" },
      { userId: "admin-2", userRoles: ["administrator"], action: "Delete", resourceType: "Site", resourceId: "site-1" },
      { userId: "admin-2", userRoles: ["administrator"], action: "Admin", resourceType: "Site", resourceId: "site-1" },
    ],
    expected: [true, true, true],
  },
  {
    name: "Viewer - Read Only",
    description: "Viewers can only view resources, no edit/create/delete",
    requests: [
      { userId: "viewer-1", userRoles: ["viewer"], action: "View", resourceType: "Site", resourceId: "site-1" },
      { userId: "viewer-1", userRoles: ["viewer"], action: "View", resourceType: "Project", resourceId: "proj-1" },
      { userId: "viewer-1", userRoles: ["viewer"], action: "Edit", resourceType: "Site", resourceId: "site-1" },
    ],
    expected: [true, true, false],
  },
  {
    name: "Contributor - View All, Edit Projects",
    description: "Contributors can view everything but only edit Projects (not Sites)",
    requests: [
      { userId: "contrib-1", userRoles: ["contributor"], action: "View", resourceType: "Site", resourceId: "site-1" },
      { userId: "contrib-1", userRoles: ["contributor"], action: "Edit", resourceType: "Project", resourceId: "proj-1" },
      { userId: "contrib-1", userRoles: ["contributor"], action: "Edit", resourceType: "Site", resourceId: "site-1" },
    ],
    expected: [true, true, false],
  },
  {
    name: "Coordinator - View, Edit, Create (No Delete)",
    description: "Coordinators can view, edit, and create but cannot delete",
    requests: [
      { userId: "coord-1", userRoles: ["coordinator"], action: "View", resourceType: "Site", resourceId: "site-1" },
      { userId: "coord-1", userRoles: ["coordinator"], action: "Create", resourceType: "Site", resourceId: "site-1" },
      { userId: "coord-1", userRoles: ["coordinator"], action: "Delete", resourceType: "Project", resourceId: "proj-1" },
    ],
    expected: [true, true, false],
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
  },
  {
    name: "No Role - Denied",
    description: "Users without any role should be denied access",
    requests: [
      { userId: "norole-1", userRoles: [], action: "View", resourceType: "Site", resourceId: "site-1" },
      { userId: "norole-1", userRoles: [], action: "Edit", resourceType: "Project", resourceId: "proj-1" },
    ],
    expected: [false, false],
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
