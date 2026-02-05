/**
 * UI Tests for the POC Application
 *
 * The app now only contains the Playground for interactive testing.
 * For detailed authorization scenario documentation, see:
 * - cypress/e2e/phase1-organization-hierarchy.cy.ts
 * - cypress/e2e/phase2-program-hierarchy.cy.ts
 */
describe("Playground UI", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("should load the Playground", () => {
    cy.contains("h1", "Gazebo Verified Permissions POC").should("be.visible");
    cy.contains("Playground").should("be.visible");
  });

  it("should show the authorization check form", () => {
    cy.get("input").should("exist");
    cy.contains("button", /check|authorize/i).should("exist");
  });
});
