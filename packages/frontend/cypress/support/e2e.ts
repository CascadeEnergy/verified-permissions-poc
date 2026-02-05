// Cypress E2E support file
import "@testing-library/cypress/add-commands";

// Authorization request type matching the backend API
interface AuthRequest {
  userId: string;
  userRoles: string[];
  action: string;
  resourceType: string;
  resourceId: string;
  resourceCreatedBy?: string;
  resourceParentSite?: string;
}

// Role assignment type for creating template-linked policies
interface RoleAssignment {
  userId: string;
  role: string;
  targetType: string;
  targetId: string;
}

// Custom command to check authorization via API directly
Cypress.Commands.add("checkAuth", (request: AuthRequest) => {
  const apiUrl = Cypress.env("API_URL");
  return cy.request({
    method: "POST",
    url: `${apiUrl}/authorize`,
    body: request,
    failOnStatusCode: false,
  });
});

// Custom command to assign a role (creates template-linked policy in AVP)
Cypress.Commands.add("assignRole", (assignment: RoleAssignment) => {
  const apiUrl = Cypress.env("API_URL");
  return cy.request({
    method: "POST",
    url: `${apiUrl}/permissions/assign`,
    body: assignment,
    failOnStatusCode: false,
  });
});

// Custom command to remove a role assignment by policy ID
Cypress.Commands.add("removeRole", (policyId: string) => {
  const apiUrl = Cypress.env("API_URL");
  return cy.request({
    method: "DELETE",
    url: `${apiUrl}/permissions/policy/${policyId}`,
    failOnStatusCode: false,
  });
});

// Custom command to run batch authorization
Cypress.Commands.add("batchCheckAuth", (requests: AuthRequest[]) => {
  const apiUrl = Cypress.env("API_URL");
  return cy.request({
    method: "POST",
    url: `${apiUrl}/authorize/batch`,
    body: { requests },
    failOnStatusCode: false,
  });
});

declare global {
  namespace Cypress {
    interface Chainable {
      checkAuth(request: AuthRequest): Chainable<Cypress.Response<any>>;
      assignRole(assignment: RoleAssignment): Chainable<Cypress.Response<any>>;
      removeRole(policyId: string): Chainable<Cypress.Response<any>>;
      batchCheckAuth(requests: AuthRequest[]): Chainable<Cypress.Response<any>>;
    }
  }
}
