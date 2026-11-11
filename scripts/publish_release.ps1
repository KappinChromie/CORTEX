param (
    [string]$Version = "v0.1.0"
)

$ErrorActionPreference = 'Stop'
$credInput = "protocol=https`nhost=github.com`n`n"
$credOutput = $credInput | git credential fill
$token = ""
foreach ($line in ($credOutput -split "`n")) {
    if ($line.Trim().StartsWith("password=")) {
        $token = $line.Trim().Substring(9).Trim()
    }
}

if (-not $token) {
    Write-Error "Could not retrieve GitHub credentials."
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Accept" = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent" = "Cortex-Release-Script"
}

Write-Host "Fetching release $Version..."
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/KappinChromie/CORTEX/releases/tags/$Version" -Headers $headers
Write-Host "Release HTML: $($release.html_url)"
Write-Host "Release assets count: $($release.assets.Count)"
foreach ($asset in $release.assets) {
    Write-Host " - $($asset.name): $($asset.browser_download_url)"
}
