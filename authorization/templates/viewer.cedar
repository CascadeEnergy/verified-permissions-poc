// Template: Grant view access to a resource and its children
// Instantiate with: ?principal = User, ?resource = Site/Region/Organization/Cohort/etc.
permit(
    principal == ?principal,
    action == Gazebo::Action::"View",
    resource in ?resource
);