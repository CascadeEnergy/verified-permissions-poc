import { AuthRequest, ROLES } from "./types";

export function buildEntities(req: AuthRequest) {
  const entities: any[] = [];

  // Add user entity with role memberships
  const userEntity: any = {
    identifier: { entityType: "Gazebo::User", entityId: req.userId },
    attributes: {},
    parents: [],
  };

  // Add role group memberships
  if (req.userRoles && req.userRoles.length > 0) {
    userEntity.parents = req.userRoles.map((role) => ({
      entityType: "Gazebo::RoleGroup",
      entityId: role,
    }));
  }

  entities.push(userEntity);

  // Add resource entity
  const resourceEntity: any = {
    identifier: {
      entityType: `Gazebo::${req.resourceType}`,
      entityId: req.resourceId,
    },
    attributes: {},
    parents: [],
  };

  // Add createdBy if provided
  if (req.resourceCreatedBy) {
    resourceEntity.attributes.createdBy = {
      entityIdentifier: {
        entityType: "Gazebo::User",
        entityId: req.resourceCreatedBy,
      },
    };
  }

  // Add parent site if provided (for Projects, Models)
  if (req.resourceParentSite && req.resourceType !== "Site") {
    resourceEntity.parents.push({
      entityType: "Gazebo::Site",
      entityId: req.resourceParentSite,
    });
  }

  entities.push(resourceEntity);

  // Add role group entities (needed for policy evaluation)
  ROLES.forEach((role) => {
    entities.push({
      identifier: { entityType: "Gazebo::RoleGroup", entityId: role },
      attributes: { name: { string: role } },
    });
  });

  return { entityList: entities };
}
