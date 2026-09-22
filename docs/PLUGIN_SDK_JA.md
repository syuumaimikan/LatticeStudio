# Lattice Plugin SDK

## 方針

ABIはCで固定し、Rust/C/C++/Zig等から利用できるようにする。API互換性は`LATTICE_PLUGIN_ABI_VERSION`で管理する。

## セキュリティ

未署名・未知vendorのNative Pluginはisolated plugin workerで起動する。ネットワークと書き込み権限は既定で無効。クラッシュ、ハング、メモリ超過をbrokerが検知して切り離す。

## 種類

- VideoEffect
- AudioEffect
- Transition
- Importer / Exporter
- Tool
- UiPanel

## Native

`sdk/include/lattice_plugin.h`をincludeし、`lattice_plugin_describe`と`lattice_plugin_create`をexportする。

## WASM

字幕整形、メタデータ処理、マーカー、UIツールなどCPU中心の拡張向け。GPU textureを直接触る拡張はNative/OFX側へ分離する。

## 外部規格

OpenFX/VST3/CLAPは専用compatibility host層に閉じ込め、Lattice内部APIへ直接依存させない。これにより規格更新で編集コアを壊さない。
