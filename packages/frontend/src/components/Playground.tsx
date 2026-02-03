import { useState } from "react";
import { api } from "../api/client";
import { Action, AuthRequest } from "../types/gazebo";

// Mock hierarchy data - mirrors the backend mock data
// In production, this comes from company-service (DynamoDB) and site-service (OpenSearch)
const MOCK_HIERARCHY = {
  organizations: {
    "1": { id: "1", name: "Cascade Energy" },
    "100": { id: "100", name: "Energy Trust of Oregon" },
    "200": { id: "200", name: "Goodwill Industries" },
  },
  regions: {
    "10": { id: "10", name: "West Region", orgId: "1" },
    "11": { id: "11", name: "East Region", orgId: "1" },
    "101": { id: "101", name: "Industrial Programs", orgId: "100" },
    "201": { id: "201", name: "Portland Metro", orgId: "200" },
  },
  sites: {
    "portland-manufacturing": { id: "portland-manufacturing", name: "Portland Manufacturing", regionId: "10" },
    "seattle-hq": { id: "seattle-hq", name: "Seattle Headquarters", regionId: "10" },
    "boston-office": { id: "boston-office", name: "Boston Office", regionId: "11" },
    "cascade-corporate": { id: "cascade-corporate", name: "Cascade Corporate HQ", orgId: "1" }, // Direct to org, no region
    "goodwill-happy-valley": { id: "goodwill-happy-valley", name: "Goodwill Happy Valley", regionId: "201" },
  },
};

// Build site list with hierarchy path
const EXAMPLE_SITES = Object.values(MOCK_HIERARCHY.sites).map((site: any) => {
  let hierarchy: string;
  if (site.regionId) {
    const region = MOCK_HIERARCHY.regions[site.regionId as keyof typeof MOCK_HIERARCHY.regions];
    const org = MOCK_HIERARCHY.organizations[region.orgId as keyof typeof MOCK_HIERARCHY.organizations];
    hierarchy = `${org.name} → ${region.name}`;
  } else if (site.orgId) {
    const org = MOCK_HIERARCHY.organizations[site.orgId as keyof typeof MOCK_HIERARCHY.organizations];
    hierarchy = org.name;
  } else {
    hierarchy = "Unknown";
  }
  return { id: site.id, name: site.name, hierarchy };
});

// Example users with their known permissions
const EXAMPLE_USERS = [
  {
    id: "alice@example.com",
    name: "Alice",
    description: "Coordinator on Portland Manufacturing (Site-level)",
    permissions: "Can View, Edit, Create, Delete on portland-manufacturing",
    scope: "Site",
  },
  {
    id: "bob@example.com",
    name: "Bob",
    description: "Champion on Portland Manufacturing (Site-level)",
    permissions: "Can View, Edit, Create on portland-manufacturing",
    scope: "Site",
  },
  {
    id: "dan@cascade.com",
    name: "Dan",
    description: "Facilitator on West Region (Region-level)",
    permissions: "Can View, Edit, Create on ALL sites in West Region (portland-manufacturing, seattle-hq)",
    scope: "Region",
  },
  {
    id: "eve@example.com",
    name: "Eve",
    description: "Contributor on Cascade Energy (Organization-level)",
    permissions: "Can View, Edit on ALL sites in Cascade Energy",
    scope: "Organization",
  },
  {
    id: "admin@cascade.com",
    name: "Admin",
    description: "Global Admin (static policy)",
    permissions: "Can do anything anywhere",
    scope: "Global",
  },
  {
    id: "nobody@example.com",
    name: "Nobody",
    description: "No permissions assigned",
    permissions: "Should be denied everything",
    scope: "None",
  },
];

const ACTIONS: Action[] = ["View", "Edit", "Create", "Delete"];

interface ApiCall {
  type: "request" | "response";
  timestamp: Date;
  data: any;
  endpoint?: string;
}

interface AuthResult {
  allowed: boolean;
  decision: string;
  determiningPolicies?: Array<{ policyId: string }>;
  request: any;
}

export function Playground() {
  const [step, setStep] = useState(1);
  const [selectedSite, setSelectedSite] = useState(EXAMPLE_SITES[0].id);
  const [projectName, setProjectName] = useState("my-new-project");
  const [projectCreator, setProjectCreator] = useState("");
  const [selectedUser, setSelectedUser] = useState(EXAMPLE_USERS[0].id);
  const [selectedAction, setSelectedAction] = useState<Action>("View");
  const [apiCalls, setApiCalls] = useState<ApiCall[]>([]);
  const [authResult, setAuthResult] = useState<AuthResult | null>(null);
  const [loading, setLoading] = useState(false);

  const logApiCall = (call: ApiCall) => {
    setApiCalls((prev) => [...prev, call]);
  };

  const clearApiCalls = () => {
    setApiCalls([]);
    setAuthResult(null);
  };

  const runAuthorizationCheck = async () => {
    setLoading(true);
    clearApiCalls();

    const request: AuthRequest = {
      userId: selectedUser,
      userRoles: selectedUser === "admin@cascade.com" ? ["globalAdmin"] : [],
      action: selectedAction,
      resourceType: "Project",
      resourceId: projectName,
      resourceParentSite: selectedSite,
      ...(projectCreator ? { resourceCreatedBy: projectCreator } : {}),
    };

    // Build the hierarchy chain for the selected site
    const buildHierarchyEntities = () => {
      const site = MOCK_HIERARCHY.sites[selectedSite as keyof typeof MOCK_HIERARCHY.sites] as any;
      if (!site) return [];

      const entities: any[] = [];

      if (site.regionId) {
        // Site → Region → Organization
        const region = MOCK_HIERARCHY.regions[site.regionId as keyof typeof MOCK_HIERARCHY.regions];

        entities.push({
          identifier: { entityType: "Gazebo::Site", entityId: selectedSite },
          parents: [{ entityType: "Gazebo::Region", entityId: site.regionId }],
        });
        entities.push({
          identifier: { entityType: "Gazebo::Region", entityId: site.regionId },
          parents: [{ entityType: "Gazebo::Organization", entityId: region.orgId }],
        });
        entities.push({
          identifier: { entityType: "Gazebo::Organization", entityId: region.orgId },
          parents: [],
        });
      } else if (site.orgId) {
        // Site → Organization (no region)
        entities.push({
          identifier: { entityType: "Gazebo::Site", entityId: selectedSite },
          parents: [{ entityType: "Gazebo::Organization", entityId: site.orgId }],
        });
        entities.push({
          identifier: { entityType: "Gazebo::Organization", entityId: site.orgId },
          parents: [],
        });
      }

      return entities;
    };

    // Build what the actual AVP request looks like (for educational display)
    const hierarchyEntities = buildHierarchyEntities();
    const avpRequestForDisplay = {
      policyStoreId: "ps-xxxxxxxx",
      principal: {
        entityType: "Gazebo::User",
        entityId: selectedUser,
      },
      action: {
        actionType: "Gazebo::Action",
        actionId: selectedAction,
      },
      resource: {
        entityType: "Gazebo::Project",
        entityId: projectName,
      },
      entities: {
        entityList: [
          {
            identifier: { entityType: "Gazebo::Project", entityId: projectName },
            parents: [{ entityType: "Gazebo::Site", entityId: selectedSite }],
            ...(projectCreator ? {
              attributes: {
                createdBy: { entityIdentifier: { entityType: "Gazebo::User", entityId: projectCreator } }
              }
            } : {}),
          },
          // Full hierarchy chain from site-service and company-service
          ...hierarchyEntities,
          ...(selectedUser === "admin@cascade.com" ? [{
            identifier: { entityType: "Gazebo::User", entityId: selectedUser },
            parents: [{ entityType: "Gazebo::Role", entityId: "globalAdmin" }],
          }] : []),
        ],
      },
    };

    // Log the request (show AVP format for educational purposes)
    logApiCall({
      type: "request",
      timestamp: new Date(),
      endpoint: "POST /authorize → AVP IsAuthorized",
      data: avpRequestForDisplay,
    });

    try {
      const response = await api.checkAuthorization(request);

      // Log the response
      logApiCall({
        type: "response",
        timestamp: new Date(),
        data: response,
      });

      setAuthResult(response);
    } catch (error: any) {
      logApiCall({
        type: "response",
        timestamp: new Date(),
        data: { error: error.message },
      });
    }

    setLoading(false);
  };

  const getExplanation = (): string => {
    if (!authResult) return "";

    const user = EXAMPLE_USERS.find((u) => u.id === selectedUser);
    const site = EXAMPLE_SITES.find((s) => s.id === selectedSite);
    const siteData = MOCK_HIERARCHY.sites[selectedSite as keyof typeof MOCK_HIERARCHY.sites] as any;

    // Get the site's hierarchy for explanation
    let siteRegion = null;
    let siteOrg = null;
    if (siteData?.regionId) {
      siteRegion = MOCK_HIERARCHY.regions[siteData.regionId as keyof typeof MOCK_HIERARCHY.regions];
      siteOrg = MOCK_HIERARCHY.organizations[siteRegion.orgId as keyof typeof MOCK_HIERARCHY.organizations];
    } else if (siteData?.orgId) {
      siteOrg = MOCK_HIERARCHY.organizations[siteData.orgId as keyof typeof MOCK_HIERARCHY.organizations];
    }

    if (authResult.allowed) {
      if (selectedUser === "admin@cascade.com") {
        return `ALLOWED: ${user?.name} is a Global Admin with a static policy that permits all actions on all resources. The globalAdmin role bypasses all resource-specific checks.`;
      }
      if (projectCreator === selectedUser && (selectedAction === "View" || selectedAction === "Edit")) {
        return `ALLOWED: The creator-privilege static policy permits users to View and Edit resources they created. Since ${user?.name} created this project, they have access regardless of other role assignments.`;
      }
      if (user?.scope === "Region" && siteRegion) {
        return `ALLOWED: ${user?.name} has a template-linked policy on Region "${siteRegion.name}". Cedar traverses the hierarchy: Project → Site → Region, and finds that "${site?.name}" is in the West Region. The "${selectedAction}" action is within their permitted actions.`;
      }
      if (user?.scope === "Organization" && siteOrg) {
        return `ALLOWED: ${user?.name} has a template-linked policy on Organization "${siteOrg.name}". Cedar traverses: Project → Site → Region → Organization, finding the match. The "${selectedAction}" action is permitted.`;
      }
      return `ALLOWED: ${user?.name} has a template-linked policy granting ${user?.permissions}. Since the project "${projectName}" is in ${site?.name}, and ${selectedAction} is within their permitted actions, access is granted.`;
    } else {
      // Check if this is a creator trying to do something other than View/Edit
      if (projectCreator === selectedUser && selectedAction !== "View" && selectedAction !== "Edit") {
        return `DENIED: ${user?.name} created this resource, but the creator-privilege policy only permits View and Edit actions. ${selectedAction} is not covered by creator privileges — you'd need a separate role assignment for that.`;
      }
      if (selectedUser === "nobody@example.com") {
        return `DENIED: ${user?.name} has no role assignments and is not the creator of this resource. In Cedar/AVP, the default is to deny access when no policy explicitly permits it.`;
      }
      // Check if the site is in the user's region/org
      if (user?.scope === "Region" && siteRegion) {
        const isInWestRegion = siteData?.regionId === "10";
        if (!isInWestRegion) {
          return `DENIED: ${user?.name} has permissions on West Region, but "${site?.name}" is in ${siteRegion.name}. Cedar traverses the hierarchy but finds no match for the user's policy scope.`;
        }
      }
      if (user?.scope === "Organization" && siteOrg) {
        const isInCascade = siteOrg.id === "1";
        if (!isInCascade) {
          return `DENIED: ${user?.name} has permissions on Cascade Energy, but "${site?.name}" belongs to ${siteOrg.name}. The hierarchy doesn't connect to the user's policy scope.`;
        }
      }
      return `DENIED: ${user?.name} does not have the "${selectedAction}" action permitted. Their permissions (${user?.permissions}) don't include this action for this resource.`;
    }
  };

  return (
    <div className="playground">
      <div className="card">
        <h2>Interactive Playground</h2>
        <p style={{ color: "#666", marginBottom: "24px" }}>
          Walk through creating a project and testing authorization. See the actual API calls
          and understand why access is granted or denied.
        </p>

        {/* Progress indicator */}
        <div className="steps-indicator" style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                padding: "8px 16px",
                borderRadius: "4px",
                background: step === s ? "#1976d2" : step > s ? "#4caf50" : "#e0e0e0",
                color: step >= s ? "white" : "#666",
                fontWeight: step === s ? "bold" : "normal",
                cursor: step > s ? "pointer" : "default",
              }}
              onClick={() => step > s && setStep(s)}
            >
              Step {s}: {s === 1 ? "Create Project" : s === 2 ? "Select User" : "Test Access"}
            </div>
          ))}
        </div>

        {/* Step 1: Create Project */}
        {step === 1 && (
          <div className="step-content">
            <h3>Step 1: Create a Project</h3>
            <p style={{ color: "#666", marginBottom: "16px" }}>
              In Gazebo, Projects belong to Sites. When you create a project, it inherits the
              Site's position in the resource hierarchy. Users with access to the Site automatically
              have access to Projects within it.
            </p>

            <div
              style={{
                padding: "12px 16px",
                marginBottom: "16px",
                background: "#e8f5e9",
                border: "1px solid #81c784",
                borderRadius: "4px",
                fontSize: "13px",
              }}
            >
              <strong>Note:</strong> You don't need to register resources with AVP. When you create
              a project in your app, you just save it to your database. At authorization time, you
              tell AVP about the resource and its parent site in the request — AVP evaluates policies
              against whatever context you provide.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "400px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Select Site:
                </label>
                <select
                  value={selectedSite}
                  onChange={(e) => setSelectedSite(e.target.value)}
                  style={{ width: "100%", padding: "8px", fontSize: "14px" }}
                >
                  {EXAMPLE_SITES.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name} — {site.hierarchy}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Project Name:
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  style={{ width: "100%", padding: "8px", fontSize: "14px" }}
                  placeholder="e.g., hvac-optimization"
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Created By (optional):
                </label>
                <select
                  value={projectCreator}
                  onChange={(e) => setProjectCreator(e.target.value)}
                  style={{ width: "100%", padding: "8px", fontSize: "14px" }}
                >
                  <option value="">No creator set</option>
                  {EXAMPLE_USERS.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.id})
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
                  Setting a creator enables the "creator-privilege" policy, allowing that user to <strong>View and Edit</strong> this resource (but not Delete or other actions).
                </p>
              </div>
            </div>

            <div className="code-block" style={{ marginTop: "16px" }}>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
                Resource hierarchy (from site-service + company-service):
              </div>
              <pre style={{ margin: 0 }}>{(() => {
                const site = MOCK_HIERARCHY.sites[selectedSite as keyof typeof MOCK_HIERARCHY.sites] as any;
                if (!site) return `Gazebo::Project::"${projectName}"\n  └── memberOf: Gazebo::Site::"${selectedSite}"`;

                if (site.regionId) {
                  const region = MOCK_HIERARCHY.regions[site.regionId as keyof typeof MOCK_HIERARCHY.regions];
                  const org = MOCK_HIERARCHY.organizations[region.orgId as keyof typeof MOCK_HIERARCHY.organizations];
                  return `Gazebo::Project::"${projectName}"${projectCreator ? `\n  └── createdBy: User::"${projectCreator}"` : ""}
  └── memberOf: Gazebo::Site::"${selectedSite}" (${site.name})
        └── memberOf: Gazebo::Region::"${site.regionId}" (${region.name})
              └── memberOf: Gazebo::Organization::"${region.orgId}" (${org.name})`;
                } else if (site.orgId) {
                  const org = MOCK_HIERARCHY.organizations[site.orgId as keyof typeof MOCK_HIERARCHY.organizations];
                  return `Gazebo::Project::"${projectName}"${projectCreator ? `\n  └── createdBy: User::"${projectCreator}"` : ""}
  └── memberOf: Gazebo::Site::"${selectedSite}" (${site.name})
        └── memberOf: Gazebo::Organization::"${site.orgId}" (${org.name})`;
                }
                return "";
              })()}</pre>
            </div>

            <div style={{
              marginTop: "12px",
              padding: "12px",
              background: "#e3f2fd",
              borderRadius: "4px",
              fontSize: "13px"
            }}>
              <strong>Key insight:</strong> The backend fetches this hierarchy from existing services
              (company-service, site-service) and passes it to AVP. This enables Cedar to traverse
              <code style={{ background: "#fff", padding: "2px 4px", borderRadius: "2px", margin: "0 4px" }}>
                resource in Region::"10"
              </code>
              and match a Project that's in a Site that's in that Region.
            </div>

            <button
              onClick={() => setStep(2)}
              style={{ marginTop: "16px" }}
              disabled={!projectName}
            >
              Next: Select User to Test →
            </button>
          </div>
        )}

        {/* Step 2: Select User */}
        {step === 2 && (
          <div className="step-content">
            <h3>Step 2: Select a User to Test</h3>
            <p style={{ color: "#666", marginBottom: "16px" }}>
              Choose a user and action to test. Each user has different permission levels
              on different resources based on their template-linked policies.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "500px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
                  Select User:
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {EXAMPLE_USERS.map((user) => (
                    <label
                      key={user.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "8px",
                        padding: "12px",
                        border: selectedUser === user.id ? "2px solid #1976d2" : "1px solid #ddd",
                        borderRadius: "4px",
                        cursor: "pointer",
                        background: selectedUser === user.id ? "#e3f2fd" : "white",
                      }}
                    >
                      <input
                        type="radio"
                        name="user"
                        value={user.id}
                        checked={selectedUser === user.id}
                        onChange={(e) => setSelectedUser(e.target.value)}
                        style={{ marginTop: "2px" }}
                      />
                      <div>
                        <div style={{ fontWeight: "bold" }}>{user.name}</div>
                        <div style={{ fontSize: "13px", color: "#666" }}>{user.description}</div>
                        <div style={{ fontSize: "12px", color: "#888", fontStyle: "italic" }}>
                          {user.permissions}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Action to Test:
                </label>
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value as Action)}
                  style={{ width: "100%", padding: "8px", fontSize: "14px" }}
                >
                  {ACTIONS.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button onClick={() => setStep(1)} style={{ background: "#666" }}>
                ← Back
              </button>
              <button onClick={() => { setStep(3); runAuthorizationCheck(); }}>
                Run Authorization Check →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {step === 3 && (
          <div className="step-content">
            <h3>Step 3: Authorization Result</h3>
            <p style={{ color: "#666", marginBottom: "16px" }}>
              Below is the actual API call made to AWS Verified Permissions and the response.
            </p>

            {loading && <div style={{ padding: "20px", textAlign: "center" }}>Running authorization check...</div>}

            {!loading && authResult && (
              <>
                {/* Result Banner */}
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "4px",
                    marginBottom: "16px",
                    background: authResult.allowed ? "#e8f5e9" : "#ffebee",
                    border: `2px solid ${authResult.allowed ? "#4caf50" : "#f44336"}`,
                  }}
                >
                  <div style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "8px" }}>
                    {authResult.allowed ? "✓ ACCESS ALLOWED" : "✗ ACCESS DENIED"}
                  </div>
                  <div>
                    Can <strong>{EXAMPLE_USERS.find((u) => u.id === selectedUser)?.name}</strong> perform{" "}
                    <strong>{selectedAction}</strong> on project <strong>"{projectName}"</strong> in{" "}
                    <strong>{EXAMPLE_SITES.find((s) => s.id === selectedSite)?.name}</strong>?
                  </div>
                </div>

                {/* Explanation */}
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "4px",
                    marginBottom: "16px",
                    background: "#fff3e0",
                    border: "1px solid #ffb74d",
                  }}
                >
                  <div style={{ fontWeight: "bold", marginBottom: "8px" }}>Why this result?</div>
                  <div>{getExplanation()}</div>
                </div>

                {/* API Calls */}
                <div style={{ marginBottom: "16px" }}>
                  <h4>API Calls</h4>
                  {apiCalls.map((call, i) => (
                    <div
                      key={i}
                      style={{
                        marginBottom: "12px",
                        border: "1px solid #ddd",
                        borderRadius: "4px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "8px 12px",
                          background: call.type === "request" ? "#e3f2fd" : "#f5f5f5",
                          borderBottom: "1px solid #ddd",
                          fontWeight: "bold",
                          fontSize: "13px",
                        }}
                      >
                        {call.type === "request" ? `→ Request: ${call.endpoint}` : "← Response"}
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          padding: "12px",
                          fontSize: "12px",
                          overflow: "auto",
                          maxHeight: "300px",
                          background: "#fafafa",
                        }}
                      >
                        {JSON.stringify(call.data, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>

                {/* Cedar Policy Explanation */}
                <div style={{ marginBottom: "16px" }}>
                  <h4>How Cedar Evaluates This</h4>
                  <div className="code-block">
                    <pre style={{ margin: 0, fontSize: "12px" }}>{`// The authorization question:
isAuthorized(
  principal: Gazebo::User::"${selectedUser}",
  action: Gazebo::Action::"${selectedAction}",
  resource: Gazebo::Project::"${projectName}"  // memberOf Site::"${selectedSite}"
)

// Cedar checks ALL policies. If ANY permit policy matches
// and NO forbid policy matches, access is ALLOWED.
// Otherwise, access is DENIED (default deny).`}</pre>
                  </div>
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button onClick={() => setStep(2)} style={{ background: "#666" }}>
                ← Back
              </button>
              <button onClick={runAuthorizationCheck} disabled={loading}>
                Run Again
              </button>
              <button
                onClick={() => {
                  setStep(1);
                  clearApiCalls();
                  setAuthResult(null);
                }}
                style={{ background: "#ff9800" }}
              >
                Start Over
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
