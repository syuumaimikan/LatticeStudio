# デスクトップ版

起動: `start-desktop.cmd`（実体: `dist/LatticeStudio/LatticeStudio.exe`）。約33 MBのアプリ一式で、Pythonは同梱、WebView2とFFmpeg/FFprobeはこのPCのインストールを使用します。

## 書き出し

「書き出す」から解像度、エンコーダー、画質・速度、WebAssembly転送を選択します。自動設定は実動作を確認したGPUを優先します。特定のGPUを指定して失敗した場合、黙ってCPUへ切り替えずエラーを表示します。設定はワークスペースの `export-settings.json` に保存します。

WASMはRGBAからRGBへの画素整形に使い、PNG圧縮を省いたフレーム転送を行います。GLSLは既存のWebGLレンダラーを引き続き使います。映像全体をメモリーに保持せず1フレームずつ処理します。書き出し速度は素材のシークや合成にも左右されます。

## データ

専用保存先は `%LOCALAPPDATA%/LatticeStudio/workspace`。初回はこのリポジトリの `.lattice-local/qa-session` から素材と保存プロジェクトをコピーします。ブラウザー版との自動同期はありません。実行ファイルを移す際はフォルダー全体を移します。

## 検証

- Python統合テスト11件、JavaScript/WASMテスト7件。
- RTX 5060のNVENC、CPUのx264それぞれで3840×2160の実MP4生成・色を検証。
- パッケージ化したWebView2アプリから共通レンダラー → WASM → NVENC → MP4の経路を検証（4K、3フレーム）。
- 長時間4K素材の連続書き出し速度・GPU別比較は未測定。

ビルド手順はREADMEを参照してください。
