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
});
