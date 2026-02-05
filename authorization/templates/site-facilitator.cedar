// Template: Grant facilitator access to a specific resource
// Facilitator = Champion + additional data management capabilities
// In Cedar terms: View, Edit, Create (same actions as Champion, differentiated by application logic)
// Instantiate with: ?principal = User, ?resource = Site/Region/Organization
permit(
    principal == ?principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create"],
    resource in ?resource
);
