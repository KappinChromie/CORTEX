use sha2::{Digest, Sha256};

/// Normalizes any file path or file URI into a unified, cross-platform canonical form.
/// On Windows: case-folds, normalizes drive letter (lowercase, e.g. "c:"),
/// uses standard backslashes, strips trailing slashes, and decodes URI escaping.
pub fn normalize_project_path(raw: &str) -> String {
    let mut s = raw.trim().to_string();

    // Strip file:// or file:/// prefix
    if s.starts_with("file:///") {
        s = s[8..].to_string();
    } else if s.starts_with("file://") {
        s = s[7..].to_string();
    }

    // URL decode if needed (e.g. %3A -> :, %20 -> space)
    if let Ok(decoded) = urlencoding::decode(&s) {
        s = decoded.into_owned();
    }

    // Strip leading slash before Windows drive letter (e.g. "/C:/Users" -> "C:/Users")
    if s.starts_with('/') && s.len() >= 3 && s.chars().nth(2) == Some(':') {
        s = s[1..].to_string();
    }

    // Standardize slashes to backslashes
    s = s.replace('/', "\\");

    // Case-fold drive letter and full path on Windows
    s = s.to_lowercase();

    // Strip trailing backslashes
    while s.ends_with('\\') && s.len() > 3 {
        s.pop();
    }

    s
}

/// Computes a stable, deterministic NodeId for a project from its normalized path.
pub fn project_node_id(normalized_path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(normalized_path.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    format!("project:{}", &hash[..16])
}

/// Extracts a human-friendly project display name from a normalized path.
pub fn project_title_from_path(normalized_path: &str) -> String {
    if let Some(pos) = normalized_path.rfind('\\') {
        let name = &normalized_path[pos + 1..];
        if !name.is_empty() {
            return name.to_string();
        }
    }
    normalized_path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_project_path_windows() {
        let p1 = "file:///c%3A/Users/luche/Documents/projects/0WEBSITEGAME";
        let p2 = r"C:\Users\luche\Documents\projects\0WEBSITEGAME\";
        let p3 = "c:/users/luche/documents/projects/0websitegame";

        let norm1 = normalize_project_path(p1);
        let norm2 = normalize_project_path(p2);
        let norm3 = normalize_project_path(p3);

        assert_eq!(norm1, norm2);
        assert_eq!(norm2, norm3);
        assert_eq!(norm1, r"c:\users\luche\documents\projects\0websitegame");
    }

    #[test]
    fn test_project_node_id_stable() {
        let p1 = normalize_project_path("file:///c%3A/Users/luche/Documents/projects/0WEBSITEGAME");
        let p2 = normalize_project_path(r"C:\Users\luche\Documents\projects\0WEBSITEGAME");
        assert_eq!(project_node_id(&p1), project_node_id(&p2));
    }
}
