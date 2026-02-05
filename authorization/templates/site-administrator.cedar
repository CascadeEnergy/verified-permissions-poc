// Template: Grant administrator access to a specific resource
// Administrator = Full control over the resource and its children
// Instantiate with: ?principal = User, ?resource = Site/Region/Organization
permit(
    principal == ?principal,
    action,
    resource in ?resource
);
