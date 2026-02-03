export type Role = "globalAdmin" | "administrator" | "coordinator" | "facilitator" | "contributor" | "champion" | "viewer";

// Phase 1: Org hierarchy targets
export type OrgTargetType = "Site" | "Organization" | "Region";
// Phase 2: Program hierarchy targets
export type ProgramTargetType = "Client" | "Program" | "Cohort" | "Participation";
export type TargetType = OrgTargetType | ProgramTargetType;

// Phase 1: Org hierarchy resources
export type OrgResourceType = "Site" | "Project" | "Model" | "Module" | "Organization" | "Region";
// Phase 2: Program hierarchy resources
export type ProgramResourceType = "Client" | "Program" | "Cohort" | "Cycle" | "Participation" | "Claim" | "Implementer";
export type ResourceType = OrgResourceType | ProgramResourceType;

export type Action = "View" | "Edit" | "Create" | "Delete" | "Admin";

export interface RoleAssignment {
  userId: string;
  role: Role;
  targetType: TargetType;
  targetId: string;
}

// Parent relationships for hierarchy traversal
export interface ResourceParents {
  // Phase 1: Org hierarchy
  site?: string;           // For Project, Model, Claim
  region?: string;         // For Site
  organization?: string;   // For Site, Region
  // Phase 2: Program hierarchy
  participation?: string;  // For Site (cross-hierarchy bridge)
  cohort?: string;         // For Participation, Cycle
  program?: string;        // For Cohort
  client?: string;         // For Program
}

export interface AuthRequest {
  userId: string;
  action: Action;
  resourceType: ResourceType;
  resourceId: string;
  resourceCreatedBy?: string;
  resourceParentSite?: string;  // Legacy: kept for backwards compatibility
  resourceParents?: ResourceParents;  // New: flexible parent specification
  userRoles?: Role[];
}

export interface AuthResponse {
  decision: string;
  allowed: boolean;
  determiningPolicies?: Array<{ policyId: string }>;
  errors?: string[];
  request: AuthRequest;
}

export interface BatchAuthRequest {
  requests: AuthRequest[];
}

export interface BatchAuthResponse {
  results: AuthResponse[];
}

export const ROLES: Role[] = ["globalAdmin", "administrator", "coordinator", "facilitator", "contributor", "champion", "viewer"];

// Phase 1: Org hierarchy
export const ORG_TARGET_TYPES: OrgTargetType[] = ["Site", "Organization", "Region"];
export const ORG_RESOURCE_TYPES: OrgResourceType[] = ["Site", "Project", "Model", "Module", "Organization", "Region"];

// Phase 2: Program hierarchy
export const PROGRAM_TARGET_TYPES: ProgramTargetType[] = ["Client", "Program", "Cohort", "Participation"];
export const PROGRAM_RESOURCE_TYPES: ProgramResourceType[] = ["Client", "Program", "Cohort", "Cycle", "Participation", "Claim", "Implementer"];

// Combined (for backwards compatibility)
export const TARGET_TYPES: TargetType[] = [...ORG_TARGET_TYPES, ...PROGRAM_TARGET_TYPES];
export const RESOURCE_TYPES: ResourceType[] = [...ORG_RESOURCE_TYPES, ...PROGRAM_RESOURCE_TYPES];

export const ACTIONS: Action[] = ["View", "Edit", "Create", "Delete", "Admin"];
