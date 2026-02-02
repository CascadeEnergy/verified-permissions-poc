// Template: Grant coordinator (admin) access to a specific site
// Full control over the site and its contents
// Instantiate with: ?principal = User, ?resource = Site
permit(
    principal == ?principal,
    action,
    resource in ?resource
);