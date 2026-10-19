$ErrorActionPreference = "Stop"
$repo = "mieunjung/ai-contents-designer"
$siteUrl = "https://mieunjung.github.io/ai-contents-designer/"
$defaultProjectRef = "yvpalquguzqupvzcavni"

function Invoke-SupabaseCli {
  & npx.cmd --yes supabase@latest @args
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase CLI failed. Sign in with 'npx supabase@latest login' and try again."
  }
}

function Invoke-GitHubCli {
  & $script:ghExecutable @args
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI request failed. Run 'gh auth login' and verify repository access."
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Install Node.js 18 or newer before deploying."
}
 $ghCommand = Get-Command gh -ErrorAction SilentlyContinue
if ($ghCommand) {
  $script:ghExecutable = $ghCommand.Source
} elseif (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA "copilot-desktop-gh-2.102.0\gh.exe")) {
  $script:ghExecutable = Join-Path $env:LOCALAPPDATA "copilot-desktop-gh-2.102.0\gh.exe"
} else {
  throw "Install GitHub CLI and sign in with 'gh auth login' before deploying."
}

$projectRefInput = Read-Host "Supabase project reference (Enter accepts $defaultProjectRef)"
$projectRef = if ([string]::IsNullOrWhiteSpace($projectRefInput)) { $defaultProjectRef } else { $projectRefInput.Trim() }
if ($projectRef -notmatch '^[a-zA-Z0-9-]{8,40}$') {
  throw "That project reference doesn't look valid."
}
$projectUrl = "https://$projectRef.supabase.co"

Write-Host "Checking Supabase CLI sign-in and project access."
$projects = Invoke-SupabaseCli projects list
if ((@($projects) -join "`n") -notmatch [regex]::Escape($projectRef)) {
  throw "The signed-in Supabase account cannot access project $projectRef."
}

$apiKeys = Invoke-SupabaseCli projects api-keys --project-ref $projectRef --output json | ConvertFrom-Json
$publishableKey = @($apiKeys | Where-Object { $_.type -eq "publishable" })[0].api_key
if ($publishableKey -notmatch '^sb_publishable_') {
  throw "The project's publishable API key could not be identified."
}

Invoke-SupabaseCli db push --project-ref $projectRef --yes

Write-Host "Sign in to Supabase if prompted. The Gemini key is entered privately and sent only to Supabase."
$geminiKey = Read-Host "Enter your newly rotated Gemini API key (input is hidden)" -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($geminiKey)
$plainKey = $null
$temporaryEnv = Join-Path ([IO.Path]::GetTempPath()) ("ai-contents-secrets-" + [guid]::NewGuid().ToString("N") + ".env")

try {
  $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
  if ([string]::IsNullOrWhiteSpace($plainKey)) {
    throw "A Gemini API key is required."
  }

  Invoke-SupabaseCli functions deploy ai-generate --project-ref $projectRef --use-api --no-verify-jwt
  [IO.File]::WriteAllText($temporaryEnv, "GEMINI_API_KEY=$plainKey", [Text.UTF8Encoding]::new($false))
  Invoke-SupabaseCli secrets set --project-ref $projectRef --env-file $temporaryEnv
} finally {
  if (Test-Path -LiteralPath $temporaryEnv) {
    Remove-Item -LiteralPath $temporaryEnv -Force
  }
  $plainKey = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
  $geminiKey.Dispose()
}

$headers = @{
  apikey = $publishableKey
  Authorization = "Bearer $publishableKey"
}
$headers.Authorization = "Bearer $publishableKey"
$health = Invoke-RestMethod -Uri "$projectUrl/functions/v1/ai-generate" -Headers $headers
if (-not $health.configured) {
  throw "The function is deployed, but it did not report a configured Gemini key."
}

Invoke-GitHubCli variable set SUPABASE_URL --repo $repo --body $projectUrl
Invoke-GitHubCli variable set SUPABASE_PUBLISHABLE_KEY --repo $repo --body $publishableKey
Invoke-GitHubCli workflow run "Deploy AI Contents designer" --repo $repo

Write-Host ""
Write-Host "Gemini backend is responding. GitHub Pages deployment has started."
Write-Host "Site: $siteUrl"
Write-Host "The Supabase URL and publishable key are public app configuration; the Gemini key stays on Supabase."
