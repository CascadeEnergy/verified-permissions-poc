import { AuthRequest, ROLES, ResourceParents } from "./types";

// Maps parent field names to their Cedar entity types
const PARENT_TYPE_MAP: Record<keyof ResourceParents, string> = {
  site: "Site",
  region: "Region",
  organization: "Organization",
  participation: "Participation",
  cohort: "Cohort",
  program: "Program",
  client: "Client",
};

export function buildEntities(req: AuthRequest) {
  const entities: any[] = [];

  // Add user entity with role memberships
  const userEntity: any = {
    identifier: { entityType: "Gazebo::User", entityId: req.userId },
    attributes: {},
    parents: [],
  };

  // Add role memberships
  if (req.userRoles && req.userRoles.length > 0) {
    userEntity.parents = req.userRoles.map((role) => ({
      entityType: "Gazebo::Role",
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

  // Add parent site if provided (legacy field for backwards compatibility)
  if (req.resourceParentSite && req.resourceType !== "Site") {
    resourceEntity.parents.push({
      entityType: "Gazebo::Site",
      entityId: req.resourceParentSite,
    });
  }

  // Add parents from resourceParents (new flexible parent specification)
  if (req.resourceParents) {
    for (const [key, value] of Object.entries(req.resourceParents)) {
      if (value) {
        const entityType = PARENT_TYPE_MAP[key as keyof ResourceParents];
        if (entityType) {
          resourceEntity.parents.push({
            entityType: `Gazebo::${entityType}`,
            entityId: value,
          });
        }
      }
    }
  }

  entities.push(resourceEntity);

  // Add role entities (needed for policy evaluation)
  ROLES.forEach((role) => {
    entities.push({
      identifier: { entityType: "Gazebo::Role", entityId: role },
      attributes: { name: { string: role } },
    });
  });

  return { entityList: entities };
}
