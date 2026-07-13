[CmdletBinding()]
param(
	[string]$ProxyRoot = (Join-Path $env:USERPROFILE '.claude\proxy'),
	[int]$Port = 47892,
	[int]$TimeoutSeconds = 360,
	[switch]$Worker
)

$ErrorActionPreference = 'Stop'

$stopScript = Join-Path $ProxyRoot 'stop-codex-proxy.ps1'
$startScript = Join-Path $ProxyRoot 'start-codex-proxy.ps1'
$restartLog = Join-Path $ProxyRoot 'codex-proxy-safe-restart.log'
$liveUrl = "http://127.0.0.1:$Port/live"

function Write-RestartLog {
	param([string]$Message)

	$line = '{0} {1}' -f (Get-Date).ToString('s'), $Message
	Add-Content -LiteralPath $restartLog -Value $line -Encoding utf8
}

function Get-ListenerProcessId {
	$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
		Select-Object -First 1
	if ($listener) {
		return [int]$listener.OwningProcess
	}
	return $null
}

function Test-ProxyLive {
	try {
		$health = Invoke-RestMethod -Uri $liveUrl -TimeoutSec 2
		return $health.status -eq 'ok'
	} catch {
		return $false
	}
}

if (-not (Test-Path -LiteralPath $stopScript)) {
	throw "Proxy stop script not found: $stopScript"
}
if (-not (Test-Path -LiteralPath $startScript)) {
	throw "Proxy start script not found: $startScript"
}

if ($Worker) {
	try {
		Write-RestartLog "worker started pid=$PID"
		& $stopScript
		& $startScript

		$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
		do {
			if (Test-ProxyLive) {
				$newPid = Get-ListenerProcessId
				Write-RestartLog "restart completed proxyPid=$newPid"
				exit 0
			}
			Start-Sleep -Milliseconds 500
		} while ((Get-Date) -lt $deadline)

		throw "Proxy did not become ready within $TimeoutSeconds seconds."
	} catch {
		Write-RestartLog "restart failed: $($_.Exception.Message)"

		# A final start attempt prevents a failed stop/start sequence from
		# intentionally leaving the shared Proxy offline.
		try {
			& $startScript
			if (Test-ProxyLive) {
				Write-RestartLog "fallback start recovered proxyPid=$(Get-ListenerProcessId)"
			}
		} catch {
			Write-RestartLog "fallback start failed: $($_.Exception.Message)"
		}
		exit 1
	}
}

$oldPid = Get-ListenerProcessId
$powershell = (Get-Process -Id $PID).Path
$workerArguments = @(
	'-NoProfile',
	'-ExecutionPolicy', 'Bypass',
	'-File', "`"$PSCommandPath`"",
	'-Worker',
	'-ProxyRoot', "`"$ProxyRoot`"",
	'-Port', $Port,
	'-TimeoutSeconds', $TimeoutSeconds
)

# The independent hidden worker survives interruption of the initiating AI
# request and completes the start phase after stopping the shared Proxy.
$workerProcess = Start-Process `
	-FilePath $powershell `
	-ArgumentList $workerArguments `
	-WindowStyle Hidden `
	-PassThru

Write-Host "[ai-proxy] Safe restart worker started. PID: $($workerProcess.Id). Previous Proxy PID: $oldPid"

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
	$currentPid = Get-ListenerProcessId
	if (
		(Test-ProxyLive) -and
		$currentPid -and
		(-not $oldPid -or $currentPid -ne $oldPid)
	) {
		Write-Host "[ai-proxy] Ready on 127.0.0.1:$Port. PID: $currentPid"
		exit 0
	}

	if ($workerProcess.HasExited -and $workerProcess.ExitCode -ne 0 -and -not (Test-ProxyLive)) {
		throw "Safe Proxy restart failed. Check $restartLog"
	}

	Start-Sleep -Milliseconds 500
	$workerProcess.Refresh()
} while ((Get-Date) -lt $deadline)

throw "Timed out waiting for the restarted Proxy. Check $restartLog"
