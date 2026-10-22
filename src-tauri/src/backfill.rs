use std::path::Path;

use crate::error::AppError;
use crate::fsops;
use crate::permissions;
use crate::roles;
use crate::spaces;
use crate::users;

/// Idempotently repairs data created by older app versions:
/// - the `admin` role always carries the full permission registry;
/// - every system role keeps its seed permissions (e.g. the manager role
///   gains `space.manage` on workspaces created before Stage 6);
/// - every account has its personal space;
/// - legacy workspace-level KB categories are copied into each space.
///
/// Runs on workspace activation, before login.
pub fn run(root: &Path) -> Result<(), AppError> {
    ensure_admin_role(root)?;
    ensure_system_roles(root)?;
    ensure_personal_spaces(root)?;
    ensure_space_categories(root)?;
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

/// Repairs non-admin system roles: a role never loses permissions it had, but
/// it gains any permission its seed role carries that it is missing. Additive
/// and idempotent, so admin customizations of system roles survive.
fn ensure_system_roles(root: &Path) -> Result<(), AppError> {
    for seed in roles::default_roles() {
        if seed.id == "admin" {
            continue;
        }
        let mut role = match roles::get(root, &seed.id) {
            Ok(role) => role,
            Err(e) if e.code == "ROLE_NOT_FOUND" => {
                roles::write_role(root, &seed)?;
                continue;
            }
            Err(e) => return Err(e),
        };
        if !role.is_system {
            continue;
        }
        let missing: Vec<String> = seed
            .permissions
            .iter()
            .filter(|perm| !role.permissions.iter().any(|p| p == *perm))
            .cloned()
            .collect();
        if missing.is_empty() {
            continue;
        }
        role.permissions.extend(missing);
        role.empty = role.permissions.is_empty();
        roles::write_role(root, &role)?;
    }
    Ok(())
}

fn ensure_personal_spaces(root: &Path) -> Result<(), AppError> {
    for user in users::list(root)? {
        spaces::ensure_personal(root, &user.id, &user.display_name)?;
    }
    Ok(())
}

/// Stage 6 made KB categories space-scoped. Copy a legacy workspace-level
/// `categories.json` into every space that does not have its own list yet.
fn ensure_space_categories(root: &Path) -> Result<(), AppError> {
    let legacy = root.join("categories.json");
    if !legacy.is_file() {
        return Ok(());
    }
    let categories = fsops::read_json::<Vec<String>>(&legacy)?;
    if categories.is_empty() {
        return Ok(());
    }
    for space in spaces::list(root)? {
        let path = spaces::space_dir(root, &space.id)?.join("categories.json");
        if !path.is_file() {
            fsops::write_json_atomic(&path, &categories)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fsops;
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

    #[test]
    fn repairs_system_roles_missing_seed_permissions() {
        let dir = tempdir().unwrap();
        crate::workspace::init(dir.path(), "Backfill").unwrap();
        users::create(dir.path(), "admin", "password123", "Admin", "admin", None).unwrap();

        // Simulate a stale v3 workspace: manager role missing space.manage.
        let mut stale = roles::get(dir.path(), "manager").unwrap();
        stale.permissions.retain(|p| p != "space.manage");
        roles::write_role(dir.path(), &stale).unwrap();
        assert!(!roles::get(dir.path(), "manager")
            .unwrap()
            .permissions
            .iter()
            .any(|p| p == "space.manage"));

        run(dir.path()).unwrap();

        let manager = roles::get(dir.path(), "manager").unwrap();
        assert!(manager.permissions.iter().any(|p| p == "space.manage"));
        assert!(manager.permissions.iter().any(|p| p == "task.create"));

        // Idempotent: a second run does not change the role file.
        let before = fsops::read_json::<roles::Role>(&dir.path().join("roles").join("manager.json"))
            .unwrap();
        run(dir.path()).unwrap();
        let after = fsops::read_json::<roles::Role>(&dir.path().join("roles").join("manager.json"))
            .unwrap();
        assert_eq!(before.permissions, after.permissions);
    }

    #[test]
    fn restores_deleted_system_role_from_seed() {
        let dir = tempdir().unwrap();
        crate::workspace::init(dir.path(), "Backfill").unwrap();
        users::create(dir.path(), "admin", "password123", "Admin", "admin", None).unwrap();

        std::fs::remove_file(dir.path().join("roles").join("manager.json")).unwrap();
        assert_eq!(roles::get(dir.path(), "manager").unwrap_err().code, "ROLE_NOT_FOUND");

        run(dir.path()).unwrap();

        let manager = roles::get(dir.path(), "manager").unwrap();
        assert!(manager.is_system);
        assert!(manager.permissions.iter().any(|p| p == "space.manage"));
    }

    #[test]
    fn migrates_legacy_categories_into_spaces() {
        let dir = tempdir().unwrap();
        crate::workspace::init(dir.path(), "Backfill").unwrap();
        let admin =
            users::create(dir.path(), "admin", "password123", "Admin", "admin", None).unwrap();
        let personal = format!("personal_{}", admin.id);
        let shared = spaces::create(dir.path(), &admin.id, "Shared", "").unwrap();

        // Legacy workspace-level category file from before Stage 6.
        fsops::write_json_atomic(
            &dir.path().join("categories.json"),
            &vec!["HR".to_string(), "Процессы".to_string()],
        )
        .unwrap();

        run(dir.path()).unwrap();

        for space_id in [shared.id.as_str(), personal.as_str()] {
            let path = spaces::space_dir(dir.path(), space_id)
                .unwrap()
                .join("categories.json");
            let categories = fsops::read_json::<Vec<String>>(&path).unwrap();
            assert_eq!(categories, vec!["HR".to_string(), "Процессы".to_string()]);
        }
    }
}
