import { useState, useEffect } from "react";
import { api } from "../api/client";

// Hardcoded schema and policies for display (matches what's deployed)
const SCHEMA_SUMMARY = {
  entityTypes: [
    { name: "User", memberOf: ["Role"], description: "Application users" },
    { name: "Role", memberOf: [], description: "Global roles (globalAdmin, administrator, etc.)" },
    { name: "Organization", memberOf: [], description: "Top-level organization" },
    { name: "Region", memberOf: ["Organization"], description: "Geographic region within an org" },
    { name: "Site", memberOf: ["Region", "Organization"], description: "Physical site/building" },
    { name: "Project", memberOf: ["Site"], description: "Project within a site" },
    { name: "Model", memberOf: ["Site"], description: "Model within a site" },
    { name: "Module", memberOf: [], description: "Application module" },
  ],
  actions: ["View", "Edit", "Create", "Delete", "Admin"],
};

const STATIC_POLICIES = [
  {
    name: "global-admin.cedar",
    description: "Global admins can do anything",
    code: `permit (
    principal in Gazebo::Role::"globalAdmin",
    action,
    resource
);`,
  },
  {
    name: "administrator.cedar",
    description: "Administrators can do anything",
    code: `permit (
    principal in Gazebo::Role::"administrator",
    action,
    resource
);`,
  },
  {
    name: "coordinator.cedar",
    description: "Coordinators can view, edit, and create",
    code: `permit (
    principal in Gazebo::Role::"coordinator",
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create"],
    resource
);`,
  },
  {
    name: "facilitator.cedar",
    description: "Facilitators can view, edit, and create",
    code: `permit (
    principal in Gazebo::Role::"facilitator",
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create"],
    resource
);`,
  },
  {
    name: "contributor-view.cedar",
    description: "Contributors can view everything",
    code: `permit (
    principal in Gazebo::Role::"contributor",
    action == Gazebo::Action::"View",
    resource
);`,
  },
  {
    name: "contributor-edit.cedar",
    description: "Contributors can edit projects only",
    code: `permit (
    principal in Gazebo::Role::"contributor",
    action == Gazebo::Action::"Edit",
    resource is Gazebo::Project
);`,
  },
  {
    name: "champion-view.cedar",
    description: "Champions can view everything",
    code: `permit (
    principal in Gazebo::Role::"champion",
    action == Gazebo::Action::"View",
    resource
);`,
  },
  {
    name: "champion-edit.cedar",
    description: "Champions can edit projects only",
    code: `permit (
    principal in Gazebo::Role::"champion",
    action == Gazebo::Action::"Edit",
    resource is Gazebo::Project
);`,
  },
  {
    name: "viewer.cedar",
    description: "Viewers can only view",
    code: `permit (
    principal in Gazebo::Role::"viewer",
    action == Gazebo::Action::"View",
    resource
);`,
  },
  {
    name: "creator-privilege.cedar",
    description: "Anyone can view/edit resources they created",
    code: `permit (
    principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
    resource
) when {
    resource has createdBy && resource.createdBy == principal
};`,
  },
];

const POLICY_TEMPLATES = [
  {
    name: "Site Viewer",
    description: "Grants view access to a site and its contents",
    code: `permit (
    principal == ?principal,
    action == Gazebo::Action::"View",
    resource in ?resource
);`,
  },
  {
    name: "Site Contributor",
    description: "Grants view and edit access to a site and its contents",
    code: `permit (
    principal == ?principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
    resource in ?resource
);`,
  },
  {
    name: "Site Coordinator",
    description: "Grants full access to a site and its contents",
    code: `permit (
    principal == ?principal,
    action,
    resource in ?resource
);`,
  },
];

interface TemplateLinkedPolicy {
  policyId: string;
  principal?: { entityType: string; entityId: string };
  resource?: { entityType: string; entityId: string };
  templateId?: string;
  description: string;
}

export function PolicyStoreViewer() {
  const [templateLinkedPolicies, setTemplateLinkedPolicies] = useState<TemplateLinkedPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("schema");

  const loadPolicies = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listPolicies();
      // Filter to only template-linked policies
      const templateLinked = res.policies
        .filter((p: any) => p.policyType === "template-linked" || p.principal)
        .map((p: any) => ({
          policyId: p.policyId,
          principal: p.principal,
          resource: p.resource,
          templateId: p.templateId,
          description: p.description,
        }));
      setTemplateLinkedPolicies(templateLinked);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPolicies();
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="policy-store-viewer">
      <div className="section-header" onClick={() => toggleSection("schema")}>
        <h2>
          <span className={`expand-icon ${expandedSection === "schema" ? "expanded" : ""}`}>▶</span>
          Schema
        </h2>
        <span className="section-badge">{SCHEMA_SUMMARY.entityTypes.length} entity types, {SCHEMA_SUMMARY.actions.length} actions</span>
      </div>
      {expandedSection === "schema" && (
        <div className="section-content">
          <p className="section-description">
            The schema defines what entity types exist and how they relate to each other.
          </p>

          <h3>Entity Types</h3>
          <div className="entity-grid">
            {SCHEMA_SUMMARY.entityTypes.map((entity) => (
              <div key={entity.name} className="entity-card">
                <div className="entity-name">{entity.name}</div>
                <div className="entity-description">{entity.description}</div>
                {entity.memberOf.length > 0 && (
                  <div className="entity-memberof">
                    memberOf: {entity.memberOf.join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>

          <h3>Actions</h3>
          <div className="action-chips">
            {SCHEMA_SUMMARY.actions.map((action) => (
              <span key={action} className="action-chip">{action}</span>
            ))}
          </div>

          <h3>Hierarchy Visualization</h3>
          <div className="code-block">
            <pre>{`Organization
└── Region
    └── Site
        ├── Project
        └── Model

User ──memberOf──▶ Role`}</pre>
          </div>
        </div>
      )}

      <div className="section-header" onClick={() => toggleSection("static")}>
        <h2>
          <span className={`expand-icon ${expandedSection === "static" ? "expanded" : ""}`}>▶</span>
          Static Policies
        </h2>
        <span className="section-badge">{STATIC_POLICIES.length} policies</span>
      </div>
      {expandedSection === "static" && (
        <div className="section-content">
          <p className="section-description">
            Static policies are fixed rules defined in .cedar files. They define what each global role can do.
          </p>

          <div className="policy-list">
            {STATIC_POLICIES.map((policy) => (
              <div key={policy.name} className="policy-card">
                <div className="policy-header">
                  <span className="policy-name">{policy.name}</span>
                  <span className="policy-description">{policy.description}</span>
                </div>
                <pre className="policy-code">{policy.code}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section-header" onClick={() => toggleSection("templates")}>
        <h2>
          <span className={`expand-icon ${expandedSection === "templates" ? "expanded" : ""}`}>▶</span>
          Policy Templates
        </h2>
        <span className="section-badge">{POLICY_TEMPLATES.length} templates</span>
      </div>
      {expandedSection === "templates" && (
        <div className="section-content">
          <p className="section-description">
            Templates are reusable policy patterns with placeholders (?principal, ?resource).
            They're instantiated when assigning users to specific sites.
          </p>

          <div className="policy-list">
            {POLICY_TEMPLATES.map((template) => (
              <div key={template.name} className="policy-card template">
                <div className="policy-header">
                  <span className="policy-name">{template.name}</span>
                  <span className="policy-description">{template.description}</span>
                </div>
                <pre className="policy-code">{template.code}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section-header" onClick={() => toggleSection("linked")}>
        <h2>
          <span className={`expand-icon ${expandedSection === "linked" ? "expanded" : ""}`}>▶</span>
          Template-Linked Policies
        </h2>
        <span className="section-badge">
          {loading ? "Loading..." : `${templateLinkedPolicies.length} assignments`}
        </span>
      </div>
      {expandedSection === "linked" && (
        <div className="section-content">
          <p className="section-description">
            These are created when you assign a user to a site. Each one references a template
            and fills in the ?principal and ?resource placeholders.
          </p>

          {error && <div className="error-message">Error loading: {error}</div>}

          {templateLinkedPolicies.length === 0 && !loading && !error && (
            <div className="empty-state">
              <p>No site-scoped assignments yet.</p>
              <p className="hint">
                Template-linked policies are created when you assign users to specific sites
                with roles like viewer, contributor, or coordinator.
              </p>
            </div>
          )}

          {templateLinkedPolicies.length > 0 && (
            <div className="linked-policy-list">
              {templateLinkedPolicies.map((policy) => (
                <div key={policy.policyId} className="linked-policy-card">
                  <div className="linked-policy-assignment">
                    <span className="linked-label">User:</span>
                    <span className="linked-value">{policy.principal?.entityId || "?"}</span>
                    <span className="linked-arrow">→</span>
                    <span className="linked-label">Site:</span>
                    <span className="linked-value">{policy.resource?.entityId || "?"}</span>
                  </div>
                  <div className="linked-policy-meta">
                    Policy ID: {policy.policyId.slice(0, 12)}...
                  </div>
                </div>
              ))}
            </div>
          )}

          <button onClick={loadPolicies} disabled={loading} style={{ marginTop: "12px" }}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      )}
    </div>
  );
}
