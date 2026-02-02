# AWS Verified Permissions - Scaling Considerations

## Quotas

| Resource | Default Limit | Adjustable |
|----------|---------------|------------|
| Policy templates per policy store | 40 | Yes |
| Policy size | 10,000 bytes | No |
| Policy size per resource | 200,000 bytes | Yes |
| Schema size | 100,000 bytes | No |
| Authorization request size | 1 MB | No |

## Template-Linked Policy Size Calculation

Template-linked policies are lightweight. Only the **principal + resource entity IDs** count toward size quotas - the template body does NOT count.

Example:
```
Principal: User::"alice"       = 13 bytes
Resource:  Site::"building-a"  = 19 bytes
Total policy size              = 32 bytes
```

With the 200KB per-resource limit:
- ~6,000+ user-site assignments per resource scope
- Separate 200KB quota for policies with undefined resource (global policies)

## Will It Scale for Gazebo?

**For typical enterprise use**: Yes. Thousands of user-site assignments work fine.

**Potential concerns at massive scale**:
- 40 policy template limit (adjustable via Service Quotas console)
- Millions of assignments may hit size limits
- Rate limits on API calls for creating/deleting policies

## Alternative Patterns for Massive Scale

If you outgrow template-linked policies:

### 1. Groups as Entities
Instead of per-user template-linked policies, assign users to groups and create one policy per group:

```cedar
permit (
  principal in Gazebo::SiteViewerGroup::"building-a-viewers",
  action == Gazebo::Action::"View",
  resource in Gazebo::Site::"building-a"
);
```

User membership is stored as entity data, not policies.

### 2. External Data Store + Context
Store assignments in DynamoDB. Pass user's assignments as context in authorization requests:

```cedar
permit (
  principal,
  action == Gazebo::Action::"View",
  resource
) when {
  resource in context.userSites
};
```

### 3. Multiple Policy Stores
One policy store per tenant or region. Useful for multi-tenant SaaS with strict isolation.

## References

- [AWS Verified Permissions Quotas](https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/quotas.html)
- [Best practices for designing an authorization model](https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/design-authz-strategy.html)
- [Multi-tenancy considerations](https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/policy-stores.html)
