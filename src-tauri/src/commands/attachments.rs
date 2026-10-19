use tauri::State;

use crate::attachments::{self, AttachmentResult};
use crate::error::AppError;
use crate::AppState;

pub fn attachment_add_impl(
    state: &AppState,
    source_path: String,
    name: String,
) -> Result<AttachmentResult, AppError> {
    state.require_auth()?;
    let root = state.root()?;
    let (info, created) = attachments::add(&root, &source_path, &name)?;
    Ok(AttachmentResult { info, created })
}

#[tauri::command(rename = "attachmentAdd")]
pub fn attachment_add(
    state: State<'_, AppState>,
    source_path: String,
    name: String,
) -> Result<AttachmentResult, AppError> {
    attachment_add_impl(&state, source_path, name)
}

pub fn attachment_get_base64_impl(
    state: &AppState,
    sha256: String,
) -> Result<String, AppError> {
    state.require_auth()?;
    attachments::get_base64(&state.root()?, &sha256)
}

#[tauri::command(rename = "attachmentGetBase64")]
pub fn attachment_get_base64(
    state: State<'_, AppState>,
    sha256: String,
) -> Result<String, AppError> {
    attachment_get_base64_impl(&state, sha256)
}

pub fn attachment_remove_impl(state: &AppState, sha256: String) -> Result<(), AppError> {
    state.require_auth()?;
    attachments::remove(&state.root()?, &sha256)
}

#[tauri::command(rename = "attachmentRemove")]
pub fn attachment_remove(state: State<'_, AppState>, sha256: String) -> Result<(), AppError> {
    attachment_remove_impl(&state, sha256)
}

pub fn attachment_open_impl(
    state: &AppState,
    app: &tauri::AppHandle,
    sha256: String,
) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt;

    state.require_auth()?;
    let root = state.root()?;
    let path = attachments::resolve(&root, &sha256)?;
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|e| AppError::new("IO", format!("open attachment: {e}")))
}

/// Opens the stored file with the OS default application.
#[tauri::command(rename = "attachmentOpen")]
pub fn attachment_open(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    sha256: String,
) -> Result<(), AppError> {
    attachment_open_impl(&state, &app, sha256)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::Session;
    use crate::users;
    use crate::workspace;
    use tempfile::tempdir;

    fn session_for(user_id: &str, role_id: &str) -> Session {
        Session {
            user_id: user_id.to_string(),
            login: "login".to_string(),
            display_name: "Name".to_string(),
            role_id: role_id.to_string(),
            avatar_color: "#5b5bd6".to_string(),
            must_change_password: false,
            login_at: "2026-10-01T00:00:00Z".to_string(),
            role_missing_reported: false,
        }
    }

    struct Fixture {
        _dir: tempfile::TempDir,
        state: AppState,
        source_dir: tempfile::TempDir,
    }

    fn fixture() -> Fixture {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "Media").unwrap();
        let admin =
            users::create(dir.path(), "admin", "password123", "Admin", "admin", None).unwrap();
        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(session_for(&admin.id, "admin"));
        let source_dir = tempdir().unwrap();
        Fixture {
            _dir: dir,
            state,
            source_dir,
        }
    }

    fn write_png(fx: &Fixture, name: &str) -> String {
        let bytes = [
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
            0x44, 0x52,
        ];
        let path = fx.source_dir.path().join(name);
        std::fs::write(&path, bytes).unwrap();
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn add_copies_and_reports_info() {
        let fx = fixture();
        let source = write_png(&fx, "screenshot.png");
        let result = attachment_add_impl(&fx.state, source, "screenshot.png".to_string()).unwrap();
        assert!(result.created);
        assert_eq!(result.info.ext, "png");
        assert_eq!(result.info.mime, "image/png");
        assert_eq!(result.info.sha256.len(), 64);
        assert_eq!(result.info.name, "screenshot.png");
        assert!(fx
            ._dir
            .path()
            .join("attachments")
            .join(format!("{}.png", result.info.sha256))
            .is_file());
    }

    #[test]
    fn deduplicates_by_hash() {
        let fx = fixture();
        let source = write_png(&fx, "shot.png");
        let first = attachment_add_impl(&fx.state, source.clone(), "shot.png".to_string()).unwrap();
        let second =
            attachment_add_impl(&fx.state, source, "shot-other-name.png".to_string()).unwrap();
        assert!(first.created);
        assert!(!second.created);
        assert_eq!(first.info.sha256, second.info.sha256);
        let files = std::fs::read_dir(fx._dir.path().join("attachments")).unwrap().count();
        assert_eq!(files, 1);
    }

    #[test]
    fn get_base64_returns_a_data_url() {
        let fx = fixture();
        let source = write_png(&fx, "img.png");
        let result = attachment_add_impl(&fx.state, source, "img.png".to_string()).unwrap();
        let data_url =
            attachment_get_base64_impl(&fx.state, result.info.sha256.clone()).unwrap();
        assert!(data_url.starts_with("data:image/png;base64,"));
        assert!(data_url.len() > "data:image/png;base64,".len());
    }

    #[test]
    fn remove_only_when_unreferenced() {
        let fx = fixture();
        let source = write_png(&fx, "doc.png");
        let result = attachment_add_impl(&fx.state, source, "doc.png".to_string()).unwrap();
        let path = fx
            ._dir
            .path()
            .join("attachments")
            .join(format!("{}.png", result.info.sha256));
        assert!(path.is_file());

        attachment_remove_impl(&fx.state, result.info.sha256.clone()).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn remove_keeps_referenced_files() {
        let fx = fixture();
        let source = write_png(&fx, "kept.png");
        let result = attachment_add_impl(&fx.state, source, "kept.png".to_string()).unwrap();
        let path = fx
            ._dir
            .path()
            .join("attachments")
            .join(format!("{}.png", result.info.sha256));

        crate::notes::create(
            fx._dir.path(),
            &fx.state.require_auth().unwrap().user_id,
            "With attachment",
            "Процессы",
            &format!("![img](attachment://{})", result.info.sha256),
        )
        .unwrap();

        attachment_remove_impl(&fx.state, result.info.sha256.clone()).unwrap();
        assert!(path.is_file());
    }

    #[test]
    fn rejects_bad_extensions_and_requires_auth() {
        let fx = fixture();
        let bad = fx.source_dir.path().join("virus.exe");
        std::fs::write(&bad, b"MZ").unwrap();
        let err = attachment_add_impl(
            &fx.state,
            bad.to_string_lossy().into_owned(),
            "virus.exe".to_string(),
        )
        .unwrap_err();
        assert_eq!(err.code, "INVALID_INPUT");

        let state = AppState::new("m".into());
        state.set_workspace(
            fx._dir.path().to_path_buf(),
            workspace::validate(fx._dir.path()).unwrap(),
        );
        let err = attachment_get_base64_impl(&state, "a".repeat(64)).unwrap_err();
        assert_eq!(err.code, "AUTH_REQUIRED");
    }
}
