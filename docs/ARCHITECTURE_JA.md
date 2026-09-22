# Lattice Studio アーキテクチャ

## 目的

4K/8K素材でもUI応答を止めず、編集・3D合成・音声・字幕・プラグインを一つのプロジェクトモデル上で処理する。

## プロセス境界

```text
Lattice Studio (UI)
  ├─ Project/Timeline Core
  ├─ Render Coordinator
  ├─ Media Service client ───── media worker
  ├─ Plugin broker ──────────── plugin worker N
  ├─ Audio engine ───────────── realtime audio worker
  └─ Background jobs ────────── proxy / waveform / thumbnail / export
```

UIスレッドはディスクI/O、デコード、プラグインスキャン、サムネイル生成、書き出しを行わない。

## フレームパイプライン

```text
Demux → HW Decode → GPU Texture → Effect Graph → 3D Composite → Color → Display
                      │                               │
                      └──────── GPU cache ────────────┘
```

ハードウェアデコードとGPU API間のゼロコピー経路を最優先する。ゼロコピー不可の環境だけステージングコピーへフォールバックする。

## Timeline

- FrameTimeを整数で保持して浮動小数誤差を避ける。
- すべての編集操作はCommandとして記録。
- autosaveは定期スナップショット + append-only command journal。
- ソースメディアは読み取り専用。

## Render Graph

エフェクトの順番ではなく依存DAGを構築し、独立ノードを並列実行する。結果キャッシュはノード入力hash、時刻、パラメータ、カラースペース、解像度をキーにする。

## 3D

Video / Image / Text / Model / Light / Camera / AudioEmitterを共通SceneNodeとして保持。通常のタイムラインクリップから3D Sceneへの参照も可能。

## プラグイン

- Native Lattice ABI: C ABI
- WASM: サンドボックス拡張
- OpenFX: 映像エフェクト互換層
- VST3 / CLAP: オーディオ互換層
- ネイティブ第三者コードは原則別プロセス

## 日本語

UTF-8を内部標準にし、UI文字列、パス、プラグイン名、字幕はUnicode前提。IME compositionイベントを直接扱い、縦書き/禁則/ルビはテキストレイアウト層で処理する。
