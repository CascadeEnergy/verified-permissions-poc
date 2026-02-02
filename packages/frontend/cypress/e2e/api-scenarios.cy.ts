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

  describe("Administrator - Full Access", () => {
    it("should allow View on Project", () => {
      cy.checkAuth({
        userId: "admin-2",
        userRoles: ["administrator"],
        action: "View",
        resourceType: "Project",
        resourceId: "proj-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should allow Delete on Site", () => {
      cy.checkAuth({
        userId: "admin-2",
        userRoles: ["administrator"],
        action: "Delete",
        resourceType: "Site",
        resourceId: "site-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should allow Admin on Site", () => {
      cy.checkAuth({
        userId: "admin-2",
        userRoles: ["administrator"],
        action: "Admin",
        resourceType: "Site",
        resourceId: "site-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });
  });

  describe("Viewer - Read Only", () => {
    it("should allow View on Site", () => {
      cy.checkAuth({
        userId: "viewer-1",
        userRoles: ["viewer"],
        action: "View",
        resourceType: "Site",
        resourceId: "site-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should allow View on Project", () => {
      cy.checkAuth({
        userId: "viewer-1",
        userRoles: ["viewer"],
        action: "View",
        resourceType: "Project",
        resourceId: "proj-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should DENY Edit on Site", () => {
      cy.checkAuth({
        userId: "viewer-1",
        userRoles: ["viewer"],
        action: "Edit",
        resourceType: "Site",
        resourceId: "site-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(false);
      });
    });
  });

  describe("Contributor - View All, Edit Projects Only", () => {
    it("should allow View on Site", () => {
      cy.checkAuth({
        userId: "contrib-1",
        userRoles: ["contributor"],
        action: "View",
        resourceType: "Site",
        resourceId: "site-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should allow Edit on Project", () => {
      cy.checkAuth({
        userId: "contrib-1",
        userRoles: ["contributor"],
        action: "Edit",
        resourceType: "Project",
        resourceId: "proj-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should DENY Edit on Site", () => {
      cy.checkAuth({
        userId: "contrib-1",
        userRoles: ["contributor"],
        action: "Edit",
        resourceType: "Site",
        resourceId: "site-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(false);
      });
    });
  });

  describe("Coordinator - View, Edit, Create (No Delete)", () => {
    it("should allow View on Site", () => {
      cy.checkAuth({
        userId: "coord-1",
        userRoles: ["coordinator"],
        action: "View",
        resourceType: "Site",
        resourceId: "site-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should allow Create on Site", () => {
      cy.checkAuth({
        userId: "coord-1",
        userRoles: ["coordinator"],
        action: "Create",
        resourceType: "Site",
        resourceId: "site-1",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.allowed).to.eq(true);
      });
    });

    it("should DENY Delete on Project", () => {
      cy.checkAuth({
        userId: "coord-1",
        userRoles: ["coordinator"],
        action: "Delete",
        resourceType: "Project",
        resourceId: "proj-1",
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

  describe("No Role - Denied", () => {
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
