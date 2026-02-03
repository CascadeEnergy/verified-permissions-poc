import { AuthRequest, ROLES, ResourceParents } from "./types";
import { hierarchyService, IHierarchyService, HierarchyNode } from "./hierarchyService";

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

/**
 * Build the entity context for an AVP authorization request.
 *
 * This function:
 * 1. Creates the User entity with role memberships
 * 2. Creates the Resource entity with immediate parents
 * 3. Fetches and includes the full hierarchy chain (Site → Region → Organization)
 * 4. Adds Role entities for policy evaluation
 *
 * @param req - The authorization request
 * @param hierarchy - Optional hierarchy service (defaults to mock service)
 * @returns Entity list for AVP IsAuthorized call
 */
export async function buildEntities(
  req: AuthRequest,
  hierarchy: IHierarchyService = hierarchyService
) {
  const entities: any[] = [];
  const addedEntities = new Set<string>();

  // Helper to add an entity only once (prevents duplicates)
  const addEntity = (entity: any) => {
    const key = `${entity.identifier.entityType}::${entity.identifier.entityId}`;
    if (!addedEntities.has(key)) {
      addedEntities.add(key);
      entities.push(entity);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Add user entity with role memberships
  // ═══════════════════════════════════════════════════════════════════════════
  const userEntity: any = {
    identifier: { entityType: "Gazebo::User", entityId: req.userId },
    attributes: {},
    parents: [],
  };

  if (req.userRoles && req.userRoles.length > 0) {
    userEntity.parents = req.userRoles.map((role) => ({
      entityType: "Gazebo::Role",
      entityId: role,
    }));
  }

  addEntity(userEntity);

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Add resource entity with immediate parents
  // ═══════════════════════════════════════════════════════════════════════════
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

  // Add parent site if provided (for Project, Model, etc.)
  if (req.resourceParentSite && req.resourceType !== "Site") {
    resourceEntity.parents.push({
      entityType: "Gazebo::Site",
      entityId: req.resourceParentSite,
    });
  }

  // Add parents from resourceParents (flexible parent specification)
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

  addEntity(resourceEntity);

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Fetch and add the full hierarchy chain
  //    This enables Cedar to traverse: Project → Site → Region → Organization
  // ═══════════════════════════════════════════════════════════════════════════
  const siteId = req.resourceType === "Site" ? req.resourceId : req.resourceParentSite;

  if (siteId) {
    try {
      const hierarchyChain = await hierarchy.getSiteHierarchy(siteId);

      for (const node of hierarchyChain.nodes) {
        addEntity({
          identifier: {
            entityType: `Gazebo::${node.type}`,
            entityId: node.id,
          },
          attributes: {},
          parents: node.parents.map((p) => ({
            entityType: `Gazebo::${p.type}`,
            entityId: p.id,
          })),
        });
      }
    } catch (error) {
      // If hierarchy lookup fails, log but don't fail the request
      // The authorization will still work, just without hierarchy traversal
      console.warn(`Failed to fetch hierarchy for site ${siteId}:`, error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Add role entities (needed for policy evaluation)
  // ═══════════════════════════════════════════════════════════════════════════
  ROLES.forEach((role) => {
    addEntity({
      identifier: { entityType: "Gazebo::Role", entityId: role },
      attributes: { name: { string: role } },
    });
  });

  return { entityList: entities };
}

/**
 * Synchronous version for backwards compatibility.
 * Does NOT include hierarchy chain - use buildEntities() for full hierarchy support.
 *
 * @deprecated Use buildEntities() instead
 */
export function buildEntitiesSync(req: AuthRequest) {
  const entities: any[] = [];

  // Add user entity with role memberships
  const userEntity: any = {
    identifier: { entityType: "Gazebo::User", entityId: req.userId },
    attributes: {},
    parents: [],
  };

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

  if (req.resourceCreatedBy) {
    resourceEntity.attributes.createdBy = {
      entityIdentifier: {
        entityType: "Gazebo::User",
        entityId: req.resourceCreatedBy,
      },
    };
  }

  if (req.resourceParentSite && req.resourceType !== "Site") {
    resourceEntity.parents.push({
      entityType: "Gazebo::Site",
      entityId: req.resourceParentSite,
    });
  }

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

  ROLES.forEach((role) => {
    entities.push({
      identifier: { entityType: "Gazebo::Role", entityId: role },
      attributes: { name: { string: role } },
    });
  });

  return { entityList: entities };
}
