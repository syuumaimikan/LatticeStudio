# 素材・効果プラグイン

プラグイン画面の「読み込む」でJSONを選択します。`examples/motion-pack.json` をそのまま試せます。読み込んだ素材はメディアライブラリにも表示されます。追加・適用は元に戻す操作に対応します。「素材をプラグイン化」「効果をプラグイン化」では、選択素材の設定をJSONパックとして書き出せます。

## version 2

- `name`: パック名、80文字以内。
- `materials`: `{name, description, template}` の配列。
- `effects`: `{name, description, values}` の配列。
- 素材と効果は合計64件まで。
- `template.kind`: `shape`, `text`, `camera`, `mask`。
- テンプレートは `color`, `shape`, `text`, `fontSize`, `width`, `height`, `duration`, `x`, `y`, `z`, `scale`, `rotation`, `opacity`, `align`, `keys`, `effects`, `shader`, `eq` を指定できます。
- 効果の `values` は `effects`, `shader`, `keys`, `eq` に対応。指定した項目を上書きします。キーは指定したパラメーターの配列を置換し、時刻は素材先頭からの秒です。
- `effects`: brightness (-0.5〜0.5), contrast (0〜2), saturation (0〜3)。
- `shader`: `{enabled:true, code:"..."}`。GLSL形式はアプリのシェーダーエディターのテンプレートを使用してください。
- `eq`: `{enabled:true, low:0, mid:0, high:0}`。各ゲインは±18 dB。
- `keys`: `{opacity:[{time:0,value:0,easing:"smooth"},{time:1,value:100,easing:"linear"}]}` など。

既存version 1のカラープラグインも使用できます。AviUtlの `.auf`・`.anm`・DLLを直接実行する互換機能ではありません。任意JavaScriptの実行や独自UIコードはこの形式には含まれません。

# レイアウト

上部「レイアウト」で左右のパネルを入れ替えたり、メディア・インスペクター・プラグインを別ウィンドウに分離できます。別ウィンドウはOSの通常操作で移動・サイズ変更できます。「メインに戻す」、メイン側の「ここに戻す」、ウィンドウを閉じる操作で再配置します。

編集内容はメインウィンドウの同じプロジェクトに反映し、保存と元に戻す操作を共有します。ダイアログ形式の編集はメインウィンドウに開きます。メインを閉じると分離ウィンドウも終了します。左右配置・幅・開閉は保存されますが、分離は起動のたびに選択します。ビューポート・タイムラインはメインに残ります。
