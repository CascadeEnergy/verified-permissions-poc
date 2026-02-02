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
          <h3>6. Entity Data & Conditional Policies</h3>
          <p>
            Policies can use <code>when</code> clauses to check <strong>entity attributes</strong>.
            AVP doesn't store entity data — you provide it with each authorization request.
          </p>
          <div className="code-example">
            <div className="code-header">Policy: Creator can edit their own resources</div>
            <pre>{`permit (
  principal,
  action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
  resource
) when {
  resource has createdBy && resource.createdBy == principal
};`}</pre>
          </div>
          <p>
            For this policy to work, your app must include the resource's <code>createdBy</code>{" "}
            attribute in the authorization request:
          </p>
          <div className="code-example">
            <div className="code-header">Authorization request with entity data</div>
            <pre>{`{
  "principal": { "entityType": "Gazebo::User", "entityId": "user-1" },
  "action": { "actionType": "Gazebo::Action", "actionId": "Edit" },
  "resource": { "entityType": "Gazebo::Project", "entityId": "proj-1" },
  "entities": {
    "entityList": [
      {
        "identifier": { "entityType": "Gazebo::Project", "entityId": "proj-1" },
        "attributes": {
          "createdBy": {
            "entityIdentifier": { "entityType": "Gazebo::User", "entityId": "user-1" }
          }
        }
      }
    ]
  }
}`}</pre>
          </div>
          <p className="note">
            <strong>Key insight:</strong> Your app fetches the resource from your database,
            then includes relevant attributes in the auth request. This means no need to sync
            entity data to AVP — you control exactly what's available for each request.
          </p>
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
        <div className="flow">
          <div className="flow-step">
            <div className="step-number">1</div>
            <div className="step-content">
              <strong>Request</strong>
              <p>App asks: "Can User:alice do Action:Edit on Project:proj-123?"</p>
            </div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="step-number">2</div>
            <div className="step-content">
              <strong>Evaluate</strong>
              <p>AVP checks all policies. Finds: Alice has contributor role on Site:building-a, and proj-123 is in that site.</p>
            </div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="step-number">3</div>
            <div className="step-content">
              <strong>Decision</strong>
              <p>ALLOW (contributor template permits View + Edit on resources in the site)</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2>Try It Out</h2>
        <p>Use the tabs above to:</p>
        <ul>
          <li><strong>Policy Store</strong> – Explore the schema, static policies, templates, and any user assignments</li>
          <li><strong>Test Scenarios</strong> – Run pre-built test cases and see which policies apply to each check</li>
        </ul>
      </section>
    </div>
  );
}
