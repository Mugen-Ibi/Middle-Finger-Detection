# Gesture Party

Web カメラの映像から手を認識し、中指を立てるジェスチャーに紙吹雪で反応する Windows 向けローカルアプリです。カメラの選択、映像表示、手の骨格表示、検出の一時停止に対応しています。

カメラ映像と認識処理はブラウザー内で完結します。録画・画像保存・映像のアップロード・マイクの取得は行いません。モデルを同梱しているため、導入後はインターネット接続なしで使用できます。

## 必要な環境

| 用途 | 必要なもの |
| --- | --- |
| exe 版を使う | Windows 11 x64、Microsoft Edge または Google Chrome、カメラ |
| ソースから起動する | 上記に加え Python 3.11 または 3.12、Node.js 22、npm |
| 開発・自動テスト | 上記に加え Git、Playwright が用意する Chromium |
| exe をビルドする | Windows x64 と `requirements.txt` のビルド依存関係 |

ブラウザーは更新済みの版を使用してください。`getUserMedia`、`requestVideoFrameCallback`、Web Worker、WebAssembly、OffscreenCanvas が必要です。Linux / macOS と Windows ARM64 は配布・検証対象に含めていません。カメラの解像度やフレームレートは機器とブラウザーが決定します。

## 導入方法

### exe 版

1. [Releases](https://github.com/Mugen-Ibi/Middle-Finger-Detection/releases) を開き、使用するベータ版のリリースノートを確認します。
2. **Assets** から `MiddleFingerDetection.exe` をダウンロードします。`Source code` は実行ファイルではありません。
3. `MiddleFingerDetection.exe` を実行します。インストール、Python / Node.js の導入は不要です。
4. 自動で開いたブラウザーで、カメラを選んで **カメラを開始** を押します。
5. 初回はブラウザーのカメラアクセスを許可します。機器名がまだ表示されない場合は、許可後に **一覧を更新** して使う機器を選び直します。

内蔵カメラ・USB カメラ・スマートフォンの仮想カメラはそれぞれ別の機器です。使いたい機器を一覧から明示的に選んでください。スマートフォン連携の設定自体は、あらかじめ Windows とスマートフォン側で済ませてください。

exe は未署名です。ダウンロード元がこのリポジトリのビルドであることを確認してください。既定ブラウザーが非対応の場合は、開いたページの URL を Edge / Chrome にコピーして開きます。

ベータ版には未検証の機器や誤判定などの制限があります。同じリリースの `SHA256SUMS.txt` と、PowerShell の `Get-FileHash .\MiddleFingerDetection.exe -Algorithm SHA256` の結果を比較すると、取得したファイルの整合性を確認できます。開発中のビルドは **Actions → Build Windows exe → Artifacts** からも取得できます。

### ソースから起動

リポジトリをクローン、または **Code → Download ZIP** で取得し、展開したプロジェクトのルートフォルダーで PowerShell を開きます。Python と Node.js を先にインストールしてください。

```powershell
py -3.11 -m venv .venv
npm.cmd ci
npm.cmd run prepare:assets
.\.venv\Scripts\python.exe app.py
```

Python 3.12 を使う場合は最初の行の `-3.11` を `-3.12` に変更します。Python Launcher の `py` がない環境では、インストール済み Python の `python -m venv .venv` を使ってください。仮想環境の有効化は不要です。

`prepare:assets` が認識モデルを取得し、チェックサムを検証します。初回の依存関係・モデルの取得にはネット接続が必要です。Python の起動処理には標準ライブラリしか使用しません。

`Launch-MiddleFingerDetection.cmd` からも起動できます。このスクリプトは `dist` 内の exe を優先します。ソースを編集した内容を確認するときは、上記の `python.exe app.py` を直接実行してください。

## 操作

| 操作 | 動作 |
| --- | --- |
| カメラを開始 | 選択したカメラから映像を取得 |
| 停止 | 映像取得を停止してカメラを解放 |
| 検出を一時停止 / 再開 | カメラ映像を表示したまま認識のみ切り替え |
| カメラの選択を変更 | 使用中のカメラを停止。開始ボタンで新しい機器を接続 |
| 左右反転 / 骨格表示 | 表示のみ変更 |
| アプリを終了 | カメラとローカルサーバーを終了 |

手全体をカメラに向け、中指だけを伸ばして約0.3秒キープします。親指の位置は問いません。一度ジェスチャーを戻すと再び反応します。画面のカウントはページを再読み込みするとリセットされます。

### メッセージとエフェクト

「祝福の演出」で、検知時の文章とエフェクトを個別に設定できます。

| メッセージモード | 動作 |
| --- | --- |
| おまかせ | 8種類のメッセージを一巡するごとに並べ替えて表示。同じメッセージは連続しません |
| 定型文を選択 | 好きな定型文を毎回表示 |
| 自由入力 | メインテキスト（60文字まで）とサブテキスト（100文字まで・省略可）を表示 |

自由入力のメインが空欄の場合は「GESTURE DETECTED!」を表示します。入力内容は通常の文字として扱い、HTML は実行しません。

エフェクトは **紙吹雪・スターシャワー・花火・ネオンリング** の4種類です。固定選択か、同じ演出が連続しない「おまかせ」を選べます。「演出を試す」はカメラなしで使用でき、祝福カウントを増やしません。演出は約3秒で終了します。

設定と入力内容はページ内のみで保持し、保存・送信しません。再読み込みで初期状態に戻ります。OS / ブラウザーでアニメーションの抑制を設定している場合は、動くエフェクトを省略してメッセージを表示します。

タブを閉じるとカメラを解放し、ローカルサーバーは通常約5分後に自動終了します。すぐに終了したい場合は **アプリを終了** を使ってください。デモ向けの簡易判定のため、照明、手の隠れ方、撮影角度によって誤判定することがあります。

## テストとビルド

導入済みの環境で、次を実行します。

```powershell
npm.cmd test
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Windows exe の生成:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --onefile --windowed --name MiddleFingerDetection --add-data "web;web" app.py
```

生成先は `dist\MiddleFingerDetection.exe` です。モデル・WASM・UI・Python ランタイムを同梱します。ビルド手順と生成物の検証は [開発ガイド](docs/development.md) を参照してください。

## ドキュメント

- [開発・テスト・ビルド](docs/development.md)
- [構成とデータの流れ](docs/architecture.md)
- [トラブルシューティング](docs/troubleshooting.md)
- [プライバシーと公開時の注意](docs/privacy.md)
- [貢献方法](CONTRIBUTING.md)
- [変更履歴](CHANGELOG.md)
- [第三者コンポーネントとライセンス](THIRD_PARTY_NOTICES.md)

本プロジェクトは [MIT License](LICENSE) で公開しています。第三者ライブラリにはそれぞれのライセンスが適用されます。
