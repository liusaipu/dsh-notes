//! The small email payload shared with the DSH quick memo plugin.
//!
//! One message is one immutable note revision. The body is base64-encoded JSON
//! so the same message survives any IMAP server's transfer encoding unchanged.

use crate::store::Note;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteNote {
    #[serde(default)]
    pub v: u32,
    #[serde(default)]
    pub kind: String,
    pub id: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub rev_by: String,
    #[serde(default)]
    pub deleted: bool,
    #[serde(default)]
    pub images: Vec<Value>,
}

pub fn build_note_message(note: &Note, email: &str) -> Result<String, String> {
    let payload = json!({
        "v": 1,
        "kind": "note",
        "id": note.id,
        "text": note.text,
        "createdAt": note.created_at,
        "updatedAt": note.updated_at,
        "revBy": note.rev_by,
        "deleted": note.deleted,
        "images": note.images,
    });
    let body = BASE64.encode(
        serde_json::to_vec(&payload).map_err(|error| format!("序列化笔记失败：{error}"))?,
    );
    let message_id = Uuid::new_v4();
    Ok(format!(
        "From: \"Quick Memo\" <quick-memo@localhost>\r\n\
To: <{email}>\r\n\
Subject: [Quick Memo] note {note_id}\r\n\
Date: {date}\r\n\
Message-ID: <{message_id}@quick-memo.local>\r\n\
MIME-Version: 1.0\r\n\
Content-Type: text/plain; charset=utf-8\r\n\
Content-Transfer-Encoding: base64\r\n\
Auto-Submitted: auto-generated\r\n\
X-DSH-Memo: 1\r\n\
X-DSH-Kind: note\r\n\
X-DSH-Note-Id: {note_id}\r\n\
X-DSH-Note-Updated: {updated_at}\r\n\
X-DSH-Note-Device: {device}\r\n\
X-DSH-Note-Deleted: {deleted}\r\n\
\r\n\
{body}\r\n",
        email = sanitize_header(email),
        note_id = note.id,
        date = Utc::now().to_rfc2822(),
        updated_at = note.updated_at,
        device = sanitize_header(&note.rev_by),
        deleted = if note.deleted { 1 } else { 0 },
    ))
}

pub fn parse_note_message(raw: &[u8]) -> Result<RemoteNote, String> {
    let text = String::from_utf8_lossy(raw);
    let split = text
        .find("\r\n\r\n")
        .or_else(|| text.find("\n\n"))
        .ok_or_else(|| "邮件缺少头/正文分隔".to_string())?;
    let body = text[split..]
        .trim_start_matches(['\r', '\n'])
        .trim()
        .replace(['\r', '\n', ' ', '\t'], "");
    let bytes = BASE64
        .decode(body)
        .map_err(|error| format!("邮件正文不是有效的 base64：{error}"))?;
    let note: RemoteNote =
        serde_json::from_slice(&bytes).map_err(|error| format!("邮件 JSON 解析失败：{error}"))?;
    if note.id.trim().is_empty() || note.updated_at <= 0 || note.rev_by.trim().is_empty() {
        return Err("邮件不是有效的笔记修订".to_string());
    }
    Ok(note)
}

fn sanitize_header(value: &str) -> String {
    value
        .chars()
        .filter(|character| !matches!(character, '\r' | '\n' | '<' | '>'))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_a_note_message() {
        let note = Note {
            id: "note-1".into(),
            text: "hello #desktop".into(),
            created_at: 100,
            updated_at: 200,
            rev_by: "device-a".into(),
            deleted: false,
            synced_rev: None,
            images: vec![json!({"id": "img-1", "mime": "image/png", "data": "AA=="})],
        };
        let raw = build_note_message(&note, "me@example.com").unwrap();
        let parsed = parse_note_message(raw.as_bytes()).unwrap();
        assert_eq!(parsed.id, "note-1");
        assert_eq!(parsed.text, "hello #desktop");
        assert_eq!(parsed.updated_at, 200);
        assert_eq!(parsed.rev_by, "device-a");
        assert!(!parsed.deleted);
        assert_eq!(parsed.images.len(), 1);
        assert_eq!(parsed.images[0]["id"], "img-1");
    }

    #[test]
    fn round_trips_a_tombstone() {
        let note = Note {
            id: "note-2".into(),
            text: String::new(),
            created_at: 1,
            updated_at: 2,
            rev_by: "device-b".into(),
            deleted: true,
            synced_rev: None,
            images: Vec::new(),
        };
        let raw = build_note_message(&note, "me@example.com").unwrap();
        assert!(parse_note_message(raw.as_bytes()).unwrap().deleted);
    }
}
