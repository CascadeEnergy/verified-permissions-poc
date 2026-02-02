// Template: Grant contributor access to a specific site
// Can view and edit the site and its Projects/Models
// Instantiate with: ?principal = User, ?resource = Site
permit(
    principal == ?principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
    resource in ?resource
);