/**
 * Mock data representing the company-service and site-service data.
 * This replicates the real data structure for sandbox testing.
 *
 * In production:
 *   - Companies are in DynamoDB (production-organization table)
 *   - Sites are in OpenSearch (site-read index)
 *
 * Hierarchy model:
 *   - Organization: company record where parentId = null
 *   - Region: company record where parentId = <org_id>
 *   - Site: site record where companyId = "organization:X" or "region:Y"
 */

// =============================================================================
// COMPANY DATA (from company-service / DynamoDB)
// =============================================================================

export interface Company {
  companyId: number;
  name: string;
  parentId: number | null;  // null = Organization, number = Region (points to parent org)
}

export const MOCK_COMPANIES: Record<string, Company> = {
  // Organizations (parentId = null)
  "1": {
    companyId: 1,
    name: "Cascade Energy",
    parentId: null,
  },
  "100": {
    companyId: 100,
    name: "Energy Trust of Oregon",
    parentId: null,
  },
  "200": {
    companyId: 200,
    name: "Goodwill Industries",
    parentId: null,
  },

  // Regions (parentId = org id)
  "10": {
    companyId: 10,
    name: "West Region",
    parentId: 1,  // belongs to Cascade Energy
  },
  "11": {
    companyId: 11,
    name: "East Region",
    parentId: 1,  // belongs to Cascade Energy
  },
  "101": {
    companyId: 101,
    name: "Industrial Programs",
    parentId: 100,  // belongs to Energy Trust
  },
  "201": {
    companyId: 201,
    name: "Portland Metro",
    parentId: 200,  // belongs to Goodwill
  },
};

// =============================================================================
// SITE DATA (from site-service / OpenSearch)
// =============================================================================

export interface Site {
  siteId: string;
  name: string;
  companyId: string;  // "organization:X" or "region:Y"
  timezone: string;
}

export const MOCK_SITES: Record<string, Site> = {
  // Sites in West Region (Cascade Energy)
  "portland-manufacturing": {
    siteId: "portland-manufacturing",
    name: "Portland Manufacturing",
    companyId: "region:10",  // West Region
    timezone: "America/Los_Angeles",
  },
  "seattle-hq": {
    siteId: "seattle-hq",
    name: "Seattle Headquarters",
    companyId: "region:10",  // West Region
    timezone: "America/Los_Angeles",
  },

  // Sites in East Region (Cascade Energy)
  "boston-office": {
    siteId: "boston-office",
    name: "Boston Office",
    companyId: "region:11",  // East Region
    timezone: "America/New_York",
  },

  // Site directly under an Organization (no region)
  "cascade-corporate": {
    siteId: "cascade-corporate",
    name: "Cascade Corporate HQ",
    companyId: "organization:1",  // Directly under Cascade Energy
    timezone: "America/Los_Angeles",
  },

  // Goodwill sites
  "goodwill-happy-valley": {
    siteId: "goodwill-happy-valley",
    name: "Goodwill Happy Valley",
    companyId: "region:201",  // Portland Metro region
    timezone: "America/Los_Angeles",
  },
  "goodwill-downtown": {
    siteId: "goodwill-downtown",
    name: "Goodwill Downtown",
    companyId: "region:201",  // Portland Metro region
    timezone: "America/Los_Angeles",
  },
};

// =============================================================================
// HELPER: Get display name for entity
// =============================================================================

export function getEntityDisplayName(type: string, id: string): string {
  if (type === "Site") {
    return MOCK_SITES[id]?.name || id;
  }
  if (type === "Organization" || type === "Region") {
    return MOCK_COMPANIES[id]?.name || id;
  }
  return id;
}

// =============================================================================
// HELPER: List all sites for display
// =============================================================================

export function listAllSites(): Array<{ id: string; name: string; hierarchy: string }> {
  return Object.values(MOCK_SITES).map(site => {
    const { id } = parseCompanyId(site.companyId);
    const company = MOCK_COMPANIES[id];

    let hierarchy: string;
    if (company?.parentId) {
      const org = MOCK_COMPANIES[String(company.parentId)];
      hierarchy = `${org?.name || company.parentId} → ${company.name}`;
    } else {
      hierarchy = company?.name || id;
    }

    return {
      id: site.siteId,
      name: site.name,
      hierarchy,
    };
  });
}

// =============================================================================
// HELPER: Parse companyId format
// =============================================================================

function parseCompanyId(companyId: string): { type: "organization" | "region"; id: string } {
  const [type, id] = companyId.split(":");
  if (type === "organization" || type === "region") {
    return { type, id };
  }
  throw new Error(`Invalid companyId format: ${companyId}`);
}
