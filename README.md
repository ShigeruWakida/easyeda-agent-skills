# easyeda-agent-skills

EasyEDA Pro（嘉立创EDA 专业版）を AI エージェント（Claude Code / Codex）から操作するための Agent Skills と、その入れ方。

| skill | 内容 | 正本 |
|---|---|---|
| `easyeda-helper` | 準備（中継サーバーの起動・停止、接続の確認）と、EasyEDA Pro 3.2.209 の不具合の回避策（プロジェクトの作成など）、確認スクリプト | このリポジトリの `easyeda-helper/` |
| `easyeda-api` | EasyEDA の公式 API リファレンスと中継サーバー（上流：[easyeda/easyeda-api-skill](https://github.com/easyeda/easyeda-api-skill)、MIT） | `%USERPROFILE%\tools\easyeda-api-skill`（install.ps1 が取得、コミット 70ba6b3） |

## 入れ方（PC ごとに 1 回）

前提：Git、Node.js 18 以上。

```powershell
git clone https://github.com/ShigeruWakida/easyeda-agent-skills.git $env:USERPROFILE\Documents\easyeda-agent-skills
cd $env:USERPROFILE\Documents\easyeda-agent-skills
powershell -ExecutionPolicy Bypass -File install.ps1
```

install.ps1 は、上流の skill と拡張機能 run-api-gateway（.eext、Apache-2.0）を取得し、
`%USERPROFILE%\.claude\skills` と `%USERPROFILE%\.codex\skills` にジャンクションで登録する。
このリポジトリを `git pull` すれば両方の skill に反映される。登録の後、Claude Code と Codex を起動し直す。
クローンした場所を移したら、install.ps1 をもう一度実行する（登録先を付け替える）。

EasyEDA Pro の本体と拡張機能の取り込みは人が GUI で行う（install.ps1 の最後に手順が出る）。
