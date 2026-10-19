$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js 18 이상을 설치한 뒤 다시 실행해 주세요."
}

$secureKey = Read-Host "Google AI Studio에서 발급한 Gemini API 키를 입력하세요 (입력 내용은 화면에 표시되지 않아요)" -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
  $env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
  if ([string]::IsNullOrWhiteSpace($env:GEMINI_API_KEY)) {
    throw "API 키를 입력하지 않았습니다."
  }

  Write-Host "Gemini 키는 현재 실행 중인 서버에만 전달되며 파일에 저장되지 않습니다."
  & node (Join-Path $PSScriptRoot "server.mjs")
} finally {
  $env:GEMINI_API_KEY = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
  $secureKey.Dispose()
}
