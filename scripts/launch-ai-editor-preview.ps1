[CmdletBinding()]
param(
	[Parameter(Mandatory = $false)]
	[string]$GatewayOrigin = $env:AI_EDITOR_VERIFY_GATEWAY_ORIGIN,
	[string]$EdgeOutboundProxy = 'http://127.0.0.1:7890',
	[string]$ProxyRepository,
	[string]$EdgeDataRoot,
	[string]$UserDataDir,
	[string]$ExtensionsDir,
	[string]$SharedDataDir,
	[string]$Workspace
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$repositoryParent = Split-Path -Parent $repositoryRoot
if ([string]::IsNullOrWhiteSpace($ProxyRepository)) {
	$ProxyRepository = Join-Path $repositoryParent 'codex_proxy-provider-worker'
}
if ([string]::IsNullOrWhiteSpace($EdgeDataRoot)) {
	$EdgeDataRoot = Join-Path $ProxyRepository '.ai-editor-dev\public-preview-client'
}
if ([string]::IsNullOrWhiteSpace($UserDataDir)) {
	$UserDataDir = Join-Path $repositoryRoot '.manual-preview-user-data'
}
if ([string]::IsNullOrWhiteSpace($ExtensionsDir)) {
	$ExtensionsDir = Join-Path $repositoryRoot '.manual-preview-extensions'
}
if ([string]::IsNullOrWhiteSpace($SharedDataDir)) {
	$SharedDataDir = Join-Path $repositoryRoot '.manual-preview-shared'
}
if ([string]::IsNullOrWhiteSpace($Workspace)) {
	$Workspace = $repositoryRoot
}

foreach ($name in @('ProxyRepository', 'EdgeDataRoot', 'UserDataDir', 'ExtensionsDir', 'SharedDataDir', 'Workspace')) {
	Set-Variable -Name $name -Value ([IO.Path]::GetFullPath((Get-Variable -Name $name -ValueOnly)))
}
if ([string]::IsNullOrWhiteSpace($GatewayOrigin)) {
	throw 'GatewayOrigin is required. Set AI_EDITOR_VERIFY_GATEWAY_ORIGIN or pass -GatewayOrigin.'
}

$startScript = Join-Path $ProxyRepository 'tools\start-ai-editor-dev.ps1'
$stopScript = Join-Path $ProxyRepository 'tools\stop-ai-editor-dev.ps1'
$codeLauncher = Join-Path $repositoryRoot 'scripts\code.bat'
foreach ($path in @($startScript, $stopScript, $codeLauncher)) {
	if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
		throw "Required file is missing: $path"
	}
}

function Get-ListenerProcessId([int]$Port) {
	$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
		Select-Object -First 1
	if ($listener) {
		return [int]$listener.OwningProcess
	}
	return $null
}

function Assert-ExistingEdgeBelongsToRepository([int]$ProcessId) {
	$process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
	if (
		-not $process -or
		-not $process.CommandLine -or
		$process.CommandLine.IndexOf($ProxyRepository, [StringComparison]::OrdinalIgnoreCase) -lt 0
	) {
		throw "Port 47921 is occupied by an unrelated process (PID $ProcessId); refusing to stop or reuse it."
	}
}

$edgeProcessId = Get-ListenerProcessId 47921
if ($edgeProcessId) {
	Assert-ExistingEdgeBelongsToRepository $edgeProcessId
	Write-Host "[ai-editor-preview] Reusing repository-owned Edge PID $edgeProcessId."
} else {
	$startArguments = @(
		'-Mode', 'edge',
		'-AuthenticationMode', 'real',
		'-GatewayOrigin', $GatewayOrigin,
		'-EdgeOutboundProxy', $EdgeOutboundProxy,
		'-DataRoot', $EdgeDataRoot
	)
	& powershell -NoProfile -ExecutionPolicy Bypass -File $startScript @startArguments
	if ($LASTEXITCODE -ne 0) {
		throw "Preview Edge start failed with exit code $LASTEXITCODE."
	}
}

$nonceFile = Join-Path $EdgeDataRoot 'edge-local-nonce.secret'
if (-not (Test-Path -LiteralPath $nonceFile -PathType Leaf)) {
	throw "Preview Edge nonce file is missing: $nonceFile"
}
$nonce = [IO.File]::ReadAllText($nonceFile).Trim()
try {
	$status = Invoke-RestMethod `
		-Uri 'http://127.0.0.1:47921/ai-editor/status' `
		-Headers @{ 'X-AI-Editor-Local-Nonce' = $nonce } `
		-TimeoutSec 10
} finally {
	$nonce = $null
}
if ($status.state -notin @('ready', 'login_required', 'account_unavailable', 'service_unavailable', 'password_change_required')) {
	throw "Preview Edge returned an unsupported account state: $($status.state)"
}

$environmentNames = @(
	'VSCODE_AI_EDITOR_ACCOUNT_EDGE_ORIGIN',
	'VSCODE_AI_EDITOR_ACCOUNT_GATEWAY_ORIGIN',
	'VSCODE_AI_EDITOR_ACCOUNT_EDGE_NONCE_FILE',
	'VSCODE_AGENT_HOST_CODEX_PROXY_MODE',
	'VSCODE_AGENT_HOST_CODEX_PROXY_BASE_URL'
)
$environmentValues = @{
	VSCODE_AI_EDITOR_ACCOUNT_EDGE_ORIGIN = 'http://127.0.0.1:47921'
	VSCODE_AI_EDITOR_ACCOUNT_GATEWAY_ORIGIN = $GatewayOrigin
	VSCODE_AI_EDITOR_ACCOUNT_EDGE_NONCE_FILE = $nonceFile
	VSCODE_AGENT_HOST_CODEX_PROXY_MODE = 'external-local-proxy'
	VSCODE_AGENT_HOST_CODEX_PROXY_BASE_URL = 'http://127.0.0.1:47921'
}
$previousEnvironment = @{}
try {
	foreach ($name in $environmentNames) {
		$previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
		[Environment]::SetEnvironmentVariable($name, $environmentValues[$name], 'Process')
	}
	Write-Host "[ai-editor-preview] Edge: http://127.0.0.1:47921 -> $GatewayOrigin"
	Write-Host "[ai-editor-preview] Account state: $($status.state)"
	Write-Host '[ai-editor-preview] Launching the development Code build. The isolated Edge stays running after Code exits.'
	& $codeLauncher `
		--user-data-dir $UserDataDir `
		--extensions-dir $ExtensionsDir `
		--shared-data-dir $SharedDataDir `
		$Workspace
} finally {
	foreach ($name in $environmentNames) {
		[Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
	}
}
