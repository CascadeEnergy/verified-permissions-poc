import { useState } from "react";
import { ScenarioRunner } from "./components/ScenarioRunner";
import { Phase2ScenarioRunner } from "./components/Phase2ScenarioRunner";
import { Playground } from "./components/Playground";

type Tab = "scenarios" | "phase2" | "playground";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("scenarios");
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
          className={`tab ${activeTab === "scenarios" ? "active" : ""}`}
          onClick={() => setActiveTab("scenarios")}
        >
          Phase 1 Scenarios
        </button>
        <button
          className={`tab ${activeTab === "phase2" ? "active" : ""}`}
          onClick={() => setActiveTab("phase2")}
        >
          Phase 2 Scenarios
        </button>
        <button
          className={`tab ${activeTab === "playground" ? "active" : ""}`}
          onClick={() => setActiveTab("playground")}
        >
          Playground
        </button>
      </div>

      {activeTab === "scenarios" && <ScenarioRunner />}
      {activeTab === "phase2" && <Phase2ScenarioRunner />}
      {activeTab === "playground" && <Playground />}
    </div>
  );
}

export default App;
