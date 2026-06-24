use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

use crate::error::{CoreError, CoreResult};

#[tauri::command]
#[specta::specta]
pub fn read_recent_logs(max_lines: Option<u32>) -> Result<crate::dto::LogTailResponse, String> {
    let limit = max_lines.unwrap_or(200).clamp(1, 2000) as usize;
    let dir = crate::logging::log_directory()
        .ok_or_else(|| "log directory unavailable".to_string())?;

    let mut entries: Vec<_> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("ind3x-art.log")
        })
        .collect();

    entries.sort_by_key(|b| std::cmp::Reverse(b.metadata().and_then(|m| m.modified()).ok()));

    let file_path = entries.first().map(|e| e.path());
    let lines = if let Some(ref path) = file_path {
        read_tail_lines(path, limit).unwrap_or_default()
    } else {
        vec![]
    };

    Ok(crate::dto::LogTailResponse {
        log_dir: Some(dir.to_string_lossy().into_owned()),
        file: file_path.map(|p| p.to_string_lossy().into_owned()),
        lines,
    })
}

fn read_tail_lines(path: &std::path::Path, limit: usize) -> std::io::Result<Vec<String>> {
    use std::fs::File;
    use std::io::{Read, Seek, SeekFrom};

    let mut file = File::open(path)?;
    let file_len = file.metadata()?.len();
    if file_len == 0 {
        return Ok(vec![]);
    }

    const CHUNK: u64 = 16 * 1024;
    let mut pos = file_len;
    let mut buf = Vec::new();

    while pos > 0 {
        let read_size = CHUNK.min(pos);
        pos -= read_size;
        file.seek(SeekFrom::Start(pos))?;
        let mut chunk = vec![0u8; read_size as usize];
        file.read_exact(&mut chunk)?;

        if pos > 0 {
            if let Some(idx) = chunk.iter().position(|&b| b == b'\n') {
                chunk = chunk[idx + 1..].to_vec();
            } else {
                chunk.clear();
            }
        }

        buf.splice(0..0, chunk);

        let complete_lines = buf.iter().filter(|&&b| b == b'\n').count();
        let partial = usize::from(!buf.is_empty() && !buf.ends_with(b"\n"));
        if complete_lines + partial >= limit || pos == 0 {
            break;
        }
    }

    let text = String::from_utf8_lossy(&buf);
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    if lines.len() > limit {
        lines = lines.split_off(lines.len() - limit);
    }
    Ok(lines)
}

#[cfg(test)]
mod log_tail_tests {
    use super::read_tail_lines;
    use std::io::Write;

    #[test]
    fn read_tail_lines_returns_last_lines_without_loading_entire_file() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("ind3x-art.log");
        let mut file = std::fs::File::create(&path).expect("create");
        for i in 0..500 {
            writeln!(file, "line-{i}").expect("write");
        }
        drop(file);

        let lines = read_tail_lines(&path, 3).expect("tail");
        assert_eq!(lines, vec!["line-497", "line-498", "line-499"]);
    }
}

#[tauri::command]
#[specta::specta]
pub fn reveal_log_dir(app: tauri::AppHandle) -> CoreResult<()> {
    let dir = crate::logging::log_directory()
        .or_else(|| app.path().app_log_dir().ok())
        .ok_or_else(|| CoreError::Unavailable("log directory unavailable".to_string()))?;

    std::fs::create_dir_all(&dir)?;

    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| CoreError::Internal(e.to_string()))?;

    Ok(())
}
