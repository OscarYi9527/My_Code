[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$verifier = Join-Path $PSScriptRoot 'verify-ai-editor-account-gateway.ps1'
$reportDirectory = Join-Path $repositoryRoot '.build\ai-editor-account-gateway\failure-cleanup-test'

function Get-ListenerProcessId([int]$Port) {
	return Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
		Select-Object -First 1 -ExpandProperty OwningProcess
}

$sharedBefore = Get-ListenerProcessId 47892
$failedAsExpected = $false
try {
	& $verifier -ReportDirectory $reportDirectory -InjectFailureAfterStart
} catch {
	if ($_.Exception.Message -notmatch 'acceptance failed') {
		throw
	}
	$failedAsExpected = $true
}

if (-not $failedAsExpected) {
	throw 'The injected acceptance failure unexpectedly passed.'
}
if ((Get-ListenerProcessId 47920) -or (Get-ListenerProcessId 47921)) {
	throw 'The verifier left an isolated Gateway or Edge listener after failure.'
}
$sharedAfter = Get-ListenerProcessId 47892
$sharedLive = Invoke-RestMethod -Uri 'http://127.0.0.1:47892/live' -TimeoutSec 5
if ($sharedBefore -ne $sharedAfter -or $sharedLive.status -ne 'ok') {
	throw 'The shared Proxy changed during the failure-cleanup test.'
}

$reportPath = Join-Path $reportDirectory 'account-gateway-acceptance.json'
$markdownReportPath = Join-Path $reportDirectory 'account-gateway-acceptance.md'
$reportText = Get-Content -Raw -LiteralPath $reportPath -Encoding UTF8
$fixturePath = Join-Path $repositoryRoot 'specs\002-ai-editor-account-gateway\contracts\fixtures\edge-code-contract.json'
$fixtures = Get-Content -Raw -LiteralPath $fixturePath -Encoding UTF8 | ConvertFrom-Json
foreach ($outputPath in @($reportPath, $markdownReportPath)) {
	$outputText = Get-Content -Raw -LiteralPath $outputPath -Encoding UTF8
	foreach ($secret in @($fixtures.reportSecretValues)) {
		if ($outputText.Contains([string]$secret)) {
			throw "The failure report contains a fixture secret: $outputPath"
		}
	}
	if ($outputText -match '"(?:nonce|ticket|refreshToken|accessToken|password)"\s*:') {
		throw "The failure report contains a forbidden secret field: $outputPath"
	}
}
$report = $reportText | ConvertFrom-Json
if (
	$report.result -ne 'FAIL' -or
	$report.cleanup.isolatedPortsReleased -ne $true -or
	$report.sharedProxy.unchanged -ne $true -or
	$report.error -notmatch 'Injected acceptance failure'
) {
	throw 'The failure-cleanup report is incomplete.'
}

Write-Host '[ai-editor-account-gateway-cleanup] 1 passing.'
