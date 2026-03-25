import re

with open('frontend/src-tauri/src/main.rs', 'r') as f:
    content = f.read()

# Find start of the corrupted section (the unclosed opener at ~line 879)
# and end (the last good closing brace before the clean open_external_url at ~line 973)
# Strategy: find the first occurrence of the bad pattern and replace up to the
# second duplicate definition of open_external_url.

# Marker 1: the corrupted opener with NO body
BAD_START = '#[tauri::command]\nfn open_external_url(url: String) -> Result<(), String> {\n#[tauri::command]\nfn get_home_directory'

# The good duplicate that appears later (around line 956)
GOOD_OPEN_EXTERNAL = '''#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("url is empty".to_string());
    }

    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(&url).status();

    #[cfg(target_os = "linux")]
    let status = Command::new("xdg-open").arg(&url).status();

    #[cfg(target_os = "windows")]
    let status = Command::new("cmd").args(["/C", "start", "", &url]).status();

    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(format!("failed to open url, exit status: {}", s)),
        Err(e) => Err(format!("failed to open url: {}", e)),
    }
}'''

NEW_BLOCK = '''#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("url is empty".to_string());
    }
    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(&url).status();
    #[cfg(target_os = "linux")]
    let status = Command::new("xdg-open").arg(&url).status();
    #[cfg(target_os = "windows")]
    let status = Command::new("cmd").args(["/C", "start", "", &url]).status();
    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(format!("failed to open url, exit status: {s}")),
        Err(e) => Err(format!("failed to open url: {e}")),
    }
}

#[tauri::command]
fn get_home_directory() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}'''

# Find position of the bad start
bad_idx = content.find(BAD_START)
if bad_idx == -1:
    print("BAD_START not found — maybe already fixed?")
else:
    # Find the position of the GOOD_OPEN_EXTERNAL that appears after the bad section
    good_idx = content.find(GOOD_OPEN_EXTERNAL, bad_idx)
    if good_idx == -1:
        print("GOOD_OPEN_EXTERNAL not found after bad_idx")
        # Show context
        print(repr(content[bad_idx:bad_idx+200]))
    else:
        # Replace from bad_idx to end of GOOD_OPEN_EXTERNAL
        end_idx = good_idx + len(GOOD_OPEN_EXTERNAL)
        content = content[:bad_idx] + NEW_BLOCK + content[end_idx:]
        with open('frontend/src-tauri/src/main.rs', 'w') as f:
            f.write(content)
        print("FIXED OK")
