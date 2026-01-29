// globalAdmin role grants full access to everything
permit (
    principal in Gazebo::RoleGroup::"globalAdmin",
    action,
    resource
);
