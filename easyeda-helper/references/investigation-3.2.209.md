> この文書は RoboScope（ShigeruWakida/RoboScope）の作業で 2026-10-25 に調べた記録の写し。文中の `tools/skills/easyeda-helper/scripts/` は、このリポジトリの `easyeda-helper/scripts/` にあたる。`logs/` は RoboScope 側にある。

# EasyEDA Pro を AI から操作する：プロジェクト作成 API の調査（2026-10-25）

ChatGPT が作った調査指示書（ユーザーが 2026-10-25 に貼り付け）に沿って調べた結果。
指示書は成果物を `rpc-analysis.md` などの複数の Markdown に分けるよう求めていたが、
リポジトリの規則（AGENTS.md §3：資料は HTML、README.md は例外）に合わせて、この README.md 1 本にまとめた。

## 結論

- **原因（確認済み）**：EasyEDA Pro 3.2.209 の本体の `createProject` が、ローカルサーバーへの要求の `path` を
  常に空（`void 0`）にしている。ローカルサーバーは `path` を必須にしているので、**この版では API でプロジェクトを作れない**。
  引数の渡し方では直せない。
- **`.eprj3`**：この版の本体とローカルサーバーには `.eprj3` の処理がない（API の型定義にあるだけ）。作れない。
- **新しい版**：公式のダウンロードページと版の履歴の最新は 3.2 系（3.2.209）。easyeda-api-skill の手引きが前提にしている
  v4.1.60 以上（CLI、`.eprj3`、ネットラベル API）は、2026-10-25 時点で公開されていない。
- **採る方式（2026-10-25 更新）**：`tools/skills/easyeda-helper/scripts/create-project.mjs` で、GUI の新規作成と同じ要求をローカルサーバーへ
  直接送ってプロジェクトを作る（非公開の内部 API。ユーザーの了承済み）。作成・一覧への登録・実ファイル・公開 API での
  オープン・回路図ページへの部品の配置まで確かめた（§5.1）。内部 API が変わったときは、GUI で作る方式（成功条件 3）に戻る。

## 1. 環境

| 項目 | 値 |
|---|---|
| EasyEDA Pro | 3.2.209（`C:\Program Files\easyeda-pro`、`version` ファイルは `v41.2.1-jlc-sa-win-x64.6`） |
| 本体の UI | `resources/app/assets/pro-ui/3.2.198.2800f583/js/ui.js` |
| 拡張 API | pro-api 0.3.59（`resources/app/assets/pro-api/0.3.59.1ca9efb5/api.js`） |
| ローカルサーバー | `resources/app/app.js` |
| 動作モード | `HALF_OFFLINE`（`Documents\EasyEDA-Pro\config.json`） |
| 接続 | 拡張機能 run-api-gateway v1.0.5 ＋ easyeda-api-skill の `scripts/bridge-server.mjs`（127.0.0.1:49620） |

インストールファイルは読むだけで、変更していない。

## 2. 根本原因（RPC の経路）

```
eda.dmt_Project.createProject(...)                      pro-api/api.js
  → rpcCall("extensionApi.DMT_Project.createProject",    引数をそのまま渡すだけ
            {projectFriendlyName, projectName, teamUuid, folderUuid, description,
             collaborationMode = 1, fileFormat = "eprj3"})
  → MK.createProject(e)                                   pro-ui/.../ui.js（DMT_Project の表に登録）
       fileFormat は受け取らない（分割代入に無い）
       teamUuid を w.teams から探す。見つからなければ undefined を返す（例外なし）
       teamUuid が無く workspace が "Personal" ならログインユーザーを所有者にする
       要求を組み立てる：{name, description, ..., project_path, mode, path: void 0}   ← ここ
  → rpcCall(rZ.CLOUD.CREATE, {project: u, ...})
  → ローカルサーバー POST /api/client/createProject       app.js
       let e = this.ctx.requestParams.path;
       if (!e || e == "undefined") throw REQUEST_PARAMS_ILLEGAL "path"   ← 「请求参数path错误」
       … path/<name>.eprj2 を作る
```

本体の該当箇所（ui.js、整形して抜粋）：

```js
static async createProject(e) {
  let {projectFriendlyName:i, projectName:o, teamUuid:n, folderUuid:r, description:a, collaborationMode:s=1} = e;
  ...
  } else if (n) { if (l = w.teams.find(f => f.uuid === n), !l) return }
    else if (!n && w.workspace === "Personal") l = w.globalVariableCookieData.userInfo;
    else return;
  let d = o || `${l.username}/${c}`,
      u = {name:i, description:a||"", public:!1, user_uuid:l.uuid, ownerSelectId:r||l.uuid,
           cbb_project:!1, project_path:d, editorVersion:"", mode:s, path:void 0},
      {message:p} = await w.messageBus.rpcCall(rZ.CLOUD.CREATE, {project:u, options:{needTips:!1}});
  if (p.success) return ... p.result.project.uuid
}
```

GUI の「新規プロジェクト」は同じ `rZ.CLOUD.CREATE` を、選んだ保存先を入れて呼んでいる（`{..., project_path: ye, mode: X, path: F}`）。
API の経路だけが `path` を渡していない。

| 確認したこと | 結果 |
|---|---|
| RPC ハンドラの場所 | `pro-ui/3.2.198.2800f583/js/ui.js` の `MK.createProject`（`DMT_Project:{..., createProject: MK.createProject, ...}`） |
| パスの解決 | API の経路には無い（`path: void 0` を固定で入れる） |
| `path` が undefined になる条件 | 常に |
| 引数で直せるか | 直せない。`teamUuid` をフォルダのパスにすると w.teams では見つかるが、`path` は空のまま |
| 版の不具合か | そう判断する（GUI の経路は `path` を渡す） |
| ログに何も出ない呼び出し | `teamUuid` が w.teams に無いとき、または `folderUuid` がチームのフォルダ木に無いときは、サーバーに届く前に undefined を返す |

## 3. チームとフォルダ（読み取りの診断）

`diagnose-project-api.mjs` の結果（`logs/` に保存）：

- ワークスペースは `Personal` だけ。
- チームは 2 つで、UUID がフォルダの絶対パス：`...\EasyEDA-Pro\projects`、`...\EasyEDA-Pro\example-projects`。
- `projects` のプロジェクトは 0 件。`example-projects` に例題が 5 件（試験には使わない：既存のプロジェクトを変えないため）。
- `eda.dmt_Folder.getAllFoldersUuid(<チーム>)` は本体の中で `rootList` の読み出しに失敗する（`Cannot read properties of undefined (reading 'rootList')`）。

## 4. eprj2 / eprj3

| 動作モード | eprj2 | eprj3 |
|---|---|---|
| HALF_OFFLINE | GUI で作れる（ローカルサーバーが `.eprj2` を作る）。API では作れない（§2） | 作れない（本体・サーバーに処理が無い。`eprj3` の文字列は pro-api の型と既定値にだけある） |
| FULL_OFFLINE | 未確認（同じ本体の関数を通るので、API では同じく失敗する見込み） | 未確認（同上の理由で作れない見込み） |

## 5. 回避策

| 方式 | 判定 | 理由 |
|---|---|---|
| D-1 公式 API だけで作る | 不可 | §2 |
| D-2 既存プロジェクトの複製 | 不可（公開 API） | pro-api の `copyProject` は中身が空の関数（`copyProject(t,i,n,r,s){}`）。ファイルの複製はプロジェクトの UUID が重なるおそれがあり、DB（`EasyEDA-Pro\database`）への登録も要るので見送った |
| D-3 空の `.eprj2` をテンプレートから作る | 見送り | `.eprj2` は SQLite の単一ファイルで、登録は本体の DB。形式の解析に時間がかかり、指示書の「根本原因に時間をかけすぎない」に当たる |
| **D-4 ローカルサーバーの `/api/client/createProject` を `path` 付きで直接呼ぶ** | **採用（成功）** | §5.1。非公開の内部 API なので、版が変わると壊れうる（スクリプトは 3.2.209 以外では止まる） |
| GUI で作成＋API で描画（成功条件 3） | 予備 | 内部 API が使えなくなったときの方式 |

### 5.1 直接呼び出しの方式（create-project.mjs）

拡張機能のコードはエディタ本体と同じ窓（`https://client/editor`）で動くので、本体と同じ相対 URL でローカルサーバーを呼べる。
pro-mgr の `createInClient` と同じ順に呼ぶ：

1. `POST /api/client/createProject` `{cbb_project:false, name, introduction:"", content, path:<プロジェクトフォルダ>, public:false, default_sheet:""}`
   → `{result: {<uuid>: {path: "<フォルダ>\<name>.eprj2"}}}`
2. `POST /api/client/openProject` `{path: <作られたファイル>}`（クライアントに登録）
3. `eda.dmt_Project.openProject(uuid)`（公開 API）→ Board1・Schematic1・ページ P1 が自動でできている

確かめたこと（2026-10-25、`logs/`）：

| 項目 | 結果 |
|---|---|
| 作成 | `ApiTest-Create-1.eprj2`（試験用）と `RoboScope-Capture-Test.eprj2` が `Documents\EasyEDA-Pro\projects` にできた |
| 一覧 | `getAllProjectsUuid(<projects>)` に入る |
| オープン | `openProject(uuid)` で開け、`getCurrentProjectInfo()` が新しいプロジェクトを返す |
| 描画 | `verify-open-project.mjs --place C25804 --delete`：抵抗を置き、ピン 2 本の座標を読み、消せた |
| 注意 | 開いているプロジェクトに未保存の変更があると、別のプロジェクトの `openProject` は false を返す（理由はログに出ない）。`sch_Document.save()` の後なら開ける。スクリプトは開く前に保存する |
| 形式 | `.eprj2`（`.eprj3` はこの版では作れない） |

試験用の `ApiTest-Create-1` は、ユーザーの了承を得て 2026-10-25 に削除した（`POST /api/client/deleteProject` `{uuid, path}`。一覧と実ファイルの両方から消えたことを確認）。

## 6. 版の移行

- 公式のダウンロードページ（https://easyeda.com/page/download、2026-10-25）：Windows x64 の最新は 3.2.209。v4 系は無い。
- 版の履歴（https://prodocs.easyeda.com/en/faq/client-version/）：3.2.149、2.2.47.7、2.1.64。
- 更新記録（https://prodocs.easyeda.com/en/release-note/index）：最新の節は V3.0.x。`createProject` の不具合の記載は無い。
- easyeda-api-skill の手引き（guide/cli.md）は「クライアントは v4.1.60 以上」と書く。CLI、`.eprj3` のフォルダ形式、
  `SCH_PrimitiveAttribute.createNetLabel`（v4 から）は、v4 が公開されるまで使えない。
- 判断：今は更新しない（更新できる版が無い）。v4 が公開されたら、3.2.209 を上書きせずに別の場所で試す。

## 7. スクリプト

2026-10-25 に skill（`tools/skills/easyeda-helper/`）へ移した。すべて `node` で、`tools/skills/easyeda-helper/scripts/` から実行する。結果は `EASYEDA_LOG_DIR`（無ければ一時フォルダの `easyeda-logs`）に残る（このフォルダの `logs/` は移す前の記録）。中継サーバーが動いていて、EasyEDA の拡張機能が接続していること。

| スクリプト | 内容 | 変更するか |
|---|---|---|
| `diagnose-project-api.mjs` | 版・モード・ワークスペース・チーム・プロジェクト一覧・開いている文書 | しない |
| `create-project.mjs <名前> [--yes]` | プロジェクトを作って開き、回路図ページを開く（内部 API、§5.1）。`--yes` なしは計画の表示だけ | `--yes` のときだけ作る |
| `test-create-project.mjs [--yes] [teamUuid]` | `createProject` の再試験（新しい版で直ったかを見る） | `--yes` のときだけプロジェクトを作る |
| `verify-open-project.mjs [--place C番号] [--delete]` | 開いているプロジェクトの回路図ページを開き、部品を 1 個置いてピン座標を読む | `--place` のときだけ部品を置く |
| `bridge.mjs` | 中継サーバーへの送信（`POST /execute {"code"}`）と、結果を `logs/` に保存 | — |

## 8. 次の作業

1. （済み）`node create-project.mjs RoboScope-Capture-Test --yes` で作成し、回路図ページを開いた。
2. （済み）`node verify-open-project.mjs --place C25804 --delete` で、部品の配置とピン座標の読み出しを確かめた。
3. `hardware/capture_test_board/build_easyeda.py --test` で数個を描き、表示を確かめてから全体を描く。
4. EasyEDA の ERC（`SCH_Drc`）で検査する。
