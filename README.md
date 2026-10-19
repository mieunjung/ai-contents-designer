# AI Contents designer 실행 안내

게임과 노래를 만들 때 Google의 **Gemini 2.5 Flash-Lite** 텍스트 모델을 사용합니다. 입력과 출력 길이를 짧게 제한하고, Gemini API 키는 브라우저가 아닌 내 컴퓨터의 로컬 서버에서만 사용합니다. Google AI Studio에서 발급한 키를 채팅이나 웹페이지에 붙여 넣지 마세요.

## 처음 한 번 준비하기

1. Node.js 18 이상을 설치합니다.
2. [Google AI Studio](https://aistudio.google.com/app/apikey)에서 Gemini API 키를 발급합니다. 무료 사용 가능 여부와 한도, 결제 조건은 Google 계정과 정책에 따라 달라질 수 있으니 [공식 요금 안내](https://ai.google.dev/gemini-api/docs/pricing)를 확인하세요.
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

GitHub Pages 공개 데모에서는 게임·노래의 예시 체험과 작품 게시판을 사용할 수 있지만, GitHub Pages가 Node.js 서버를 실행하지 않으므로 Gemini 실생성은 동작하지 않습니다. Gemini 실생성을 인터넷에 공개하려면 별도의 HTTPS 백엔드 호스팅에 `server.mjs`를 배포하고 `GEMINI_API_KEY`를 해당 호스팅의 비밀 환경 변수에 등록한 뒤, HTML의 `/api` 요청을 그 백엔드로 연결해야 합니다. API 키를 공개 저장소나 HTML에 넣지 마세요.

## 생성되는 콘텐츠

- **게임:** Gemini가 주인공, 모을 아이템, 장애물, 목표를 만들고, 페이지에서 아이템을 클릭해 점수를 얻는 간단한 플레이 체험을 할 수 있습니다.
- **노래:** Gemini가 새 가사와 음계 정보를 만들고, 브라우저가 간단한 전자음 멜로디로 재생합니다. Gemini가 음원이나 가수 목소리를 생성하는 기능은 아닙니다.
- **영상·그림:** 현재는 페이지 안의 예시를 만드는 프로토타입이며 Gemini 호출은 연결되어 있지 않습니다.

요청은 로컬 PC에서 Google Gemini API로 전송됩니다. 서버는 로컬 주소에만 연결되고 분당 최대 12회의 생성 요청을 허용합니다. 생성 작품은 서버에 저장하지 않습니다. 게시판 저장은 해당 브라우저의 로컬 저장 공간을 사용합니다.
