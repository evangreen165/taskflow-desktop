use serde::Serialize;
use tauri::State;

use crate::error::AppError;
use crate::notes::{self, NoteMeta, NoteStatus};
use crate::roles;
use crate::session::Session;
use crate::tasks::{self, Task, TaskStatus};
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub total_tasks: usize,
    pub in_progress: usize,
    pub completed_this_week: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub my_active_tasks: Vec<Task>,
    pub my_tasks_today: Vec<Task>,
    pub my_overdue_tasks: Vec<Task>,
    pub recent_articles: Vec<NoteMeta>,
    pub stats: DashboardStats,
}

fn parse_date(value: &str) -> Option<chrono::NaiveDate> {
    value
        .get(..10)
        .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
}

fn is_finished(status: TaskStatus) -> bool {
    matches!(status, TaskStatus::Done | TaskStatus::Rejected)
}

fn is_visible(session: &Session, view_all: bool, task: &Task) -> bool {
    view_all
        || task.assignees.iter().any(|a| a == &session.user_id)
        || task.author_id == session.user_id
}

pub fn dashboard_summary_impl(
    state: &AppState,
    space_id: Option<String>,
) -> Result<DashboardSummary, AppError> {
    let session = state.require_auth()?;
    let root = state.root()?;
    let permissions = roles::permissions_for(&root, &session.role_id)?;
    let view_all = permissions.iter().any(|p| p == "task.view_all");
    let can_view_articles = permissions.iter().any(|p| p == "article.view");

    let accessible: Vec<crate::spaces::Space> = if let Some(id) = &space_id {
        vec![crate::spaces::require_access(&root, id, &session)?]
    } else {
        let all_spaces = crate::spaces::list(&root)?;
        if crate::spaces::is_admin(&session) {
            all_spaces
        } else {
            all_spaces
                .into_iter()
                .filter(|space| crate::spaces::is_member(space, &session.user_id))
                .collect()
        }
    };

    let mut all_tasks = Vec::new();
    let mut all_notes = Vec::new();
    let mut accessible_ids = std::collections::HashSet::new();
    for space in &accessible {
        accessible_ids.insert(space.id.clone());
        let Ok(space_dir) = crate::spaces::space_dir(&root, &space.id) else {
            continue;
        };
        if let Ok(mut tasks) = tasks::list(&space_dir) {
            for task in &mut tasks {
                task.space_id = Some(space.id.clone());
                task.space_name = Some(space.name.clone());
            }
            all_tasks.append(&mut tasks);
        }
        if can_view_articles {
            if let Ok(mut notes) = notes::list_meta(&space_dir) {
                all_notes.append(&mut notes);
            }
        }
    }

    // Notes from other spaces explicitly shared with an accessible space.
    if can_view_articles {
        let mut seen: std::collections::HashSet<String> =
            all_notes.iter().map(|note| note.id.clone()).collect();
        if let Ok(all_spaces) = crate::spaces::list(&root) {
            for space in all_spaces {
                if accessible_ids.contains(&space.id) {
                    continue;
                }
                let Ok(dir) = crate::spaces::space_dir(&root, &space.id) else {
                    continue;
                };
                let Ok(metas) = notes::list_meta(&dir) else {
                    continue;
                };
                for meta in metas {
                    if seen.contains(&meta.id) {
                        continue;
                    }
                    if meta
                        .shared_with_spaces
                        .iter()
                        .any(|s| accessible_ids.contains(s))
                    {
                        seen.insert(meta.id.clone());
                        all_notes.push(meta);
                    }
                }
            }
        }
    }

    let visible_tasks: Vec<Task> = all_tasks
        .into_iter()
        .filter(|task| is_visible(&session, view_all, task))
        .collect();

    let today = chrono::Local::now().date_naive();
    let my_active_tasks: Vec<Task> = visible_tasks
        .iter()
        .filter(|task| !is_finished(task.status))
        .cloned()
        .collect();
    let mut my_tasks_today = Vec::new();
    let mut my_overdue_tasks = Vec::new();
    for task in &visible_tasks {
        if is_finished(task.status) {
            continue;
        }
        match task.due_date.as_deref().and_then(parse_date) {
            Some(date) if date == today => my_tasks_today.push(task.clone()),
            Some(date) if date < today => my_overdue_tasks.push(task.clone()),
            _ => {}
        }
    }
    my_tasks_today.sort_by(|a, b| b.due_date.cmp(&a.due_date));
    my_overdue_tasks.sort_by(|a, b| b.due_date.cmp(&a.due_date));

    let cutoff = chrono::Utc::now() - chrono::Duration::days(7);
    let completed_this_week = visible_tasks
        .iter()
        .filter(|task| {
            task.status == TaskStatus::Done
                && chrono::DateTime::parse_from_rfc3339(&task.updated_at)
                    .map(|dt| dt.with_timezone(&chrono::Utc) >= cutoff)
                    .unwrap_or(false)
        })
        .count();
    let stats = DashboardStats {
        total_tasks: visible_tasks.len(),
        in_progress: visible_tasks
            .iter()
            .filter(|task| task.status == TaskStatus::InProgress)
            .count(),
        completed_this_week,
    };

    let recent_articles = if can_view_articles {
        all_notes.retain(|meta| meta.status == NoteStatus::Published);
        all_notes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        all_notes.truncate(5);
        all_notes
    } else {
        Vec::new()
    };

    Ok(DashboardSummary {
        my_active_tasks,
        my_tasks_today,
        my_overdue_tasks,
        recent_articles,
        stats,
    })
}

#[tauri::command(rename = "dashboardSummary")]
pub fn dashboard_summary(
    state: State<'_, AppState>,
    space_id: Option<String>,
) -> Result<DashboardSummary, AppError> {
    dashboard_summary_impl(&state, space_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::Session;
    use crate::users::{self, UserInfo};
    use crate::workspace;
    use serde_json::json;
    use tempfile::tempdir;

    const SPACE: &str = "default";

    struct Fixture {
        _dir: tempfile::TempDir,
        state: AppState,
        admin: UserInfo,
        executor: UserInfo,
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
        let info = workspace::init(dir.path(), "Dash").unwrap();
        let admin =
            users::create(dir.path(), "admin", "password123", "Admin", "admin", None).unwrap();
        let executor =
            users::create(dir.path(), "ex", "password123", "Executor", "executor", None).unwrap();
        let space = crate::spaces::Space {
            id: SPACE.to_string(),
            name: "Основное".to_string(),
            description: String::new(),
            created_at: crate::audit::now_rfc3339(),
            owner_id: admin.id.clone(),
            members: vec![admin.id.clone(), executor.id.clone()],
        };
        crate::spaces::write_space(dir.path(), &space).unwrap();
        let state = AppState::new("m".into());
        state.set_workspace(dir.path().to_path_buf(), info);
        state.set_session(session_for(&admin.id, "admin"));
        Fixture {
            _dir: dir,
            state,
            admin,
            executor,
        }
    }

    fn make_task(fx: &Fixture, title: &str, status: &str, due: &str, assignees: &[&str]) -> Task {
        crate::tasks::create(
            &crate::spaces::space_dir(fx._dir.path(), SPACE).unwrap(),
            &fx.admin.id,
            serde_json::from_value(json!({
                "title": title,
                "status": status,
                "dueDate": due,
                "assignees": assignees,
            }))
            .unwrap(),
        )
        .unwrap()
    }

    #[test]
    fn dashboard_splits_tasks_by_due_date() {
        let fx = fixture();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
            .format("%Y-%m-%d")
            .to_string();
        let tomorrow = (chrono::Local::now() + chrono::Duration::days(1))
            .format("%Y-%m-%d")
            .to_string();

        let ex_id = fx.executor.id.clone();
        make_task(&fx, "Без срока", "new", "", &[&ex_id]);
        make_task(&fx, "Сегодня", "new", &today, &[&ex_id]);
        make_task(&fx, "Просрочена", "new", &yesterday, &[&ex_id]);
        make_task(&fx, "Позже", "new", &tomorrow, &[&ex_id]);
        make_task(&fx, "Готова", "done", &yesterday, &[&ex_id]);

        fx.state.set_session(session_for(&fx.executor.id, "executor"));
        let summary = dashboard_summary_impl(&fx.state, None).unwrap();
        let active_titles: Vec<&str> =
            summary.my_active_tasks.iter().map(|t| t.title.as_str()).collect();
        assert!(active_titles.contains(&"Без срока"));
        assert!(active_titles.contains(&"Позже"));
        assert!(!active_titles.contains(&"Готова"));
        let today_titles: Vec<&str> =
            summary.my_tasks_today.iter().map(|t| t.title.as_str()).collect();
        let overdue_titles: Vec<&str> =
            summary.my_overdue_tasks.iter().map(|t| t.title.as_str()).collect();
        assert_eq!(today_titles, vec!["Сегодня"]);
        assert_eq!(overdue_titles, vec!["Просрочена"]);
        assert_eq!(summary.stats.total_tasks, 5);
        assert_eq!(summary.stats.in_progress, 0);
        assert_eq!(summary.stats.completed_this_week, 1);
    }

    #[test]
    fn dashboard_scopes_tasks_by_permission() {
        let fx = fixture();
        make_task(&fx, "Моя", "new", "2999-01-01", &[&fx.executor.id.clone()]);
        make_task(&fx, "Чужая", "new", "2999-01-01", &[]);

        fx.state.set_session(session_for(&fx.executor.id, "executor"));
        let summary = dashboard_summary_impl(&fx.state, None).unwrap();
        assert_eq!(summary.stats.total_tasks, 1);

        fx.state.set_session(session_for(&fx.admin.id, "admin"));
        let summary = dashboard_summary_impl(&fx.state, None).unwrap();
        assert_eq!(summary.stats.total_tasks, 2);
    }

    #[test]
    fn recent_articles_are_published_only() {
        let fx = fixture();
        crate::notes::create(&crate::spaces::space_dir(fx._dir.path(), SPACE).unwrap(), &fx.admin.id, "Draft", "Процессы", "x").unwrap();
        let first = crate::notes::create(&crate::spaces::space_dir(fx._dir.path(), SPACE).unwrap(), &fx.admin.id, "One", "Процессы", "x").unwrap();
        crate::notes::publish(&crate::spaces::space_dir(fx._dir.path(), SPACE).unwrap(), &first.meta.id, 1).unwrap();
        let second = crate::notes::create(&crate::spaces::space_dir(fx._dir.path(), SPACE).unwrap(), &fx.admin.id, "Two", "Процессы", "x").unwrap();
        crate::notes::publish(&crate::spaces::space_dir(fx._dir.path(), SPACE).unwrap(), &second.meta.id, 1).unwrap();

        let summary = dashboard_summary_impl(&fx.state, None).unwrap();
        let titles: Vec<&str> = summary
            .recent_articles
            .iter()
            .map(|m| m.title.as_str())
            .collect();
        assert_eq!(titles.len(), 2);
        assert!(titles.contains(&"One"));
        assert!(!titles.contains(&"Draft"));
    }
}
