import { useState } from "react";
import { api } from "../api/client";
import { ACTIONS, RESOURCE_TYPES, ROLES, Action, ResourceType, Role } from "../types/gazebo";

export function AuthChecker() {
  const [userId, setUserId] = useState("user-123");
  const [userRoles, setUserRoles] = useState<Role[]>(["viewer"]);
  const [action, setAction] = useState<Action>("View");
  const [resourceType, setResourceType] = useState<ResourceType>("Site");
  const [resourceId, setResourceId] = useState("site-456");
  const [resourceCreatedBy, setResourceCreatedBy] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const toggleRole = (role: Role) => {
    setUserRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const checkAuth = async () => {
    setLoading(true);
    try {
      const res = await api.checkAuthorization({
        userId,
        action,
        resourceType,
        resourceId,
        resourceCreatedBy: resourceCreatedBy || undefined,
        userRoles,
      });
      setResult(res);
    } catch (err: any) {
      setResult({ error: err.message });
    }
    setLoading(false);
  };

  return (
    <div className="card">
      <h2>Check Authorization</h2>
      <p style={{ color: "#666", marginBottom: "16px" }}>
        Test if a user with specific roles can perform an action on a resource.
      </p>

      <div className="grid">
        <div>
          <div className="form-group">
            <label>User ID</label>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g., user-123"
            />
          </div>

          <div className="form-group">
            <label>User Roles (select one or more)</label>
            <div className="checkbox-group">
              {ROLES.map((role) => (
                <label key={role} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={userRoles.includes(role)}
                    onChange={() => toggleRole(role)}
                  />
                  {role}
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Action</label>
            <select value={action} onChange={(e) => setAction(e.target.value as Action)}>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="form-group">
            <label>Resource Type</label>
            <select
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value as ResourceType)}
            >
              {RESOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Resource ID</label>
            <input
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              placeholder="e.g., site-456"
            />
          </div>

          <div className="form-group">
            <label>Resource Created By (optional - for creator privilege)</label>
            <input
              value={resourceCreatedBy}
              onChange={(e) => setResourceCreatedBy(e.target.value)}
              placeholder="e.g., user-123"
            />
          </div>
        </div>
      </div>

      <button onClick={checkAuth} disabled={loading}>
        {loading ? "Checking..." : "Check Authorization"}
      </button>

      {result && (
        <div className={`result ${result.allowed ? "allowed" : "denied"}`}>
          <div className="decision">{result.allowed ? "ALLOWED" : "DENIED"}</div>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
