# EasyEDA を AI から操作するための skill を、この PC の Claude Code と Codex に入れる（PC ごとに 1 回）。
#
#   powershell -ExecutionPolicy Bypass -File install.ps1     （このリポジトリの直下で）
#
# 行うこと：
#   1. 上流の easyeda-api-skill（MIT）を %USERPROFILE%\tools\easyeda-api-skill に取得し、決めたコミットにして npm install
#   2. 拡張機能 run-api-gateway（Apache-2.0）の .eext を %USERPROFILE%\tools に取得
#   3. %USERPROFILE%\.claude\skills と %USERPROFILE%\.codex\skills に、次の 2 つをジャンクション（フォルダへのリンク）で登録
#        easyeda-api    → %USERPROFILE%\tools\easyeda-api-skill
#        easyeda-helper → このリポジトリの easyeda-helper（git pull の更新がそのまま反映される）
# 同じ名前の普通のフォルダが既にあれば、上書きせずに知らせる。何度実行してもよい。
# Windows PowerShell 5.1 と PowerShell 7 のどちらでも動く。

$ErrorActionPreference = 'Stop'
$UpstreamRepo = 'https://github.com/easyeda/easyeda-api-skill.git'
$UpstreamCommit = '70ba6b3'          # 2026-10-25 に確かめた版（v1.1.60）
$EextVersion = 'v1.0.5'
$EextName = "run-api-gateway_${EextVersion}_global.eext"
$EextUrl = "https://github.com/easyeda/eext-run-api-gateway/releases/download/$EextVersion/$EextName"

$tools = Join-Path $env:USERPROFILE 'tools'
$upstream = Join-Path $tools 'easyeda-api-skill'
$helper = Join-Path $PSScriptRoot 'easyeda-helper'

function Need($cmd) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$cmd が見つからない。インストールしてから実行する" }
}
Need git; Need node; Need npm
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 18) { throw "Node.js 18 以上が要る（今は $(node -v)）" }

# 1. 上流の skill
New-Item -ItemType Directory -Force -Path $tools | Out-Null
if (-not (Test-Path (Join-Path $upstream '.git'))) {
    Write-Host "取得：$UpstreamRepo → $upstream"
    git clone --quiet $UpstreamRepo $upstream
}
Push-Location $upstream
try {
    $dirty = git status --porcelain --untracked-files=no -- . ':!package-lock.json'   # npm install が書き換えるものは除く
    if ($dirty) {
        Write-Warning "$upstream に変更があるので、コミットの切り替えを飛ばす"
    } else {
        git fetch --quiet origin
        git -c advice.detachedHead=false checkout --quiet $UpstreamCommit
    }
    Write-Host "上流の skill：$(git log --oneline -1)"
    if (-not (Test-Path (Join-Path $upstream 'node_modules\ws'))) {
        npm install --omit=dev --no-audit --no-fund | Out-Null
    }
} finally { Pop-Location }

# 2. 拡張機能
$eext = Join-Path $tools $EextName
if (-not (Test-Path $eext)) {
    Write-Host "取得：$EextUrl"
    Invoke-WebRequest -Uri $EextUrl -OutFile $eext -UseBasicParsing
}
Write-Host "拡張機能：$eext"

# 3. 登録
function Link-Skill($skillsDir, $name, $target) {
    New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null
    $link = Join-Path $skillsDir $name
    $item = Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue
    if ($item) {
        $isLink = [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
        if (-not $isLink) { Write-Warning "$link は普通のフォルダなので触らない（手で消すか名前を変えてから再実行）"; return }
        $cur = $item.Target
        if ($cur -is [array]) { $cur = $cur[0] }
        if ($cur -and ((Resolve-Path -LiteralPath $cur).Path -eq (Resolve-Path -LiteralPath $target).Path)) { Write-Host "済み：$link"; return }
        [IO.Directory]::Delete($link)    # リンクだけを消す（リンク先は消えない）
    }
    New-Item -ItemType Junction -Path $link -Target $target | Out-Null
    Write-Host "登録：$link → $target"
}
foreach ($dir in @((Join-Path $env:USERPROFILE '.claude\skills'), (Join-Path $env:USERPROFILE '.codex\skills'))) {
    Link-Skill $dir 'easyeda-api' $upstream
    Link-Skill $dir 'easyeda-helper' $helper
}

Write-Host ''
Write-Host '次は人が EasyEDA Pro で行う（PC ごとに 1 回）：'
Write-Host '  1. EasyEDA Pro をインストール（https://easyeda.com/page/download、半オフラインで使う）'
Write-Host "  2. 拡張機能マネージャーで $eext をインポート"
Write-Host '  3. 拡張機能の設定で「Allow interactive with external」と「Show at header menu」にチェック'
Write-Host "  4. 中継サーバーを起動：powershell -File `"$helper\scripts\bridge-ctl.ps1`" start"
Write-Host '  5. EasyEDA のヘッダーの Run API Gateway メニューで Reconnect'
Write-Host '  確認：node diagnose-project-api.mjs（easyeda-helper\scripts で実行）'
Write-Host 'Claude Code と Codex は、起動し直すと skill を読み込む。'
