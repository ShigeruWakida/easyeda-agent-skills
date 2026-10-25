# EasyEDA の中継サーバー（easyeda-api-skill の scripts/bridge-server.mjs、127.0.0.1:49620）の起動・停止・状態。
#   pwsh -File bridge-ctl.ps1 start | stop | status
# 上流の場所は環境変数 EASYEDA_API_SKILL_DIR、無ければ %USERPROFILE%\tools\easyeda-api-skill。
# 中継サーバーは CORS が * で認証もないので、使わないときは stop する。
param([ValidateSet('start', 'stop', 'status')][string]$Action = 'status')

$ErrorActionPreference = 'Stop'
$skill = if ($env:EASYEDA_API_SKILL_DIR) { $env:EASYEDA_API_SKILL_DIR } else { Join-Path $env:USERPROFILE 'tools\easyeda-api-skill' }
$server = Join-Path $skill 'scripts\bridge-server.mjs'
$log = Join-Path ([IO.Path]::GetTempPath()) 'easyeda-bridge.log'
$port = 49620

function Get-Health {
    try { return Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -TimeoutSec 3 } catch { return $null }
}
function Get-BridgeProcess {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object { $_.CommandLine -like '*bridge-server.mjs*' }
}

switch ($Action) {
    'status' {
        $h = Get-Health
        if ($h) { "動作中：EasyEDA 接続 $($h.edaConnected)、窓 $($h.edaWindowCount)" } else { '停止中' }
        Get-BridgeProcess | ForEach-Object { "  node PID $($_.ProcessId)" }
    }
    'start' {
        if (Get-Health) { '既に動作中'; break }
        if (-not (Test-Path $server)) { throw "上流の skill が無い：$server（tools/skills/install.ps1 を実行）" }
        Start-Process -FilePath 'node' -ArgumentList "`"$server`"" -WorkingDirectory $skill -WindowStyle Hidden `
            -RedirectStandardOutput $log -RedirectStandardError "$log.err"
        foreach ($i in 1..20) { Start-Sleep -Milliseconds 500; if (Get-Health) { break } }
        $h = Get-Health
        if (-not $h) { throw "起動しなかった。ログ：$log" }
        "起動した（ログ $log）。EasyEDA 接続 $($h.edaConnected)。false なら EasyEDA の Run API Gateway メニューで Reconnect"
    }
    'stop' {
        $p = Get-BridgeProcess
        if (-not $p) { '動いていない'; break }
        $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
        '停止した'
    }
}
