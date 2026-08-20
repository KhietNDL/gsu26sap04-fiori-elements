[CmdletBinding()]
param(
  [string]$UserName = "DEV-115",
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$credential = Get-Credential -UserName $UserName -Message "SAP S40 client 324 credentials"

if (-not $credential) {
  throw "SAP credentials are required to start Approval Inbox."
}

$env:FIORI_TOOLS_USER = $credential.UserName
$env:FIORI_TOOLS_PASSWORD = $credential.GetNetworkCredential().Password

try {
  Set-Location -LiteralPath $projectRoot
  & npx.cmd fiori run --config ui5-approval.yaml --port $Port

  if ($LASTEXITCODE -ne 0) {
    throw "Approval dev server exited with code $LASTEXITCODE."
  }
} finally {
  Remove-Item Env:FIORI_TOOLS_USER -ErrorAction SilentlyContinue
  Remove-Item Env:FIORI_TOOLS_PASSWORD -ErrorAction SilentlyContinue
}
