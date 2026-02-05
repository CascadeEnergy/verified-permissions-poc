// Template: Grant coordinator access to a resource and its children
// Coordinator = Facilitator + Delete (can manage users, sites, delete resources)
// Does NOT include Admin action (use Administrator template for that)
// Instantiate with: ?principal = User, ?resource = Site/Region/Organization/Cohort/etc.
permit(
    principal == ?principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create", Gazebo::Action::"Delete"],
    resource in ?resource
);