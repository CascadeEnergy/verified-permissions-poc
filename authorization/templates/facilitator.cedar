// Template: Grant facilitator access to a resource and its children
// Facilitator = Champion + additional data management capabilities
// In Cedar terms: View, Edit, Create (same actions as Champion, differentiated by application logic)
// Instantiate with: ?principal = User, ?resource = Site/Region/Organization/Cohort/etc.
permit(
    principal == ?principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create"],
    resource in ?resource
);
