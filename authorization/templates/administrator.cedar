// Template: Grant administrator access to a resource and its children
// Administrator = Full control over the resource and its children
// Instantiate with: ?principal = User, ?resource = Site/Region/Organization/Cohort/etc.
permit(
    principal == ?principal,
    action,
    resource in ?resource
);
