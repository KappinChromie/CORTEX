use regex::Regex;
use std::sync::OnceLock;

static REDACTION_REGEXES: OnceLock<Vec<(Regex, &'static str)>> = OnceLock::new();

fn get_regexes() -> &'static Vec<(Regex, &'static str)> {
    REDACTION_REGEXES.get_or_init(|| {
        vec![
            // OpenAI / Anthropic / Generic API keys
            (Regex::new(r"sk-[A-Za-z0-9_\-]{20,}").unwrap(), "[REDACTED_API_KEY]"),
            (Regex::new(r"sk-ant-[A-Za-z0-9_\-]{20,}").unwrap(), "[REDACTED_API_KEY]"),
            // Bearer tokens
            (Regex::new(r"(?i)bearer\s+[A-Za-z0-9_\-\.]{20,}").unwrap(), "Bearer [REDACTED_TOKEN]"),
            // Email addresses
            (Regex::new(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+").unwrap(), "[REDACTED_EMAIL]"),
            // Passwords or tokens in key-value config lines
            (Regex::new(r#"(?i)(password|secret|api_key|token|access_token|private_key)["':\s=]+[^\s"',;]{6,}"#).unwrap(), "$1: [REDACTED]"),
            // JWT tokens
            (Regex::new(r"eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+").unwrap(), "[REDACTED_JWT]"),
        ]
    })
}

/// Redact sensitive patterns (API keys, tokens, emails, passwords) and clamp to max chars.
pub fn redact_and_truncate(input: &str, max_chars: usize) -> String {
    let mut redacted = input.to_string();
    for (re, replacement) in get_regexes() {
        redacted = re.replace_all(&redacted, *replacement).to_string();
    }
    
    // Normalize excessive whitespace/newlines
    let trimmed = redacted.trim();
    if trimmed.chars().count() > max_chars {
        let mut truncated: String = trimmed.chars().take(max_chars).collect();
        truncated.push_str("...");
        truncated
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redaction_api_keys() {
        let raw = "Use API key sk-proj-1234567890abcdefghijklmnopqrstuvwxyz to authenticate.";
        let res = redact_and_truncate(raw, 300);
        assert!(!res.contains("sk-proj"));
        assert!(res.contains("[REDACTED_API_KEY]"));
    }

    #[test]
    fn test_redaction_email() {
        let raw = "Contact me at alice.smith+agent@example.com for help.";
        let res = redact_and_truncate(raw, 300);
        assert!(!res.contains("alice.smith"));
        assert!(res.contains("[REDACTED_EMAIL]"));
    }

    #[test]
    fn test_truncation() {
        let long_str = "a".repeat(500);
        let res = redact_and_truncate(&long_str, 300);
        assert!(res.len() <= 305); // 300 chars + "..."
        assert!(res.ends_with("..."));
    }
}
