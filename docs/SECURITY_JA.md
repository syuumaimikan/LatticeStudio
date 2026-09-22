# セキュリティ / 安定性モデル

- Source mediaは読み取り専用で扱う。
- Native third-party pluginは原則out-of-process。
- Plugin workerはresource limitとwatchdog付き。
- Project読み込み時はpath traversalを拒否。
- 自動取得するオンライン素材はhash/signature検証対象。
- WASMは明示permission capability以外へアクセス不可。
- autosave journalはfsync境界を定義し、クラッシュ後にreplayする。
- 破損projectはread-only recovery modeで開く。
- テレメトリはopt-inを基本とし、素材名/ファイル内容を送信しない。
