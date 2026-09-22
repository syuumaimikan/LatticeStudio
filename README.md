# Lattice Studio 1.0.0 — Commercial-grade NLE Foundation

Lattice Studio is a GPU-first, Japanese-first, extensible non-linear editing (NLE) codebase designed for 4K/8K workflows, 3D spatial editing, isolated plugins, deterministic project files, and low-latency interaction.

> **Important:** this repository is a production-oriented foundation and reference implementation. It is not a drop-in replacement for a mature commercial editor without platform-specific FFmpeg/GPU/plugin SDK integration, QA, codec licensing review, device certification, and sustained performance testing. The architecture is intentionally structured so those steps can be completed without rewriting the product core.

## Included

- Rust workspace for the application/core/media/render/scene/plugin/i18n layers
- Timeline + undo/redo transaction model
- 3D scene graph and spatial clip model
- Render-graph scheduler abstraction
- Hardware-aware proxy decision engine
- Stable C plugin ABI header
- Plugin sandbox process protocol model
- Japanese localization resources and Japanese-first UX rules
- Sample `.lattice` JSON project and JSON Schema
- Interactive zero-dependency browser UI preview
- CI, release scripts, threat model, performance plan, plugin SDK docs
- Sample native plugin source

## Product principles

1. UI thread never decodes, renders, scans plugins, generates thumbnails, or exports.
2. Source media is immutable; every edit is a reversible command.
3. Decode → effects → composite stays GPU-resident whenever the backend supports it.
4. Heavy/unsafe native plugins run out-of-process.
5. 3D editing is optional: conventional timeline editing remains first-class.
6. Japanese is not a translation layer; IME, vertical text, font fallback, subtitle segmentation and JIS shortcuts are first-class product requirements.

## Quick preview (no toolchain required)

Open `preview/index.html` in a modern browser.

## Native development

Install the Rust toolchain and platform dependencies, then:

```bash
cargo check --workspace
cargo test --workspace
```

The included source intentionally keeps FFmpeg/OpenFX/VST3/CLAP platform bindings behind integration boundaries. Connect those SDKs in `crates/lattice-media` and `crates/lattice-plugin-host` for production builds.

## Repository map

- `apps/lattice-studio` — desktop app shell
- `crates/lattice-core` — project, timeline, command history
- `crates/lattice-media` — media metadata + proxy policy + decoder boundary
- `crates/lattice-render` — render graph + backend abstraction
- `crates/lattice-scene3d` — 3D scene graph
- `crates/lattice-plugin-api` — stable plugin metadata/contracts
- `crates/lattice-plugin-host` — sandbox/host policy
- `crates/lattice-i18n` — localization infrastructure
- `sdk/include` — C ABI for third-party plugins
- `plugins/sample-fade` — sample plugin
- `schemas` — project schemas
- `preview` — interactive UI concept
- `docs` — architecture, performance, security, SDK and release requirements

## License

The original code in this package is Apache-2.0. Third-party SDKs/codecs are not bundled; production distributors must review their own licensing obligations.
