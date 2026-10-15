/// Canonical permission registry. This is the single source of truth for the
/// permission strings the app understands; roles may only carry permissions
/// from this list.
pub const ALL: [&str; 16] = [
    "task.view",
    "task.create",
    "task.edit",
    "task.change_status",
    "task.assign",
    "task.view_all",
    "task.delete",
    "article.view",
    "article.create",
    "article.edit",
    "article.publish",
    "article.delete",
    "users.manage",
    "roles.manage",
    "audit.view",
    "workspace.settings",
];

pub fn is_valid(perm: &str) -> bool {
    ALL.contains(&perm)
}

/// Keeps only known permissions, preserving first-seen order and dropping
/// duplicates.
pub fn filter_valid<I>(perms: I) -> Vec<String>
where
    I: IntoIterator<Item = String>,
{
    let mut out: Vec<String> = Vec::new();
    for perm in perms {
        if is_valid(&perm) && !out.contains(&perm) {
            out.push(perm);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_sixteen_unique_entries() {
        assert_eq!(ALL.len(), 16);
        for (i, perm) in ALL.iter().enumerate() {
            assert!(!ALL[i + 1..].contains(perm), "duplicate permission {perm}");
        }
    }

    #[test]
    fn is_valid_matches_registry() {
        assert!(is_valid("task.view"));
        assert!(is_valid("workspace.settings"));
        assert!(!is_valid("workspace.manage"));
        assert!(!is_valid("attachments.add"));
        assert!(!is_valid("custom.perm"));
        assert!(!is_valid(""));
    }

    #[test]
    fn filter_valid_drops_unknown_and_duplicates() {
        let input = vec![
            "task.view".to_string(),
            "custom.perm".to_string(),
            "attachments.add".to_string(),
            "task.view".to_string(),
            "workspace.manage".to_string(),
            "workspace.settings".to_string(),
        ];
        assert_eq!(
            filter_valid(input),
            vec!["task.view".to_string(), "workspace.settings".to_string()]
        );
    }
}
