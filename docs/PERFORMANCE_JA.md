# 4K性能設計・受け入れ基準

## 最重要KPI

- UI input-to-paint P95: 16.7ms以下を目標
- 4K60 10-bit HEVC: 対応GPUのHW decode利用時に1ストリーム実時間再生
- Timelineスクラブ: 連続操作中にUIスレッドの50ms超ブロックをゼロにする
- 4K proxy切替: フレーム落ちを検出したら自動的に1/2 → 1/4へ段階降下
- idle project memory: 400MB未満を目標
- plugin crash: ホスト本体を終了させない

## キャッシュ

L1 VRAM: 現在位置前後のデコード済みtexture
L2 RAM: デコード済み低解像度フレーム、waveform、thumbnail
L3 NVMe: proxy、render cache、analysis cache

キャッシュ上限はOSメモリ圧とVRAM budgetを監視して動的変更する。

## Proxyポリシー

自動生成条件例:
- 8K以上
- 4K + ソフトウェアデコード
- 4K HEVC/AV1 4:2:2 / 高bit-depth
- 高bitrate long-GOP
- VRAM不足

Proxyは編集用のみ。最終書き出しは原則ソースへ再リンクする。

## ベンチマーク素材

1. H.264 4K60 8-bit 4:2:0
2. HEVC 4K60 10-bit 4:2:0
3. HEVC 4K60 10-bit 4:2:2
4. AV1 4K60 10-bit
5. ProRes/DNx系intraframe
6. 4K multicam 4 streams
7. 3D scene + 4 video planes + text + bloom

製品版ではGPU/driver/OSごとの結果をCIラボに保存する。
