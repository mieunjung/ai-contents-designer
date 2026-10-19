# AI Contents designer 실행 안내

게임, 노래, 영상 스토리보드, 그림 설계에 Google이 가격 대비 성능이 좋다고 안내하는 **Gemini 2.5 Flash** 모델을 사용합니다. Flash-Lite보다 더 풍부한 창작 결과를 목표로 합니다. 입력과 출력은 필요한 분량으로 제한합니다. Gemini API 키는 브라우저가 아닌 내 컴퓨터의 로컬 서버에서만 사용합니다. Google AI Studio에서 발급한 키를 채팅이나 웹페이지에 붙여 넣지 마세요.

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

GitHub Pages는 HTML만 실행하므로 모델 호출은 Supabase Edge Function `ai-generate`가 처리합니다. Gemini API 키는 Supabase 비밀 환경 변수에만 저장합니다. 브라우저에 배포되는 Supabase 프로젝트 URL과 legacy `anon` 키는 공개 클라이언트 설정이며, Gemini 비밀 키와 다릅니다.

### 공개 페이지의 Gemini 백엔드 설정

1. 먼저 이전에 채팅/이미지에 올린 Gemini 키를 Google AI Studio에서 폐기하고 새 키를 발급합니다. 새 키는 채팅에 보내거나 저장소 파일에 넣지 마세요.
2. [Supabase](https://database.new/)에서 프로젝트를 만듭니다. Windows에 Node.js 18 이상과 GitHub CLI가 설치되어 있고 `gh auth login`이 완료되어 있어야 합니다.
3. Supabase 대시보드의 [Account > Access Tokens](https://supabase.com/dashboard/account/tokens)에서 Personal Access Token을 발급합니다. 토큰은 여기 채팅에 공유하지 마세요.

```powershell
git push
```

4. PowerShell에서 이 폴더로 이동해 `.\deploy-supabase.ps1`을 실행합니다. Supabase Personal Access Token은 가려진 입력란에 입력합니다. 프로젝트 reference는 기본값으로 현재 생성된 프로젝트를 사용합니다. 스크립트는 프로젝트 접근 권한을 확인하고, **공개** legacy `anon` 키를 물어본 뒤 대시보드 SQL Editor를 엽니다.
5. 스크립트가 안내하는 `supabase/migrations/20261019000000_ai_generation_limits.sql`의 전체 내용을 SQL Editor에서 실행하고, 성공한 후 스크립트에 `YES`라고 입력합니다.
6. 새 Gemini 키를 스크립트의 숨김 입력란에 입력합니다. 스크립트는 Edge Function을 배포하고 키를 Supabase secret `GEMINI_API_KEY`로 설정합니다. 임시 키 파일은 작업 후 삭제됩니다. Supabase access token과 Gemini 키는 채팅·HTML·저장소에 넣지 마세요.
7. 스크립트는 백엔드 상태를 확인하고, 공개 Supabase URL/anon 키를 GitHub Actions 변수로 등록해 Pages 재배포를 시작합니다. 배포 후 [공개 사이트](https://mieunjung.github.io/ai-contents-designer/)의 네 가지 만들기 화면에 Gemini 연결 완료가 표시됩니다.

Supabase의 무료 사용량과 Gemini 무료 티어는 계정, 지역, 현재 제공 정책에 따라 달라질 수 있으며 무제한 보장이 아닙니다. 이 함수는 IP 해시 기준 하루 8회, 전체 합계 하루 100회의 생성 한도를 둡니다. SQL 마이그레이션을 적용하지 않으면 생성을 fail-closed로 거부합니다. 실제 노래 음원이나 가수 목소리를 생성하지 않고, 새 가사와 16음의 짧은 브라우저 합성 멜로디를 만듭니다.

## 생성되는 콘텐츠

- **게임:** Gemini가 아이디어에 맞는 주인공, 모을 아이템, 장애물, 목표를 만들고, 페이지에서 아이템을 눌러 점수를 얻는 미니 게임으로 플레이할 수 있습니다.
- **노래:** Gemini가 이야기 흐름과 운율을 갖춘 새 가사, 가사/후렴이 구분되는 16음 멜로디를 만들고 브라우저가 재생합니다. 실제 가창 음원이나 가수 목소리를 생성하는 기능은 아닙니다.
- **영상:** Gemini가 아이디어를 3개 장면의 스토리보드와 내레이션으로 만듭니다. 브라우저가 각 장면을 애니메이션으로 재생하고 WebM 영상 파일로 저장합니다. 외부 영상 생성 모델이 만든 실사/고화질 영상은 아닙니다.
- **그림:** Gemini가 아이디어에 맞는 주인공, 색상, 장식을 설계하고 브라우저가 SVG 그림으로 렌더링합니다. 그림은 SVG 파일로 내려받을 수 있으며, 외부 이미지 생성 모델이 만든 사진/픽셀 그림은 아닙니다.

영상과 그림 파일은 브라우저에서 만들어지므로 별도의 영상·이미지 API 요금이 발생하지 않습니다. Gemini가 연결되지 않았을 때는 예시 결과로 가장하지 않고 연결 안내를 보여줍니다.

요청은 로컬 PC에서 Google Gemini API로 전송됩니다. 서버는 로컬 주소에만 연결되고 분당 최대 12회의 생성 요청을 허용합니다. 생성 작품은 서버에 저장하지 않습니다. 게시판 저장은 해당 브라우저의 로컬 저장 공간을 사용합니다.
