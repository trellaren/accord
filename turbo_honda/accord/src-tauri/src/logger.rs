//! In-memory log store that captures `log` crate events for the debug window.
//!
//! `AccordLogger` is installed as the global logger and forwards every record
//! to both the standard `env_logger` output and to a bounded `LogStore` that
//! the frontend can query via the `get_logs` Tauri command.

use chrono::Utc;
use log::{Level, LevelFilter, Log, Metadata, Record};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

/// Maximum number of log entries kept in memory.
const MAX_ENTRIES: usize = 500;

/// A single captured log entry.
#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    /// ISO-8601 UTC timestamp.
    pub timestamp: String,
    /// Log level as a string: "ERROR", "WARN", "INFO", "DEBUG", "TRACE".
    pub level: String,
    /// The logger target (usually the module path).
    pub target: String,
    /// The formatted log message.
    pub message: String,
}

/// Thread-safe, bounded circular buffer of recent log entries.
#[derive(Clone, Default)]
pub struct LogStore(Arc<Mutex<VecDeque<LogEntry>>>);

impl LogStore {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(VecDeque::with_capacity(MAX_ENTRIES))))
    }

    /// Append a new entry, evicting the oldest if at capacity.
    pub fn push(&self, entry: LogEntry) {
        if let Ok(mut q) = self.0.lock() {
            if q.len() >= MAX_ENTRIES {
                q.pop_front();
            }
            q.push_back(entry);
        }
    }

    /// Return a snapshot of all stored entries (oldest first).
    pub fn entries(&self) -> Vec<LogEntry> {
        self.0
            .lock()
            .map(|q| q.iter().cloned().collect())
            .unwrap_or_default()
    }
}

/// A `log::Log` implementation that captures records into a [`LogStore`] and
/// also delegates to the `env_logger` backend so terminal output is preserved.
pub struct AccordLogger {
    store: LogStore,
    env_logger: env_logger::Logger,
}

impl AccordLogger {
    /// Build an `AccordLogger` from a pre-built `env_logger::Logger` and a
    /// shared [`LogStore`].
    pub fn new(env_logger: env_logger::Logger, store: LogStore) -> Self {
        Self { store, env_logger }
    }
}

impl Log for AccordLogger {
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        self.env_logger.enabled(metadata)
    }

    fn log(&self, record: &Record<'_>) {
        // Always forward to env_logger for terminal output.
        self.env_logger.log(record);

        // Only capture records that pass the env_logger filter.
        if !self.env_logger.enabled(record.metadata()) {
            return;
        }

        let entry = LogEntry {
            timestamp: Utc::now().to_rfc3339(),
            level: level_str(record.level()).to_string(),
            target: record.target().to_string(),
            message: record.args().to_string(),
        };

        self.store.push(entry);
    }

    fn flush(&self) {
        self.env_logger.flush();
    }
}

fn level_str(level: Level) -> &'static str {
    match level {
        Level::Error => "ERROR",
        Level::Warn => "WARN",
        Level::Info => "INFO",
        Level::Debug => "DEBUG",
        Level::Trace => "TRACE",
    }
}

/// Initialise the global logger.
///
/// Reads `RUST_LOG` (defaulting to `"info"`) from the environment, sets up
/// `env_logger`, wraps it in [`AccordLogger`], and installs it as the global
/// logger.  Returns the shared [`LogStore`] that can be placed into
/// [`AppState`](crate::AppState) for retrieval by the frontend.
///
/// # Panics
///
/// Panics if a global logger has already been set (i.e. if called more than
/// once).
pub fn init() -> LogStore {
    let store = LogStore::new();

    let env_logger = env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("info"),
    )
    .build();

    let max_level = env_logger.filter();

    let logger = AccordLogger::new(env_logger, store.clone());

    log::set_boxed_logger(Box::new(logger))
        .expect("global logger already set");
    log::set_max_level(LevelFilter::max().min(max_level));

    store
}
