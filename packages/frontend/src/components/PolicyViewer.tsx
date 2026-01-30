import { useState, useEffect } from "react";
import { api } from "../api/client";

interface Policy {
  policyId: string;
  policyType: string;
  createdDate: string;
  statement: string;
  description: string;
}

export function PolicyViewer() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userIdFilter, setUserIdFilter] = useState("");
  const [appliedFilter, setAppliedFilter] = useState("");

  const loadPolicies = async (userId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listPolicies(userId || undefined);
      setPolicies(res.policies);
      setAppliedFilter(userId || "");
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPolicies();
  }, []);

  const handleFilter = () => {
    loadPolicies(userIdFilter.trim() || undefined);
  };

  const handleClearFilter = () => {
    setUserIdFilter("");
    loadPolicies();
  };

  const parsePolicy = (statement: string) => {
    const userMatch = statement.match(/User::"([^"]+)"/);
    const roleMatch = statement.match(/Role::"([^"]+)"/);
    const resourceMatch = statement.match(/resource in Gazebo::(\w+)::"([^"]+)"/);
    const actionMatch = statement.match(/action in \[([^\]]+)\]/);

    return {
      user: userMatch?.[1] || null,
      role: roleMatch?.[1] || null,
      resourceType: resourceMatch?.[1] || null,
      resourceId: resourceMatch?.[2] || null,
      actions: actionMatch?.[1] || "all",
    };
  };

  const staticPolicies = policies.filter((p) => p.policyType === "STATIC" && !p.statement.includes('principal =='));
  const dynamicPolicies = policies.filter((p) => p.statement.includes('principal =='));

  return (
    <div className="card">
      <h2>Policy Viewer</h2>
      <p style={{ color: "#666", marginBottom: "16px" }}>
        View all Cedar policies in the policy store. Filter by user ID to see user-specific assignments.
      </p>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <input
          type="text"
          value={userIdFilter}
          onChange={(e) => setUserIdFilter(e.target.value)}
          placeholder="Filter by User ID (e.g., user-123)"
          style={{ flex: 1 }}
          onKeyDown={(e) => e.key === "Enter" && handleFilter()}
        />
        <button onClick={handleFilter} disabled={loading}>
          {loading ? "Loading..." : "Filter"}
        </button>
        {appliedFilter && (
          <button onClick={handleClearFilter} style={{ background: "#666" }}>
            Clear
          </button>
        )}
      </div>

      {appliedFilter && (
        <div style={{ marginBottom: "16px", padding: "8px", background: "#e3f2fd", borderRadius: "4px" }}>
          Showing policies for user: <strong>{appliedFilter}</strong>
        </div>
      )}

      {error && (
        <div style={{ color: "#f44336", marginBottom: "16px" }}>
          Error: {error}
        </div>
      )}

      <div style={{ marginBottom: "24px" }}>
        <h3 style={{ borderBottom: "2px solid #2196f3", paddingBottom: "8px" }}>
          Base Role Policies ({staticPolicies.length})
        </h3>
        <p style={{ color: "#666", fontSize: "13px", marginBottom: "12px" }}>
          These define what each role can do globally.
        </p>
        {staticPolicies.length === 0 ? (
          <p style={{ color: "#999" }}>No base policies found.</p>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {staticPolicies.map((policy) => (
              <div
                key={policy.policyId}
                style={{
                  padding: "12px",
                  background: "#f5f5f5",
                  borderRadius: "4px",
                  borderLeft: "4px solid #2196f3",
                }}
              >
                <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
                  {policy.description || policy.policyId}
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    whiteSpace: "pre-wrap",
                    background: "#fff",
                    padding: "8px",
                    borderRadius: "4px",
                  }}
                >
                  {policy.statement}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 style={{ borderBottom: "2px solid #4caf50", paddingBottom: "8px" }}>
          User Role Assignments ({dynamicPolicies.length})
        </h3>
        <p style={{ color: "#666", fontSize: "13px", marginBottom: "12px" }}>
          These assign specific users to roles at specific resources.
        </p>
        {dynamicPolicies.length === 0 ? (
          <p style={{ color: "#999" }}>
            {appliedFilter
              ? `No role assignments found for user "${appliedFilter}".`
              : "No user role assignments found. Use 'Manage Permissions' to create some."}
          </p>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {dynamicPolicies.map((policy) => {
              const parsed = parsePolicy(policy.statement);
              return (
                <div
                  key={policy.policyId}
                  style={{
                    padding: "12px",
                    background: "#f5f5f5",
                    borderRadius: "4px",
                    borderLeft: "4px solid #4caf50",
                  }}
                >
                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "8px" }}>
                    {parsed.user && (
                      <span>
                        <strong>User:</strong> {parsed.user}
                      </span>
                    )}
                    {parsed.role && (
                      <span>
                        <strong>Role:</strong>{" "}
                        <span
                          style={{
                            background: "#e8f5e9",
                            padding: "2px 8px",
                            borderRadius: "4px",
                          }}
                        >
                          {parsed.role}
                        </span>
                      </span>
                    )}
                    {parsed.resourceType && (
                      <span>
                        <strong>Resource:</strong> {parsed.resourceType}::{parsed.resourceId}
                      </span>
                    )}
                  </div>
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: "12px", color: "#666" }}>
                      View Cedar Policy
                    </summary>
                    <pre
                      style={{
                        margin: "8px 0 0 0",
                        fontSize: "11px",
                        whiteSpace: "pre-wrap",
                        background: "#fff",
                        padding: "8px",
                        borderRadius: "4px",
                      }}
                    >
                      {policy.statement}
                    </pre>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: "16px", textAlign: "right" }}>
        <button onClick={() => loadPolicies(appliedFilter || undefined)} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </div>
  );
}
