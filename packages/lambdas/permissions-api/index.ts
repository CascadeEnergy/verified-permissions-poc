import {
  VerifiedPermissionsClient,
  CreatePolicyCommand,
  DeletePolicyCommand,
  ListPoliciesCommand,
} from "@aws-sdk/client-verifiedpermissions";
import { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { RoleAssignment } from "../shared/types";

const client = new VerifiedPermissionsClient({});
const POLICY_STORE_ID = process.env.POLICY_STORE_ID!;

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

export const handler: APIGatewayProxyHandlerV2 = async (event): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // POST /permissions/assign - Assign role to user
    if (method === "POST" && path.endsWith("/assign")) {
      const body: RoleAssignment = JSON.parse(event.body || "{}");

      if (!body.userId || !body.role || !body.targetType || !body.targetId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing required fields: userId, role, targetType, targetId" }),
        };
      }

      // Create a policy that grants this user the role at the target
      const policyStatement = `permit (
  principal == Gazebo::User::"${body.userId}",
  action,
  resource in Gazebo::${body.targetType}::"${body.targetId}"
) when {
  principal in Gazebo::RoleGroup::"${body.role}"
};`;

      const command = new CreatePolicyCommand({
        policyStoreId: POLICY_STORE_ID,
        definition: {
          static: {
            statement: policyStatement,
            description: `${body.role} for user ${body.userId} at ${body.targetType}:${body.targetId}`,
          },
        },
      });

      const result = await client.send(command);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          policyId: result.policyId,
          assignment: body,
        }),
      };
    }

    // DELETE /permissions/assign/{policyId} - Remove role assignment
    if (method === "DELETE" && path.includes("/assign/")) {
      const policyId = path.split("/").pop()!;

      await client.send(
        new DeletePolicyCommand({
          policyStoreId: POLICY_STORE_ID,
          policyId,
        })
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, deleted: policyId }),
      };
    }

    // GET /permissions/list - List all policies
    if (method === "GET" && path.endsWith("/list")) {
      const command = new ListPoliciesCommand({
        policyStoreId: POLICY_STORE_ID,
      });

      const result = await client.send(command);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          policies: result.policies || [],
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
