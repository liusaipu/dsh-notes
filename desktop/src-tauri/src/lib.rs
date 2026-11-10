//! Quick Memo desktop spike.
//!
//! The first milestone is deliberately narrow: prove that the Rust side can
//! speak IMAP, create a test folder, append one note message that carries an
//! image, read it back, and decode the same payload the DSH plugin uses.
//! The full local store, sync loop and UI will be layered on this.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::Utc;
use imap::ClientBuilder;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

/// A 1x1 transparent-ish PNG used only to prove that image payloads survive
/// the IMAP round trip. The full app will replace this with the user's image.
const SPIKE_PNG_BASE64: &str =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

#[derive(Debug, Deserialize)]
struct ProbeRequest {
    email: String,
    password: String,
    host: String,
    port: u16,
    folder: String,
}

#[derive(Debug, Serialize)]
struct ProbeResult {
    host: String,
    port: u16,
    folder: String,
    created: bool,
    uid: Option<u32>,
    message_bytes: usize,
    image_bytes: usize,
    note_text: String,
    mailboxes: Vec<String>,
}

#[tauri::command]
async fn imap_probe(request: ProbeRequest) -> Result<ProbeResult, String> {
    tauri::async_runtime::spawn_blocking(move || probe(request))
        .await
        .map_err(|error| format!("后台任务失败：{error}"))?
}

fn probe(request: ProbeRequest) -> Result<ProbeResult, String> {
    let email = request.email.trim().to_string();
    let host = request.host.trim().to_string();
    let folder = request.folder.trim().to_string();
    if email.is_empty() || !email.contains('@') {
        return Err("请输入有效的邮箱地址".into());
    }
    if request.password.is_empty() {
        return Err("请输入应用专用密码或授权码".into());
    }
    if host.is_empty() {
        return Err("IMAP 服务器不能为空".into());
    }
    if folder.is_empty() {
        return Err("测试文件夹不能为空".into());
    }
    if folder == "DSH Notes" {
        return Err("技术验证请使用独立文件夹，例如 DSH Notes Spike，避免写入正式笔记目录".into());
    }
    if has_control(&email) || has_control(&host) || has_control(&folder) {
        return Err("输入包含非法控制字符".into());
    }

    let client = ClientBuilder::new(&host, request.port)
        .connect()
        .map_err(|error| format!("连接失败：{error}"))?;
    let mut session = client
        .login(&email, &request.password)
        .map_err(|(error, _)| format!("登录失败：{error}"))?;

    let names = session
        .list(None, Some("*"))
        .map_err(|error| format!("读取邮箱目录失败：{error}"))?;
    let mailboxes: Vec<String> = names.iter().map(|name| name.name().to_string()).collect();
    let existed = mailboxes.iter().any(|name| name == &folder);
    if !existed {
        session
            .create(&folder)
            .map_err(|error| format!("创建测试文件夹失败：{error}"))?;
    }

    session
        .select(&folder)
        .map_err(|error| format!("打开测试文件夹失败：{error}"))?;

    let now = Utc::now().timestamp_millis();
    let note_id = Uuid::new_v4().to_string();
    let image_id = Uuid::new_v4().to_string();
    let text = format!("Tauri spike #tauri\n\n![spike](dsh-image:{image_id})");
    let payload = json!({
        "v": 1,
        "kind": "note",
        "id": note_id,
        "text": text,
        "createdAt": now,
        "updatedAt": now,
        "revBy": "quick-memo-spike",
        "deleted": false,
        "images": [{
            "id": image_id,
            "mime": "image/png",
            "data": SPIKE_PNG_BASE64
        }]
    });
    let body = BASE64.encode(serde_json::to_vec(&payload).map_err(|error| format!("序列化失败：{error}"))?);
    let raw = format!(
        "From: \"Quick Memo\" <quick-memo@localhost>\r\n\
To: <{email}>\r\n\
Subject: [Quick Memo] Tauri spike\r\n\
Date: {date}\r\n\
Message-ID: <{note_id}@quick-memo.local>\r\n\
MIME-Version: 1.0\r\n\
Content-Type: text/plain; charset=utf-8\r\n\
Content-Transfer-Encoding: base64\r\n\
Auto-Submitted: auto-generated\r\n\
X-DSH-Memo: 1\r\n\
X-DSH-Kind: note\r\n\
X-DSH-Note-Id: {note_id}\r\n\
X-DSH-Note-Updated: {now}\r\n\
X-DSH-Note-Device: quick-memo-spike\r\n\
X-DSH-Note-Deleted: 0\r\n\
\r\n\
{body}\r\n",
        date = Utc::now().to_rfc2822(),
        email = sanitize_header(&email),
    );

    session
        .append(&folder, raw.as_bytes())
        .finish()
        .map_err(|error| format!("写入测试笔记失败：{error}"))?;

    let mut uids: Vec<u32> = session
        .uid_search("ALL")
        .map_err(|error| format!("检索测试笔记失败：{error}"))?
        .into_iter()
        .collect();
    uids.sort_unstable();
    let uid = uids.last().copied();

    let fetched = match uid {
        Some(uid) => session
            .uid_fetch(uid.to_string(), "BODY.PEEK[]")
            .map_err(|error| format!("读回测试笔记失败：{error}"))?,
        None => return Err("写入后没有找到测试邮件".into()),
    };
    let message = fetched
        .iter()
        .next()
        .ok_or_else(|| "读回结果为空".to_string())?;
    let raw_body = message
        .body()
        .ok_or_else(|| "读回的邮件没有正文".to_string())?;

    let (note_text, image_bytes) = decode_note(raw_body)?;
    let _ = session.logout();

    Ok(ProbeResult {
        host,
        port: request.port,
        folder,
        created: !existed,
        uid,
        message_bytes: raw.len(),
        image_bytes,
        note_text,
        mailboxes,
    })
}

fn decode_note(raw: &[u8]) -> Result<(String, usize), String> {
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
        .map_err(|error| format!("测试邮件正文不是有效的 base64：{error}"))?;
    let payload: Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("测试邮件 JSON 解析失败：{error}"))?;
    let note_text = payload
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let mut image_bytes = 0usize;
    if let Some(images) = payload.get("images").and_then(Value::as_array) {
        for image in images {
            if let Some(data) = image.get("data").and_then(Value::as_str) {
                if let Ok(decoded) = BASE64.decode(data) {
                    image_bytes += decoded.len();
                }
            }
        }
    }
    Ok((note_text, image_bytes))
}

fn sanitize_header(value: &str) -> String {
    value
        .chars()
        .filter(|character| !matches!(character, '\r' | '\n' | '<' | '>'))
        .collect()
}

fn has_control(value: &str) -> bool {
    value.chars().any(|character| character.is_control())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![imap_probe])
        .run(tauri::generate_context!())
        .expect("error while running Quick Memo");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_a_note_payload_with_an_image() {
        let payload = json!({
            "v": 1,
            "kind": "note",
            "id": "test-note",
            "text": "hello #tauri\n\n![spike](dsh-image:test-image)",
            "createdAt": 1,
            "updatedAt": 2,
            "revBy": "spike",
            "deleted": false,
            "images": [{
                "id": "test-image",
                "mime": "image/png",
                "data": SPIKE_PNG_BASE64
            }]
        });
        let body = BASE64.encode(serde_json::to_vec(&payload).unwrap());
        let raw = format!(
            "X-DSH-Memo: 1\r\nContent-Type: text/plain\r\n\r\n{body}\r\n"
        );
        let (text, image_bytes) = decode_note(raw.as_bytes()).unwrap();
        assert_eq!(text, "hello #tauri\n\n![spike](dsh-image:test-image)");
        assert_eq!(image_bytes, 68);
    }

    #[test]
    fn rejects_a_non_json_body() {
        let raw = "X-DSH-Memo: 1\r\n\r\nbm90IGpzb24=\r\n";
        assert!(decode_note(raw.as_bytes()).is_err());
    }

    #[test]
    #[ignore = "requires a disposable test mailbox in environment variables"]
    fn live_imap_roundtrip() {
        let email = std::env::var("QUICK_MEMO_TEST_EMAIL").expect("QUICK_MEMO_TEST_EMAIL");
        let password = std::env::var("QUICK_MEMO_TEST_PASSWORD").expect("QUICK_MEMO_TEST_PASSWORD");
        let host = std::env::var("QUICK_MEMO_TEST_HOST").unwrap_or_else(|_| "imap.ethereal.email".into());
        let port = std::env::var("QUICK_MEMO_TEST_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(993);
        let folder = std::env::var("QUICK_MEMO_TEST_FOLDER").expect("QUICK_MEMO_TEST_FOLDER");
        let result = probe(ProbeRequest {
            email,
            password,
            host,
            port,
            folder,
        })
        .expect("IMAP roundtrip failed");
        assert!(result.note_text.contains("Tauri spike"));
        assert_eq!(result.image_bytes, 68);
        println!("live roundtrip OK: uid={:?} message_bytes={}", result.uid, result.message_bytes);
    }
}
