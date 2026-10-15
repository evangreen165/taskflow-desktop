use serde::Serialize;

/// Single error type shared by every Tauri command.
///
/// Serializes as `{ code, message, details? }` and is normalized on the
/// frontend into the unified `AppError` type of the `Result<T, AppError>` API.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl AppError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), details: None }
    }

    pub fn with_details(
        code: &'static str,
        message: impl Into<String>,
        details: impl Into<String>,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            details: Some(details.into()),
        }
    }

    pub fn io(context: impl std::fmt::Display, err: std::io::Error) -> Self {
        use std::io::ErrorKind as K;
        let code = match err.kind() {
            K::NotFound => "NOT_FOUND",
            K::AlreadyExists => "ALREADY_EXISTS",
            K::PermissionDenied => "PERMISSION_DENIED",
            _ => "IO",
        };
        Self::new(code, format!("{context}: {err}"))
    }

    pub fn parse(context: impl std::fmt::Display, err: &(impl std::fmt::Display + ?Sized)) -> Self {
        Self::new("PARSE", format!("{context}: {err}"))
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::io("IO", err)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::parse("JSON", &err)
    }
}

impl From<argon2::password_hash::Error> for AppError {
    fn from(err: argon2::password_hash::Error) -> Self {
        AppError::new("AUTH_HASH", err.to_string())
    }
}

impl From<notify::Error> for AppError {
    fn from(err: notify::Error) -> Self {
        AppError::new("WATCH", err.to_string())
    }
}

impl From<String> for AppError {
    fn from(message: String) -> Self {
        AppError::new("INTERNAL", message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn serializes_camel_case() {
        let err = AppError::new("NOT_FOUND", "missing");
        let v = serde_json::to_value(err).unwrap();
        assert_eq!(v, json!({ "code": "NOT_FOUND", "message": "missing" }));
    }

    #[test]
    fn details_are_optional() {
        let with = AppError::with_details("IO", "x", "y");
        assert_eq!(with.details.as_deref(), Some("y"));
        let v = serde_json::to_value(with).unwrap();
        assert!(v.get("details").is_some());
    }

    #[test]
    fn maps_io_kinds() {
        let e = AppError::io("ctx", std::io::Error::from(std::io::ErrorKind::NotFound));
        assert_eq!(e.code, "NOT_FOUND");
        let e = AppError::io("ctx", std::io::Error::from(std::io::ErrorKind::AlreadyExists));
        assert_eq!(e.code, "ALREADY_EXISTS");
        let e = AppError::io("ctx", std::io::Error::from(std::io::ErrorKind::Interrupted));
        assert_eq!(e.code, "IO");
    }
}