#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cortex_adapters::hermes_listener::{start_hermes_listener, HermesListenerConfig, HermesListenerHandle};
use cortex_adapters::watch::{start_cortex_file_watchers, CortexWatcherHandle};
use cortex_adapters::scan_all_sources;
use cortex_graph::{process_graph, EnrichedGraphSnapshot};
use cortex_model::{AdapterHealth, Event, EventKind};
use cortex_store::CortexStore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub scan_on_launch: bool,
    pub enable_watchers: bool,
    pub enable_hermes_hook: bool,
    pub hermes_hook_port: u16,
    pub hermes_hook_secret: Option<String>,
    pub quality: String,
    pub show_perf_overlay: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            scan_on_launch: true,
            enable_watchers: true,
            enable_hermes_hook: false,
            hermes_hook_port: 47821,
            hermes_hook_secret: Some("cortex_secret_47821".into()),
            quality: "high".into(),
            show_perf_overlay: false,
        }
    }
}

fn get_settings_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.cortex.app")
        .join("settings.json")
}

fn load_settings_from_disk() -> AppSettings {
    let path = get_settings_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str(&content) {
                return settings;
            }
        }
    }
    AppSettings::default()
}

fn save_settings_to_disk(settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}

struct AppState {
    store: Mutex<CortexStore>,
    settings: Mutex<AppSettings>,
    watcher_handle: Mutex<Option<CortexWatcherHandle>>,
    listener_handle: Mutex<Option<HermesListenerHandle>>,
}

#[tauri::command]
fn get_graph_snapshot(state: State<'_, AppState>) -> Result<EnrichedGraphSnapshot, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;

    // Try loading existing snapshot from store first
    if let Ok(snapshot) = store.get_snapshot() {
        if !snapshot.nodes.is_empty() {
            return Ok(process_graph(snapshot));
        }
    }

    // Otherwise perform scan
    let raw = scan_all_sources(None, None, vec![]);
    let _ = store.save_snapshot(&raw);
    Ok(process_graph(raw))
}

#[tauri::command]
fn list_sources(state: State<'_, AppState>) -> Result<Vec<AdapterHealth>, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    match store.get_snapshot() {
        Ok(s) => Ok(s.sources),
        Err(_) => {
            let raw = scan_all_sources(None, None, vec![]);
            Ok(raw.sources)
        }
    }
}

#[tauri::command]
fn rescan(state: State<'_, AppState>) -> Result<EnrichedGraphSnapshot, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let raw = scan_all_sources(None, None, vec![]);
    let _ = store.save_snapshot(&raw);
    Ok(process_graph(raw))
}

#[tauri::command]
fn load_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

#[tauri::command]
fn save_settings(new_settings: AppSettings, state: State<'_, AppState>) -> Result<(), String> {
    save_settings_to_disk(&new_settings)?;
    let mut settings = state.settings.lock().map_err(|e| e.to_string())?;
    *settings = new_settings;
    Ok(())
}

#[tauri::command]
fn emit_test_event(
    node_id: Option<String>,
    source_id: Option<String>,
    detail: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let ev = Event {
        id: format!("test-event-{}", chrono::Utc::now().timestamp_millis()),
        ts: chrono::Utc::now(),
        source_id: source_id.unwrap_or_else(|| "antigravity".into()),
        node_id,
        kind: EventKind::ToolCalled,
        detail: detail.unwrap_or_else(|| "Test tool invocation".into()),
    };
    app.emit("agent:event", &ev).map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    #[cfg(windows)]
    {
        if std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_err() {
            std::env::set_var(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--remote-debugging-port=9222",
            );
        }
    }

    let store_path = CortexStore::default_path();
    let store = CortexStore::new(store_path).expect("Failed to initialize CortexStore");
    let initial_settings = load_settings_from_disk();

    tauri::Builder::default()
        .manage(AppState {
            store: Mutex::new(store),
            settings: Mutex::new(initial_settings.clone()),
            watcher_handle: Mutex::new(None),
            listener_handle: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_graph_snapshot,
            list_sources,
            rescan,
            load_settings,
            save_settings,
            emit_test_event
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // Set up File Watchers if enabled
            if initial_settings.enable_watchers {
                let mut ag_paths = Vec::new();
                if let Some(home) = dirs::home_dir() {
                    let ag_dir = home.join(".gemini").join("antigravity");
                    if ag_dir.exists() {
                        ag_paths.push(ag_dir);
                    }
                }

                let mut hermes_paths = Vec::new();
                if let Some(home) = dirs::home_dir() {
                    let hermes_dir = home.join(".hermes");
                    if hermes_dir.exists() {
                        hermes_paths.push(hermes_dir);
                    }
                }

                let app_ev = app_handle.clone();
                let app_delta = app_handle.clone();

                if let Ok(handle) = start_cortex_file_watchers(
                    ag_paths,
                    hermes_paths,
                    Duration::from_millis(250),
                    move |event| {
                        let _ = app_ev.emit("agent:event", &event);
                    },
                    move |delta| {
                        let _ = app_delta.emit("graph:delta", &delta);
                    },
                ) {
                    let state = app_handle.state::<AppState>();
                    let mut lock = state.watcher_handle.lock().unwrap();
                    *lock = Some(handle);
                }
            }

            // Set up Hermes Hook Listener if enabled
            if initial_settings.enable_hermes_hook {
                let config = HermesListenerConfig {
                    host: "127.0.0.1".into(),
                    port: initial_settings.hermes_hook_port,
                    secret: initial_settings.hermes_hook_secret.clone(),
                };

                let app_hook = app_handle.clone();
                if let Ok(handle) = start_hermes_listener(config, move |event| {
                    let _ = app_hook.emit("agent:event", &event);
                }) {
                    let state = app_handle.state::<AppState>();
                    let mut lock = state.listener_handle.lock().unwrap();
                    *lock = Some(handle);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
