import { useState } from "react";
import { Introduction } from "./components/Introduction";
import { PolicyStoreViewer } from "./components/PolicyStoreViewer";
import { ScenarioRunner } from "./components/ScenarioRunner";
import { Playground } from "./components/Playground";

type Tab = "intro" | "policystore" | "scenarios" | "playground";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("intro");
  const apiUrl = import.meta.env.VITE_API_URL;

  return (
    <div className="app">
      <h1>Gazebo Verified Permissions POC</h1>
      <p className="subtitle">
        Explore how AWS Verified Permissions can manage Gazebo's role-based access control
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
          className={`tab ${activeTab === "intro" ? "active" : ""}`}
          onClick={() => setActiveTab("intro")}
        >
          Introduction
        </button>
        <button
          className={`tab ${activeTab === "policystore" ? "active" : ""}`}
          onClick={() => setActiveTab("policystore")}
        >
          Policy Store
        </button>
        <button
          className={`tab ${activeTab === "scenarios" ? "active" : ""}`}
          onClick={() => setActiveTab("scenarios")}
        >
          Test Scenarios
        </button>
        <button
          className={`tab ${activeTab === "playground" ? "active" : ""}`}
          onClick={() => setActiveTab("playground")}
        >
          Playground
        </button>
      </div>

      {activeTab === "intro" && <Introduction />}
      {activeTab === "policystore" && <PolicyStoreViewer />}
      {activeTab === "scenarios" && <ScenarioRunner />}
      {activeTab === "playground" && <Playground />}
    </div>
  );
}

export default App;
