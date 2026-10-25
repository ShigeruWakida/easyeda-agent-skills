---
name: easyeda-helper
description: >-
  EasyEDA Pro（嘉立创EDA 专业版、デスクトップ版 3.2.209）を AI から操作するための手順と回避策。
  中継サーバーの起動・停止、接続の確認、プロジェクトの作成（公開 API の createProject が壊れている版の回避策）、
  回路図ページを開いて部品を置く確認。EasyEDA、回路図、PCB、プロジェクトの作成、run-api-gateway、
  bridge-server を扱うときに使う。API の詳細は easyeda-api skill を読む。
---

# EasyEDA Pro を AI から操作する（easyeda-helper）

API の使い方（クラス・メソッド・座標の単位・列挙型）は **easyeda-api** skill（公式の easyeda-api-skill）を読むこと。
この skill は、その上で必要になった「環境の準備」と「版の不具合の回避策」をまとめたもの。

## 0. 仕組み

```
AI（Claude Code / Codex）─ HTTP ─ 中継サーバー（node、127.0.0.1:49620）─ WebSocket ─ EasyEDA Pro の拡張機能 run-api-gateway
```

- `POST http://127.0.0.1:49620/execute {"code": "<JavaScript>"}` で、EasyEDA の中で `eda.*` を実行し、`return` の値が返る。
- `GET /health` で接続の状態（`edaConnected`）。
- 送るコードはエディタ本体と同じ窓（`https://client/editor`）で動く。`fetch('/api/client/...')` でローカルサーバーも呼べる。

## 1. 準備（PC ごとに 1 回）

`tools/skills/install.ps1`（このリポジトリの README.md を参照）が、上流の easyeda-api-skill の取得、拡張機能のダウンロード、
Claude Code と Codex への skill の登録を行う。そのあと人が GUI で行うこと：

1. EasyEDA Pro をインストール（半オフラインで使う）。
2. 「拡張機能」→「拡張機能マネージャー」で `run-api-gateway_v1.0.5_global.eext` をインポート。
3. 拡張機能の設定で「Allow interactive with external」と「Show at header menu」にチェック。
4. 中継サーバーを起動してから、ヘッダーの Run API Gateway メニューで「Reconnect」。

## 2. 中継サーバー

```powershell
pwsh -File <skill>/scripts/bridge-ctl.ps1 start    # 起動（既に動いていれば何もしない）
pwsh -File <skill>/scripts/bridge-ctl.ps1 status   # 状態（EasyEDA 接続の有無）
pwsh -File <skill>/scripts/bridge-ctl.ps1 stop     # 停止。CORS が * で認証も無いので、使い終わったら止める
```

`edaConnected` が false なら、EasyEDA 側で Reconnect を押してもらう（AI からはできない）。

## 3. スクリプト（node、`<skill>/scripts/`）

| スクリプト | 内容 | 変更するか |
|---|---|---|
| `diagnose-project-api.mjs` | 版・動作モード・チーム（＝プロジェクトのフォルダ）・プロジェクト一覧・開いている文書 | しない |
| `create-project.mjs <名前> [--yes]` | プロジェクトを作って開き、回路図ページを開く（§4 の回避策）。`--yes` なしは計画の表示だけ | `--yes` のとき作る |
| `verify-open-project.mjs [--place C番号] [--delete]` | 開いているプロジェクトの回路図ページを開き、LCSC 番号の部品を 1 個置いてピン座標を読む | `--place` のとき置く |
| `test-create-project.mjs [--yes] [teamUuid]` | 公開 API の createProject が直ったかの再試験（新しい版で使う） | `--yes` のとき作る |
| `bridge.mjs` | 中継サーバーへの送信（`execute(code)`）と結果の保存。ほかのスクリプトから import | — |

結果は `EASYEDA_LOG_DIR`（無ければ一時フォルダの `easyeda-logs`）に JSON で残る。

## 4. 版の不具合と回避策（EasyEDA Pro 3.2.209、半オフライン、2026-10-25 確認）

- **`eda.dmt_Project.createProject` は必ず失敗する（undefined）。** 本体（pro-ui の `MK.createProject`）が、ローカルサーバーへの要求の
  保存先 `path` を常に空で送るため（ログ：`请求参数path错误`）。引数では直せない。`fileFormat` も無視され、`.eprj3` は作れない。
  → `create-project.mjs` が GUI と同じ要求を直接送る：`POST /api/client/createProject {name, path, ...}` → `POST /api/client/openProject {path}`
  → `eda.dmt_Project.openProject(uuid)`。Board1・Schematic1・ページ P1 が自動でできる。非公開の内部 API なので、版が変わったら
  先に `test-create-project.mjs` で公開 API が直っていないか確かめる（スクリプトは 3.2.209 以外では止まる）。
- **別のプロジェクトに未保存の変更があると、`openProject` が理由を出さずに false を返す。** `eda.sch_Document.save()` の後なら開ける。
- **チームの UUID はフォルダの絶対パス**（`...\EasyEDA-Pro\projects` など）。`getAllProjectsUuid(<そのパス>)` で一覧が取れる。
- **`eda.dmt_Folder.getAllFoldersUuid` は本体の中で例外になる**（`rootList` が undefined）。
- **ネットラベルの API（`SCH_PrimitiveAttribute.createNetLabel`）は v4 から。** 3.2 では、ネット名を付けた線
  （`sch_PrimitiveWire.create(line, net)`）とネットポート（`createNetPort`）・電源記号（`createNetFlag`）で代わりにする。
- **削除：** 公開 API の `deleteProject` は何もしない。内部 API `POST /api/client/deleteProject {uuid, path}` で消える（元に戻せない。
  人の了承を得てから。開いていないプロジェクトだけ）。
- 上流の手引き（guide/cli.md）の CLI と `.eprj3` は EasyEDA Pro v4.1.60 以上が前提で、2026-10-25 時点で v4 は公開されていない。

## 5. 守ること

- 既存のプロジェクト（例題を含む）を試験に使わない。試験には専用の名前のプロジェクトを作る。
- プロジェクトの削除、上書きは人の了承を得てから。
- 部品は LCSC の C 番号で選ぶ（`eda.lib_Device.getByLcscIds`）。回路図の座標の単位は 10 mil（0.01 インチ）。
- EasyEDA のインストールファイル（`C:\Program Files\easyeda-pro`）は読むだけで、変更しない。

調査の詳細：`references/investigation-3.2.209.md`（RoboScope の作業で調べた記録。パスは当時のもの）。
