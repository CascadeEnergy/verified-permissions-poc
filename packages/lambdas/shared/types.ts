export type Role = "globalAdmin" | "administrator" | "coordinator" | "contributor" | "viewer";
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

export interface BatchAuthRequest {
  requests: AuthRequest[];
}

export const ROLES: Role[] = ["globalAdmin", "administrator", "coordinator", "contributor", "viewer"];
