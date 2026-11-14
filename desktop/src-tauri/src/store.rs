//! Local-first note store for the desktop app.
//!
//! The file format mirrors the DSH plugin's note model closely enough that the
//! same mailbox revisions can be merged: a note is a small JSON object with a
//! last-write-wins `(updatedAt, revBy)` pair and an optional tombstone.

use crate::mime::RemoteNote;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const TEXT_LIMIT: usize = 20_000;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub text: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub rev_by: String,
    pub deleted: bool,
    #[serde(default)]
    pub synced_rev: Option<String>,
    /// Raw `images` payloads from a remote revision. The desktop UI does not
    /// render them yet, but keeping them means an edit never strips the bytes
    /// that another device uploaded.
    #[serde(default)]
    pub images: Vec<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub email: String,
    pub host: String,
    pub port: u16,
    pub secure: bool,
    pub folder: String,
    pub connected_at: i64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    pub account: Option<Account>,
    #[serde(default)]
    pub last_sync_at: i64,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default)]
    pub last_uid: u32,
    #[serde(default)]
    pub uid_validity: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Persisted {
    version: u32,
    device_id: String,
    #[serde(default)]
    sequence: u64,
    #[serde(default)]
    notes: HashMap<String, Note>,
    #[serde(default)]
    sync: SyncState,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteView {
    pub id: String,
    pub text: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountView {
    pub email: String,
    pub host: String,
    pub port: u16,
    pub secure: bool,
    pub folder: String,
    pub connected_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncView {
    pub configured: bool,
    pub last_sync_at: i64,
    pub last_error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub version: u64,
    pub notes: Vec<NoteView>,
    pub pending: usize,
    pub account: Option<AccountView>,
    pub sync: SyncView,
}

pub struct Store {
    path: PathBuf,
    #[allow(dead_code)]
    images_dir: PathBuf,
    state: Persisted,
}

impl Store {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("创建数据目录失败：{error}"))?;
        }
        let images_dir = path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("images");
        fs::create_dir_all(&images_dir).map_err(|error| format!("创建图片目录失败：{error}"))?;

        let state = match fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|error| format!("读取本地笔记失败：{error}"))?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Persisted {
                version: 1,
                device_id: Uuid::new_v4().to_string(),
                sequence: 0,
                notes: HashMap::new(),
                sync: SyncState::default(),
            },
            Err(error) => return Err(format!("读取本地笔记失败：{error}")),
        };

        let store = Self {
            path,
            images_dir,
            state,
        };
        if !store.path.exists() {
            store.save()?;
        }
        Ok(store)
    }

    pub fn account(&self) -> Option<Account> {
        self.state.sync.account.clone()
    }

    pub fn snapshot(&self) -> Snapshot {
        let mut notes: Vec<Note> = self
            .state
            .notes
            .values()
            .filter(|note| !note.deleted)
            .cloned()
            .collect();
        notes.sort_by(|left, right| {
            right
                .created_at
                .cmp(&left.created_at)
                .then_with(|| right.updated_at.cmp(&left.updated_at))
        });

        let pending = self.pending_count();
        let account = self.state.sync.account.as_ref().map(|account| AccountView {
            email: account.email.clone(),
            host: account.host.clone(),
            port: account.port,
            secure: account.secure,
            folder: account.folder.clone(),
            connected_at: account.connected_at,
        });

        Snapshot {
            version: self.state.sequence,
            notes: notes
                .into_iter()
                .map(|note| NoteView {
                    id: note.id,
                    text: note.text,
                    created_at: note.created_at,
                    updated_at: note.updated_at,
                })
                .collect(),
            pending,
            account,
            sync: SyncView {
                configured: self.state.sync.account.is_some(),
                last_sync_at: self.state.sync.last_sync_at,
                last_error: self.state.sync.last_error.clone(),
            },
        }
    }

    pub fn create_note(&mut self, text: &str) -> Result<(), String> {
        let text = clean_text(text)?;
        let now = Utc::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();
        self.state.notes.insert(
            id.clone(),
            Note {
                id,
                text,
                created_at: now,
                updated_at: now,
                rev_by: self.state.device_id.clone(),
                deleted: false,
                synced_rev: None,
                images: Vec::new(),
            },
        );
        self.touch();
        self.save()
    }

    pub fn update_note(&mut self, id: &str, text: &str) -> Result<(), String> {
        let text = clean_text(text)?;
        let now = Utc::now().timestamp_millis();
        let note = self
            .state
            .notes
            .get_mut(id)
            .filter(|note| !note.deleted)
            .ok_or_else(|| "这条笔记不存在".to_string())?;
        note.text = text;
        note.updated_at = note.updated_at.max(now);
        note.rev_by = self.state.device_id.clone();
        note.synced_rev = None;
        self.touch();
        self.save()
    }

    pub fn delete_note(&mut self, id: &str) -> Result<(), String> {
        let now = Utc::now().timestamp_millis();
        let note = self
            .state
            .notes
            .get_mut(id)
            .filter(|note| !note.deleted)
            .ok_or_else(|| "这条笔记不存在".to_string())?;
        note.deleted = true;
        note.updated_at = note.updated_at.max(now);
        note.rev_by = self.state.device_id.clone();
        note.synced_rev = None;
        self.touch();
        self.save()
    }

    pub fn set_account(&mut self, account: Account) -> Result<(), String> {
        for note in self.state.notes.values_mut() {
            note.synced_rev = None;
        }
        self.state.sync.account = Some(account);
        self.state.sync.last_uid = 0;
        self.state.sync.uid_validity = None;
        self.state.sync.last_error = None;
        self.touch();
        self.save()
    }

    pub fn clear_account(&mut self) -> Result<(), String> {
        self.state.sync.account = None;
        self.state.sync.last_uid = 0;
        self.state.sync.uid_validity = None;
        self.state.sync.last_error = None;
        self.touch();
        self.save()
    }

    /// Merge one remote revision using `(updatedAt, revBy)` last-write-wins.
    pub fn merge_remote(&mut self, remote: &RemoteNote) -> bool {
        let remote_rev = revision_parts(remote.updated_at, &remote.rev_by);
        let text = String::from(remote.text.chars().take(TEXT_LIMIT).collect::<String>())
            .trim()
            .to_string();
        if let Some(local) = self.state.notes.get_mut(&remote.id) {
            let local_key = (local.updated_at, local.rev_by.clone());
            let remote_key = (remote.updated_at, remote.rev_by.clone());
            if remote_key > local_key {
                local.text = text;
                local.created_at = remote.created_at.max(0);
                local.updated_at = remote.updated_at;
                local.rev_by = remote.rev_by.clone();
                local.deleted = remote.deleted;
                local.synced_rev = Some(remote_rev);
                local.images = remote.images.clone();
                return true;
            }
            if remote_key == local_key {
                local.synced_rev = Some(remote_rev);
                return true;
            }
            return false;
        }

        self.state.notes.insert(
            remote.id.clone(),
            Note {
                id: remote.id.clone(),
                text,
                created_at: remote.created_at.max(0),
                updated_at: remote.updated_at,
                rev_by: remote.rev_by.clone(),
                deleted: remote.deleted,
                synced_rev: Some(remote_rev),
                images: remote.images.clone(),
            },
        );
        true
    }

    pub fn pending_notes(&self, limit: usize) -> Vec<Note> {
        let mut notes: Vec<Note> = self
            .state
            .notes
            .values()
            .filter(|note| {
                let rev = revision(note);
                note.synced_rev.as_deref() != Some(rev.as_str())
            })
            .cloned()
            .collect();
        notes.sort_by_key(|note| note.updated_at);
        notes.truncate(limit);
        notes
    }

    pub fn pending_count(&self) -> usize {
        self.state
            .notes
            .values()
            .filter(|note| {
                let rev = revision(note);
                note.synced_rev.as_deref() != Some(rev.as_str())
            })
            .count()
    }

    pub fn mark_synced(&mut self, id: &str, pushed_rev: &str) {
        if let Some(note) = self.state.notes.get_mut(id) {
            if revision(note) == pushed_rev {
                note.synced_rev = Some(pushed_rev.to_string());
            }
        }
    }

    pub fn finish_sync(&mut self, last_uid: u32, last_sync_at: i64, error: Option<String>) {
        self.state.sync.last_uid = last_uid;
        self.state.sync.last_sync_at = last_sync_at;
        self.state.sync.last_error = error;
        self.touch();
        let _ = self.save();
    }

    pub fn set_sync_error(&mut self, message: &str) {
        self.state.sync.last_error = Some(message.chars().take(500).collect());
        self.touch();
        let _ = self.save();
    }

    pub fn save(&self) -> Result<(), String> {
        let body = serde_json::to_vec_pretty(&self.state)
            .map_err(|error| format!("保存本地笔记失败：{error}"))?;
        let temporary = self.path.with_extension(format!("json.{}.tmp", std::process::id()));
        fs::write(&temporary, body).map_err(|error| format!("保存本地笔记失败：{error}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600));
        }
        #[cfg(windows)]
        {
            // Windows refuses to rename over an existing file. The window here
            // is small and only affects the local cache, never the mailbox.
            let _ = fs::remove_file(&self.path);
        }
        fs::rename(&temporary, &self.path).map_err(|error| format!("保存本地笔记失败：{error}"))
    }

    fn touch(&mut self) {
        self.state.sequence = self.state.sequence.saturating_add(1);
    }
}

pub fn revision(note: &Note) -> String {
    revision_parts(note.updated_at, &note.rev_by)
}

pub fn revision_parts(updated_at: i64, rev_by: &str) -> String {
    format!("{updated_at}:{rev_by}")
}

fn clean_text(value: &str) -> Result<String, String> {
    let text = value.trim();
    if text.is_empty() {
        return Err("笔记内容不能为空".to_string());
    }
    Ok(text.chars().take(TEXT_LIMIT).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mime::RemoteNote;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("quick-memo-store-{stamp}.json"))
    }

    #[test]
    fn creates_updates_and_deletes_notes() {
        let path = temp_path();
        let mut store = Store::open(path.clone()).unwrap();
        store.create_note("hello").unwrap();
        let id = store.snapshot().notes[0].id.clone();
        store.update_note(&id, "hello world").unwrap();
        assert_eq!(store.snapshot().notes[0].text, "hello world");
        store.delete_note(&id).unwrap();
        assert!(store.snapshot().notes.is_empty());
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn remote_newer_revision_wins() {
        let path = temp_path();
        let mut store = Store::open(path.clone()).unwrap();
        store.create_note("local").unwrap();
        let id = store.snapshot().notes[0].id.clone();
        let remote = RemoteNote {
            v: 1,
            kind: "note".into(),
            id: id.clone(),
            text: "remote".into(),
            created_at: 1,
            updated_at: Utc::now().timestamp_millis() + 10,
            rev_by: "other-device".into(),
            deleted: false,
            images: vec![],
        };
        assert!(store.merge_remote(&remote));
        assert_eq!(store.snapshot().notes[0].text, "remote");
        std::fs::remove_file(path).ok();
    }
}
