use rusqlite::{Connection, OpenFlags, Result};
use std::path::Path;
use std::thread::sleep;
use std::time::Duration;

/// Opens an existing SQLite database strictly read-only, never checkpointing WAL,
/// with busy timeout and retry protection against concurrent agent writes.
pub fn open_readonly_sqlite(path: &Path) -> Result<Connection> {
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY
        | OpenFlags::SQLITE_OPEN_URI
        | OpenFlags::SQLITE_OPEN_NO_MUTEX;

    let mut attempts = 0;
    loop {
        match Connection::open_with_flags(path, flags) {
            Ok(conn) => {
                let _ = conn.execute("PRAGMA busy_timeout = 5000;", []);
                let _ = conn.execute("PRAGMA query_only = ON;", []);
                return Ok(conn);
            }
            Err(e) => {
                attempts += 1;
                if attempts >= 3 {
                    return Err(e);
                }
                sleep(Duration::from_millis(100 * attempts));
            }
        }
    }
}
