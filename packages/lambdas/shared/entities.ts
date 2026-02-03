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
  // 2. Fetch hierarchy chain FIRST (so we can set parents on resource entity)
  // ═══════════════════════════════════════════════════════════════════════════
  const siteId = req.resourceType === "Site" ? req.resourceId : req.resourceParentSite;
  let hierarchyChain: { nodes: HierarchyNode[] } | null = null;

  if (siteId) {
    try {
      hierarchyChain = await hierarchy.getSiteHierarchy(siteId);
    } catch (error) {
      // If hierarchy lookup fails, log but don't fail the request
      console.warn(`Failed to fetch hierarchy for site ${siteId}:`, error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Add resource entity with proper parents from hierarchy
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

  // If the resource IS a Site and we have hierarchy, use the hierarchy's parents
  if (req.resourceType === "Site" && hierarchyChain) {
    const siteNode = hierarchyChain.nodes.find(n => n.type === "Site" && n.id === req.resourceId);
    if (siteNode) {
      resourceEntity.parents = siteNode.parents.map((p) => ({
        entityType: `Gazebo::${p.type}`,
        entityId: p.id,
      }));
    }
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
  // 4. Add remaining hierarchy entities (Region, Organization)
  //    This enables Cedar to traverse: Project → Site → Region → Organization
  //    Note: Site is already added above with proper parents
  // ═══════════════════════════════════════════════════════════════════════════
  if (hierarchyChain) {
    for (const node of hierarchyChain.nodes) {
      // Skip Site - it's already added as the resource entity
      if (node.type === "Site") {
        continue;
      }

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
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Add role entities (needed for policy evaluation)
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
