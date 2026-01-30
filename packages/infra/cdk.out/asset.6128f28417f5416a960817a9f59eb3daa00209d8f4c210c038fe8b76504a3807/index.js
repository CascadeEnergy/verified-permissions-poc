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

// ../lambdas/authorize-api/index.ts
var index_exports = {};
__export(index_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(index_exports);
var import_client_verifiedpermissions = require("@aws-sdk/client-verifiedpermissions");

// ../lambdas/shared/types.ts
var ROLES = ["globalAdmin", "administrator", "coordinator", "contributor", "viewer"];

// ../lambdas/shared/entities.ts
function buildEntities(req) {
  const entities = [];
  const userEntity = {
    identifier: { entityType: "Gazebo::User", entityId: req.userId },
    attributes: {},
    parents: []
  };
  if (req.userRoles && req.userRoles.length > 0) {
    userEntity.parents = req.userRoles.map((role) => ({
      entityType: "Gazebo::Role",
      entityId: role
    }));
  }
  entities.push(userEntity);
  const resourceEntity = {
    identifier: {
      entityType: `Gazebo::${req.resourceType}`,
      entityId: req.resourceId
    },
    attributes: {},
    parents: []
  };
  if (req.resourceCreatedBy) {
    resourceEntity.attributes.createdBy = {
      entityIdentifier: {
        entityType: "Gazebo::User",
        entityId: req.resourceCreatedBy
      }
    };
  }
  if (req.resourceParentSite && req.resourceType !== "Site") {
    resourceEntity.parents.push({
      entityType: "Gazebo::Site",
      entityId: req.resourceParentSite
    });
  }
  entities.push(resourceEntity);
  ROLES.forEach((role) => {
    entities.push({
      identifier: { entityType: "Gazebo::Role", entityId: role },
      attributes: { name: { string: role } }
    });
  });
  return { entityList: entities };
}

// ../lambdas/authorize-api/index.ts
var client = new import_client_verifiedpermissions.VerifiedPermissionsClient({});
var POLICY_STORE_ID = process.env.POLICY_STORE_ID;
var headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var handler = async (event) => {
  const method = event.requestContext.http.method;
  const path = event.rawPath;
  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  try {
    if (method === "POST" && path === "/authorize") {
      const body = JSON.parse(event.body || "{}");
      if (!body.userId || !body.action || !body.resourceType || !body.resourceId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing required fields: userId, action, resourceType, resourceId" })
        };
      }
      const entities = buildEntities(body);
      const command = new import_client_verifiedpermissions.IsAuthorizedCommand({
        policyStoreId: POLICY_STORE_ID,
        principal: {
          entityType: "Gazebo::User",
          entityId: body.userId
        },
        action: {
          actionType: "Gazebo::Action",
          actionId: body.action
        },
        resource: {
          entityType: `Gazebo::${body.resourceType}`,
          entityId: body.resourceId
        },
        entities
      });
      const result = await client.send(command);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          decision: result.decision,
          allowed: result.decision === import_client_verifiedpermissions.Decision.ALLOW,
          determiningPolicies: result.determiningPolicies,
          errors: result.errors,
          request: body
        })
      };
    }
    if (method === "POST" && path === "/authorize/batch") {
      const body = JSON.parse(event.body || "{}");
      if (!body.requests || !Array.isArray(body.requests) || body.requests.length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing or empty requests array" })
        };
      }
      const requests = body.requests.map((req) => ({
        principal: {
          entityType: "Gazebo::User",
          entityId: req.userId
        },
        action: {
          actionType: "Gazebo::Action",
          actionId: req.action
        },
        resource: {
          entityType: `Gazebo::${req.resourceType}`,
          entityId: req.resourceId
        },
        entities: buildEntities(req)
      }));
      const command = new import_client_verifiedpermissions.BatchIsAuthorizedCommand({
        policyStoreId: POLICY_STORE_ID,
        requests
      });
      const result = await client.send(command);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          results: result.results?.map((r, i) => ({
            request: body.requests[i],
            decision: r.decision,
            allowed: r.decision === import_client_verifiedpermissions.Decision.ALLOW,
            determiningPolicies: r.determiningPolicies,
            errors: r.errors
          }))
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
