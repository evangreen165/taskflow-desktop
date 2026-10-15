use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::fsops;

/// Stable per-machine identity, persisted in the app data directory.
/// Used as the lock owner so a shared folder can tell sessions apart.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MachineIdFile {
    id: String,
}

pub fn load_or_create(app_data_dir: &Path) -> Result<String, AppError> {
    let path = app_data_dir.join("machine-id.json");
    if path.exists() {
        let file: MachineIdFile = fsops::read_json(&path)?;
        return Ok(file.id);
    }
    std::fs::create_dir_all(app_data_dir).map_err(|e| AppError::io("create app data dir", e))?;
    let id = uuid::Uuid::new_v4().to_string();
    fsops::write_json_atomic(&path, &MachineIdFile { id: id.clone() })?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn creates_then_reuses_id() {
        let dir = tempdir().unwrap();
        let a = load_or_create(dir.path()).unwrap();
        let b = load_or_create(dir.path()).unwrap();
        assert_eq!(a, b);
        assert!(dir.path().join("machine-id.json").exists());
    }
}