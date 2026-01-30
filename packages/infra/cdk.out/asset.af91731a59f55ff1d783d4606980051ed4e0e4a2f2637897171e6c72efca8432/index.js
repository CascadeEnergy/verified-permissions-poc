var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../lambdas/permissions-api/index.ts
var index_exports = {};
__export(index_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(index_exports);
var import_client_verifiedpermissions = require("@aws-sdk/client-verifiedpermissions");
var client = new import_client_verifiedpermissions.VerifiedPermissionsClient({});
var POLICY_STORE_ID = process.env.POLICY_STORE_ID;
var headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS"
};
var handler = async (event) => {
  const method = event.requestContext.http.method;
  const path = event.rawPath;
  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  try {
    if (method === "POST" && path.endsWith("/assign")) {
      const body = JSON.parse(event.body || "{}");
      if (!body.userId || !body.role || !body.targetType || !body.targetId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing required fields: userId, role, targetType, targetId" })
        };
      }
      const policyStatement = `permit (
  principal == Gazebo::User::"${body.userId}",
  action,
  resource in Gazebo::${body.targetType}::"${body.targetId}"
) when {
  principal in Gazebo::Role::"${body.role}"
};`;
      const command = new import_client_verifiedpermissions.CreatePolicyCommand({
        policyStoreId: POLICY_STORE_ID,
        definition: {
          static: {
            statement: policyStatement,
            description: `${body.role} for user ${body.userId} at ${body.targetType}:${body.targetId}`
          }
        }
      });
      const result = await client.send(command);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          policyId: result.policyId,
          assignment: body
        })
      };
    }
    if (method === "DELETE" && path.includes("/assign/")) {
      const policyId = path.split("/").pop();
      await client.send(
        new import_client_verifiedpermissions.DeletePolicyCommand({
          policyStoreId: POLICY_STORE_ID,
          policyId
        })
      );
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, deleted: policyId })
      };
    }
    if (method === "GET" && path.endsWith("/list")) {
      const userIdFilter = event.queryStringParameters?.userId;
      const listCommand = new import_client_verifiedpermissions.ListPoliciesCommand({
        policyStoreId: POLICY_STORE_ID
      });
      const listResult = await client.send(listCommand);
      const policiesWithDetails = await Promise.all(
        (listResult.policies || []).map(async (policy) => {
          try {
            const getCommand = new import_client_verifiedpermissions.GetPolicyCommand({
              policyStoreId: POLICY_STORE_ID,
              policyId: policy.policyId
            });
            const detail = await client.send(getCommand);
            const statement = detail.definition?.static?.statement || "";
            const description = detail.definition?.static?.description || "";
            return {
              policyId: policy.policyId,
              policyType: policy.policyType,
              createdDate: policy.createdDate,
              statement,
              description
            };
          } catch {
            return {
              policyId: policy.policyId,
              policyType: policy.policyType,
              createdDate: policy.createdDate,
              statement: "",
              description: ""
            };
          }
        })
      );
      const filteredPolicies = userIdFilter ? policiesWithDetails.filter((p) => p.statement.includes(`User::"${userIdFilter}"`)) : policiesWithDetails;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          policies: filteredPolicies,
          total: filteredPolicies.length
        })
      };
    }
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: "Not found" })
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
