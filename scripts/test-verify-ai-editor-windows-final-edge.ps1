[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'lib\ai-editor-final-edge-release.ps1')

$script:passed = 0

function New-ReleaseSource([string]$ProductTarget) {
	return [pscustomobject]@{
		productTarget = $ProductTarget
		targets = [pscustomobject]@{
			edge = [pscustomobject]@{
				entryPoint = 'src/launcher.js'
				npmWorkspaces = $false
			}
		}
	}
}

function New-ArtifactValidation([string]$Target, [string[]]$Files) {
	$manifestFiles = [ordered]@{}
	foreach ($file in $Files) {
		$manifestFiles[$file] = 'a' * 64
	}
	return [pscustomobject]@{
		target = $Target
		manifest = [pscustomobject]@{
			schemaVersion = 2
			target = $Target
			entryPoint = if ($Target -eq 'edge') { 'src/launcher.js' } else { 'src/server.js' }
			files = [pscustomobject]$manifestFiles
		}
	}
}

function Assert-Throws([scriptblock]$Action, [string]$Pattern) {
	try {
		& $Action
	} catch {
		if ($_.Exception.Message -notmatch $Pattern) {
			throw "Expected error matching '$Pattern', found: $($_.Exception.Message)"
		}
		$script:passed++
		return
	}
	throw "Expected action to fail with '$Pattern'."
}

function Assert-Passes([scriptblock]$Action) {
	& $Action
	$script:passed++
}

$metadataFiles = @(
	'LICENSE',
	'ThirdPartyNotices.txt',
	'package.json',
	'package-lock.json',
	'src/launcher.js',
	'src/edge/edge-server.js'
)

Assert-Throws {
	Assert-AiEditorFinalEdgeRelease `
		(New-ReleaseSource 'legacy-standalone') `
		(New-ArtifactValidation 'legacy-standalone' @('src/server.js'))
} 'productTarget=edge'

Assert-Throws {
	Assert-AiEditorFinalEdgeRelease `
		(New-ReleaseSource 'edge') `
		(New-ArtifactValidation 'edge' ($metadataFiles + 'gateway/dist/server.js'))
} 'forbidden Gateway'

Assert-Throws {
	Assert-AiEditorFinalEdgeRelease `
		(New-ReleaseSource 'edge') `
		(New-ArtifactValidation 'edge' ($metadataFiles + 'data/gateway.sqlite'))
} 'database resource'

Assert-Passes {
	Assert-AiEditorFinalEdgeRelease `
		(New-ReleaseSource 'edge') `
		(New-ArtifactValidation 'edge' $metadataFiles)
}

Write-Host "[ai-editor-final-edge-release] $script:passed passing."
