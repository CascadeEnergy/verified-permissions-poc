import { useState } from "react";
import { PermissionManager } from "./components/PermissionManager";
import { AuthChecker } from "./components/AuthChecker";
import { ScenarioRunner } from "./components/ScenarioRunner";
import { PolicyViewer } from "./components/PolicyViewer";

type Tab = "permissions" | "authorize" | "scenarios" | "policies";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("authorize");
  const apiUrl = import.meta.env.VITE_API_URL;

  return (
    <div className="app">
      <h1>Gazebo Verified Permissions POC</h1>
      <p className="subtitle">
        Test AWS Verified Permissions with Gazebo-like role-based access control
      </p>

      {!apiUrl && (
        <div className="config-banner">
          <strong>Note:</strong> No API URL configured. Create{" "}
          <code>.env.local</code> with <code>VITE_API_URL=your-api-url</code> after
          deploying the infrastructure.
        </div>
      )}

      <div className="tabs">
        <button
          className={`tab ${activeTab === "authorize" ? "active" : ""}`}
          onClick={() => setActiveTab("authorize")}
        >
          Check Authorization
        </button>
        <button
          className={`tab ${activeTab === "permissions" ? "active" : ""}`}
          onClick={() => setActiveTab("permissions")}
        >
          Manage Permissions
        </button>
        <button
          className={`tab ${activeTab === "scenarios" ? "active" : ""}`}
          onClick={() => setActiveTab("scenarios")}
        >
          Test Scenarios
        </button>
        <button
          className={`tab ${activeTab === "policies" ? "active" : ""}`}
          onClick={() => setActiveTab("policies")}
        >
          View Policies
        </button>
      </div>

      {activeTab === "authorize" && <AuthChecker />}
      {activeTab === "permissions" && <PermissionManager />}
      {activeTab === "scenarios" && <ScenarioRunner />}
      {activeTab === "policies" && <PolicyViewer />}
    </div>
  );
}

export default App;
