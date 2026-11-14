//! Minimal IMAP sync for the desktop app.
//!
//! The mailbox folder is an append-only log of note revisions, exactly like the
//! DSH plugin. This first version fetches the folder and merges by
//! `(updatedAt, revBy)`; incremental UID ranges and image payloads come next.

use crate::mime::{build_note_message, parse_note_message, RemoteNote};
use crate::store::{revision, Account, Store};
use chrono::Utc;
use imap::ClientBuilder;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

const KEYRING_SERVICE: &str = "dsh-quicknotes";
const DEFAULT_FOLDER: &str = "DSH Notes";
const MAX_PUSH_PER_SYNC: usize = 40;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInput {
    pub email: String,
    pub password: String,
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub port: u16,
    #[serde(default)]
    pub folder: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutcome {
    pub fetched: usize,
    pub pushed: usize,
    pub last_sync_at: i64,
}

pub fn verify_and_save(store: Arc<Mutex<Store>>, input: AccountInput) -> Result<(), String> {
    let account = normalize_account(&input)?;
    let client = ClientBuilder::new(&account.host, account.port)
        .connect()
        .map_err(|error| format!("连接失败：{error}"))?;
    let mut session = client
        .login(&account.email, &input.password)
        .map_err(|(error, _)| format!("登录失败：{error}"))?;
    ensure_folder(&mut session, &account.folder)?;
    let _ = session.logout();

    save_password(&account.email, &input.password)?;
    let mut guard = store.lock().map_err(|_| "本地存储锁失败".to_string())?;
    let previous = guard.account();
    guard.set_account(account.clone())?;
    drop(guard);

    if let Some(previous) = previous {
        if previous.email != account.email {
            delete_password(&previous.email);
        }
    }
    Ok(())
}

pub fn disconnect(store: Arc<Mutex<Store>>) -> Result<(), String> {
    let mut guard = store.lock().map_err(|_| "本地存储锁失败".to_string())?;
    if let Some(account) = guard.account() {
        guard.clear_account()?;
        drop(guard);
        delete_password(&account.email);
    } else {
        guard.clear_account()?;
    }
    Ok(())
}

pub fn sync(store: Arc<Mutex<Store>>) -> Result<SyncOutcome, String> {
    let account = {
        let guard = store.lock().map_err(|_| "本地存储锁失败".to_string())?;
        guard.account()
    }
    .ok_or_else(|| "还没有连接邮箱".to_string())?;

    let password = load_password(&account.email)
        .map_err(|_| "邮箱密码未保存，请重新连接邮箱".to_string())?;

    let result = sync_inner(store.clone(), &account, &password);
    if let Err(error) = &result {
        if let Ok(mut guard) = store.lock() {
            guard.set_sync_error(error);
        }
    }
    result
}

fn sync_inner(
    store: Arc<Mutex<Store>>,
    account: &Account,
    password: &str,
) -> Result<SyncOutcome, String> {
    let client = ClientBuilder::new(&account.host, account.port)
        .connect()
        .map_err(|error| format!("连接失败：{error}"))?;
    let mut session = client
        .login(&account.email, password)
        .map_err(|(error, _)| format!("登录失败：{error}"))?;

    ensure_folder(&mut session, &account.folder)?;
    let uids = session
        .uid_search("ALL")
        .map_err(|error| format!("读取邮件目录失败：{error}"))?;
    let max_uid = uids.iter().copied().max().unwrap_or(0);

    let mut remote_notes: Vec<RemoteNote> = Vec::new();
    if !uids.is_empty() {
        let messages = session
            .uid_fetch("1:*", "BODY.PEEK[]")
            .map_err(|error| format!("读取笔记邮件失败：{error}"))?;
        for message in messages.iter() {
            if let Some(body) = message.body() {
                if let Ok(note) = parse_note_message(body) {
                    remote_notes.push(note);
                }
            }
        }
    }

    let pending = {
        let mut guard = store.lock().map_err(|_| "本地存储锁失败".to_string())?;
        for note in &remote_notes {
            guard.merge_remote(note);
        }
        guard.save()?;
        guard.pending_notes(MAX_PUSH_PER_SYNC)
    };

    let mut pushed = 0usize;
    for note in pending {
        let pushed_rev = revision(&note);
        let raw = build_note_message(&note, &account.email)?;
        session
            .append(&account.folder, raw.as_bytes())
            .finish()
            .map_err(|error| format!("写入笔记失败：{error}"))?;
        let mut guard = store.lock().map_err(|_| "本地存储锁失败".to_string())?;
        guard.mark_synced(&note.id, &pushed_rev);
        guard.save()?;
        pushed += 1;
    }

    let now = Utc::now().timestamp_millis();
    {
        let mut guard = store.lock().map_err(|_| "本地存储锁失败".to_string())?;
        guard.finish_sync(max_uid, now, None);
    }
    let _ = session.logout();

    Ok(SyncOutcome {
        fetched: remote_notes.len(),
        pushed,
        last_sync_at: now,
    })
}

fn ensure_folder<T: std::io::Read + std::io::Write>(
    session: &mut imap::Session<T>,
    folder: &str,
) -> Result<(), String> {
    let names = session
        .list(None, Some("*"))
        .map_err(|error| format!("读取邮箱目录失败：{error}"))?;
    let exists = names.iter().any(|name| name.name() == folder);
    if !exists {
        session
            .create(folder)
            .map_err(|error| format!("创建同步文件夹失败：{error}"))?;
    }
    session
        .select(folder)
        .map_err(|error| format!("打开同步文件夹失败：{error}"))?;
    Ok(())
}

fn normalize_account(input: &AccountInput) -> Result<Account, String> {
    let email = input.email.trim().to_lowercase();
    if !email.contains('@') || email.len() < 3 {
        return Err("请输入有效的邮箱地址".to_string());
    }
    if input.password.is_empty() {
        return Err("请输入应用专用密码或授权码".to_string());
    }
    if has_control(&email) {
        return Err("邮箱地址包含非法字符".to_string());
    }
    let folder = if input.folder.trim().is_empty() {
        DEFAULT_FOLDER.to_string()
    } else {
        input.folder.trim().to_string()
    };
    if folder.len() > 80 || has_control(&folder) {
        return Err("同步文件夹名称不合法".to_string());
    }
    let host_input = input.host.trim().trim_start_matches("imap://");
    let host = if host_input.is_empty() {
        guess_host(&email)
    } else {
        host_input
            .trim_end_matches('/')
            .split(':')
            .next()
            .unwrap_or("")
            .to_lowercase()
    };
    if host.is_empty() || !host.contains('.') || has_control(&host) {
        return Err("IMAP 服务器地址不正确".to_string());
    }
    let port = if input.port == 0 { 993 } else { input.port };
    Ok(Account {
        email,
        host,
        port,
        secure: true,
        folder,
        connected_at: Utc::now().timestamp_millis(),
    })
}

fn guess_host(email: &str) -> String {
    let domain = email.split('@').nth(1).unwrap_or("");
    match domain {
        "gmail.com" | "googlemail.com" => "imap.gmail.com",
        "icloud.com" | "me.com" | "mac.com" => "imap.mail.me.com",
        "qq.com" | "foxmail.com" | "vip.qq.com" => "imap.qq.com",
        "163.com" | "126.com" | "yeah.net" => "imap.163.com",
        "outlook.com" | "hotmail.com" | "live.com" => "outlook.office365.com",
        other => return format!("imap.{other}"),
    }
    .to_string()
}

fn save_password(email: &str, password: &str) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, email)
        .map_err(|error| format!("打开系统凭据失败：{error}"))?;
    entry
        .set_password(password)
        .map_err(|error| format!("保存邮箱密码失败：{error}"))
}

fn load_password(email: &str) -> Result<String, String> {
    let entry = Entry::new(KEYRING_SERVICE, email)
        .map_err(|error| format!("打开系统凭据失败：{error}"))?;
    entry
        .get_password()
        .map_err(|error| format!("读取邮箱密码失败：{error}"))
}

fn delete_password(email: &str) {
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, email) {
        let _ = entry.delete_credential();
    }
}

fn has_control(value: &str) -> bool {
    value.chars().any(char::is_control)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_store(name: &str) -> (Arc<Mutex<Store>>, PathBuf) {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("quick-memo-sync-{name}-{stamp}.json"));
        let store = Store::open(path.clone()).unwrap();
        (Arc::new(Mutex::new(store)), path)
    }

    #[test]
    #[ignore = "requires a disposable IMAP test mailbox in environment variables"]
    fn live_sync_between_two_local_stores() {
        let email = std::env::var("QUICK_MEMO_TEST_EMAIL").expect("QUICK_MEMO_TEST_EMAIL");
        let password = std::env::var("QUICK_MEMO_TEST_PASSWORD").expect("QUICK_MEMO_TEST_PASSWORD");
        let host = std::env::var("QUICK_MEMO_TEST_HOST").unwrap_or_else(|_| "imap.ethereal.email".into());
        let port = std::env::var("QUICK_MEMO_TEST_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(993);
        let folder = std::env::var("QUICK_MEMO_TEST_FOLDER").expect("QUICK_MEMO_TEST_FOLDER");
        let account = Account {
            email: email.clone(),
            host,
            port,
            secure: true,
            folder,
            connected_at: Utc::now().timestamp_millis(),
        };

        let (first, first_path) = temp_store("first");
        {
            let mut store = first.lock().unwrap();
            store.set_account(account.clone()).unwrap();
            store.create_note("desktop live sync").unwrap();
        }
        let first_result = sync_inner(first.clone(), &account, &password).unwrap();
        assert!(first_result.pushed >= 1);
        assert_eq!(first.lock().unwrap().snapshot().pending, 0);

        let (second, second_path) = temp_store("second");
        {
            let mut store = second.lock().unwrap();
            store.set_account(account.clone()).unwrap();
        }
        let second_result = sync_inner(second.clone(), &account, &password).unwrap();
        assert!(second_result.fetched >= 1);
        let snapshot = second.lock().unwrap().snapshot();
        assert!(snapshot.notes.iter().any(|note| note.text == "desktop live sync"));
        assert_eq!(snapshot.pending, 0);

        std::fs::remove_file(first_path).ok();
        std::fs::remove_file(second_path).ok();
    }
}
