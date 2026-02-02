// Template: Grant view access to a specific site and its contents
// Instantiate with: ?principal = User, ?resource = Site
permit(
    principal == ?principal,
    action == Gazebo::Action::"View",
    resource in ?resource
);