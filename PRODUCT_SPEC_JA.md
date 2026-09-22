# Lattice Studio — 完成製品仕様

## ポジショニング

「軽量な4K/8K NLE」だけでなく、2D編集・3Dシーン・モーショングラフィックス・音声・字幕を一つの非破壊プロジェクトで扱うSpatial Video Workstation。

## ワークスペース

編集 / 3D / カラー / オーディオ / 字幕 / エフェクト / 配信

## 編集

- frame/subframe精度timeline
- ripple / roll / slip / slide / blade / trim
- multicam
- nested sequence
- compound clip
- marker / chapter / region
- variable speed / optical flow bridge
- source/program monitor
- proxy relink
- background conform

## 3D

- video plane, image, text, model, light, camera, particle, audio emitter
- transform keyframes and curves
- camera DOF/motion blur abstraction
- glTF/GLB first, USD/FBX adapter layer
- 3D gizmo + snapping + spatial timeline

## 色

- scene-referred render pipeline boundary
- curves, wheels, LUT, qualifiers, masks, tracking bridge
- waveform / parade / vectorscope / histogram
- HDR pipeline extension point

## 音声

- sample-accurate timeline
- buses / sends / automation
- VST3 / CLAP compatibility host
- loudness meter, EQ, dynamics, de-esser, limiter extension points
- spatial audio emitter model

## 字幕 / 日本語

- SRT/VTT/ASS adapter
- UTF-8 first
- IME composition
- Japanese line-break policy
- vertical writing and ruby layout layer
- transcript-to-caption extension point

## プラグイン

- stable Lattice C ABI
- sandboxed WASM
- isolated native process
- OpenFX bridge
- VST3 / CLAP bridge
- shader/effect graph bridge

## 軽量化

- lazy-loaded workspaces
- bounded caches
- adaptive resolution playback
- proxy generation
- async thumbnails/waveforms
- GPU-resident frames
- graph invalidation: 変更されたノードのみ再計算

## 商用品質要件

クラッシュ復旧、migration、signed update、plugin quarantine、accessibility、telemetry opt-in、SBOM、fuzzing、long-running soak testをリリースゲートに含める。
