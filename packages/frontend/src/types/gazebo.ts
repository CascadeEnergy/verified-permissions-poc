export type Role = "globalAdmin" | "administrator" | "coordinator" | "facilitator" | "contributor" | "champion" | "viewer";
export type TargetType = "Site" | "Organization" | "Region";
export type ResourceType = "Site" | "Project" | "Model" | "Module" | "Organization" | "Region";
export type Action = "View" | "Edit" | "Create" | "Delete" | "Admin";

export interface RoleAssignment {
  userId: string;
  role: Role;
  targetType: TargetType;
  targetId: string;
}

export interface AuthRequest {
  userId: string;
  action: Action;
  resourceType: ResourceType;
  resourceId: string;
  resourceCreatedBy?: string;
  resourceParentSite?: string;
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
export const TARGET_TYPES: TargetType[] = ["Site", "Organization", "Region"];
export const RESOURCE_TYPES: ResourceType[] = ["Site", "Project", "Model", "Module", "Organization", "Region"];
export const ACTIONS: Action[] = ["View", "Edit", "Create", "Delete", "Admin"];
