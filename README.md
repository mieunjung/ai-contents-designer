# AI Contents designer 실행 안내

앱 안에서 게임·노래·영상 스토리보드·그림 초안을 만들 때 **Gemini 2.5 Flash**를 사용합니다. 각 만들기 화면에서 그림은 [Genspark](https://www.genspark.ai/), 영상은 [Canva](https://www.canva.com/), 노래는 [Suno](https://suno.com/), 게임은 [Gemini](https://gemini.google.com/)를 새 탭으로 열고, 해당 서비스에 붙여 넣을 주문서를 복사할 수 있습니다. 외부 서비스는 별도 계정이나 로그인, 사용량 제한이 있을 수 있으며 무료 제공 범위는 각 서비스의 현재 정책을 확인하세요. 입력과 출력은 필요한 분량으로 제한합니다. Gemini API 키는 브라우저가 아닌 내 컴퓨터의 로컬 서버에서만 사용합니다. Google AI Studio에서 발급한 키를 채팅이나 웹페이지에 붙여 넣지 마세요.

## 처음 한 번 준비하기

1. Node.js 18 이상을 설치합니다.
2. [Google AI Studio](https://aistudio.google.com/app/apikey)에서 Gemini API 키를 발급합니다. 무료 티어의 모델 접근과 사용 한도는 Google 계정, 지역, 현재 정책에 따라 달라질 수 있습니다. 사용 전에 [Gemini 2.5 Flash 모델 안내](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash)와 [공식 요금 안내](https://ai.google.dev/gemini-api/docs/pricing)를 확인하세요. AI Studio의 무료 티어와 한도를 넘는 유료 사용은 서로 다르므로, 결제를 원치 않으면 Google Cloud 유료 설정 및 사용량을 확인하세요.
3. Windows PowerShell을 열고 이 폴더로 이동한 뒤 아래 명령을 실행합니다.

```powershell
.\start.ps1
```

PowerShell이 스크립트 실행을 막으면 다음 명령을 사용할 수 있습니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

키를 입력할 때 화면에 글자가 나타나지 않는 것은 정상입니다. 서버가 `http://127.0.0.1:4173` 주소를 표시하면 그 주소를 브라우저에서 엽니다. 키는 실행 중인 서버의 환경 변수로만 전달되며 파일에 저장되지 않습니다. 사이트를 닫으려면 PowerShell 창에서 `Ctrl+C`를 누릅니다.

## 공개 데모와 Gemini 연결

GitHub Pages는 HTML만 실행하므로 모델 호출은 Supabase Edge Function `ai-generate`가 처리합니다. Gemini API 키는 Supabase 비밀 환경 변수에만 저장합니다. 브라우저에는 Supabase 프로젝트 URL과 publishable API 키만 설정하며, Gemini 비밀 키와 다릅니다. 함수는 공개 API 키를 확인하고 데이터베이스의 사용량 제한을 적용합니다.

### 공개 페이지의 Gemini 백엔드 설정

1. 먼저 이전에 채팅/이미지에 올린 Gemini 키를 Google AI Studio에서 폐기하고 새 키를 발급합니다. 새 키는 채팅에 보내거나 저장소 파일에 넣지 마세요.
2. 사용할 Supabase 프로젝트를 준비합니다. Windows에 Node.js 18 이상과 GitHub CLI가 설치되어 있어야 합니다.
3. Windows에 Node.js 18 이상과 GitHub CLI를 설치하고 GitHub와 Supabase CLI에 로그인합니다(`gh auth login`, `npx supabase@latest login`). 인증 토큰을 채팅이나 저장소 파일에 넣지 마세요.

4. PowerShell에서 이 폴더로 이동해 `.\deploy-supabase.ps1`을 실행합니다. 프로젝트 reference는 기본값으로 현재 프로젝트를 사용합니다. 저장소 밖에서 실행해도 스크립트가 저장소의 파일을 찾으며, SQL 마이그레이션을 적용하고 `ai-generate`, `board-upload` Edge Function을 JWT 검증 없이 배포합니다. 함수가 공개 API 키를 확인하고 데이터베이스의 사용량 제한을 적용합니다.
5. Google AI Studio에서 새 Gemini 키를 발급하고, 스크립트의 숨김 입력란에 입력합니다. 키는 Supabase secret `GEMINI_API_KEY`로 설정되며 임시 파일은 작업 후 삭제됩니다. Gemini 키는 채팅·HTML·저장소에 넣지 마세요.
6. 스크립트가 Supabase의 공개 URL과 publishable 키를 GitHub Actions 저장소 변수 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`로 등록해 Pages 배포를 시작합니다. 이 두 변수가 없으면 Pages workflow는 연결이 끊긴 사이트를 게시하지 않고 실패합니다. 배포 후 [공개 사이트](https://mieunjung.github.io/ai-contents-designer/)의 네 가지 만들기 화면에 Gemini 연결 완료가 표시됩니다.

Supabase의 무료 사용량과 Gemini 무료 티어는 계정, 지역, 현재 제공 정책에 따라 달라질 수 있으며 무제한 보장이 아닙니다. 이 함수는 IP 해시 기준 하루 8회, 전체 합계 하루 100회의 생성 한도를 둡니다. SQL 마이그레이션을 적용하지 않으면 생성을 fail-closed로 거부합니다. 실제 노래 음원이나 가수 목소리를 생성하지 않고, 새 가사와 16음의 짧은 브라우저 합성 멜로디를 만듭니다.

## 스크래치 게임 게시판 업로드

작품 게시판에서 **작품 올리기**를 누르고 분야를 **AI 게임**으로 선택한 뒤 제목, 소개, `.sb3` 파일을 제출하면 공개 Supabase Storage 버킷과 데이터베이스에 저장됩니다. 올린 게임은 AI 게임 게시판의 카드에서 열어 작품 소개를 확인하고 `.sb3` 파일을 다운로드할 수 있습니다. 파일은 최대 50MB이며, IP 해시 기준 하루 10회, 전체 하루 200회 업로드로 제한됩니다. 업로드는 Supabase Edge Function이 서명한 URL을 사용하며, 파일을 브라우저 로컬 저장소에 보관하지 않습니다. 게시판에는 백엔드 연결 상태와 공개 게임 개수가 표시됩니다. GitHub Pages와 Supabase 백엔드를 설정한 뒤 새 마이그레이션 및 함수를 배포해야 사용할 수 있습니다.

## 생성되는 콘텐츠

- **게임:** Gemini가 아이디어에 맞는 주인공, 모을 아이템, 장애물, 목표를 만들고, 페이지에서 아이템을 눌러 점수를 얻는 미니 게임으로 플레이할 수 있습니다.
- **노래:** Gemini가 이야기 흐름과 운율을 갖춘 새 가사, 가사/후렴이 구분되는 16음 멜로디를 만들고 브라우저가 재생합니다. 실제 가창 음원이나 가수 목소리를 생성하는 기능은 아닙니다.
- **영상:** Gemini가 아이디어를 3개 장면의 스토리보드와 내레이션으로 만듭니다. 브라우저가 각 장면을 애니메이션으로 재생하고 WebM 영상 파일로 저장합니다. 외부 영상 생성 모델이 만든 실사/고화질 영상은 아닙니다.
- **그림:** Gemini가 아이디어에 맞는 주인공, 색상, 장식을 설계하고 브라우저가 SVG 그림으로 렌더링합니다. 그림은 SVG 파일로 내려받을 수 있으며, 외부 이미지 생성 모델이 만든 사진/픽셀 그림은 아닙니다.

영상과 그림 파일은 브라우저에서 만들어지므로 별도의 영상·이미지 API 요금이 발생하지 않습니다. Gemini가 연결되지 않았을 때는 예시 결과로 가장하지 않고 연결 안내를 보여줍니다.

요청은 로컬 PC에서 Google Gemini API로 전송됩니다. 서버는 로컬 주소에만 연결되고 분당 최대 12회의 생성 요청을 허용합니다. 생성 작품과 기존 게시물은 브라우저 로컬 저장소를 사용하고, 게시판에 올린 스크래치 게임 파일과 게시물 정보는 공개 Supabase 백엔드에 저장됩니다.
