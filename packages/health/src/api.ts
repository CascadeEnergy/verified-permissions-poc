/**
 * API client for authorization health checks.
 * Makes HTTP requests to the deployed AVP authorization API.
 */

// Authorization request type matching the backend API
export interface AuthRequest {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceCreatedBy?: string;
  resourceParentSite?: string;
}

// Authorization response from the API
export interface AuthResponse {
  allowed: boolean;
  decision?: string;
  errors?: string[];
}

// Get API URL from environment variable
function getApiUrl(): string {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    throw new Error(
      "API_URL environment variable is required. Set it to the deployed API Gateway URL."
    );
  }
  return apiUrl;
}

/**
 * Check authorization via the AVP API.
 * Returns the response status and body.
 */
export async function checkAuth(
  request: AuthRequest
): Promise<{ status: number; body: AuthResponse }> {
  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const body = (await response.json()) as AuthResponse;
  return { status: response.status, body };
}

/**
 * Batch check authorization for multiple requests.
 */
export async function batchCheckAuth(
  requests: AuthRequest[]
): Promise<{ status: number; body: { results: AuthResponse[] } }> {
  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/authorize/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });

  const body = (await response.json()) as { results: AuthResponse[] };
  return { status: response.status, body };
}
