// Administrator: full access at assigned sites
permit (
    principal in Gazebo::RoleGroup::"administrator",
    action,
    resource
);

// Coordinator: create and edit, but not delete or admin
permit (
    principal in Gazebo::RoleGroup::"coordinator",
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit", Gazebo::Action::"Create"],
    resource
);

// Contributor: edit projects and view everything
permit (
    principal in Gazebo::RoleGroup::"contributor",
    action == Gazebo::Action::"View",
    resource
);

permit (
    principal in Gazebo::RoleGroup::"contributor",
    action == Gazebo::Action::"Edit",
    resource is Gazebo::Project
);

// Viewer: read-only access
permit (
    principal in Gazebo::RoleGroup::"viewer",
    action == Gazebo::Action::"View",
    resource
);
