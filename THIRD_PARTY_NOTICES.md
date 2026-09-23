# Third-party integration notes

This source package does not bundle FFmpeg, OpenFX, VST3, CLAP, codec binaries, fonts, or proprietary SDKs.
Production distributors must review the licenses and patent obligations of the exact binaries they choose to ship.

Desktop builds bundle Python (PSF license), pywebview (BSD-3-Clause), pythonnet (MIT), and their runtime dependencies. PyInstaller uses GPL with its bootloader exception. Package license files are retained by the build where provided. WebView2 uses the installed Microsoft runtime; FFmpeg/FFprobe are external and are not bundled.
