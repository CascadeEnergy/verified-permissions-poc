// Template: Grant champion access to a specific resource
// Champion = Contributor + Create (can create projects, manage savings claims)
// Instantiate with: ?principal = User, ?resource = Site/Region/Organization
permit(
    principal == ?principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create"],
    resource in ?resource
);
