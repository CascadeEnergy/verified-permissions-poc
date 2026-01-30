permit (
    principal,
    action in [Gazebo::Action::"View", Gazebo::Action::"Edit"],
    resource
) when {
    resource has createdBy && resource.createdBy == principal
};
