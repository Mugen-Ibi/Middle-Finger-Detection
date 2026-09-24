# 開発・テスト・ビルド

## 基準環境

CI の設定は Windows (`windows-latest`)、Python 3.11、Node.js 22 です。ソースの起動は Python 3.11 / 3.12 を対象にしています。ブラウザーは Chromium 系の必要 API を使います。特定の PC、カメラの型番、ユーザーフォルダーを前提にしません。

以下のコマンドはすべてプロジェクトルートの PowerShell で実行します。`npm.cmd` / `npx.cmd` を使用することで、PowerShell のスクリプト実行ポリシー変更は不要です。

## 初回セットアップ

```powershell
py -3.11 -m venv .venv
npm.cmd ci
npm.cmd run prepare:assets
.\.venv\Scripts\python.exe app.py
```

exe のビルドを行う場合のみ、次を追加します。

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

`npm ci` は `package-lock.json` のバージョンを使用します。モデルは固定バージョンの URL から取得し、`scripts/prepare-assets.mjs` に記載した SHA-256 と照合します。モデルが存在し、チェックサムが一致するとダウンロードを省略します。

`web/vendor/` と `web/models/` は生成物です。Git 管理対象には含めず、セットアップと CI で用意します。これらが存在しない場合は、ランチャーが不足ファイルを表示して終了します。

## 開発時の起動

```powershell
.\.venv\Scripts\python.exe app.py --no-browser --port 8765
```

端末に表示された `http://127.0.0.1:...` をブラウザーで開きます。指定ポートが使用中の場合は別の空きポートになります。Python 以外のサーバーで単に HTML を開くと、セッション取得・稼働確認・終了 API は動きません。

| オプション | 既定値 | 用途 |
| --- | --- | --- |
| `--port` | `8765` | 使用するポート。`0` は OS に空きポートの割り当てを依頼 |
| `--no-browser` | 無効 | ブラウザーの自動起動を省略 |
| `--idle-seconds` | `300` | 稼働確認が途切れた後の自動終了時間。`0` は開発・テスト用に自動終了を無効化 |

ソースの変更後はページを再読み込みしてください。`app.py` の変更にはプロセスの再起動が必要です。`Launch-MiddleFingerDetection.cmd` はビルド済み exe を優先するため、ソースの動作確認には直接 Python を使います。

## 自動テスト

```powershell
npm.cmd test
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

| テスト | 対象 |
| --- | --- |
| `tests/camera.test.mjs` | 正確な機器 ID の指定、切り替え、遅延許可、キャンセル、タイムアウト、切断 |
| `tests/gesture.test.mjs` | 指の姿勢、左右反転・回転への不変性、検出維持、再検出の抑制 |
| `tests/test_app.py` | ローカル HTTP、配信範囲、Host / Origin / セッショントークン、終了処理 |
| `tests/browser/app.test.mjs` | 実ブラウザー・実モデルでのプレビュー、停止・再開、権限拒否、黒映像、モデル障害、画面サイズ |

ブラウザーテストでは人工カメラを使用し、利用者の実カメラにはアクセスしません。手の認識は、出典を記載した公開テスト画像でも検証します。生成したスクリーンショットは `test-results/` に保存され、Git の対象外です。

インストール済み Chrome を使う場合:

```powershell
$env:BROWSER_CHANNEL = 'chrome'
npm.cmd run test:e2e
Remove-Item Env:BROWSER_CHANNEL
```

テスト起動時の Python は `PYTHON` 環境変数、`.venv\Scripts\python.exe`、PATH 上の `python` の順に選びます。`BROWSER_CHANNEL` はテスト用ブラウザーの指定です。アプリのカメラ設定や端末の既定ブラウザーは変更しません。

## ビルドと生成物の検証

```powershell
npm.cmd run prepare:assets
.\.venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --onefile --windowed --name MiddleFingerDetection --add-data "web;web" app.py
$env:LAUNCHER_EXE = (Resolve-Path dist\MiddleFingerDetection.exe).Path
npm.cmd run test:e2e
Remove-Item Env:LAUNCHER_EXE
```

`LAUNCHER_EXE` を指定すると、ブラウザーテストが Python ソースの代わりに exe を起動します。UI・WASM・モデルの同梱漏れを検出できます。exe は同梱ファイルを一時領域に展開してから起動するため、最初の画面表示まで時間がかかることがあります。

GitHub Actions は単体テスト、ソースに対するブラウザーテスト、exe ビルド、exe に対するブラウザーテストの順で実行します。成功後に exe を Artifact として保存します。リリースタグの作成や GitHub Release への公開は自動では行いません。

## 依存関係を更新するとき

1. `package.json` と `package-lock.json` を一緒に更新します。
2. モデルを変更する場合は出典・固定 URL・SHA-256・第三者通知も更新します。
3. assets を準備し、単体・ブラウザー・exe の各テストを実行します。
4. カメラの明示選択・停止・再接続を手動でも確認します。実カメラの画像やログはコミットしません。

プロジェクトのライセンス追加や変更は、第三者通知の更新とは別の判断です。
