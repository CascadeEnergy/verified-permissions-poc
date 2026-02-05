// Template: Grant champion access to a resource and its children
// Champion = Contributor + Create (can create projects, manage savings claims)
// Instantiate with: ?principal = User, ?resource = Site/Region/Organization/Cohort/etc.
permit(
    principal == ?principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create"],
    resource in ?resource
);
