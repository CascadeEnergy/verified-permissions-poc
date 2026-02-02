describe("UI Test Scenarios", () => {
  beforeEach(() => {
    // Visit the app
    cy.visit("/");
  });

  it("should load the Introduction tab by default", () => {
    cy.contains("h2", "What is AWS Verified Permissions?").should("be.visible");
  });

  it("should navigate to Policy Store tab and show sections", () => {
    cy.contains("button", "Policy Store").click();
    cy.contains("h2", "Schema").should("be.visible");
    cy.contains("h2", "Static Policies").should("be.visible");
    cy.contains("h2", "Policy Templates").should("be.visible");
    cy.contains("h2", "Template-Linked Policies").should("be.visible");
  });

  it("should expand Schema section and show entity types", () => {
    cy.contains("button", "Policy Store").click();
    // Schema should be expanded by default
    cy.contains("User").should("be.visible");
    cy.contains("Site").should("be.visible");
    cy.contains("Project").should("be.visible");
  });

  describe("Test Scenarios Tab", () => {
    beforeEach(() => {
      cy.contains("button", "Test Scenarios").click();
    });

    it("should show the Test Scenarios page", () => {
      cy.contains("h2", "Test Scenarios").should("be.visible");
      cy.contains("button", "Run All Scenarios").should("be.visible");
    });

    it("should run all scenarios and pass", () => {
      // Click Run All Scenarios
      cy.contains("button", "Run All Scenarios").click();

      // Wait for results to load (button changes while loading)
      cy.contains("button", "Running...").should("be.visible");
      cy.contains("button", "Run All Scenarios", { timeout: 30000 }).should("be.visible");

      // Check that results show 7/7 passed
      cy.contains("Results: 7/7 passed", { timeout: 10000 }).should("be.visible");

      // Verify each scenario passed
      cy.contains(".scenario.passed", "Global Admin - Full Access").should("exist");
      cy.contains(".scenario.passed", "Administrator - Full Access").should("exist");
      cy.contains(".scenario.passed", "Viewer - Read Only").should("exist");
      cy.contains(".scenario.passed", "Contributor - View All, Edit Projects").should("exist");
      cy.contains(".scenario.passed", "Coordinator - View, Edit, Create (No Delete)").should("exist");
      cy.contains(".scenario.passed", "Creator Privilege - Own Resources").should("exist");
      cy.contains(".scenario.passed", "No Role - Denied").should("exist");
    });

    it("should show individual check results for each scenario", () => {
      cy.contains("button", "Run All Scenarios").click();
      cy.contains("button", "Run All Scenarios", { timeout: 30000 }).should("be.visible");

      // Check Global Admin scenario shows ALLOWED and no mismatches
      cy.contains(".scenario", "Global Admin").within(() => {
        cy.contains("ALLOWED").should("exist");
        cy.get(".check.mismatch").should("not.exist");
      });

      // Check Viewer scenario shows correct results
      cy.contains(".scenario", "Viewer").within(() => {
        // Should have both ALLOWED (for View) and DENIED (for Edit)
        cy.contains("ALLOWED").should("exist");
        cy.contains("DENIED").should("exist");
        cy.get(".check.mismatch").should("not.exist");
      });

      // Check No Role scenario shows all DENIED
      cy.contains(".scenario", "No Role").within(() => {
        cy.contains("DENIED").should("exist");
        cy.get(".check.mismatch").should("not.exist");
      });
    });
  });
});
