$ErrorActionPreference = "Stop"
$repo = "mieunjung/ai-contents-designer"
$siteUrl = "https://mieunjung.github.io/ai-contents-designer/"

function Invoke-SupabaseCli {
  & npx --yes supabase@latest @args
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase CLI failed. Sign in with 'npx supabase@latest login' and try again."
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Install Node.js 18 or newer before deploying."
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "Install GitHub CLI and sign in with 'gh auth login' before deploying."
}

$projectRef = Read-Host "Supabase project reference (Project Settings > General)"
if ($projectRef -notmatch '^[a-zA-Z0-9-]{8,40}$') {
  throw "That project reference doesn't look valid."
}
$projectUrl = "https://$projectRef.supabase.co"

Write-Host "Checking Supabase CLI sign-in and project access."
$projects = Invoke-SupabaseCli projects list
if ((@($projects) -join "`n") -notmatch [regex]::Escape($projectRef)) {
  throw "The signed-in Supabase account cannot access project $projectRef."
}

$publishableKey = Read-Host "Supabase legacy anon public key (Settings > API Keys > Legacy API keys; public, not secret)"
if ($publishableKey -notmatch '^eyJ') {
  throw "Use the project's legacy anon JWT key so the Edge Function JWT verification works."
}

Write-Host ""
Write-Host "Before continuing, apply this SQL migration in the Supabase SQL Editor:"
Write-Host (Join-Path $PSScriptRoot "supabase\migrations\20261019000000_ai_generation_limits.sql")
Start-Process "https://supabase.com/dashboard/project/$projectRef/sql/new"
$migrationReady = Read-Host "Paste and run the migration SQL. Type YES after it succeeds"
if ($migrationReady -cne "YES") {
  throw "The migration was not confirmed; nothing was deployed."
}

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

  Invoke-SupabaseCli functions deploy ai-generate --project-ref $projectRef --use-api
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
$health = Invoke-RestMethod -Uri "$projectUrl/functions/v1/ai-generate" -Headers $headers
if (-not $health.configured) {
  throw "The function is deployed, but it did not report a configured Gemini key."
}

gh variable set SUPABASE_URL --repo $repo --body $projectUrl
if ($LASTEXITCODE -ne 0) { throw "Could not save the public Supabase URL as a GitHub Actions variable." }
gh variable set SUPABASE_ANON_KEY --repo $repo --body $publishableKey
if ($LASTEXITCODE -ne 0) { throw "Could not save the public Supabase anon key as a GitHub Actions variable." }
gh workflow run "Deploy AI Contents designer" --repo $repo
if ($LASTEXITCODE -ne 0) { throw "Could not start the GitHub Pages deployment." }

Write-Host ""
Write-Host "Gemini backend is responding. GitHub Pages deployment has started."
Write-Host "Site: $siteUrl"
Write-Host "The Supabase URL and anon key are public app configuration; the Gemini key stays on Supabase."
