$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
rustc --edition 2024 --crate-type cdylib --target wasm32-unknown-unknown -C opt-level=3 -C target-feature=+simd128 native/pixels.rs -o preview/pixels.wasm
if ($LASTEXITCODE -ne 0) { throw 'WASM build failed' }
python -m PyInstaller --noconfirm --clean --windowed --name LatticeStudio --add-data 'preview;preview' --collect-all webview desktop.py
if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed' }
