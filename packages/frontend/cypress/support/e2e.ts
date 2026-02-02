// Cypress E2E support file
import "@testing-library/cypress/add-commands";

// Custom command to check authorization via API directly
Cypress.Commands.add("checkAuth", (request: {
  userId: string;
  userRoles: string[];
  action: string;
  resourceType: string;
  resourceId: string;
  resourceCreatedBy?: string;
}) => {
  const apiUrl = Cypress.env("API_URL");
  return cy.request({
    method: "POST",
    url: `${apiUrl}/authorize`,
    body: request,
    failOnStatusCode: false,
  });
});

// Custom command to run batch authorization
Cypress.Commands.add("batchCheckAuth", (requests: Array<{
  userId: string;
  userRoles: string[];
  action: string;
  resourceType: string;
  resourceId: string;
  resourceCreatedBy?: string;
}>) => {
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
      checkAuth(request: {
        userId: string;
        userRoles: string[];
        action: string;
        resourceType: string;
        resourceId: string;
        resourceCreatedBy?: string;
      }): Chainable<Cypress.Response<any>>;
      batchCheckAuth(requests: Array<{
        userId: string;
        userRoles: string[];
        action: string;
        resourceType: string;
        resourceId: string;
        resourceCreatedBy?: string;
      }>): Chainable<Cypress.Response<any>>;
    }
  }
}
