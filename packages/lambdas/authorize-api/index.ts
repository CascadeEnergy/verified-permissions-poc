import {
  VerifiedPermissionsClient,
  IsAuthorizedCommand,
  BatchIsAuthorizedCommand,
  Decision,
} from "@aws-sdk/client-verifiedpermissions";
import { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthRequest, BatchAuthRequest } from "../shared/types";
import { buildEntities } from "../shared/entities";

const client = new VerifiedPermissionsClient({});
const POLICY_STORE_ID = process.env.POLICY_STORE_ID!;

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const handler: APIGatewayProxyHandlerV2 = async (event): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // POST /authorize - Single authorization check
    if (method === "POST" && path === "/authorize") {
      const body: AuthRequest = JSON.parse(event.body || "{}");

      if (!body.userId || !body.action || !body.resourceType || !body.resourceId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing required fields: userId, action, resourceType, resourceId" }),
        };
      }

      const entities = await buildEntities(body);

      const command = new IsAuthorizedCommand({
        policyStoreId: POLICY_STORE_ID,
        principal: {
          entityType: "Gazebo::User",
          entityId: body.userId,
        },
        action: {
          actionType: "Gazebo::Action",
          actionId: body.action,
        },
        resource: {
          entityType: `Gazebo::${body.resourceType}`,
          entityId: body.resourceId,
        },
        entities,
      });

      const result = await client.send(command);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          decision: result.decision,
          allowed: result.decision === Decision.ALLOW,
          determiningPolicies: result.determiningPolicies,
          errors: result.errors,
          request: body,
        }),
      };
    }

    // POST /authorize/batch - Multiple authorization checks
    if (method === "POST" && path === "/authorize/batch") {
      const body: BatchAuthRequest = JSON.parse(event.body || "{}");

      if (!body.requests || !Array.isArray(body.requests) || body.requests.length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing or empty requests array" }),
        };
      }

      // Build requests (without entities - those go at the top level)
      const requests = body.requests.map((req) => ({
        principal: {
          entityType: "Gazebo::User",
          entityId: req.userId,
        },
        action: {
          actionType: "Gazebo::Action",
          actionId: req.action,
        },
        resource: {
          entityType: `Gazebo::${req.resourceType}`,
          entityId: req.resourceId,
        },
      }));

      // Combine entities from all requests (deduplicated by identifier)
      const entityMap = new Map<string, any>();
      for (const req of body.requests) {
        const { entityList } = await buildEntities(req);
        for (const entity of entityList) {
          const key = `${entity.identifier.entityType}::${entity.identifier.entityId}`;
          if (!entityMap.has(key)) {
            entityMap.set(key, entity);
          }
        }
      }
      const combinedEntities = { entityList: Array.from(entityMap.values()) };

      const command = new BatchIsAuthorizedCommand({
        policyStoreId: POLICY_STORE_ID,
        requests,
        entities: combinedEntities,
      });

      const result = await client.send(command);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          results: result.results?.map((r, i) => ({
            request: body.requests[i],
            decision: r.decision,
            allowed: r.decision === Decision.ALLOW,
            determiningPolicies: r.determiningPolicies,
            errors: r.errors,
          })),
        }),
      };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: "Not found" }),
    };
  } catch (error: any) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
