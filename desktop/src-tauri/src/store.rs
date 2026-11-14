//! Local-first notebook store for the desktop app.
//!
//! One file holds the notebook registry plus each notebook's notes and sync
//! state. This mirrors the DSH plugin: tabs are local-only, while notes and
//! mailbox revisions are shared through the mailbox.

use crate::mime::RemoteNote;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const TEXT_LIMIT: usize = 20_000;
pub const MAX_NOTEBOOKS: usize = 20;
pub const DEFAULT_NOTEBOOK_ID: &str = "default";
pub const DEFAULT_NOTEBOOK_NAME: &str = "我的笔记";

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
pub struct Notebook {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub device_id: String,
    #[serde(default)]
    pub notes: HashMap<String, Note>,
    #[serde(default)]
    pub sync: SyncState,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Persisted {
    version: u32,
    active_id: String,
    #[serde(default)]
    sequence: u64,
    #[serde(default)]
    notebooks: Vec<Notebook>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyPersisted {
    #[serde(default)]
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
pub struct NotebookSummary {
    pub id: String,
    pub name: String,
    pub configured: bool,
    pub pending: usize,
    pub last_sync_at: i64,
    pub last_error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookView {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub version: u64,
    pub active: String,
    pub notebook: NotebookView,
    pub notebooks: Vec<NotebookSummary>,
    pub notes: Vec<NoteView>,
    pub pending: usize,
    pub account: Option<AccountView>,
    pub sync: SyncView,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletedNotebook {
    pub id: String,
    pub name: String,
    pub account_email: Option<String>,
}

pub struct Store {
    path: PathBuf,
    #[allow(dead_code)]
    images_dir: PathBuf,
    active_id: String,
    sequence: u64,
    notebooks: Vec<Notebook>,
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

        let mut store = match fs::read(&path) {
            Ok(bytes) => {
                let value: serde_json::Value = serde_json::from_slice(&bytes)
                    .map_err(|error| format!("读取本地笔记失败：{error}"))?;
                if value.get("notebooks").is_some() {
                    let persisted: Persisted = serde_json::from_value(value)
                        .map_err(|error| format!("读取本地笔记本失败：{error}"))?;
                    Self::from_persisted(path, images_dir, persisted)
                } else {
                    let legacy: LegacyPersisted = serde_json::from_value(value)
                        .map_err(|error| format!("读取旧版本地笔记失败：{error}"))?;
                    Self::migrate(path, images_dir, legacy)
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let notebook = Notebook::new(
                    DEFAULT_NOTEBOOK_ID.to_string(),
                    DEFAULT_NOTEBOOK_NAME.to_string(),
                    Uuid::new_v4().to_string(),
                );
                Self {
                    path,
                    images_dir,
                    active_id: notebook.id.clone(),
                    sequence: 0,
                    notebooks: vec![notebook],
                }
            }
            Err(error) => return Err(format!("读取本地笔记失败：{error}")),
        };

        store.normalize()?;
        store.save()?;
        Ok(store)
    }

    fn from_persisted(path: PathBuf, images_dir: PathBuf, persisted: Persisted) -> Self {
        Self {
            path,
            images_dir,
            active_id: persisted.active_id,
            sequence: persisted.sequence,
            notebooks: persisted.notebooks,
        }
    }

    fn migrate(path: PathBuf, images_dir: PathBuf, legacy: LegacyPersisted) -> Self {
        let notebook = Notebook {
            id: DEFAULT_NOTEBOOK_ID.to_string(),
            name: DEFAULT_NOTEBOOK_NAME.to_string(),
            created_at: Utc::now().timestamp_millis(),
            device_id: if legacy.device_id.is_empty() {
                Uuid::new_v4().to_string()
            } else {
                legacy.device_id
            },
            notes: legacy.notes,
            sync: legacy.sync,
        };
        Self {
            path,
            images_dir,
            active_id: notebook.id.clone(),
            sequence: legacy.sequence,
            notebooks: vec![notebook],
        }
    }

    fn normalize(&mut self) -> Result<(), String> {
        if self.notebooks.is_empty() {
            self.notebooks.push(Notebook::new(
                DEFAULT_NOTEBOOK_ID.to_string(),
                DEFAULT_NOTEBOOK_NAME.to_string(),
                Uuid::new_v4().to_string(),
            ));
        }
        self.notebooks.truncate(MAX_NOTEBOOKS);
        let mut seen = std::collections::HashSet::new();
        self.notebooks.retain_mut(|notebook| {
            if notebook.id.is_empty() || !seen.insert(notebook.id.clone()) {
                return false;
            }
            if clean_name(&notebook.name).is_err() {
                notebook.name = DEFAULT_NOTEBOOK_NAME.to_string();
            }
            if notebook.device_id.is_empty() {
                notebook.device_id = Uuid::new_v4().to_string();
            }
            true
        });
        if self.notebooks.is_empty() {
            self.notebooks.push(Notebook::new(
                DEFAULT_NOTEBOOK_ID.to_string(),
                DEFAULT_NOTEBOOK_NAME.to_string(),
                Uuid::new_v4().to_string(),
            ));
        }
        if !self
            .notebooks
            .iter()
            .any(|notebook| notebook.id == self.active_id)
        {
            self.active_id = self.notebooks[0].id.clone();
        }
        Ok(())
    }

    pub fn active(&self) -> &Notebook {
        self.notebooks
            .iter()
            .find(|notebook| notebook.id == self.active_id)
            .unwrap_or(&self.notebooks[0])
    }

    fn active_mut(&mut self) -> &mut Notebook {
        let id = self.active_id.clone();
        if let Some(index) = self.notebooks.iter().position(|notebook| notebook.id == id) {
            return &mut self.notebooks[index];
        }
        &mut self.notebooks[0]
    }

    pub fn account_for(&self, id: &str) -> Option<Account> {
        self.notebooks
            .iter()
            .find(|notebook| notebook.id == id)
            .and_then(|notebook| notebook.sync.account.clone())
    }

    pub fn snapshot(&self) -> Snapshot {
        let active = self.active();
        let mut notes: Vec<Note> = active
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
        let notebooks = self
            .notebooks
            .iter()
            .map(Notebook::summary)
            .collect();
        let account = active.sync.account.as_ref().map(|account| AccountView {
            email: account.email.clone(),
            host: account.host.clone(),
            port: account.port,
            secure: account.secure,
            folder: account.folder.clone(),
            connected_at: account.connected_at,
        });
        let pending = active.pending_count();

        Snapshot {
            version: self.sequence,
            active: active.id.clone(),
            notebook: NotebookView {
                id: active.id.clone(),
                name: active.name.clone(),
            },
            notebooks,
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
                configured: active.sync.account.is_some(),
                last_sync_at: active.sync.last_sync_at,
                last_error: active.sync.last_error.clone(),
            },
        }
    }

    pub fn set_active(&mut self, id: &str) -> Result<(), String> {
        self.find(id)?;
        self.active_id = id.to_string();
        self.touch();
        self.save()
    }

    pub fn create_notebook(&mut self, name: &str) -> Result<(), String> {
        let name = clean_name(name)?;
        if self.notebooks.len() >= MAX_NOTEBOOKS {
            return Err(format!("最多只能创建 {MAX_NOTEBOOKS} 个笔记本"));
        }
        let mut id = new_id();
        while self.notebooks.iter().any(|notebook| notebook.id == id) {
            id = new_id();
        }
        let notebook = Notebook::new(id, name, Uuid::new_v4().to_string());
        self.active_id = notebook.id.clone();
        self.notebooks.push(notebook);
        self.touch();
        self.save()
    }

    pub fn rename_notebook(&mut self, id: &str, name: &str) -> Result<(), String> {
        let name = clean_name(name)?;
        let notebook = self
            .notebooks
            .iter_mut()
            .find(|notebook| notebook.id == id)
            .ok_or_else(|| "笔记本不存在".to_string())?;
        notebook.name = name;
        self.touch();
        self.save()
    }

    pub fn delete_notebook(&mut self, id: &str) -> Result<DeletedNotebook, String> {
        if self.notebooks.len() <= 1 {
            return Err("至少保留一个笔记本".to_string());
        }
        let index = self
            .notebooks
            .iter()
            .position(|notebook| notebook.id == id)
            .ok_or_else(|| "笔记本不存在".to_string())?;
        let removed = self.notebooks.remove(index);
        if self.active_id == removed.id {
            self.active_id = self.notebooks[0].id.clone();
        }
        self.touch();
        self.save()?;
        Ok(DeletedNotebook {
            id: removed.id,
            name: removed.name,
            account_email: removed.sync.account.map(|account| account.email),
        })
    }

    pub fn email_conflict(&self, email: &str, except_id: &str) -> Option<String> {
        let email = email.trim().to_lowercase();
        self.notebooks
            .iter()
            .filter(|notebook| notebook.id != except_id)
            .find(|notebook| {
                notebook.sync.account.as_ref().is_some_and(|account| {
                    account.email.trim().to_lowercase() == email
                })
            })
            .map(|notebook| notebook.name.clone())
    }

    pub fn set_account_for(&mut self, id: &str, account: Account) -> Result<(), String> {
        {
            let target = self.notebook_mut(id)?;
            for note in target.notes.values_mut() {
                note.synced_rev = None;
            }
            target.sync.account = Some(account);
            target.sync.last_uid = 0;
            target.sync.uid_validity = None;
            target.sync.last_error = None;
        }
        self.touch();
        self.save()
    }

    pub fn clear_account_for(&mut self, id: &str) -> Result<(), String> {
        {
            let target = self.notebook_mut(id)?;
            target.sync.account = None;
            target.sync.last_uid = 0;
            target.sync.uid_validity = None;
            target.sync.last_error = None;
        }
        self.touch();
        self.save()
    }

    pub fn create_note(&mut self, text: &str) -> Result<(), String> {
        let text = clean_text(text)?;
        let now = Utc::now().timestamp_millis();
        let target = self.active_mut();
        let id = Uuid::new_v4().to_string();
        target.notes.insert(
            id.clone(),
            Note {
                id,
                text,
                created_at: now,
                updated_at: now,
                rev_by: target.device_id.clone(),
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
        let target = self.active_mut();
        let note = target
            .notes
            .get_mut(id)
            .filter(|note| !note.deleted)
            .ok_or_else(|| "这条笔记不存在".to_string())?;
        note.text = text;
        note.updated_at = note.updated_at.max(now);
        note.rev_by = target.device_id.clone();
        note.synced_rev = None;
        self.touch();
        self.save()
    }

    pub fn delete_note(&mut self, id: &str) -> Result<(), String> {
        let now = Utc::now().timestamp_millis();
        let target = self.active_mut();
        let note = target
            .notes
            .get_mut(id)
            .filter(|note| !note.deleted)
            .ok_or_else(|| "这条笔记不存在".to_string())?;
        note.deleted = true;
        note.updated_at = note.updated_at.max(now);
        note.rev_by = target.device_id.clone();
        note.synced_rev = None;
        self.touch();
        self.save()
    }

    pub fn merge_remote_for(&mut self, id: &str, remote: &RemoteNote) -> Result<bool, String> {
        Ok(self.notebook_mut(id)?.merge_remote(remote))
    }

    pub fn pending_notes_for(&self, id: &str, limit: usize) -> Result<Vec<Note>, String> {
        Ok(self.find(id)?.pending_notes(limit))
    }

    pub fn mark_synced_for(&mut self, notebook: &str, id: &str, pushed_rev: &str) -> Result<(), String> {
        self.notebook_mut(notebook)?.mark_synced(id, pushed_rev);
        Ok(())
    }

    pub fn finish_sync_for(
        &mut self,
        notebook: &str,
        last_uid: u32,
        last_sync_at: i64,
        error: Option<String>,
    ) -> Result<(), String> {
        {
            let target = self.notebook_mut(notebook)?;
            target.finish_sync(last_uid, last_sync_at, error);
        }
        self.touch();
        self.save()
    }

    pub fn set_sync_error_for(&mut self, notebook: &str, message: &str) -> Result<(), String> {
        self.notebook_mut(notebook)?.set_sync_error(message);
        self.touch();
        self.save()
    }

    pub fn save(&self) -> Result<(), String> {
        let persisted = Persisted {
            version: 2,
            active_id: self.active_id.clone(),
            sequence: self.sequence,
            notebooks: self.notebooks.clone(),
        };
        let body = serde_json::to_vec_pretty(&persisted)
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
            let _ = fs::remove_file(&self.path);
        }
        fs::rename(&temporary, &self.path).map_err(|error| format!("保存本地笔记失败：{error}"))
    }

    fn find(&self, id: &str) -> Result<&Notebook, String> {
        self.notebooks
            .iter()
            .find(|notebook| notebook.id == id)
            .ok_or_else(|| "笔记本不存在".to_string())
    }

    fn notebook_mut(&mut self, id: &str) -> Result<&mut Notebook, String> {
        self.notebooks
            .iter_mut()
            .find(|notebook| notebook.id == id)
            .ok_or_else(|| "笔记本不存在".to_string())
    }

    fn touch(&mut self) {
        self.sequence = self.sequence.saturating_add(1);
    }
}

impl Notebook {
    fn new(id: String, name: String, device_id: String) -> Self {
        Self {
            id,
            name,
            created_at: Utc::now().timestamp_millis(),
            device_id,
            notes: HashMap::new(),
            sync: SyncState::default(),
        }
    }

    fn summary(&self) -> NotebookSummary {
        NotebookSummary {
            id: self.id.clone(),
            name: self.name.clone(),
            configured: self.sync.account.is_some(),
            pending: self.pending_count(),
            last_sync_at: self.sync.last_sync_at,
            last_error: self.sync.last_error.clone(),
        }
    }

    fn pending_notes(&self, limit: usize) -> Vec<Note> {
        let mut notes: Vec<Note> = self
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

    fn pending_count(&self) -> usize {
        self.notes
            .values()
            .filter(|note| {
                let rev = revision(note);
                note.synced_rev.as_deref() != Some(rev.as_str())
            })
            .count()
    }

    fn merge_remote(&mut self, remote: &RemoteNote) -> bool {
        let remote_rev = revision_parts(remote.updated_at, &remote.rev_by);
        let text = String::from(remote.text.chars().take(TEXT_LIMIT).collect::<String>())
            .trim()
            .to_string();
        if let Some(local) = self.notes.get_mut(&remote.id) {
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
                local.images = remote.images.clone();
                local.synced_rev = Some(remote_rev);
                return true;
            }
            return false;
        }
        self.notes.insert(
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

    fn mark_synced(&mut self, id: &str, pushed_rev: &str) {
        if let Some(note) = self.notes.get_mut(id) {
            if revision(note) == pushed_rev {
                note.synced_rev = Some(pushed_rev.to_string());
            }
        }
    }

    fn finish_sync(&mut self, last_uid: u32, last_sync_at: i64, error: Option<String>) {
        self.sync.last_uid = last_uid;
        self.sync.last_sync_at = last_sync_at;
        self.sync.last_error = error;
    }

    fn set_sync_error(&mut self, message: &str) {
        self.sync.last_error = Some(message.chars().take(500).collect());
    }
}

pub fn revision(note: &Note) -> String {
    revision_parts(note.updated_at, &note.rev_by)
}

pub fn revision_parts(updated_at: i64, rev_by: &str) -> String {
    format!("{updated_at}:{rev_by}")
}

fn new_id() -> String {
    Uuid::new_v4().simple().to_string()[..8].to_string()
}

fn clean_name(value: &str) -> Result<String, String> {
    let name = value.trim();
    if name.is_empty() {
        return Err("笔记本名称不能为空".to_string());
    }
    if name.chars().count() > 32 || name.chars().any(char::is_control) {
        return Err("笔记本名称不合法".to_string());
    }
    Ok(name.to_string())
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

    fn temp_path() -> PathBuf {
        std::env::temp_dir().join(format!("quick-memo-store-{}.json", Uuid::new_v4()))
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
        let active = store.snapshot().active;
        assert!(store.merge_remote_for(&active, &remote).unwrap());
        assert_eq!(store.snapshot().notes[0].text, "remote");
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn migrates_legacy_single_notebook() {
        let path = temp_path();
        let legacy = serde_json::json!({
            "version": 1,
            "deviceId": "legacy-device",
            "sequence": 3,
            "notes": {},
            "sync": {}
        });
        std::fs::write(&path, serde_json::to_vec(&legacy).unwrap()).unwrap();
        let store = Store::open(path.clone()).unwrap();
        let snapshot = store.snapshot();
        assert_eq!(snapshot.notebooks.len(), 1);
        assert_eq!(snapshot.active, DEFAULT_NOTEBOOK_ID);
        assert_eq!(snapshot.notebook.name, DEFAULT_NOTEBOOK_NAME);
        let persisted: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert!(persisted.get("notebooks").is_some());
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn rejects_reusing_one_email_across_notebooks() {
        let path = temp_path();
        let mut store = Store::open(path.clone()).unwrap();
        let first = store.snapshot().active;
        store.create_notebook("生活").unwrap();
        let second = store.snapshot().active;
        let account = Account {
            email: "same@example.com".into(),
            host: "imap.example.com".into(),
            port: 993,
            secure: true,
            folder: "DSH Notes".into(),
            connected_at: 1,
        };
        store.set_account_for(&first, account).unwrap();
        assert_eq!(
            store.email_conflict("SAME@example.com", &second),
            Some(DEFAULT_NOTEBOOK_NAME.to_string())
        );
        assert!(store.email_conflict("same@example.com", &first).is_none());
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn creates_renames_and_deletes_notebooks() {
        let path = temp_path();
        let mut store = Store::open(path.clone()).unwrap();
        store.create_notebook("生活").unwrap();
        let active = store.snapshot().active;
        assert_eq!(store.snapshot().notebooks.len(), 2);
        store.rename_notebook(&active, "读书").unwrap();
        assert_eq!(store.snapshot().notebook.name, "读书");
        store.delete_notebook(&active).unwrap();
        assert_eq!(store.snapshot().notebooks.len(), 1);
        std::fs::remove_file(path).ok();
    }
}
