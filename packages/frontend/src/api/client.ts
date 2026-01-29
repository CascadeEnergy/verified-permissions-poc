import { RoleAssignment, AuthRequest, BatchAuthRequest } from "../types/gazebo";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Permissions
  assignRole: (assignment: RoleAssignment) =>
    request<{ success: boolean; policyId: string; assignment: RoleAssignment }>(
      "/permissions/assign",
      {
        method: "POST",
        body: JSON.stringify(assignment),
      }
    ),

  removeRole: (policyId: string) =>
    request<{ success: boolean; deleted: string }>(`/permissions/assign/${policyId}`, {
      method: "DELETE",
    }),

  listPolicies: () =>
    request<{ policies: Array<{ policyId: string; principal?: any; resource?: any }> }>(
      "/permissions/list"
    ),

  // Authorization
  checkAuthorization: (req: AuthRequest) =>
    request<{
      decision: string;
      allowed: boolean;
      determiningPolicies?: Array<{ policyId: string }>;
      errors?: string[];
      request: AuthRequest;
    }>("/authorize", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  batchCheckAuthorization: (req: BatchAuthRequest) =>
    request<{
      results: Array<{
        request: AuthRequest;
        decision: string;
        allowed: boolean;
        determiningPolicies?: Array<{ policyId: string }>;
        errors?: string[];
      }>;
    }>("/authorize/batch", {
      method: "POST",
      body: JSON.stringify(req),
    }),
};
