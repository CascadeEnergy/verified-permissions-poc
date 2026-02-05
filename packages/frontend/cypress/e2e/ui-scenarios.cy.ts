/**
 * UI Tests for the POC Application
 *
 * These tests verify the UI works correctly. For detailed authorization
 * scenario documentation, see:
 * - cypress/e2e/phase1-organization-hierarchy.cy.ts
 * - cypress/e2e/phase2-program-hierarchy.cy.ts
 */
describe("UI Test Scenarios", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("should load the Phase 1 Scenarios tab by default", () => {
    cy.contains("h2", "Phase 1: Organization Hierarchy Scenarios").should("be.visible");
  });

  it("should show Run All Scenarios button", () => {
    cy.contains("button", "Run All Scenarios").should("be.visible");
  });

  describe("Phase 1 Scenarios Tab", () => {
    it("should run all scenarios and pass", () => {
      // First, set up the test policies for hierarchy scenarios
      cy.contains("button", "Create Test Policies").click();
      cy.contains("Ready", { timeout: 30000 }).should("be.visible");

      // Click Run All Scenarios
      cy.contains("button", "Run All Scenarios").click();

      // Wait for results to load (button changes while loading)
      cy.contains("button", "Running...").should("be.visible");
      cy.contains("button", "Run All Scenarios", { timeout: 30000 }).should("be.visible");

      // Check that results show 7/7 passed (4 basic + 3 hierarchy scenarios)
      cy.contains("Results: 7/7 passed", { timeout: 10000 }).should("be.visible");

      // Verify each scenario passed
      cy.contains(".scenario.passed", "Global Admin - Full Access").should("exist");
      cy.contains(".scenario.passed", "Roles Without Assignment - Denied").should("exist");
      cy.contains(".scenario.passed", "Creator Privilege - Own Resources").should("exist");
      cy.contains(".scenario.passed", "No Role, No Creator - Denied").should("exist");
      cy.contains(".scenario.passed", "Hierarchy: Site-Level Access").should("exist");
      cy.contains(".scenario.passed", "Hierarchy: Region-Level Access").should("exist");
      cy.contains(".scenario.passed", "Hierarchy: Organization-Level Access").should("exist");
    });

    it("should show individual check results for each scenario", () => {
      cy.contains("button", "Run All Scenarios").click();
      cy.contains("button", "Run All Scenarios", { timeout: 30000 }).should("be.visible");

      // Check Global Admin scenario shows ALLOWED and no mismatches
      cy.contains(".scenario", "Global Admin").within(() => {
        cy.contains("ALLOWED").should("exist");
        cy.get(".check-item.mismatch").should("not.exist");
      });

      // Check Roles Without Assignment scenario shows all DENIED
      cy.contains(".scenario", "Roles Without Assignment").within(() => {
        cy.contains("DENIED").should("exist");
        cy.get(".check-item.mismatch").should("not.exist");
      });

      // Check Creator Privilege shows correct results
      cy.contains(".scenario", "Creator Privilege").within(() => {
        // Should have both ALLOWED (for own resources) and DENIED (for others)
        cy.contains("ALLOWED").should("exist");
        cy.contains("DENIED").should("exist");
        cy.get(".check-item.mismatch").should("not.exist");
      });

      // Check No Role scenario shows all DENIED
      cy.contains(".scenario", "No Role").within(() => {
        cy.contains("DENIED").should("exist");
        cy.get(".check-item.mismatch").should("not.exist");
      });
    });
  });

  describe("Phase 2 Scenarios Tab", () => {
    beforeEach(() => {
      cy.contains("button", "Phase 2 Scenarios").click();
    });

    it("should show the Phase 2 Scenarios page", () => {
      cy.contains("h2", "Phase 2: Program Layer Test Scenarios").should("be.visible");
      cy.contains("button", "Run All Phase 2 Scenarios").should("be.visible");
    });
  });
});
