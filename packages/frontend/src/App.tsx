import { Playground } from "./components/Playground";

function App() {
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

      <Playground />
    </div>
  );
}

export default App;
