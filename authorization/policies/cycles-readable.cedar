// Cycles are broadly readable reference data (time period definitions)
// Any authenticated user can view Cycles
permit (
    principal,
    action == Gazebo::Action::"View",
    resource is Gazebo::Cycle
);
