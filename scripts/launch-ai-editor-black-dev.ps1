[CmdletBinding()]
param(
	[ValidateSet('mock', 'real')]
	[string]$AuthenticationMode = 'real',
	[ValidateSet('ready', 'login_required', 'account_unavailable', 'service_unavailable', 'password_change_required')]
	[string]$State = 'login_required',
	[string]$BlackRepository,
	[string]$DataRoot,
	[string]$UserDataDir,
	[string]$ExtensionsDir,
	[string]$SharedDataDir,
	[string]$Workspace
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$connectorPath = Join-Path $PSScriptRoot 'connect-ai-editor-black-dev.ps1'
$codeLauncherPath = Join-Path $PSScriptRoot 'code.bat'

if ([string]::IsNullOrWhiteSpace($Workspace)) {
	$Workspace = $repositoryRoot
}
if ([string]::IsNullOrWhiteSpace($UserDataDir)) {
	$UserDataDir = Join-Path $repositoryRoot '.verify-edge-user-data'
}
if ([string]::IsNullOrWhiteSpace($ExtensionsDir)) {
	$ExtensionsDir = Join-Path $repositoryRoot '.verify-edge-extensions'
}
if ([string]::IsNullOrWhiteSpace($SharedDataDir)) {
	$SharedDataDir = Join-Path $repositoryRoot '.verify-edge-shared'
}

function Resolve-FullPath([string]$Path) {
	return [System.IO.Path]::GetFullPath($Path)
}

$Workspace = Resolve-FullPath $Workspace
$UserDataDir = Resolve-FullPath $UserDataDir
$ExtensionsDir = Resolve-FullPath $ExtensionsDir
$SharedDataDir = Resolve-FullPath $SharedDataDir

foreach ($path in @($connectorPath, $codeLauncherPath)) {
	if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
		throw "Required launcher file is missing: $path"
	}
}
if (-not (Test-Path -LiteralPath $Workspace -PathType Container)) {
	throw "Workspace is missing: $Workspace"
}
if (Test-Path -LiteralPath (Join-Path $UserDataDir 'code.lock') -PathType Leaf) {
	throw "The isolated Code profile is already in use: $UserDataDir. Close that Code window before launching again."
}

$connectorArguments = @{
	AuthenticationMode = $AuthenticationMode
	State = $State
	ValidateOnly = $true
}
if (-not [string]::IsNullOrWhiteSpace($BlackRepository)) {
	$connectorArguments.BlackRepository = $BlackRepository
}
if (-not [string]::IsNullOrWhiteSpace($DataRoot)) {
	$connectorArguments.DataRoot = $DataRoot
}

$connectorInfo = & $connectorPath @connectorArguments
if (-not $connectorInfo.valid) {
	throw 'The isolated Black Edge configuration is invalid.'
}

$connectorArguments.Remove('ValidateOnly')
& $connectorPath @connectorArguments

if (-not (Test-Path -LiteralPath $connectorInfo.nonceFile -PathType Leaf)) {
	throw "The isolated Black Edge nonce file was not created: $($connectorInfo.nonceFile)"
}

$env:VSCODE_AI_EDITOR_ACCOUNT_EDGE_ORIGIN = $connectorInfo.edgeOrigin
$env:VSCODE_AI_EDITOR_ACCOUNT_GATEWAY_ORIGIN = $connectorInfo.gatewayOrigin
$env:VSCODE_AI_EDITOR_ACCOUNT_EDGE_NONCE_FILE = $connectorInfo.nonceFile
$env:VSCODE_AGENT_HOST_CODEX_PROXY_MODE = 'external-local-proxy'
$env:VSCODE_AGENT_HOST_CODEX_PROXY_BASE_URL = $connectorInfo.edgeOrigin

Write-Host "[ai-editor-black-dev] Launching Code with the isolated $AuthenticationMode Edge."
Write-Host "[ai-editor-black-dev] Edge: $($connectorInfo.edgeOrigin); Gateway: $($connectorInfo.gatewayOrigin)"
Write-Host '[ai-editor-black-dev] The nonce stays in this PowerShell process and is not written to Code settings.'

& $codeLauncherPath `
	--user-data-dir $UserDataDir `
	--extensions-dir $ExtensionsDir `
	--shared-data-dir $SharedDataDir `
	$Workspace
