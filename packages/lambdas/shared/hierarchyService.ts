/**
 * Hierarchy Service - Resolves entity hierarchies for Cedar authorization.
 *
 * In production, this would query:
 *   - company-service (DynamoDB) for organization/region data
 *   - site-service (OpenSearch) for site data
 *
 * For the POC sandbox, we use in-memory mock data.
 *
 * Hierarchy model:
 *   Organization → Region → Site → Project/Model/etc.
 *
 * A Region is a Company record with parentId set.
 * An Organization is a Company record with parentId = null.
 */

import { MOCK_COMPANIES, MOCK_SITES, Company, Site } from "./mockData";

// =============================================================================
// TYPES
// =============================================================================

export interface HierarchyNode {
  type: "Site" | "Region" | "Organization";
  id: string;
  name?: string;
  parents: Array<{ type: "Region" | "Organization" | "System"; id: string }>;
}

export interface HierarchyChain {
  nodes: HierarchyNode[];
  path: string;  // Human-readable path like "Cascade Energy → West Region → Portland Manufacturing"
}

// =============================================================================
// HIERARCHY SERVICE INTERFACE
// =============================================================================

export interface IHierarchyService {
  /**
   * Get the full ancestor chain for a site.
   * Returns nodes from Site up to the root Organization.
   */
  getSiteHierarchy(siteId: string): Promise<HierarchyChain>;

  /**
   * Get a site by ID.
   */
  getSite(siteId: string): Promise<Site | null>;

  /**
   * Get a company (organization or region) by ID.
   */
  getCompany(companyId: string): Promise<Company | null>;
}

// =============================================================================
// MOCK HIERARCHY SERVICE (for sandbox/POC)
// =============================================================================

export class MockHierarchyService implements IHierarchyService {
  /**
   * Get the full ancestor chain for a site.
   *
   * Example outputs:
   *   Site in Region: Site:52 → Region:10 → Organization:1
   *   Site in Org:    Site:53 → Organization:1
   */
  async getSiteHierarchy(siteId: string): Promise<HierarchyChain> {
    const nodes: HierarchyNode[] = [];
    const pathParts: string[] = [];

    // 1. Fetch site
    const site = MOCK_SITES[siteId];
    if (!site) {
      throw new Error(`Site not found: ${siteId}`);
    }

    // 2. Parse companyId: "organization:123" or "region:456"
    const parentRef = this.parseCompanyId(site.companyId);

    // 3. Fetch the parent company record
    const company = MOCK_COMPANIES[parentRef.id];
    if (!company) {
      throw new Error(`Company not found: ${parentRef.id}`);
    }

    if (company.parentId !== null) {
      // It's a Region (has a parent Organization)
      // Chain: Site → Region → Organization

      const org = MOCK_COMPANIES[String(company.parentId)];
      if (!org) {
        throw new Error(`Organization not found: ${company.parentId}`);
      }

      nodes.push({
        type: "Site",
        id: siteId,
        name: site.name,
        parents: [{ type: "Region", id: parentRef.id }],
      });

      nodes.push({
        type: "Region",
        id: parentRef.id,
        name: company.name,
        parents: [{ type: "Organization", id: String(company.parentId) }],
      });

      nodes.push({
        type: "Organization",
        id: String(company.parentId),
        name: org.name,
        parents: [{ type: "System", id: "gazebo" }],
      });

      pathParts.push(org.name, company.name, site.name);
    } else {
      // It's an Organization (no parent)
      // Chain: Site → Organization → System

      nodes.push({
        type: "Site",
        id: siteId,
        name: site.name,
        parents: [{ type: "Organization", id: parentRef.id }],
      });

      nodes.push({
        type: "Organization",
        id: parentRef.id,
        name: company.name,
        parents: [{ type: "System", id: "gazebo" }],
      });

      pathParts.push(company.name, site.name);
    }

    return {
      nodes,
      path: pathParts.join(" → "),
    };
  }

  async getSite(siteId: string): Promise<Site | null> {
    return MOCK_SITES[siteId] || null;
  }

  async getCompany(companyId: string): Promise<Company | null> {
    return MOCK_COMPANIES[companyId] || null;
  }

  private parseCompanyId(companyId: string): { type: "organization" | "region"; id: string } {
    const [type, id] = companyId.split(":");
    if (type === "organization" || type === "region") {
      return { type, id };
    }
    throw new Error(`Invalid companyId format: ${companyId}. Expected "organization:X" or "region:Y"`);
  }
}

// =============================================================================
// PRODUCTION HIERARCHY SERVICE (stub for future implementation)
// =============================================================================

export class ProductionHierarchyService implements IHierarchyService {
  constructor(
    private companyServiceUrl: string,
    private siteServiceUrl: string
  ) {}

  async getSiteHierarchy(_siteId: string): Promise<HierarchyChain> {
    // In production, this would:
    // 1. GET ${siteServiceUrl}/site/${siteId}
    // 2. Parse companyId from response
    // 3. GET ${companyServiceUrl}/company/${companyId}
    // 4. If parentId exists, GET the parent org
    // 5. Build and return the chain

    throw new Error("ProductionHierarchyService not implemented - use MockHierarchyService for POC");
  }

  async getSite(siteId: string): Promise<Site | null> {
    const response = await fetch(`${this.siteServiceUrl}/site/${siteId}`);
    if (!response.ok) return null;
    return response.json() as Promise<Site>;
  }

  async getCompany(companyId: string): Promise<Company | null> {
    const response = await fetch(`${this.companyServiceUrl}/company/${companyId}`);
    if (!response.ok) return null;
    return response.json() as Promise<Company>;
  }
}

// =============================================================================
// SINGLETON INSTANCE FOR POC
// =============================================================================

export const hierarchyService: IHierarchyService = new MockHierarchyService();
