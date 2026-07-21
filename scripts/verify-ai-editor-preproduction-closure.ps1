[CmdletBinding()]
param(
	[string]$ProxyRepository,
	[string]$ProductRoot,
	[string]$GatewayOrigin,
	[string]$EdgeOutboundProxy,
	[string]$EdgeOrigin = 'http://127.0.0.1:47921',
	[string]$EdgeDataRoot,
	[string]$EdgeNonceFile,
	[string]$ProductionDecisionFile,
	[string]$ReportDirectory,
	[string]$Model,
	[int]$ResponseTimeoutSec = 180,
	[switch]$SkipBuild,
	[switch]$SkipServerReleaseCheck,
	[switch]$SkipRealUi,
	[switch]$SkipRealResponses,
	[switch]$RequireFinalEdge,
	[switch]$AllowDirtyRepositories,
	[switch]$NoFetch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$repositoryParent = Split-Path -Parent $repositoryRoot
$allowedReportRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot '.build\ai-editor-preproduction-closure'))
$runId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')

if ([string]::IsNullOrWhiteSpace($ProxyRepository)) {
	$ProxyRepository = Join-Path $repositoryParent 'codex_proxy-provider-worker'
}
if ([string]::IsNullOrWhiteSpace($ProductRoot)) {
	$ProductRoot = Join-Path $repositoryParent 'VSCode-win32-x64'
}
if ([string]::IsNullOrWhiteSpace($ProductionDecisionFile)) {
	$ProductionDecisionFile = Join-Path $ProxyRepository 'deploy\production\readiness.example.json'
}
if ([string]::IsNullOrWhiteSpace($GatewayOrigin)) {
	$GatewayOrigin = [Environment]::GetEnvironmentVariable('AI_EDITOR_VERIFY_GATEWAY_ORIGIN', 'Process')
}
if ([string]::IsNullOrWhiteSpace($EdgeDataRoot)) {
	if (-not [string]::IsNullOrWhiteSpace($EdgeNonceFile)) {
		$EdgeDataRoot = Split-Path -Parent $EdgeNonceFile
	} else {
		$EdgeDataRoot = Join-Path $ProxyRepository '.ai-editor-dev\public-preview-client'
	}
}
if ([string]::IsNullOrWhiteSpace($EdgeNonceFile)) {
	$EdgeNonceFile = Join-Path $EdgeDataRoot 'edge-local-nonce.secret'
}
if ([string]::IsNullOrWhiteSpace($ReportDirectory)) {
	$ReportDirectory = Join-Path $allowedReportRoot $runId
}

$ProxyRepository = [IO.Path]::GetFullPath($ProxyRepository)
$ProductRoot = [IO.Path]::GetFullPath($ProductRoot)
$ProductionDecisionFile = [IO.Path]::GetFullPath($ProductionDecisionFile)
$EdgeDataRoot = [IO.Path]::GetFullPath($EdgeDataRoot)
$EdgeNonceFile = [IO.Path]::GetFullPath($EdgeNonceFile)
$ReportDirectory = [IO.Path]::GetFullPath($ReportDirectory)

$allowedReportPrefix = $allowedReportRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if (
	-not $ReportDirectory.Equals($allowedReportRoot, [StringComparison]::OrdinalIgnoreCase) -and
	-not $ReportDirectory.StartsWith($allowedReportPrefix, [StringComparison]::OrdinalIgnoreCase)
) {
	throw "ReportDirectory must stay under $allowedReportRoot"
}
if ($ResponseTimeoutSec -lt 1 -or $ResponseTimeoutSec -gt 600) {
	throw 'ResponseTimeoutSec must be between 1 and 600.'
}

function Assert-Directory([string]$Path, [string]$Description) {
	if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
		throw "$Description was not found: $Path"
	}
}

function Assert-File([string]$Path, [string]$Description) {
	if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
		throw "$Description was not found: $Path"
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

function Get-Sha256([string]$Path) {
	return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-SharedProxySnapshot {
	$processId = Get-ListenerProcessId 47892
	if (-not $processId) {
		throw 'Shared Proxy 47892 is not listening.'
	}
	$live = Invoke-RestMethod -Uri 'http://127.0.0.1:47892/live' -TimeoutSec 5
	if ($live.status -ne 'ok') {
		throw 'Shared Proxy /live is not healthy.'
	}

	$process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction Stop
	$serverPath = $null
	if ($process.CommandLine -match '"([^"]+[\\/]src[\\/]server\.js)"') {
		$serverPath = $Matches[1]
	} elseif ($process.CommandLine -match '([A-Za-z]:\\[^"]+[\\/]src[\\/]server\.js)') {
		$serverPath = $Matches[1].Trim()
	}

	$programHashes = [ordered]@{}
	$selectedDataHashes = [ordered]@{}
	if ($serverPath -and (Test-Path -LiteralPath $serverPath -PathType Leaf)) {
		$programRoot = Split-Path (Split-Path $serverPath -Parent) -Parent
		foreach ($relativePath in @('package.json', 'src/server.js')) {
			$filePath = Join-Path $programRoot $relativePath
			if (Test-Path -LiteralPath $filePath -PathType Leaf) {
				$programHashes[$relativePath] = Get-Sha256 $filePath
			}
		}
		foreach ($relativePath in @('codex-models.json', 'auto-model.json')) {
			$filePath = Join-Path $programRoot $relativePath
			if (Test-Path -LiteralPath $filePath -PathType Leaf) {
				$selectedDataHashes[$relativePath] = Get-Sha256 $filePath
			}
		}
	}

	return [ordered]@{
		processId = $processId
		liveStatus = [string]$live.status
		programHashes = $programHashes
		selectedDataHashes = $selectedDataHashes
	}
}

function Test-SnapshotEqual($Before, $After) {
	return (
		$Before.processId -eq $After.processId -and
		$Before.liveStatus -eq $After.liveStatus -and
		($Before.programHashes | ConvertTo-Json -Compress) -ceq
			($After.programHashes | ConvertTo-Json -Compress) -and
		($Before.selectedDataHashes | ConvertTo-Json -Compress) -ceq
			($After.selectedDataHashes | ConvertTo-Json -Compress)
	)
}

function Get-SafeEdgeSnapshot {
	$processId = Get-ListenerProcessId 47921
	if (-not $processId) {
		return [ordered]@{
			running = $false
			processId = $null
			liveStatus = $null
			mode = $null
			owned = $false
			dataRoot = $EdgeDataRoot
		}
	}
	$live = Invoke-RestMethod -Uri "$EdgeOrigin/live" -TimeoutSec 5
	$metadataPath = Join-Path $EdgeDataRoot 'edge.pid.json'
	$owned = $false
	if (Test-Path -LiteralPath $metadataPath -PathType Leaf) {
		$metadata = Get-Content -Raw -LiteralPath $metadataPath -Encoding UTF8 |
			ForEach-Object { $_ -replace '^\uFEFF', '' } |
			ConvertFrom-Json
		$owned = (
			[int]$metadata.pid -eq $processId -and
			[IO.Path]::GetFullPath([string]$metadata.repository).Equals($ProxyRepository, [StringComparison]::OrdinalIgnoreCase) -and
			[IO.Path]::GetFullPath([string]$metadata.data_root).Equals($EdgeDataRoot, [StringComparison]::OrdinalIgnoreCase)
		)
	}
	return [ordered]@{
		running = $true
		processId = $processId
		liveStatus = [string]$live.status
		mode = [string]$live.mode
		owned = $owned
		dataRoot = $EdgeDataRoot
	}
}

function Protect-Text([string]$Text, [string[]]$KnownSecrets) {
	$result = $Text
	foreach ($secret in @($KnownSecrets)) {
		if (-not [string]::IsNullOrEmpty($secret)) {
			$result = $result.Replace($secret, '[REDACTED]')
		}
	}
	$patterns = @(
		@('(?i)(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,''"]+', '$1[REDACTED]'),
		@('(?i)((?:api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|signing[-_]?secret|password)\s*[:=]\s*)[^\s,''"]+', '$1[REDACTED]'),
		@('(?i)\bpostgres(?:ql)?://[^@\s]+@', 'postgresql://[REDACTED]@'),
		@('\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b', '[REDACTED-KEY]'),
		@('\bgh[pousr]_[A-Za-z0-9]{20,}\b', '[REDACTED-TOKEN]'),
		@('\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b', '[REDACTED-JWT]')
	)
	foreach ($entry in $patterns) {
		$result = [Regex]::Replace($result, $entry[0], $entry[1])
	}
	return $result
}

function Write-SanitizedLog([string]$RawPath, [string]$SafePath, [string[]]$KnownSecrets) {
	$text = if (Test-Path -LiteralPath $RawPath -PathType Leaf) {
		[IO.File]::ReadAllText($RawPath)
	} else {
		''
	}
	$safe = Protect-Text $text $KnownSecrets
	[IO.File]::WriteAllText($SafePath, $safe, (New-Object Text.UTF8Encoding($false)))
	Remove-Item -LiteralPath $RawPath -Force -ErrorAction SilentlyContinue
}

function ConvertTo-NativeCommandLineArgument([string]$Value) {
	if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') {
		return $Value
	}
	$builder = New-Object Text.StringBuilder
	[void]$builder.Append([char]34)
	$backslashes = 0
	foreach ($character in $Value.ToCharArray()) {
		if ($character -eq [char]92) {
			$backslashes++
			continue
		}
		if ($character -eq [char]34) {
			[void]$builder.Append([char]92, ($backslashes * 2) + 1)
			[void]$builder.Append([char]34)
			$backslashes = 0
			continue
		}
		if ($backslashes -gt 0) {
			[void]$builder.Append([char]92, $backslashes)
			$backslashes = 0
		}
		[void]$builder.Append($character)
	}
	if ($backslashes -gt 0) {
		[void]$builder.Append([char]92, $backslashes * 2)
	}
	[void]$builder.Append([char]34)
	return $builder.ToString()
}

function Invoke-LoggedCommand(
	[string]$Name,
	[string]$FilePath,
	[string[]]$Arguments,
	[string]$WorkingDirectory
) {
	$rawPath = Join-Path $ReportDirectory "raw-$Name.log"
	$safePath = Join-Path $logsDirectory "$Name.log"
	$started = Get-Date
	$exitCode = 1
	$invokeError = $null
	try {
		$processArguments = @($Arguments | ForEach-Object {
			ConvertTo-NativeCommandLineArgument ([string]$_)
		})
		$processInfo = New-Object Diagnostics.ProcessStartInfo
		$extension = [IO.Path]::GetExtension($FilePath)
		if ($extension -in @('.cmd', '.bat')) {
			$command = @(
				ConvertTo-NativeCommandLineArgument $FilePath
				$processArguments
			) -join ' '
			$processInfo.FileName = 'cmd.exe'
			$processInfo.Arguments = "/d /s /c `"$command`""
		} else {
			$processInfo.FileName = $FilePath
			$processInfo.Arguments = $processArguments -join ' '
		}
		$processInfo.WorkingDirectory = $WorkingDirectory
		$processInfo.UseShellExecute = $false
		$processInfo.CreateNoWindow = $true
		$processInfo.RedirectStandardOutput = $true
		$processInfo.RedirectStandardError = $true
		$processInfo.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
		$processInfo.StandardErrorEncoding = New-Object Text.UTF8Encoding($false)
		$process = New-Object Diagnostics.Process
		$process.StartInfo = $processInfo
		if (-not $process.Start()) {
			throw "Unable to start $FilePath"
		}
		$stdoutTask = $process.StandardOutput.ReadToEndAsync()
		$stderrTask = $process.StandardError.ReadToEndAsync()
		$process.WaitForExit()
		$stdout = $stdoutTask.GetAwaiter().GetResult()
		$stderr = $stderrTask.GetAwaiter().GetResult()
		$exitCode = [int]$process.ExitCode
		[IO.File]::WriteAllText(
			$rawPath,
			($stdout + $(if ($stderr) { "`n$stderr" } else { '' })),
			(New-Object Text.UTF8Encoding($false))
		)
	} catch {
		$invokeError = $_.Exception.Message
		[IO.File]::AppendAllText($rawPath, "`n$invokeError`n")
		$exitCode = 1
	}
	Write-SanitizedLog $rawPath $safePath $script:knownSecrets.ToArray()
	return [ordered]@{
		exitCode = $exitCode
		durationSeconds = [Math]::Round(((Get-Date) - $started).TotalSeconds, 2)
		log = $safePath
		error = if ($invokeError) { Protect-Text $invokeError $script:knownSecrets.ToArray() } else { $null }
	}
}

function Add-Check(
	[string]$Id,
	[string]$Category,
	[ValidateSet('PASS', 'BLOCKED', 'FAIL')][string]$Result,
	[string]$Detail,
	[string]$Evidence = ''
) {
	$script:checks.Add([ordered]@{
		id = $Id
		category = $Category
		result = $Result
		detail = $Detail
		evidence = $Evidence
	})
}

function Invoke-Step(
	[string]$Id,
	[string]$Category,
	[string]$FilePath,
	[string[]]$Arguments,
	[string]$WorkingDirectory,
	[int[]]$SuccessExitCodes = @(0)
) {
	$result = Invoke-LoggedCommand $Id $FilePath $Arguments $WorkingDirectory
	if ($SuccessExitCodes -contains $result.exitCode) {
		Add-Check $Id $Category 'PASS' "Completed in $($result.durationSeconds) seconds." $result.log
	} else {
		Add-Check $Id $Category 'FAIL' "Exited with code $($result.exitCode) after $($result.durationSeconds) seconds." $result.log
	}
	return $result
}

function Invoke-DetachedLifecycleCommand(
	[string]$Name,
	[string]$ScriptPath,
	[string[]]$Arguments
) {
	$started = Get-Date
	$logPath = Join-Path $logsDirectory "$Name.log"
	$processArguments = @(
		'-NoProfile',
		'-ExecutionPolicy', 'Bypass',
		'-File', "`"$ScriptPath`""
	)
	foreach ($argument in $Arguments) {
		$processArguments += if ($argument -match '[\s"]') {
			"`"$($argument.Replace('"', '\"'))`""
		} else {
			$argument
		}
	}
	$exitCode = 1
	$invokeError = $null
	try {
		# Start-Process deliberately avoids PowerShell's native stdout pipeline.
		# A detached Edge inherits that pipeline handle even when its own stdout
		# is redirected, which otherwise prevents the parent invocation from
		# observing EOF and completing.
		$process = Start-Process -FilePath 'powershell.exe' `
			-ArgumentList $processArguments `
			-WorkingDirectory $ProxyRepository `
			-WindowStyle Hidden `
			-PassThru
		# Start-Process -Wait follows the full descendant tree on Windows. The
		# lifecycle script intentionally leaves Edge running, so wait only for
		# the direct PowerShell child instead.
		$process.WaitForExit()
		$exitCode = [int]$process.ExitCode
	} catch {
		$invokeError = Protect-Text $_.Exception.Message $script:knownSecrets.ToArray()
	}
	$duration = [Math]::Round(((Get-Date) - $started).TotalSeconds, 2)
	$lines = @(
		"Lifecycle command: $Name",
		"Exit code: $exitCode",
		"Duration seconds: $duration"
	)
	if ($invokeError) {
		$lines += "Error: $invokeError"
	}
	[IO.File]::WriteAllText(
		$logPath,
		(($lines -join "`n") + "`n"),
		(New-Object Text.UTF8Encoding($false))
	)
	return [ordered]@{
		exitCode = $exitCode
		durationSeconds = $duration
		log = $logPath
		error = $invokeError
	}
}

function Get-GitValue([string]$Repository, [string[]]$Arguments) {
	$output = (& git -C $Repository @Arguments 2>&1 | Out-String).Trim()
	if ($LASTEXITCODE -ne 0) {
		throw "Git command failed in $Repository"
	}
	return $output
}

function Test-RepositoryState([string]$Id, [string]$Repository) {
	$fetchPassed = $true
	if (-not $NoFetch) {
		$fetchPassed = $false
		$fetch = $null
		for ($attempt = 1; $attempt -le 3; $attempt++) {
			$fetch = Invoke-LoggedCommand "$Id-fetch" 'git' @('-C', $Repository, 'fetch', '--quiet', 'origin') $repositoryRoot
			if ($fetch.exitCode -eq 0) {
				$fetchPassed = $true
				break
			}
			if ($attempt -lt 3) {
				Start-Sleep -Seconds ([Math]::Pow(2, $attempt - 1))
			}
		}
		if (-not $fetchPassed) {
			Add-Check "$Id-fetch" 'source' 'FAIL' "Unable to fetch origin after three attempts (last exit $($fetch.exitCode))." $fetch.log
		}
	}
	$branch = Get-GitValue $Repository @('rev-parse', '--abbrev-ref', 'HEAD')
	$head = Get-GitValue $Repository @('rev-parse', 'HEAD')
	$upstream = Get-GitValue $Repository @('rev-parse', '@{upstream}')
	$dirty = -not [string]::IsNullOrWhiteSpace((Get-GitValue $Repository @('status', '--porcelain=v1')))
	$result = if (-not $fetchPassed -or $head -cne $upstream) {
		'FAIL'
	} elseif ($dirty -and -not $AllowDirtyRepositories) {
		'FAIL'
	} elseif ($dirty) {
		'BLOCKED'
	} else {
		'PASS'
	}
	$detail = if ($head -cne $upstream) {
		"Branch $branch is not synchronized with its upstream."
	} elseif ($dirty) {
		"Branch $branch has local changes."
	} else {
		"Branch $branch is clean and synchronized at $($head.Substring(0, 9))."
	}
	Add-Check $Id 'source' $result $detail
	return [ordered]@{
		path = $Repository
		branch = $branch
		head = $head
		upstream = $upstream
		clean = -not $dirty
		synchronized = $head -ceq $upstream
	}
}

function Invoke-HighConfidenceSecretScan([string]$Id, [string]$Repository, [string]$RepositoryKind) {
	$patterns = [ordered]@{
		privateKey = '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
		openAiKey = 'sk-(proj-)?[A-Za-z0-9_-]{20,}'
		githubToken = 'gh[pousr]_[A-Za-z0-9]{20,}'
		awsAccessKey = 'AKIA[0-9A-Z]{16}'
		postgresPassword = 'postgres(ql)?://[^/[:space:]:@]+:[^@[:space:]]+@'
		jwt = 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}'
	}
	$allowlisted = @{
		code = @(
			'privateKey|build/azure-pipelines/common/publish.ts',
			'privateKey|extensions/copilot/src/extension/chronicle/common/test/secretFilter.spec.ts',
			'privateKey|src/vs/platform/agentHost/node/sshRemoteAgentHostService.ts',
			'privateKey|src/vs/platform/agentHost/test/node/sshRemoteAgentHostService.test.ts',
			'privateKey|src/vs/platform/tunnel/test/node/selfSignedCert.test.ts',
			'openAiKey|extensions/copilot/test/prompts/fixtures/devcontainer/devContainerConfigTestData.json',
			'openAiKey|src/vs/base/test/node/uri.perf.data.txt',
			'githubToken|extensions/copilot/src/extension/chronicle/common/test/secretFilter.spec.ts',
			'githubToken|src/vs/platform/terminal/test/node/terminalEnvironment.test.ts',
			'awsAccessKey|extensions/copilot/src/extension/chronicle/common/test/secretFilter.spec.ts',
			'postgresPassword|extensions/copilot/src/extension/chronicle/common/test/secretFilter.spec.ts',
			'jwt|src/vs/platform/terminal/test/node/terminalEnvironment.test.ts'
		)
		proxy = @(
			'openAiKey|gateway/admin-web/src/pages/system/ProvidersPage.test.tsx',
			'openAiKey|gateway/tests/contract/provider-admin.test.ts',
			'openAiKey|gateway/tests/integration/credential-envelope-migration.test.ts',
			'openAiKey|gateway/tests/integration/encrypted-sqlite-backup.test.ts',
			'openAiKey|gateway/tests/security/envelope-credential-protector.test.ts'
		)
	}
	$knownFixtures = @($allowlisted[$RepositoryKind])
	$unexpected = New-Object 'System.Collections.Generic.List[string]'
	$fixtureCount = 0
	foreach ($entry in $patterns.GetEnumerator()) {
		$output = @(& git -C $Repository -c core.quotepath=false grep -Il -E -e $entry.Value -- . 2>$null)
		$grepExit = $LASTEXITCODE
		if ($grepExit -gt 1) {
			Add-Check $Id 'security' 'FAIL' "Secret scan command failed for pattern $($entry.Key)."
			return $false
		}
		foreach ($pathValue in $output) {
			$normalized = ([string]$pathValue).Trim().Replace('\', '/')
			if (-not $normalized) {
				continue
			}
			$key = "$($entry.Key)|$normalized"
			if ($knownFixtures -contains $key) {
				$fixtureCount++
			} else {
				$unexpected.Add("$($entry.Key):$normalized")
			}
		}
	}
	if ($unexpected.Count -gt 0) {
		Add-Check $Id 'security' 'FAIL' "Found $($unexpected.Count) unexpected high-confidence secret candidate path(s): $($unexpected -join ', ')."
		return $false
	}
	Add-Check $Id 'security' 'PASS' "No unexpected high-confidence secret candidates; $fixtureCount known synthetic fixture match(es) were allowlisted by path and type."
	return $true
}

function Stop-PreviewEdge {
	return Invoke-DetachedLifecycleCommand `
		'preview-edge-stop' `
		(Join-Path $ProxyRepository 'tools\stop-ai-editor-dev.ps1') `
		@(
		'-Mode', 'edge',
		'-DataRoot', $EdgeDataRoot
	)
}

function Start-PreviewEdge {
	$arguments = @(
		'-Mode', 'edge',
		'-AuthenticationMode', 'real',
		'-GatewayOrigin', $GatewayOrigin,
		'-DataRoot', $EdgeDataRoot
	)
	if (-not [string]::IsNullOrWhiteSpace($EdgeOutboundProxy)) {
		$arguments += @('-EdgeOutboundProxy', $EdgeOutboundProxy)
	}
	return Invoke-DetachedLifecycleCommand `
		'preview-edge-start' `
		(Join-Path $ProxyRepository 'tools\start-ai-editor-dev.ps1') `
		$arguments
}

function Test-GatewayOrigin([string]$Origin) {
	if ([string]::IsNullOrWhiteSpace($Origin)) {
		return $false
	}
	try {
		$uri = [Uri]::new($Origin, [UriKind]::Absolute)
		return (
			$uri.Scheme -eq 'https' -and
			[string]::IsNullOrEmpty($uri.UserInfo) -and
			($uri.AbsolutePath -eq '/') -and
			[string]::IsNullOrEmpty($uri.Query) -and
			[string]::IsNullOrEmpty($uri.Fragment)
		)
	} catch {
		return $false
	}
}

function Resolve-WindowsSignToolDirectory {
	$available = Get-Command 'signtool.exe' -ErrorAction SilentlyContinue
	if ($available) {
		return Split-Path -Parent $available.Source
	}
	$kitsRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
	if (-not (Test-Path -LiteralPath $kitsRoot -PathType Container)) {
		return $null
	}
	$candidate = Get-ChildItem -LiteralPath $kitsRoot -Filter 'signtool.exe' -File -Recurse -ErrorAction SilentlyContinue |
		Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
		Sort-Object FullName -Descending |
		Select-Object -First 1
	if ($candidate) {
		return $candidate.DirectoryName
	}
	return $null
}

function Copy-IfPresent([string]$Source, [string]$DestinationName) {
	if (Test-Path -LiteralPath $Source -PathType Leaf) {
		$destination = Join-Path $artifactsDirectory $DestinationName
		Copy-Item -LiteralPath $Source -Destination $destination -Force
		return $destination
	}
	return $null
}

function Get-ClosureResult {
	if (@($script:checks | Where-Object { $_.result -eq 'FAIL' }).Count -gt 0) {
		return 'FAIL'
	}
	if (@($script:checks | Where-Object { $_.result -eq 'BLOCKED' }).Count -gt 0) {
		return 'BLOCKED'
	}
	return 'PASS'
}

function Write-MarkdownReport([string]$Path, $Report) {
	$lines = @(
		'# AI Editor preproduction automated closure',
		'',
		"- Generated: $($Report.generatedAt)",
		"- Result: **$($Report.result)**",
		"- PASS: $($Report.summary.pass)",
		"- BLOCKED: $($Report.summary.blocked)",
		"- FAIL: $($Report.summary.fail)",
		"- Shared Proxy unchanged: $($Report.runtime.sharedProxy.unchanged)",
		"- Preview Edge restored: $($Report.runtime.previewEdge.restored)",
		'',
		'`BLOCKED` means the executable technical gates did not regress, but an external prerequisite, account state, skipped gate, production approval, or platform runner is still missing.',
		'',
		'## Checks',
		'',
		'| Check | Category | Result | Detail |',
		'| --- | --- | --- | --- |'
	)
	foreach ($check in $Report.checks) {
		$detail = ([string]$check.detail).Replace('|', '\|').Replace("`r", ' ').Replace("`n", ' ')
		$lines += "| $($check.id) | $($check.category) | $($check.result) | $detail |"
	}
	if ($Report.production.blockers.Count -gt 0) {
		$lines += @('', '## Production blockers', '')
		foreach ($blocker in $Report.production.blockers) {
			$lines += "- ``$($blocker.id)``: $($blocker.detail)"
		}
	}
	[IO.File]::WriteAllText(
		$Path,
		(($lines -join "`n") + "`n"),
		(New-Object Text.UTF8Encoding($false))
	)
}

Assert-Directory $repositoryRoot 'Code repository'
Assert-Directory $ProxyRepository 'Proxy repository'
Assert-Directory $ProductRoot 'Windows product'
Assert-File $ProductionDecisionFile 'Production decision file'
Assert-File (Join-Path $ProxyRepository 'scripts\check-production-readiness.mjs') 'Production preflight'
Assert-File (Join-Path $ProxyRepository 'tools\start-ai-editor-dev.ps1') 'Preview Edge start script'
Assert-File (Join-Path $ProxyRepository 'tools\stop-ai-editor-dev.ps1') 'Preview Edge stop script'
Assert-File (Join-Path $repositoryRoot 'scripts\verify-ai-editor-windows-release.ps1') 'Windows release verifier'

New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
$logsDirectory = Join-Path $ReportDirectory 'logs'
$artifactsDirectory = Join-Path $ReportDirectory 'artifacts'
New-Item -ItemType Directory -Path $logsDirectory, $artifactsDirectory -Force | Out-Null

$script:checks = New-Object 'System.Collections.Generic.List[object]'
$script:knownSecrets = New-Object 'System.Collections.Generic.List[string]'
if (Test-Path -LiteralPath $EdgeNonceFile -PathType Leaf) {
	$nonce = [IO.File]::ReadAllText($EdgeNonceFile).Trim()
	if ($nonce) {
		$script:knownSecrets.Add($nonce)
	}
}

$sharedBefore = $null
$sharedAfter = $null
$edgeBefore = $null
$edgeAfter = $null
$edgeStoppedForRelease = $false
$edgeStartedByRunner = $false
$edgeRestored = $false
$repositories = [ordered]@{}
$productionReport = $null
$productionBlockers = @()
$serverReleasePassed = $false
$secretScanPassed = $false
$windowsReleasePassed = $false

try {
	$sharedBefore = Get-SharedProxySnapshot
	Add-Check 'shared-proxy-start' 'runtime' 'PASS' "Shared Proxy is healthy at PID $($sharedBefore.processId)."

	$edgeBefore = Get-SafeEdgeSnapshot
	if ($edgeBefore.running -and (-not $edgeBefore.owned -or $edgeBefore.liveStatus -ne 'ok' -or $edgeBefore.mode -ne 'edge')) {
		Add-Check 'preview-edge-start' 'runtime' 'FAIL' 'Port 47921 is not the expected repository-owned healthy Edge.'
	} elseif ($edgeBefore.running) {
		Add-Check 'preview-edge-start' 'runtime' 'PASS' "Repository-owned preview Edge is healthy at PID $($edgeBefore.processId)."
	} else {
		Add-Check 'preview-edge-start' 'runtime' 'BLOCKED' 'Preview Edge was not running at closure start; the runner will start it only when a safe Gateway origin is configured.'
	}

	$repositories.code = Test-RepositoryState 'code-repository' $repositoryRoot
	$repositories.proxy = Test-RepositoryState 'proxy-repository' $ProxyRepository
	$codeSecretsPassed = Invoke-HighConfidenceSecretScan 'code-secret-scan' $repositoryRoot 'code'
	$proxySecretsPassed = Invoke-HighConfidenceSecretScan 'proxy-secret-scan' $ProxyRepository 'proxy'
	$secretScanPassed = $codeSecretsPassed -and $proxySecretsPassed

	if ($SkipServerReleaseCheck) {
		Add-Check 'server-release-check' 'server' 'BLOCKED' 'Server release check was explicitly skipped.'
	} else {
		$canReleaseEdge = -not $edgeBefore.running -or (
			$edgeBefore.owned -and
			(Test-GatewayOrigin $GatewayOrigin)
		)
		if (-not $canReleaseEdge) {
			Add-Check 'server-release-check' 'server' 'BLOCKED' 'The preview Edge cannot be safely stopped and restored without its HTTPS Gateway origin.'
		} else {
			if ($edgeBefore.running) {
				$stopResult = Stop-PreviewEdge
				if ($stopResult.exitCode -eq 0 -and -not (Get-ListenerProcessId 47921)) {
					$edgeStoppedForRelease = $true
					Add-Check 'preview-edge-release' 'runtime' 'PASS' 'Preview Edge was released through the repository lifecycle script.' $stopResult.log
				} else {
					Add-Check 'preview-edge-release' 'runtime' 'FAIL' 'Preview Edge could not be safely released for isolated server tests.' $stopResult.log
				}
			}
			if (-not $edgeBefore.running -or $edgeStoppedForRelease) {
				$serverResult = Invoke-Step 'server-release-check' 'server' 'npm.cmd' @('run', 'release:check') $ProxyRepository
				$serverReleasePassed = $serverResult.exitCode -eq 0
			}
		}
	}

	if ($edgeStoppedForRelease -or -not $edgeBefore.running) {
		if (Test-GatewayOrigin $GatewayOrigin) {
			$startResult = Start-PreviewEdge
			if ($startResult.exitCode -eq 0) {
				$edgeStartedByRunner = -not $edgeBefore.running
				if (Test-Path -LiteralPath $EdgeNonceFile -PathType Leaf) {
					$newNonce = [IO.File]::ReadAllText($EdgeNonceFile).Trim()
					if ($newNonce -and -not $script:knownSecrets.Contains($newNonce)) {
						$script:knownSecrets.Add($newNonce)
					}
				}
				$restoredSnapshot = Get-SafeEdgeSnapshot
				$edgeRestored = $restoredSnapshot.running -and $restoredSnapshot.owned -and $restoredSnapshot.liveStatus -eq 'ok'
				Add-Check 'preview-edge-restore' 'runtime' $(if ($edgeRestored) { 'PASS' } else { 'FAIL' }) $(if ($edgeRestored) { 'Preview Edge was restored through the repository lifecycle script.' } else { 'Preview Edge restart did not restore the expected owned process.' }) $startResult.log
			} else {
				Add-Check 'preview-edge-restore' 'runtime' 'FAIL' 'Preview Edge restart failed.' $startResult.log
			}
		} else {
			Add-Check 'preview-edge-restore' 'runtime' 'BLOCKED' 'No safe HTTPS Gateway origin was supplied, so the runner did not invent a preview topology.'
		}
	} else {
		$edgeRestored = $edgeBefore.running
	}

	$paCreatorSource = Join-Path $repositoryRoot 'src\vs\workbench\contrib\paCreator\browser\paCreator.contribution.ts'
	$paFeaturePresent = Test-Path -LiteralPath $paCreatorSource -PathType Leaf
	if ($paFeaturePresent) {
		Add-Check 'pa-creator-source' 'pa-creator' 'PASS' 'PA Creator and its local registry are present in the MVP source tree.'
	} else {
		Add-Check 'pa-creator-source' 'pa-creator' 'FAIL' 'PA Creator is missing from the MVP source tree.'
	}

	if ($SkipBuild) {
		Add-Check 'code-development-build' 'code' 'BLOCKED' 'Development compile was explicitly skipped.'
		Add-Check 'code-core-build' 'code' 'BLOCKED' 'Product core build was explicitly skipped.'
		Add-Check 'windows-product-package' 'product' 'BLOCKED' 'Windows product packaging was explicitly skipped.'
		Add-Check 'pa-creator-focused-tests' 'pa-creator' 'BLOCKED' 'PA Creator focused tests require the synchronized development build.'
		Add-Check 'pa-creator-development-ui' 'pa-creator' 'BLOCKED' 'PA Creator development UI verification was explicitly skipped with the build.'
	} else {
		$compileResult = Invoke-Step 'code-development-build' 'code' 'npm.cmd' @('run', 'compile') $repositoryRoot
		if ($compileResult.exitCode -eq 0) {
			Invoke-Step 'code-account-electron-tests' 'code' (Join-Path $repositoryRoot 'scripts\test.bat') @(
				'--runGlob', '**/aiEditorAccount/test/electron-main/**/*.test.js'
			) $repositoryRoot | Out-Null
			Invoke-Step 'code-proxy-electron-tests' 'code' (Join-Path $repositoryRoot 'scripts\test.bat') @(
				'--runGlob', '**/aiEditorProxy/test/electron-main/**/*.test.js'
			) $repositoryRoot | Out-Null
			Invoke-Step 'code-contract-tests' 'code' 'npm.cmd' @('run', 'test-ai-editor-account-contracts') $repositoryRoot | Out-Null
			if ($paFeaturePresent) {
				Invoke-Step 'pa-creator-focused-tests' 'pa-creator' (Join-Path $repositoryRoot 'scripts\test.bat') @(
					'--grep',
					'PA Creator bootstrap acceptance|PA Creator workflow|PA package publisher|PaRegistryService|PA Plaza editor input|PA runtime|PA registry database|PA manifest contracts|AI Editor management input'
				) $repositoryRoot | Out-Null
				Invoke-Step 'pa-creator-development-ui' 'pa-creator' 'node.exe' @(
					'--experimental-strip-types',
					(Join-Path $repositoryRoot 'scripts\verify-ai-editor-pa-creator-ui.ts'),
					'--surface', 'development',
					'--remote-debugging-port', '49234'
				) $repositoryRoot | Out-Null
				Copy-IfPresent (Join-Path $repositoryRoot '.build\ai-editor-pa-creator\pa-creator-development-ui.json') 'pa-creator-development-ui.json' | Out-Null
				Copy-IfPresent (Join-Path $repositoryRoot '.build\ai-editor-pa-creator\pa-creator-development-ui.md') 'pa-creator-development-ui.md' | Out-Null
				Copy-IfPresent (Join-Path $repositoryRoot '.build\ai-editor-pa-creator\pa-creator-development-ui.png') 'pa-creator-development-ui.png' | Out-Null
			}
		} else {
			Add-Check 'code-focused-tests' 'code' 'FAIL' 'Focused tests were not run because the development compile failed.'
			Add-Check 'pa-creator-focused-tests' 'pa-creator' 'FAIL' 'PA Creator focused tests were not run because the development compile failed.'
			Add-Check 'pa-creator-development-ui' 'pa-creator' 'FAIL' 'PA Creator development UI verification was not run because the development compile failed.'
		}
		$coreResult = Invoke-Step 'code-core-build' 'code' 'npm.cmd' @('run', 'core-ci') $repositoryRoot
		if ($coreResult.exitCode -eq 0) {
			$signToolDirectory = Resolve-WindowsSignToolDirectory
			if ($signToolDirectory) {
				Add-Check 'windows-signing-tool' 'product' 'PASS' 'Located the Windows SDK x64 signing tool without changing the user environment.'
				$originalPath = [Environment]::GetEnvironmentVariable('PATH', 'Process')
				try {
					[Environment]::SetEnvironmentVariable('PATH', "$signToolDirectory;$originalPath", 'Process')
					Invoke-Step 'windows-product-package' 'product' 'npm.cmd' @('run', 'gulp', 'vscode-win32-x64-min-ci') $repositoryRoot | Out-Null
				} finally {
					[Environment]::SetEnvironmentVariable('PATH', $originalPath, 'Process')
				}
			} else {
				Add-Check 'windows-signing-tool' 'product' 'FAIL' 'The Windows SDK x64 signing tool was not found.'
				Add-Check 'windows-product-package' 'product' 'FAIL' 'Windows packaging requires signtool.exe.'
			}
		} else {
			Add-Check 'windows-product-package' 'product' 'FAIL' 'Windows packaging was not run because core-ci failed.'
		}
	}

	$packageCheck = @($script:checks | Where-Object { $_.id -eq 'windows-product-package' } | Select-Object -Last 1)
	if ($packageCheck.Count -gt 0 -and $packageCheck[0].result -eq 'PASS') {
		$windowsReportPath = Join-Path $artifactsDirectory 'windows-release.json'
		$windowsArguments = @(
			'-NoProfile',
			'-ExecutionPolicy', 'Bypass',
			'-File', (Join-Path $repositoryRoot 'scripts\verify-ai-editor-windows-release.ps1'),
			'-ProductRoot', $ProductRoot,
			'-ReportPath', $windowsReportPath
		)
		if ($RequireFinalEdge) {
			$windowsArguments += '-RequireEdgeTarget'
		}
		$windowsResult = Invoke-Step 'windows-release-verification' 'product' 'powershell.exe' $windowsArguments $repositoryRoot
		$windowsReleasePassed = $windowsResult.exitCode -eq 0
		if ($windowsReleasePassed -and $paFeaturePresent) {
			Invoke-Step 'pa-creator-product-ui' 'pa-creator' 'node.exe' @(
				'--experimental-strip-types',
				(Join-Path $repositoryRoot 'scripts\verify-ai-editor-pa-creator-ui.ts'),
				'--surface', 'product',
				'--product-root', $ProductRoot,
				'--remote-debugging-port', '49235'
			) $repositoryRoot | Out-Null
			Copy-IfPresent (Join-Path $repositoryRoot '.build\ai-editor-pa-creator\pa-creator-product-ui.json') 'pa-creator-product-ui.json' | Out-Null
			Copy-IfPresent (Join-Path $repositoryRoot '.build\ai-editor-pa-creator\pa-creator-product-ui.md') 'pa-creator-product-ui.md' | Out-Null
			Copy-IfPresent (Join-Path $repositoryRoot '.build\ai-editor-pa-creator\pa-creator-product-ui.png') 'pa-creator-product-ui.png' | Out-Null
		} elseif ($paFeaturePresent) {
			Add-Check 'pa-creator-product-ui' 'pa-creator' 'BLOCKED' 'PA Creator product UI verification requires a passing Windows release.'
		}
	} else {
		Add-Check 'windows-release-verification' 'product' 'BLOCKED' 'Windows release verification requires a successful synchronized product package.'
		if ($paFeaturePresent) {
			Add-Check 'pa-creator-product-ui' 'pa-creator' 'BLOCKED' 'PA Creator product UI verification requires a synchronized Windows package.'
		}
	}

	$edgeReadyForUi = $false
	try {
		$currentEdge = Get-SafeEdgeSnapshot
		$edgeReadyForUi = $currentEdge.running -and $currentEdge.owned -and $currentEdge.liveStatus -eq 'ok'
	} catch {
		$edgeReadyForUi = $false
	}

	if ($SkipRealUi) {
		Add-Check 'real-ui' 'ui' 'BLOCKED' 'Real UI/CDP verification was explicitly skipped.'
	} elseif (-not $edgeReadyForUi -or -not (Test-GatewayOrigin $GatewayOrigin) -or -not (Test-Path -LiteralPath $EdgeNonceFile -PathType Leaf)) {
		Add-Check 'real-ui' 'ui' 'BLOCKED' 'Real UI/CDP verification requires the owned Edge, its nonce file, and the configured HTTPS Gateway origin.'
	} else {
		$oldGatewayOrigin = [Environment]::GetEnvironmentVariable('AI_EDITOR_VERIFY_GATEWAY_ORIGIN', 'Process')
		$oldEdgeOrigin = [Environment]::GetEnvironmentVariable('AI_EDITOR_VERIFY_EDGE_ORIGIN', 'Process')
		$oldNonceFile = [Environment]::GetEnvironmentVariable('AI_EDITOR_VERIFY_EDGE_NONCE_FILE', 'Process')
		try {
			[Environment]::SetEnvironmentVariable('AI_EDITOR_VERIFY_GATEWAY_ORIGIN', $GatewayOrigin, 'Process')
			[Environment]::SetEnvironmentVariable('AI_EDITOR_VERIFY_EDGE_ORIGIN', $EdgeOrigin, 'Process')
			[Environment]::SetEnvironmentVariable('AI_EDITOR_VERIFY_EDGE_NONCE_FILE', $EdgeNonceFile, 'Process')
			$uiResult = Invoke-Step 'real-ui' 'ui' 'node.exe' @(
				'--experimental-strip-types',
				(Join-Path $repositoryRoot 'scripts\verify-ai-editor-account-real-ui.ts')
			) $repositoryRoot
			Copy-IfPresent (Join-Path $repositoryRoot '.build\ai-editor-account-gateway\real-ui-prelogin-acceptance.json') 'real-ui.json' | Out-Null
			Copy-IfPresent (Join-Path $repositoryRoot '.build\ai-editor-account-gateway\real-ui-prelogin-acceptance.md') 'real-ui.md' | Out-Null
		} finally {
			[Environment]::SetEnvironmentVariable('AI_EDITOR_VERIFY_GATEWAY_ORIGIN', $oldGatewayOrigin, 'Process')
			[Environment]::SetEnvironmentVariable('AI_EDITOR_VERIFY_EDGE_ORIGIN', $oldEdgeOrigin, 'Process')
			[Environment]::SetEnvironmentVariable('AI_EDITOR_VERIFY_EDGE_NONCE_FILE', $oldNonceFile, 'Process')
		}
	}

	if ($SkipRealResponses) {
		Add-Check 'real-model-sse' 'model' 'BLOCKED' 'Real model/SSE verification was explicitly skipped.'
	} elseif (-not $edgeReadyForUi) {
		Add-Check 'real-model-sse' 'model' 'BLOCKED' 'Real model/SSE verification requires the owned preview Edge.'
	} else {
		$sseArguments = @(
			'--experimental-strip-types',
			(Join-Path $repositoryRoot 'scripts\verify-ai-editor-account-real-model-sse.ts'),
			'--black-repository', $ProxyRepository,
			'--data-root', $EdgeDataRoot,
			'--edge-origin', $EdgeOrigin,
			'--edge-nonce-file', $EdgeNonceFile,
			'--timeout-ms', ([string]($ResponseTimeoutSec * 1000))
		)
		if (-not [string]::IsNullOrWhiteSpace($Model)) {
			$sseArguments += @('--model', $Model)
		}
		$sseResult = Invoke-LoggedCommand 'real-model-sse' 'node.exe' $sseArguments $repositoryRoot
		$sseReportPath = Join-Path $repositoryRoot '.build\ai-editor-account-gateway\real-model-sse-acceptance.json'
		$sseReport = $null
		if (Test-Path -LiteralPath $sseReportPath -PathType Leaf) {
			$sseReport = Get-Content -Raw -LiteralPath $sseReportPath -Encoding UTF8 | ConvertFrom-Json
			Copy-IfPresent $sseReportPath 'real-model-sse.json' | Out-Null
			Copy-IfPresent ([IO.Path]::ChangeExtension($sseReportPath, '.md')) 'real-model-sse.md' | Out-Null
		}
		if ($sseResult.exitCode -eq 0 -and $sseReport -and $sseReport.result -eq 'PASS') {
			Add-Check 'real-model-sse' 'model' 'PASS' "Real model SSE completed in $($sseResult.durationSeconds) seconds." $sseResult.log
		} elseif ($sseResult.exitCode -eq 2 -and $sseReport -and $sseReport.result -eq 'BLOCKED') {
			Add-Check 'real-model-sse' 'model' 'BLOCKED' 'The safe account state is not ready, so no model Turn was sent.' $sseResult.log
		} else {
			Add-Check 'real-model-sse' 'model' 'FAIL' "Real model/SSE verification exited with code $($sseResult.exitCode)." $sseResult.log
		}
	}

	Add-Check 'macos-product-runtime' 'product' 'BLOCKED' 'macOS Keychain, packaging, signing, and runtime acceptance require a real macOS runner; a Windows host cannot truthfully emulate them.'

	$decision = Get-Content -Raw -LiteralPath $ProductionDecisionFile -Encoding UTF8 | ConvertFrom-Json
	$decision.source.gatewayCommit = $repositories.proxy.head
	$decision.source.workerCommit = $repositories.proxy.head
	$decision.source.codeCommit = $repositories.code.head
	$decision.source.releaseCheckPassed = $serverReleasePassed
	$decision.source.secretScanPassed = $secretScanPassed
	$decision.source.finalEdgeProductPassed = $RequireFinalEdge -and $windowsReleasePassed
	$effectiveDecisionPath = Join-Path $artifactsDirectory 'effective-production-readiness.json'
	[IO.File]::WriteAllText(
		$effectiveDecisionPath,
		(($decision | ConvertTo-Json -Depth 30) + "`n"),
		(New-Object Text.UTF8Encoding($false))
	)
	$productionReportPath = Join-Path $artifactsDirectory 'production-readiness.json'
	$preflightResult = Invoke-LoggedCommand 'production-readiness' 'node.exe' @(
		(Join-Path $ProxyRepository 'scripts\check-production-readiness.mjs'),
		'--config', $effectiveDecisionPath,
		'--report', $productionReportPath,
		'--report-only'
	) $ProxyRepository
	if ($preflightResult.exitCode -ne 0 -or -not (Test-Path -LiteralPath $productionReportPath -PathType Leaf)) {
		Add-Check 'production-readiness' 'production' 'FAIL' 'Production readiness preflight could not produce a report.' $preflightResult.log
	} else {
		$productionReport = Get-Content -Raw -LiteralPath $productionReportPath -Encoding UTF8 | ConvertFrom-Json
		$productionBlockers = @($productionReport.checks | Where-Object { $_.status -eq 'blocked' })
		if ($productionReport.result -eq 'ready') {
			Add-Check 'production-readiness' 'production' 'PASS' "All $($productionReport.summary.total) production decisions and gates are ready." $productionReportPath
		} else {
			Add-Check 'production-readiness' 'production' 'BLOCKED' "$($productionReport.summary.blocked) of $($productionReport.summary.total) production prerequisite(s) remain." $productionReportPath
		}
	}
} catch {
	Add-Check 'closure-runner' 'runner' 'FAIL' (Protect-Text $_.Exception.Message $script:knownSecrets.ToArray())
} finally {
	if ($edgeStartedByRunner -and -not $edgeBefore.running) {
		$stopResult = Stop-PreviewEdge
		if ($stopResult.exitCode -eq 0 -and -not (Get-ListenerProcessId 47921)) {
			Add-Check 'preview-edge-final-cleanup' 'runtime' 'PASS' 'The runner released the preview Edge that it started.'
			$edgeRestored = $true
		} else {
			Add-Check 'preview-edge-final-cleanup' 'runtime' 'FAIL' 'The runner could not release the preview Edge that it started.' $stopResult.log
			$edgeRestored = $false
		}
	}
	try {
		$edgeAfter = Get-SafeEdgeSnapshot
		if ($edgeBefore -and $edgeBefore.running) {
			$edgeRestored = $edgeAfter.running -and $edgeAfter.owned -and $edgeAfter.liveStatus -eq 'ok' -and $edgeAfter.mode -eq 'edge'
			if (-not $edgeRestored) {
				Add-Check 'preview-edge-final-invariant' 'runtime' 'FAIL' 'The preview Edge was not healthy and repository-owned at closure end.'
			} else {
				Add-Check 'preview-edge-final-invariant' 'runtime' 'PASS' 'The preview Edge is healthy and repository-owned at closure end.'
			}
		}
	} catch {
		$edgeRestored = $false
		Add-Check 'preview-edge-final-invariant' 'runtime' 'FAIL' 'Unable to verify the preview Edge final state.'
	}
	try {
		$sharedAfter = Get-SharedProxySnapshot
		$sharedUnchanged = $sharedBefore -and (Test-SnapshotEqual $sharedBefore $sharedAfter)
		if ($sharedUnchanged) {
			Add-Check 'shared-proxy-final-invariant' 'runtime' 'PASS' 'Shared Proxy PID, /live, selected program hashes, and selected data hashes stayed unchanged.'
		} else {
			Add-Check 'shared-proxy-final-invariant' 'runtime' 'FAIL' 'Shared Proxy PID, health, program hashes, or selected data hashes changed.'
		}
	} catch {
		$sharedUnchanged = $false
		Add-Check 'shared-proxy-final-invariant' 'runtime' 'FAIL' 'Unable to verify the shared Proxy final state.'
	}
}

$result = Get-ClosureResult
$summary = [ordered]@{
	pass = @($script:checks | Where-Object { $_.result -eq 'PASS' }).Count
	blocked = @($script:checks | Where-Object { $_.result -eq 'BLOCKED' }).Count
	fail = @($script:checks | Where-Object { $_.result -eq 'FAIL' }).Count
	total = $script:checks.Count
}
$report = [ordered]@{
	schemaVersion = 1
	generatedAt = (Get-Date).ToUniversalTime().ToString('o')
	runId = $runId
	result = $result
	summary = $summary
	repositories = $repositories
	runtime = [ordered]@{
		sharedProxy = [ordered]@{
			before = $sharedBefore
			after = $sharedAfter
			unchanged = [bool]$sharedUnchanged
		}
		previewEdge = [ordered]@{
			before = $edgeBefore
			after = $edgeAfter
			restored = [bool]$edgeRestored
		}
	}
	production = [ordered]@{
		result = if ($productionReport) { [string]$productionReport.result } else { 'unavailable' }
		blockers = @($productionBlockers | ForEach-Object {
			[ordered]@{
				id = [string]$_.id
				category = [string]$_.category
				detail = [string]$_.detail
			}
		})
	}
	checks = $script:checks
}

$jsonPath = Join-Path $ReportDirectory 'closure-report.json'
$markdownPath = Join-Path $ReportDirectory 'closure-report.md'
$reportJson = $report | ConvertTo-Json -Depth 40
$safeReportJson = Protect-Text $reportJson $script:knownSecrets.ToArray()
foreach ($secret in $script:knownSecrets) {
	if (-not [string]::IsNullOrEmpty($secret) -and $safeReportJson.Contains($secret)) {
		throw 'Refusing to write a closure report containing the Edge nonce.'
	}
}
[IO.File]::WriteAllText($jsonPath, ($safeReportJson + "`n"), (New-Object Text.UTF8Encoding($false)))
Write-MarkdownReport $markdownPath $report
Copy-Item -LiteralPath $jsonPath -Destination (Join-Path $allowedReportRoot 'latest.json') -Force
Copy-Item -LiteralPath $markdownPath -Destination (Join-Path $allowedReportRoot 'latest.md') -Force

[ordered]@{
	result = $result
	report = $jsonPath
	markdown = $markdownPath
	pass = $summary.pass
	blocked = $summary.blocked
	fail = $summary.fail
	sharedProxyPid = if ($sharedAfter) { $sharedAfter.processId } else { $null }
	sharedProxyUnchanged = [bool]$sharedUnchanged
	previewEdgeRestored = [bool]$edgeRestored
} | ConvertTo-Json -Depth 8

if ($result -eq 'FAIL') {
	exit 1
}
if ($result -eq 'BLOCKED') {
	exit 2
}
