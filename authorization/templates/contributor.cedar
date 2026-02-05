// Template: Grant contributor access to a resource and its children
// Can view and edit the resource and its children (Projects, Models, etc.)
// Instantiate with: ?principal = User, ?resource = Site/Region/Organization/Cohort/etc.
permit(
    principal == ?principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
    resource in ?resource
);