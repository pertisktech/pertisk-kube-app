use std::fs;
use std::path::Path;

fn main() {
    // Copy the compiled backend binary to a bundlable location
    let backend_src = Path::new("../../backend/target/release/pertisk-kube-backend");
    let bundle_dir = Path::new("./bundle-resources");
    let backend_dst = bundle_dir.join("pertisk-kube-backend");

    if backend_src.exists() {
        fs::create_dir_all(bundle_dir).ok();
        if let Err(e) = fs::copy(backend_src, &backend_dst) {
            eprintln!("Warning: couldn't copy backend binary (will try relative paths): {}", e);
        } else {
            println!("cargo::rustc-env=BACKEND_BINARY_COPIED=true");
        }
    }

    tauri_build::build()
}
