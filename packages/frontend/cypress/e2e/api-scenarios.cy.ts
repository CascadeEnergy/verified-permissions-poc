describe("Authorization Scenarios", () => {
  describe("Global Admin - Full Access", () => {
    it("should allow View on Site", () => {
      cy.checkAuth({
        userId: "admin-1",
        userRoles: ["globalAdmin"],
        action: "View",
        resourceType: "Site",
        resourceId: "site-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should allow Delete on Site", () => {
      cy.checkAuth({
        userId: "admin-1",
        userRoles: ["globalAdmin"],
        action: "Delete",
        resourceType: "Site",
        resourceId: "site-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should allow Admin on Organization", () => {
      cy.checkAuth({
        userId: "admin-1",
        userRoles: ["globalAdmin"],
        action: "Admin",
        resourceType: "Organization",
        resourceId: "org-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });
  });

  describe("Roles Without Site Assignment - Denied", () => {
    it("should DENY administrator role without site assignment", () => {
      cy.checkAuth({
        userId: "admin-2",
        userRoles: ["administrator"],
        action: "View",
        resourceType: "Site",
        resourceId: "site-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(false);
      });
    });

    it("should DENY coordinator role without site assignment", () => {
      cy.checkAuth({
        userId: "coord-1",
        userRoles: ["coordinator"],
        action: "View",
        resourceType: "Site",
        resourceId: "site-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(false);
      });
    });

    it("should DENY viewer role without site assignment", () => {
      cy.checkAuth({
        userId: "viewer-1",
        userRoles: ["viewer"],
        action: "View",
        resourceType: "Site",
        resourceId: "site-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(false);
      });
    });
  });

  describe("Creator Privilege - Own Resources", () => {
    it("should allow View on own Project", () => {
      cy.checkAuth({
        userId: "user-1",
        userRoles: [],
        action: "View",
        resourceType: "Project",
        resourceId: "proj-1",
        resourceCreatedBy: "user-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should allow Edit on own Project", () => {
      cy.checkAuth({
        userId: "user-1",
        userRoles: [],
        action: "Edit",
        resourceType: "Project",
        resourceId: "proj-1",
        resourceCreatedBy: "user-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should DENY Edit on someone else's Project", () => {
      cy.checkAuth({
        userId: "user-1",
        userRoles: [],
        action: "Edit",
        resourceType: "Project",
        resourceId: "proj-2",
        resourceCreatedBy: "user-2",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(false);
      });
    });
  });

  describe("No Role, No Creator - Denied", () => {
    it("should DENY View on Site", () => {
      cy.checkAuth({
        userId: "norole-1",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "site-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(false);
      });
    });

    it("should DENY Edit on Project", () => {
      cy.checkAuth({
        userId: "norole-1",
        userRoles: [],
        action: "Edit",
        resourceType: "Project",
        resourceId: "proj-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(false);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HIERARCHY SCENARIOS
  // These require template-linked policies to be created first via /permissions/assign
  // Hierarchy: portland-manufacturing → Region:10 (West) → Org:1 (Cascade)
  //            seattle-hq → Region:10 (West) → Org:1 (Cascade)
  //            boston-office → Region:11 (East) → Org:1 (Cascade)
  //            goodwill-happy-valley → Region:201 (Portland Metro) → Org:200 (Goodwill)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Hierarchy: Site-Level Access (Alice)", () => {
    // alice@example.com has coordinator on Site::portland-manufacturing

    it("should ALLOW alice to View her assigned site", () => {
      cy.checkAuth({
        userId: "alice@example.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should ALLOW alice to Edit projects in her site", () => {
      cy.checkAuth({
        userId: "alice@example.com",
        userRoles: [],
        action: "Edit",
        resourceType: "Project",
        resourceId: "hvac-project",
        resourceParentSite: "portland-manufacturing",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should DENY alice access to seattle-hq (different site, same region)", () => {
      cy.checkAuth({
        userId: "alice@example.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "seattle-hq",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(false);
      });
    });
  });

  describe("Hierarchy: Region-Level Access (Dan)", () => {
    // dan@cascade.com has contributor on Region::10 (West Region)

    it("should ALLOW dan to View portland-manufacturing (in West Region)", () => {
      cy.checkAuth({
        userId: "dan@cascade.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should ALLOW dan to Edit seattle-hq (also in West Region)", () => {
      cy.checkAuth({
        userId: "dan@cascade.com",
        userRoles: [],
        action: "Edit",
        resourceType: "Site",
        resourceId: "seattle-hq",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should ALLOW dan to Edit projects in West Region sites", () => {
      cy.checkAuth({
        userId: "dan@cascade.com",
        userRoles: [],
        action: "Edit",
        resourceType: "Project",
        resourceId: "hvac-project",
        resourceParentSite: "portland-manufacturing",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should DENY dan access to boston-office (in East Region)", () => {
      cy.checkAuth({
        userId: "dan@cascade.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "boston-office",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(false);
      });
    });

    it("should DENY dan access to goodwill site (different org)", () => {
      cy.checkAuth({
        userId: "dan@cascade.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "goodwill-happy-valley",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(false);
      });
    });
  });

  describe("Hierarchy: Organization-Level Access (Eve)", () => {
    // eve@cascade.com has viewer on Organization::1 (Cascade Energy)

    it("should ALLOW eve to View portland-manufacturing (West Region → Cascade)", () => {
      cy.checkAuth({
        userId: "eve@cascade.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should ALLOW eve to View boston-office (East Region → Cascade)", () => {
      cy.checkAuth({
        userId: "eve@cascade.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "boston-office",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should DENY eve Edit access (viewer only has View)", () => {
      cy.checkAuth({
        userId: "eve@cascade.com",
        userRoles: [],
        action: "Edit",
        resourceType: "Site",
        resourceId: "portland-manufacturing",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(false);
      });
    });

    it("should DENY eve access to goodwill site (different organization)", () => {
      cy.checkAuth({
        userId: "eve@cascade.com",
        userRoles: [],
        action: "View",
        resourceType: "Site",
        resourceId: "goodwill-happy-valley",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(false);
      });
    });
  });
});
