fn main() {
    tauri_build::build();

    // Recompile le helper Swift si le source change
    #[cfg(target_os = "macos")]
    compile_swift_helper();
}

#[cfg(target_os = "macos")]
fn compile_swift_helper() {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let swift_src = format!("{}/swift/battleship-ble-host.swift", manifest);

    if !std::path::Path::new(&swift_src).exists() {
        return;
    }

    let arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_else(|_| "aarch64".to_string());
    let triple = format!("{}-apple-darwin", arch);
    let binary_dir = format!("{}/binaries", manifest);
    let binary_out = format!("{}/battleship-ble-host-{}", binary_dir, triple);

    std::fs::create_dir_all(&binary_dir).ok();

    // Skip if binary is already newer than Swift source (avoids Tauri watcher loop)
    if let (Ok(src_meta), Ok(bin_meta)) = (
        std::fs::metadata(&swift_src),
        std::fs::metadata(&binary_out),
    ) {
        if let (Ok(src_t), Ok(bin_t)) = (src_meta.modified(), bin_meta.modified()) {
            if bin_t >= src_t {
                println!("cargo:warning=⏭️  battleship-ble-host à jour, skip");
                println!("cargo:rerun-if-changed=swift/battleship-ble-host.swift");
                return;
            }
        }
    }

    let status = std::process::Command::new("swiftc")
        .args([
            &swift_src,
            "-o", &binary_out,
            "-framework", "CoreBluetooth",
            "-framework", "Foundation",
        ])
        .status();

    match status {
        Ok(s) if s.success() => {
            println!("cargo:warning=✅ battleship-ble-host compilé → {}", binary_out);
        }
        Ok(s) => println!("cargo:warning=⚠️  swiftc a échoué ({})", s),
        Err(e) => println!("cargo:warning=⚠️  swiftc introuvable : {}", e),
    }

    println!("cargo:rerun-if-changed=swift/battleship-ble-host.swift");
}
