import { useState } from "react";
import { api } from "../api/client";
import { ROLES, TARGET_TYPES, Role, TargetType } from "../types/gazebo";

export function PermissionManager() {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<Role>("administrator");
  const [targetType, setTargetType] = useState<TargetType>("Site");
  const [targetId, setTargetId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [policies, setPolicies] = useState<any[]>([]);

  const assignRole = async () => {
    if (!userId || !targetId) {
      setResult({ error: "Please fill in all fields" });
      return;
    }

    setLoading(true);
    try {
      const res = await api.assignRole({ userId, role, targetType, targetId });
      setResult(res);
      loadPolicies();
    } catch (err: any) {
      setResult({ error: err.message });
    }
    setLoading(false);
  };

  const loadPolicies = async () => {
    try {
      const res = await api.listPolicies();
      setPolicies(res.policies || []);
    } catch (err: any) {
      console.error("Failed to load policies:", err);
    }
  };

  const deletePolicy = async (policyId: string) => {
    try {
      await api.removeRole(policyId);
      loadPolicies();
    } catch (err: any) {
      setResult({ error: err.message });
    }
  };

  return (
    <div>
      <div className="grid">
        <div className="card">
          <h2>Assign Role</h2>
          <div className="form-group">
            <label>User ID</label>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g., user-123"
            />
          </div>
          <div className="form-group">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Target Type</label>
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as TargetType)}
            >
              {TARGET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Target ID</label>
            <input
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="e.g., site-456"
            />
          </div>
          <button onClick={assignRole} disabled={loading}>
            {loading ? "Assigning..." : "Assign Role"}
          </button>
          {result && <pre className="result">{JSON.stringify(result, null, 2)}</pre>}
        </div>

        <div className="card">
          <h2>
            Current Policies{" "}
            <button onClick={loadPolicies} style={{ marginLeft: 8, padding: "4px 8px" }}>
              Refresh
            </button>
          </h2>
          {policies.length === 0 ? (
            <p style={{ color: "#666" }}>No policies loaded. Click Refresh to load.</p>
          ) : (
            <div>
              {policies.map((p) => (
                <div
                  key={p.policyId}
                  style={{
                    padding: "8px",
                    marginBottom: "8px",
                    background: "#f5f5f5",
                    borderRadius: "4px",
                    fontSize: "12px",
                  }}
                >
                  <div>
                    <strong>Policy:</strong> {p.policyId?.slice(0, 20)}...
                  </div>
                  <button
                    onClick={() => deletePolicy(p.policyId)}
                    style={{
                      marginTop: "4px",
                      padding: "2px 8px",
                      background: "#f44336",
                      fontSize: "11px",
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
