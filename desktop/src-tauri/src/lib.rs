//! Quick Memo desktop app.
//!
//! The Host half is a small local-first note store plus optional IMAP sync. The
//! WebView only calls commands; it never reads files or mailbox credentials.

mod mime;
mod store;
mod sync;

use crate::store::Snapshot;
use crate::sync::{AccountInput, SyncOutcome};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

type SharedStore = Arc<Mutex<store::Store>>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncResponse {
    snapshot: Snapshot,
    fetched: usize,
    pushed: usize,
}

fn lock_store(state: &SharedStore) -> Result<std::sync::MutexGuard<'_, store::Store>, String> {
    state.lock().map_err(|_| "本地存储锁失败".to_string())
}

fn snapshot(state: &SharedStore) -> Result<Snapshot, String> {
    Ok(lock_store(state)?.snapshot())
}

#[tauri::command]
fn load_notes(state: State<'_, SharedStore>) -> Result<Snapshot, String> {
    snapshot(state.inner())
}

#[tauri::command]
fn create_note(text: String, state: State<'_, SharedStore>) -> Result<Snapshot, String> {
    {
        let mut store = lock_store(state.inner())?;
        store.create_note(&text)?;
    }
    snapshot(state.inner())
}

#[tauri::command]
fn update_note(id: String, text: String, state: State<'_, SharedStore>) -> Result<Snapshot, String> {
    {
        let mut store = lock_store(state.inner())?;
        store.update_note(&id, &text)?;
    }
    snapshot(state.inner())
}

#[tauri::command]
fn delete_note(id: String, state: State<'_, SharedStore>) -> Result<Snapshot, String> {
    {
        let mut store = lock_store(state.inner())?;
        store.delete_note(&id)?;
    }
    snapshot(state.inner())
}

#[tauri::command]
fn set_active_notebook(id: String, state: State<'_, SharedStore>) -> Result<Snapshot, String> {
    {
        let mut store = lock_store(state.inner())?;
        store.set_active(&id)?;
    }
    snapshot(state.inner())
}

#[tauri::command]
fn create_notebook(name: String, state: State<'_, SharedStore>) -> Result<Snapshot, String> {
    {
        let mut store = lock_store(state.inner())?;
        store.create_notebook(&name)?;
    }
    snapshot(state.inner())
}

#[tauri::command]
fn rename_notebook(id: String, name: String, state: State<'_, SharedStore>) -> Result<Snapshot, String> {
    {
        let mut store = lock_store(state.inner())?;
        store.rename_notebook(&id, &name)?;
    }
    snapshot(state.inner())
}

#[tauri::command]
fn delete_notebook(id: String, state: State<'_, SharedStore>) -> Result<Snapshot, String> {
    let removed = {
        let mut store = lock_store(state.inner())?;
        store.delete_notebook(&id)?
    };
    if let Some(email) = removed.account_email {
        sync::delete_password(&email);
    }
    snapshot(state.inner())
}

#[tauri::command]
async fn save_account(
    input: AccountInput,
    state: State<'_, SharedStore>,
) -> Result<Snapshot, String> {
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || sync::verify_and_save(shared, input))
        .await
        .map_err(|error| format!("连接任务失败：{error}"))??;
    snapshot(state.inner())
}

#[tauri::command]
async fn sync_now(state: State<'_, SharedStore>) -> Result<SyncResponse, String> {
    let shared = state.inner().clone();
    let outcome: SyncOutcome =
        tauri::async_runtime::spawn_blocking(move || sync::sync(shared))
            .await
            .map_err(|error| format!("同步任务失败：{error}"))??;
    Ok(SyncResponse {
        snapshot: snapshot(state.inner())?,
        fetched: outcome.fetched,
        pushed: outcome.pushed,
    })
}

#[tauri::command]
async fn disconnect_account(state: State<'_, SharedStore>) -> Result<Snapshot, String> {
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || sync::disconnect(shared))
        .await
        .map_err(|error| format!("断开连接任务失败：{error}"))??;
    snapshot(state.inner())
}

#[tauri::command]
fn about() -> serde_json::Value {
    serde_json::json!({
        "name": "dsh-quicknotes",
        "version": env!("CARGO_PKG_VERSION"),
        "developer": "liusaipu",
        "license": "MIT",
        "repository": "https://github.com/liusaipu/dsh-quicknotes",
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            let file = data_dir.join("state.json");
            let store = store::Store::open(file)
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            app.manage(Arc::new(Mutex::new(store)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_notes,
            set_active_notebook,
            create_notebook,
            rename_notebook,
            delete_notebook,
            create_note,
            update_note,
            delete_note,
            save_account,
            sync_now,
            disconnect_account,
            about,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Quick Memo");
}
