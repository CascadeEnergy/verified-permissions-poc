export function Introduction() {
  return (
    <div className="introduction">
      <section>
        <h2>What is AWS Verified Permissions?</h2>
        <p>
          AWS Verified Permissions (AVP) is a managed authorization service that uses{" "}
          <strong>Cedar</strong>, a policy language developed by Amazon. Instead of
          hardcoding permission checks in your application, you define policies
          externally and ask AVP: <em>"Can this user do this action on this resource?"</em>
        </p>
      </section>

      <section>
        <h2>Core Concepts</h2>

        <div className="concept">
          <h3>1. Policy Store</h3>
          <p>
            A container that holds your schema, policies, and policy templates. Think of
            it as a "permissions database" for your application. Each application
            typically has one policy store.
          </p>
          <div className="code-example">
            <div className="code-header">What's in a Policy Store</div>
            <pre>{`Policy Store
├── Schema                      (entity types, actions, relationships)
├── Static Policies             (fixed rules from .cedar files)
├── Policy Templates            (reusable patterns with ?placeholders)
└── Template-Linked Policies    (user→site assignments, created via API)`}</pre>
          </div>
        </div>

        <div className="concept">
          <h3>2. Schema</h3>
          <p>
            Defines the <strong>types</strong> in your authorization model: what entities
            exist (Users, Sites, Projects), what actions are possible (View, Edit, Delete),
            and how entities relate to each other.
          </p>
          <div className="code-example">
            <div className="code-header">Gazebo Schema (simplified)</div>
            <pre>{`{
  "entityTypes": {
    "User": { "memberOfTypes": ["Role"] },
    "Site": { "memberOfTypes": ["Region", "Organization"] },
    "Project": { "memberOfTypes": ["Site"] },
    "Model": { "memberOfTypes": ["Site"] }
  },
  "actions": {
    "View": { "appliesTo": { "principalTypes": ["User"], "resourceTypes": ["Site", "Project", "Model"] } },
    "Edit": { "appliesTo": { "principalTypes": ["User"], "resourceTypes": ["Site", "Project", "Model"] } }
  }
}`}</pre>
          </div>
          <p className="note">
            <strong>Key insight:</strong> The <code>memberOfTypes</code> creates a hierarchy.
            A Project belongs to a Site, so granting access to a Site automatically includes
            its Projects and Models.
          </p>
        </div>

        <div className="concept">
          <h3>3. Policies (Static)</h3>
          <p>
            Rules that grant or deny access. Written in Cedar's declarative syntax.
            Static policies are fixed rules that apply broadly.
          </p>
          <div className="code-example">
            <div className="code-header">Example: Global admin can do anything</div>
            <pre>{`permit (
  principal in Gazebo::Role::"globalAdmin",
  action,
  resource
);`}</pre>
          </div>
          <div className="code-example">
            <div className="code-header">Example: Viewers can only view</div>
            <pre>{`permit (
  principal in Gazebo::Role::"viewer",
  action == Gazebo::Action::"View",
  resource
);`}</pre>
          </div>
        </div>

        <div className="concept">
          <h3>4. Policy Templates</h3>
          <p>
            Reusable policy patterns with <strong>placeholders</strong> (<code>?principal</code>,{" "}
            <code>?resource</code>). Templates are defined once in the policy store.
          </p>
          <div className="code-example">
            <div className="code-header">Template: Site Viewer</div>
            <pre>{`permit (
  principal == ?principal,
  action == Gazebo::Action::"View",
  resource in ?resource
);`}</pre>
          </div>
        </div>

        <div className="concept">
          <h3>5. Template-Linked Policies</h3>
          <p>
            When you assign a user to a site, you <strong>instantiate</strong> a template
            by binding specific values to the placeholders. This creates a template-linked
            policy that lives in the policy store alongside static policies.
          </p>
          <div className="code-example">
            <div className="code-header">Creating a template-linked policy (API call)</div>
            <pre>{`{
  "policyTemplateId": "site-viewer-template",
  "principal": { "entityType": "Gazebo::User", "entityId": "alice" },
  "resource": { "entityType": "Gazebo::Site", "entityId": "building-a" }
}`}</pre>
          </div>
          <p className="note">
            This effectively creates a policy: "Alice can View resources in Building A."
            The template-linked policy is stored in the policy store and evaluated just
            like static policies during authorization checks.
          </p>
        </div>

        <div className="concept">
          <h3>6. Entity Data & Hierarchy (You Must Provide It!)</h3>
          <p>
            <strong>AVP doesn't store your entity data or hierarchy.</strong> You must provide
            the full hierarchy chain with each authorization request. This includes:
          </p>
          <ul style={{ marginTop: "8px", marginBottom: "12px", paddingLeft: "24px" }}>
            <li>Entity attributes (like <code>createdBy</code>)</li>
            <li>Parent relationships (Project → Site → Region → Organization)</li>
          </ul>
          <div className="code-example">
            <div className="code-header">Policy using hierarchy: User has access to Region</div>
            <pre>{`permit (
  principal == ?principal,
  action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
  resource in ?resource   // ?resource = Region::"west-region"
);`}</pre>
          </div>
          <p>
            For Cedar to evaluate <code>resource in Region::"west-region"</code>, it needs to
            traverse: Project → Site → Region. <strong>You must provide this chain:</strong>
          </p>
          <div className="code-example">
            <div className="code-header">Authorization request with FULL hierarchy chain</div>
            <pre>{`{
  "principal": { "entityType": "Gazebo::User", "entityId": "dan@cascade.com" },
  "action": { "actionType": "Gazebo::Action", "actionId": "Edit" },
  "resource": { "entityType": "Gazebo::Project", "entityId": "my-project" },
  "entities": {
    "entityList": [
      {
        "identifier": { "entityType": "Gazebo::Project", "entityId": "my-project" },
        "parents": [{ "entityType": "Gazebo::Site", "entityId": "portland-mfg" }]
      },
      {
        "identifier": { "entityType": "Gazebo::Site", "entityId": "portland-mfg" },
        "parents": [{ "entityType": "Gazebo::Region", "entityId": "west-region" }]
      },
      {
        "identifier": { "entityType": "Gazebo::Region", "entityId": "west-region" },
        "parents": [{ "entityType": "Gazebo::Organization", "entityId": "cascade" }]
      },
      {
        "identifier": { "entityType": "Gazebo::Organization", "entityId": "cascade" },
        "parents": []
      }
    ]
  }
}`}</pre>
          </div>
          <p className="note" style={{ background: "#fff3e0", border: "1px solid #ffb74d" }}>
            <strong>Critical:</strong> If you only provide the Site without its Region parent,
            Cedar cannot traverse the hierarchy and policies scoped to Region will NOT match.
            The authorization service must fetch hierarchy from your existing data stores
            (company-service, site-service) and include it in every request.
          </p>
        </div>

        <div className="concept">
          <h3>7. Resources Don't Need to Exist in AVP</h3>
          <p>
            <strong>AVP is a policy evaluation engine, not a resource database.</strong> When you
            create a new Project in Gazebo, you don't need to register it with AVP. Instead, you
            provide the resource context at authorization time.
          </p>
          <div className="code-example">
            <div className="code-header">Authorization request with resource hierarchy</div>
            <pre>{`{
  "principal": { "entityType": "Gazebo::User", "entityId": "alice@example.com" },
  "action": { "actionType": "Gazebo::Action", "actionId": "View" },
  "resource": { "entityType": "Gazebo::Project", "entityId": "brand-new-project" },
  "entities": {
    "entityList": [
      {
        "identifier": { "entityType": "Gazebo::Project", "entityId": "brand-new-project" },
        "parents": [{ "entityType": "Gazebo::Site", "entityId": "portland-manufacturing" }]
      }
    ]
  }
}`}</pre>
          </div>
          <p>
            The <code>parents</code> field tells AVP that this project belongs to the site. AVP then
            evaluates: "Does any policy permit this user on this project (which is in this site)?"
          </p>
          <p className="note">
            <strong>Key insight:</strong> Resources are "implied" at evaluation time. AVP doesn't
            care if a resource "exists" — it just evaluates policies against what you tell it.
            This means:
          </p>
          <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
            <li>No sync needed between your database and AVP</li>
            <li>New resources work immediately with existing policies</li>
            <li>You control exactly what context AVP sees for each request</li>
          </ul>
        </div>
      </section>

      <section>
        <h2>How This Maps to Gazebo</h2>
        <div className="note" style={{ marginBottom: "16px", background: "#e3f2fd", padding: "12px", borderRadius: "4px" }}>
          <strong>Important:</strong> These role names (Viewer, Contributor, etc.) are <em>permission levels</em>, not job titles.
          They define what capabilities a user has on a specific resource. A single person can have different permission
          levels on different resources — for example, Administrator on Site A, but only Viewer on Site B.
        </div>
        <p>
          Permission hierarchy from lowest to highest: Viewer → Contributor → Champion → Facilitator → Coordinator → Administrator
        </p>
        <table className="mapping-table">
          <thead>
            <tr>
              <th>Permission Level</th>
              <th>Capabilities</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Global Admin</td>
              <td>Static policy — full access everywhere (only truly global permission)</td>
            </tr>
            <tr>
              <td>Administrator</td>
              <td>Full access to a resource and its children (Cascade only)</td>
            </tr>
            <tr>
              <td>Coordinator</td>
              <td>Facilitator + manage users, sites, data streams, groups</td>
            </tr>
            <tr>
              <td>Facilitator</td>
              <td>Champion + import projects, overwrite data, share views</td>
            </tr>
            <tr>
              <td>Champion</td>
              <td>Contributor + edit models, manage savings claims</td>
            </tr>
            <tr>
              <td>Contributor</td>
              <td>Viewer + add data, edit projects/resources/markers</td>
            </tr>
            <tr>
              <td>Viewer</td>
              <td>View and export data only</td>
            </tr>
            <tr>
              <td>Creator Access</td>
              <td>Static policy — view/edit resources you created (automatic)</td>
            </tr>
          </tbody>
        </table>
        <p className="note">
          <strong>Key insight:</strong> All permission levels except Global Admin are assigned per-resource using policy templates.
          When you assign a user as "Coordinator" on a Site, they get Coordinator access to that Site and all its children
          (Projects, Models). The same user might have "Viewer" access to a different Site.
        </p>
      </section>

      <section>
        <h2>Authorization Flow</h2>
        <div className="flow" style={{ flexWrap: "wrap", gap: "8px" }}>
          <div className="flow-step">
            <div className="step-number">1</div>
            <div className="step-content">
              <strong>Request</strong>
              <p>App asks: "Can Dan edit Project in Portland Mfg?"</p>
            </div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step" style={{ background: "#fff3e0", border: "1px solid #ffb74d" }}>
            <div className="step-number">2</div>
            <div className="step-content">
              <strong>Build Hierarchy</strong>
              <p>Auth service queries site-service & company-service to get: Site → Region → Org chain</p>
            </div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="step-number">3</div>
            <div className="step-content">
              <strong>Call AVP</strong>
              <p>Send request with full entity hierarchy to AVP</p>
            </div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="step-number">4</div>
            <div className="step-content">
              <strong>Evaluate</strong>
              <p>Cedar traverses: Project → Site → Region. Finds Dan's policy on Region.</p>
            </div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="step-number">5</div>
            <div className="step-content">
              <strong>Decision</strong>
              <p>ALLOW (Dan's template permits Edit on West Region, and Portland Mfg is in West Region)</p>
            </div>
          </div>
        </div>
        <div className="code-example" style={{ marginTop: "16px" }}>
          <div className="code-header">Step 2: Hierarchy lookup (from existing services)</div>
          <pre>{`// site-service: GET /site/portland-mfg
{ "siteId": "portland-mfg", "companyId": "region:10" }

// company-service: GET /company/10  (West Region)
{ "companyId": 10, "name": "West Region", "parentId": 1 }

// company-service: GET /company/1   (Cascade Energy)
{ "companyId": 1, "name": "Cascade Energy", "parentId": null }

// Result: Site:portland-mfg → Region:10 → Organization:1`}</pre>
        </div>
      </section>

      <section>
        <h2>Try It Out</h2>
        <p>Use the tabs above to:</p>
        <ul>
          <li><strong>Policy Store</strong> – Explore the schema, static policies, templates, and any user assignments</li>
          <li><strong>Phase 1 Scenarios</strong> – Test the Organization hierarchy (Org → Region → Site → Project/Model)</li>
          <li><strong>Phase 2 Scenarios</strong> – Test the Program Layer hierarchy (Client → Program → Cohort → Participation → Site)</li>
          <li><strong>Playground</strong> – Interactive walkthrough of creating projects and testing authorization</li>
        </ul>
      </section>
    </div>
  );
}
