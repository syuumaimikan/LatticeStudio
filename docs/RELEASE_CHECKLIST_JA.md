# 商用リリース前チェックリスト

このZIPは完成形の**コード基盤**をまとめたものだが、本当に販売・配布するには以下を完了する。

- Windows/macOS/Linux各GPUバックエンド実装とdriver matrix QA
- FFmpeg連携、各HW decoder/encoderの実機検証
- codec/patent/SDKライセンスの法務確認
- OpenFX/VST3/CLAP compatibility test suite
- IME（Microsoft IME / ATOK / macOS日本語入力）検証
- 縦書き、ルビ、禁則、字幕レンダリングの組版テスト
- HDR/ICC/OCIO/ディスプレイ管理
- crash reporting / recovery / migration test
- 100GB超project、数万clip、数千effectのstress test
- accessibility / high DPI / multi-monitor
- signed installer, updater, rollback, SBOM
- plugin signature / quarantine UI
- security audit / fuzzing
- export conformance and A/V sync test

「商用レベル」は機能数ではなく、この検証を継続して通せることまで含む。
