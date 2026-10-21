use std::path::Path;

use tauri::State;

use serde::Serialize;

use taskflow_macros::write_command;

use crate::attachments;
use crate::error::AppError;
use crate::fsops;
use crate::notes::{self, Note, NoteMeta, NoteStatus};
use crate::AppState;

/// `notesList` item: flattened meta plus a content snippet for the grid.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteListItem {
    #[serde(flatten)]
    pub meta: NoteMeta,
    pub preview: String,
}

pub fn notes_list_impl(
    state: &AppState,
    space_id: String,
    category: Option<String>,
    tag: Option<String>,
    query: Option<String>,
    status: Option<NoteStatus>,
) -> Result<Vec<NoteListItem>, AppError> {
    let session = state.require_perm("article.view")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;

    let mut metas = notes::list_meta(&space_dir)?;
    if let Some(category) = &category {
        metas.retain(|meta| &meta.category == category);
    }
    if let Some(tag) = &tag {
        metas.retain(|meta| meta.tags.iter().any(|t| t == tag));
    }
    if let Some(status) = status {
        metas.retain(|meta| meta.status == status);
    }
    if let Some(query) = query.map(|q| q.trim().to_lowercase()) {
        if !query.is_empty() {
            metas.retain(|meta| {
                let meta_hay = format!("{} {}", meta.title, meta.category).to_lowercase();
                meta_hay.contains(&query)
                    || notes::read_content(&space_dir, &meta.id)
                        .map(|content| content.to_lowercase().contains(&query))
                        .unwrap_or(false)
            });
        }
    }

    let mut items = Vec::with_capacity(metas.len());
    for meta in metas {
        let preview = notes::read_content(&space_dir, &meta.id)
            .map(|content| notes::preview_of(&content))
            .unwrap_or_default();
        items.push(NoteListItem { meta, preview });
    }
    Ok(items)
}

#[tauri::command(rename = "notesList")]
pub fn notes_list(
    state: State<'_, AppState>,
    space_id: String,
    category: Option<String>,
    tag: Option<String>,
    query: Option<String>,
    status: Option<NoteStatus>,
) -> Result<Vec<NoteListItem>, AppError> {
    notes_list_impl(&state, space_id, category, tag, query, status)
}

pub fn notes_get_impl(
    state: &AppState,
    space_id: String,
    id: String,
) -> Result<Note, AppError> {
    let session = state.require_perm("article.view")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    notes::get(&space_dir, &id)
}

#[tauri::command(rename = "notesGet")]
pub fn notes_get(
    state: State<'_, AppState>,
    space_id: String,
    id: String,
) -> Result<Note, AppError> {
    notes_get_impl(&state, space_id, id)
}

pub fn notes_get_history_impl(
    state: &AppState,
    space_id: String,
    id: String,
) -> Result<Vec<NoteMeta>, AppError> {
    let session = state.require_perm("article.view")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    notes::get_history(&space_dir, &id)
}

#[tauri::command(rename = "notesGetHistory")]
pub fn notes_get_history(
    state: State<'_, AppState>,
    space_id: String,
    id: String,
) -> Result<Vec<NoteMeta>, AppError> {
    notes_get_history_impl(&state, space_id, id)
}

pub fn notes_create_impl(
    state: &AppState,
    space_id: String,
    title: String,
    category: String,
    content: String,
) -> Result<Note, AppError> {
    state.require_writable()?;
    let session = state.require_perm("article.create")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    notes::create(&space_dir, &session.user_id, &title, &category, &content)
}

#[write_command(rename = "notesCreate")]
pub fn notes_create(
    state: State<'_, AppState>,
    space_id: String,
    title: String,
    category: String,
    content: String,
) -> Result<Note, AppError> {
    notes_create_impl(&state, space_id, title, category, content)
}

pub fn notes_update_impl(
    state: &AppState,
    space_id: String,
    id: String,
    title: String,
    category: String,
    tags: Vec<String>,
    content: String,
    expected_version: u64,
) -> Result<Note, AppError> {
    state.require_writable()?;
    let session = state.require_perm("article.edit")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    notes::update(
        &space_dir,
        &id,
        &title,
        &category,
        &tags,
        &content,
        expected_version,
    )
}

#[write_command(rename = "notesUpdate")]
pub fn notes_update(
    state: State<'_, AppState>,
    space_id: String,
    id: String,
    title: String,
    category: String,
    tags: Vec<String>,
    content: String,
    expected_version: u64,
) -> Result<Note, AppError> {
    notes_update_impl(
        &state,
        space_id,
        id,
        title,
        category,
        tags,
        content,
        expected_version,
    )
}

pub fn notes_publish_impl(
    state: &AppState,
    space_id: String,
    id: String,
    expected_version: u64,
) -> Result<Note, AppError> {
    state.require_writable()?;
    let session = state.require_perm("article.publish")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    notes::publish(&space_dir, &id, expected_version)
}

#[write_command(rename = "notesPublish")]
pub fn notes_publish(
    state: State<'_, AppState>,
    space_id: String,
    id: String,
    expected_version: u64,
) -> Result<Note, AppError> {
    notes_publish_impl(&state, space_id, id, expected_version)
}

pub fn notes_delete_impl(
    state: &AppState,
    space_id: String,
    id: String,
) -> Result<(), AppError> {
    state.require_writable()?;
    let session = state.require_perm("article.delete")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    notes::delete(&space_dir, &id)
}

#[write_command(rename = "notesDelete")]
pub fn notes_delete(
    state: State<'_, AppState>,
    space_id: String,
    id: String,
) -> Result<(), AppError> {
    notes_delete_impl(&state, space_id, id)
}

pub fn notes_restore_version_impl(
    state: &AppState,
    space_id: String,
    id: String,
    version: u64,
) -> Result<Note, AppError> {
    state.require_writable()?;
    let session = state.require_perm("article.edit")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;
    notes::restore_version(&space_dir, &id, version)
}

#[write_command(rename = "notesRestoreVersion")]
pub fn notes_restore_version(
    state: State<'_, AppState>,
    space_id: String,
    id: String,
    version: u64,
) -> Result<Note, AppError> {
    notes_restore_version_impl(&state, space_id, id, version)
}

pub fn notes_list_categories_impl(state: &AppState) -> Result<Vec<String>, AppError> {
    state.require_auth()?;
    notes::list_categories(&state.root()?)
}

#[tauri::command(rename = "notesListCategories")]
pub fn notes_list_categories(state: State<'_, AppState>) -> Result<Vec<String>, AppError> {
    notes_list_categories_impl(&state)
}

pub fn notes_create_category_impl(
    state: &AppState,
    name: String,
) -> Result<Vec<String>, AppError> {
    state.require_writable()?;
    state.require_perm("article.create")?;
    notes::create_category(&state.root()?, &name)
}

#[write_command(rename = "notesCreateCategory")]
pub fn notes_create_category(
    state: State<'_, AppState>,
    name: String,
) -> Result<Vec<String>, AppError> {
    notes_create_category_impl(&state, name)
}

pub fn notes_delete_category_impl(
    state: &AppState,
    name: String,
) -> Result<Vec<String>, AppError> {
    state.require_writable()?;
    state.require_perm("article.create")?;
    notes::delete_category(&state.root()?, &name)
}

#[write_command(rename = "notesDeleteCategory")]
pub fn notes_delete_category(
    state: State<'_, AppState>,
    name: String,
) -> Result<Vec<String>, AppError> {
    notes_delete_category_impl(&state, name)
}

/// Imports a local file as a note. `.md` files become the note body; `.pdf`
/// files are stored as attachments and referenced from the body.
pub fn notes_import_impl(
    state: &AppState,
    space_id: String,
    source_path: String,
) -> Result<Note, AppError> {
    state.require_writable()?;
    let session = state.require_perm("article.create")?;
    let root = state.root()?;
    crate::spaces::require_access(&root, &space_id, &session)?;
    let space_dir = crate::spaces::space_dir(&root, &space_id)?;

    let path = Path::new(&source_path);
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| source_path.clone());
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !matches!(ext.as_str(), "md" | "markdown" | "pdf") {
        return Err(AppError::new(
            "INVALID_INPUT",
            "only .md and .pdf files can be imported",
        ));
    }
    let meta = std::fs::metadata(path).map_err(|e| AppError::io("import source", e))?;
    let limit = if ext == "pdf" {
        50 * 1024 * 1024
    } else {
        2 * 1024 * 1024
    };
    if meta.len() > limit {
        return Err(AppError::new("INVALID_INPUT", "imported file is too large"));
    }

    let title = path
        .file_stem()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Импорт".to_string());

    match ext.as_str() {
        "md" | "markdown" => {
            let text = fsops::read_text(path)?;
            notes::create(&space_dir, &session.user_id, &title, "Импорт", &text)
        }
        "pdf" => {
            let (info, _) = attachments::add(&root, &source_path, &name)?;
            let content = format!("[Открыть PDF](attachment://{})", info.sha256);
            notes::create(&space_dir, &session.user_id, &title, "Импорт", &content)
        }
        _ => unreachable!(),
    }
}

#[write_command(rename = "notesImport")]
pub fn notes_import(
    state: State<'_, AppState>,
    space_id: String,
    source_path: String,
) -> Result<Note, AppError> {
    notes_import_impl(&state, space_id, source_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::Session;
    use crate::users::{self, UserInfo};
    use crate::workspace;
    use tempfile::tempdir;

    const SPACE: &str = "default";

    struct Fixture {
        _dir: tempfile::TempDir,
        state: AppState,
        admin: UserInfo,
        observer: UserInfo,
    }

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

    fn fixture() -> Fixture {
        let dir = tempdir().unwrap();
        let info = workspace::init(dir.path(), "KB").unwrap();
        let admin =
            users::create(dir.path(), "admin", "password123", "Admin", "admin", None).unwrap();
        let observer =
            users::create(dir.path(), "obs", "password123", "Observer", "observer", None).unwrap();
        let space = crate::spaces::Space {
            id: SPACE.to_string(),
            name: "Основное".to_string(),
            description: String::new(),
            created_at: crate::audit::now_rfc3339(),
            owner_id: admin.id.clone(),
            members: vec![admin.id.clone(), observer.id.clone()],
        };
        crate::spaces::write_space(dir.path(), &space).unwrap();
        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(session_for(&admin.id, "admin"));
        Fixture {
            _dir: dir,
            state,
            admin,
            observer,
        }
    }

    fn create_note(fx: &Fixture, title: &str, content: &str) -> Note {
        notes_create_impl(&fx.state, SPACE.to_string(), title.to_string(), "Процессы".to_string(), content.to_string())
            .unwrap()
    }

    fn history_file_count(fx: &Fixture, id: &str) -> usize {
        let dir = fx
            ._dir
            .path()
            .join("spaces")
            .join(SPACE)
            .join("notes")
            .join(id)
            .join("history");
        if !dir.is_dir() {
            return 0;
        }
        std::fs::read_dir(&dir)
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter(|e| {
                        e.path()
                            .extension()
                            .and_then(|ext| ext.to_str())
                            == Some("json")
                    })
                    .count()
            })
            .unwrap_or(0)
    }

    #[test]
    fn create_list_get() {
        let fx = fixture();
        let note = create_note(&fx, "Онбординг", "# Онбординг\nТекст.");
        assert_eq!(note.meta.version, 1);
        assert_eq!(note.meta.author_id, fx.admin.id);
        assert_eq!(note.meta.status, NoteStatus::Draft);

        let listed = notes_list_impl(&fx.state, SPACE.to_string(), None, None, None, None).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].meta.id, note.meta.id);
        assert!(listed[0].preview.contains("Онбординг"));

        let fetched = notes_get_impl(&fx.state, SPACE.to_string(), note.meta.id.clone()).unwrap();
        assert_eq!(fetched.content, "# Онбординг\nТекст.");
        assert!(fetched.history_versions.is_empty());
    }

    #[test]
    fn update_increments_version_and_creates_history() {
        let fx = fixture();
        let note = create_note(&fx, "V1", "first");
        let updated = notes_update_impl(&fx.state, SPACE.to_string(), note.meta.id.clone(),
            "V2".to_string(),
            "Процессы".to_string(),
            vec![],
            "second".to_string(),
            1,
        )
        .unwrap();
        assert_eq!(updated.meta.version, 2);
        assert_eq!(updated.content, "second");
        assert_eq!(updated.history_versions, vec![1]);
        assert_eq!(history_file_count(&fx, &note.meta.id), 1);
    }

    #[test]
    fn update_version_conflict_returns_current_meta() {
        let fx = fixture();
        let note = create_note(&fx, "V1", "first");
        let err = notes_update_impl(&fx.state, SPACE.to_string(), note.meta.id.clone(),
            "V2".to_string(),
            "Процессы".to_string(),
            vec![],
            "second".to_string(),
            99,
        )
        .unwrap_err();
        assert_eq!(err.code, "VERSION_CONFLICT");
        let current: NoteMeta = serde_json::from_str(err.details.as_deref().unwrap()).unwrap();
        assert_eq!(current.id, note.meta.id);
        assert_eq!(current.version, 1);
    }

    #[test]
    fn publish_sets_status_and_date() {
        let fx = fixture();
        let note = create_note(&fx, "Draft", "x");
        let published = notes_publish_impl(&fx.state, SPACE.to_string(), note.meta.id.clone(), 1).unwrap();
        assert_eq!(published.meta.status, NoteStatus::Published);
        assert!(published.meta.published_at.is_some());
        assert_eq!(published.meta.version, 2);
    }

    #[test]
    fn restore_version_creates_a_new_version() {
        let fx = fixture();
        let note = create_note(&fx, "V1", "first");
        notes_update_impl(&fx.state, SPACE.to_string(), note.meta.id.clone(),
            "V2".to_string(),
            "Процессы".to_string(),
            vec![],
            "second".to_string(),
            1,
        )
        .unwrap();

        let restored = notes_restore_version_impl(&fx.state, SPACE.to_string(), note.meta.id.clone(), 1).unwrap();
        assert_eq!(restored.meta.version, 3);
        assert_eq!(restored.content, "first");
        assert_eq!(restored.meta.title, "V1");
        // The pre-restore state (version 2) is preserved in history.
        assert!(restored.history_versions.contains(&2));
    }

    #[test]
    fn observer_cannot_create() {
        let fx = fixture();
        fx.state
            .set_session(session_for(&fx.observer.id, "observer"));
        let err = notes_create_impl(&fx.state, SPACE.to_string(), "Nope".to_string(),
            "Процессы".to_string(),
            "x".to_string(),
        )
        .unwrap_err();
        assert_eq!(err.code, "FORBIDDEN");
    }

    #[test]
    fn history_is_limited_to_twenty() {
        let fx = fixture();
        let note = create_note(&fx, "Start", "0");
        for i in 1..=25 {
            notes_update_impl(&fx.state, SPACE.to_string(), note.meta.id.clone(),
                format!("Title {i}"),
                "Процессы".to_string(),
                vec![],
                format!("content {i}"),
                i,
            )
            .unwrap();
        }
        assert_eq!(history_file_count(&fx, &note.meta.id), 20);
        let history = notes_get_history_impl(&fx.state, SPACE.to_string(), note.meta.id.clone()).unwrap();
        assert_eq!(history.len(), 20);
        assert_eq!(history[0].version, 25);
        assert_eq!(history[19].version, 6);
    }

    #[test]
    fn list_filters_by_category_status_and_query() {
        let fx = fixture();
        create_note(&fx, "Онбординг сотрудника", "Шаги по онбордингу.");
        notes_create_impl(&fx.state, SPACE.to_string(), "Политика отпусков".to_string(),
            "HR".to_string(),
            "Правила отпусков.".to_string(),
        )
        .unwrap();

        let by_category =
            notes_list_impl(&fx.state, SPACE.to_string(), Some("HR".to_string()), None, None, None).unwrap();
        assert_eq!(by_category.len(), 1);
        assert_eq!(by_category[0].meta.title, "Политика отпусков");

        let by_status =
            notes_list_impl(&fx.state, SPACE.to_string(), None, None, None, Some(NoteStatus::Published)).unwrap();
        assert_eq!(by_status.len(), 0);

        let by_query = notes_list_impl(&fx.state, SPACE.to_string(), None, None, Some("отпуск".to_string()), None)
            .unwrap();
        assert_eq!(by_query.len(), 1);
        assert_eq!(by_query[0].meta.title, "Политика отпусков");
    }

    #[test]
    fn categories_create_list_delete() {
        let fx = fixture();
        let created = notes_create_category_impl(&fx.state, "Онбординг".to_string()).unwrap();
        assert!(created.iter().any(|c| c == "Онбординг"));

        // Idempotent create.
        notes_create_category_impl(&fx.state, "Онбординг".to_string()).unwrap();
        let listed = notes_list_categories_impl(&fx.state).unwrap();
        assert_eq!(listed, vec!["Онбординг".to_string()]);

        assert_eq!(
            notes_create_category_impl(&fx.state, "  ".to_string()).unwrap_err().code,
            "INVALID_INPUT"
        );

        let after_delete = notes_delete_category_impl(&fx.state, "Онбординг".to_string()).unwrap();
        assert!(after_delete.is_empty());
        assert!(notes_list_categories_impl(&fx.state).unwrap().is_empty());
    }

    #[test]
    fn imports_markdown_and_pdf() {
        let fx = fixture();

        let md = fx._dir.path().join("guide.md");
        std::fs::write(&md, "# Онбординг\n\nТекст.").unwrap();
        let note = notes_import_impl(&fx.state, SPACE.to_string(), md.to_string_lossy().into_owned()).unwrap();
        assert_eq!(note.meta.title, "guide");
        assert_eq!(note.meta.category, "Импорт");
        assert!(note.content.contains("Онбординг"));

        let pdf = fx._dir.path().join("doc.pdf");
        std::fs::write(&pdf, b"%PDF-1.4 fake").unwrap();
        let note = notes_import_impl(&fx.state, SPACE.to_string(), pdf.to_string_lossy().into_owned()).unwrap();
        assert!(note.content.starts_with("[Открыть PDF](attachment://"));
        assert!(fx._dir.path().join("attachments").is_dir());

        let exe = fx._dir.path().join("bad.exe");
        std::fs::write(&exe, b"MZ").unwrap();
        assert_eq!(
            notes_import_impl(&fx.state, SPACE.to_string(), exe.to_string_lossy().into_owned()).unwrap_err().code,
            "INVALID_INPUT"
        );
    }
}
