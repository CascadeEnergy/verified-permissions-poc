// Template: Grant coordinator access to a specific resource
// Coordinator = Facilitator + Delete (can manage users, sites, delete resources)
// Does NOT include Admin action (use Administrator template for that)
// Instantiate with: ?principal = User, ?resource = Site/Region/Organization
permit(
    principal == ?principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create", Gazebo::Action::"Delete"],
    resource in ?resource
);