import {
  VerifiedPermissionsClient,
  CreatePolicyCommand,
  DeletePolicyCommand,
  ListPoliciesCommand,
  GetPolicyCommand,
  GetPolicyTemplateCommand,
} from "@aws-sdk/client-verifiedpermissions";
import { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { RoleAssignment } from "../shared/types";

const client = new VerifiedPermissionsClient({});
const POLICY_STORE_ID = process.env.POLICY_STORE_ID!;

// Template IDs for scoped roles (can be applied to Site, Region, or Organization)
const TEMPLATES: Record<string, string | undefined> = {
  viewer: process.env.TEMPLATE_VIEWER,
  contributor: process.env.TEMPLATE_CONTRIBUTOR,
  champion: process.env.TEMPLATE_CHAMPION,
  facilitator: process.env.TEMPLATE_FACILITATOR,
  coordinator: process.env.TEMPLATE_COORDINATOR,
  administrator: process.env.TEMPLATE_ADMINISTRATOR,
};

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
    // POST /permissions/assign - Assign role to user at a site
    if (method === "POST" && path.endsWith("/assign")) {
      const body: RoleAssignment = JSON.parse(event.body || "{}");

      if (!body.userId || !body.role || !body.targetType || !body.targetId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing required fields: userId, role, targetType, targetId" }),
        };
      }

      const templateId = TEMPLATES[body.role];

      if (templateId) {
        // Use template instantiation for site-scoped roles (viewer, contributor, coordinator)
        const command = new CreatePolicyCommand({
          policyStoreId: POLICY_STORE_ID,
          definition: {
            templateLinked: {
              policyTemplateId: templateId,
              principal: {
                entityType: "Gazebo::User",
                entityId: body.userId,
              },
              resource: {
                entityType: `Gazebo::${body.targetType}`,
                entityId: body.targetId,
              },
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
            policyType: "template-linked",
            template: body.role,
            assignment: body,
          }),
        };
      } else {
        // For global roles (globalAdmin, administrator), assign user to role membership
        // This creates a static policy granting the user membership in the global role
        const policyStatement = `permit (
  principal == Gazebo::User::"${body.userId}",
  action,
  resource
) when {
  principal in Gazebo::Role::"${body.role}"
};`;

        const command = new CreatePolicyCommand({
          policyStoreId: POLICY_STORE_ID,
          definition: {
            static: {
              statement: policyStatement,
              description: `Global ${body.role} for user ${body.userId}`,
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
            policyType: "static",
            assignment: body,
          }),
        };
      }
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

    // GET /permissions/list - List all policies (optional ?userId= filter)
    if (method === "GET" && path.endsWith("/list")) {
      const userIdFilter = event.queryStringParameters?.userId;

      const listCommand = new ListPoliciesCommand({
        policyStoreId: POLICY_STORE_ID,
      });

      const listResult = await client.send(listCommand);

      // Fetch full details for each policy
      const policiesWithDetails = await Promise.all(
        (listResult.policies || []).map(async (policy) => {
          try {
            const getCommand = new GetPolicyCommand({
              policyStoreId: POLICY_STORE_ID,
              policyId: policy.policyId!,
            });
            const detail = await client.send(getCommand);

            // Handle both static and template-linked policies
            if (detail.definition?.static) {
              return {
                policyId: policy.policyId,
                policyType: "static",
                createdDate: policy.createdDate,
                statement: detail.definition.static.statement || "",
                description: detail.definition.static.description || "",
              };
            } else if (detail.definition?.templateLinked) {
              const tpl = detail.definition.templateLinked;

              // Fetch template details to get the role/description
              let templateDescription = "";
              let templateStatement = "";
              try {
                const templateDetail = await client.send(
                  new GetPolicyTemplateCommand({
                    policyStoreId: POLICY_STORE_ID,
                    policyTemplateId: tpl.policyTemplateId!,
                  })
                );
                templateDescription = templateDetail.description || "";
                templateStatement = templateDetail.statement || "";
              } catch {
                // Ignore template fetch errors
              }

              return {
                policyId: policy.policyId,
                policyType: "template-linked",
                createdDate: policy.createdDate,
                templateId: tpl.policyTemplateId,
                principal: tpl.principal,
                resource: tpl.resource,
                templateDescription,
                templateStatement,
                description: templateDescription || `${tpl.principal?.entityId} → ${tpl.resource?.entityId}`,
              };
            }

            return {
              policyId: policy.policyId,
              policyType: policy.policyType,
              createdDate: policy.createdDate,
              statement: "",
              description: "",
            };
          } catch {
            return {
              policyId: policy.policyId,
              policyType: policy.policyType,
              createdDate: policy.createdDate,
              statement: "",
              description: "",
            };
          }
        })
      );

      // Filter by userId if provided
      const filteredPolicies = userIdFilter
        ? policiesWithDetails.filter((p) => {
            // Check static policy statement
            if (p.statement && p.statement.includes(`User::"${userIdFilter}"`)) {
              return true;
            }
            // Check template-linked principal
            if (p.principal?.entityId === userIdFilter) {
              return true;
            }
            return false;
          })
        : policiesWithDetails;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          policies: filteredPolicies,
          total: filteredPolicies.length,
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
