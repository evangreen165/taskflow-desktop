use std::path::Path;

use crate::error::AppError;
use crate::permissions;
use crate::roles;
use crate::spaces;
use crate::users;

/// Idempotently repairs data created by older app versions:
/// - the `admin` role always carries the full permission registry;
/// - every account has its personal space.
///
/// Runs on workspace activation, before login.
pub fn run(root: &Path) -> Result<(), AppError> {
    ensure_admin_role(root)?;
    ensure_personal_spaces(root)?;
    Ok(())
}

fn ensure_admin_role(root: &Path) -> Result<(), AppError> {
    let mut role = match roles::get(root, "admin") {
        Ok(role) => role,
        Err(e) if e.code == "ROLE_NOT_FOUND" => {
            if let Some(seed) = roles::default_roles().into_iter().find(|r| r.id == "admin") {
                roles::write_role(root, &seed)?;
            }
            return Ok(());
        }
        Err(e) => return Err(e),
    };

    let has_all = !role.empty
        && role.permissions.len() == permissions::ALL.len()
        && permissions::ALL
            .iter()
            .all(|perm| role.permissions.iter().any(|p| p == perm));
    if has_all {
        return Ok(());
    }

    role.permissions = permissions::ALL.iter().map(|p| p.to_string()).collect();
    role.empty = false;
    roles::write_role(root, &role)
}

fn ensure_personal_spaces(root: &Path) -> Result<(), AppError> {
    for user in users::list(root)? {
        spaces::ensure_personal(root, &user.id, &user.display_name)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn repairs_stale_admin_role_and_missing_personal_spaces() {
        let dir = tempdir().unwrap();
        crate::workspace::init(dir.path(), "Backfill").unwrap();
        let admin =
            users::create(dir.path(), "admin", "password123", "Admin", "admin", None).unwrap();

        // Simulate a stale v3 workspace: admin role missing space.create.
        let mut stale = roles::get(dir.path(), "admin").unwrap();
        stale.permissions.retain(|p| p != "space.create");
        roles::write_role(dir.path(), &stale).unwrap();
        assert!(!roles::get(dir.path(), "admin")
            .unwrap()
            .permissions
            .iter()
            .any(|p| p == "space.create"));

        // Simulate a user created before personal spaces existed.
        let personal = dir.path().join("spaces").join(format!("personal_{}", admin.id));
        std::fs::remove_dir_all(&personal).unwrap();
        assert!(!personal.exists());

        run(dir.path()).unwrap();

        let role = roles::get(dir.path(), "admin").unwrap();
        assert!(role.permissions.iter().any(|p| p == "space.create"));
        assert_eq!(role.permissions.len(), permissions::ALL.len());
        assert!(personal.join("space.json").is_file());

        // Idempotent: a second run keeps the same permission count.
        run(dir.path()).unwrap();
        assert_eq!(
            roles::get(dir.path(), "admin").unwrap().permissions.len(),
            permissions::ALL.len()
        );
    }
}
