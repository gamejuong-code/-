# 스마트 과제 관리 — 웹 버전

기존 `tkinter` 프로그램의 과제 등록·수정·삭제, 완료 변경, 검색·필터, 마감일순 목록, 상세 보기, 마감 임박 안내를 웹으로 옮긴 프로젝트입니다. 웹 파일은 [GitHub 저장소](https://github.com/gamejuong-code/-)에 올라가 있습니다. 윈도우 `.exe`와 원본 `응프.py`는 웹 배포에 필요하지 않습니다.

현재 버전은 Firebase 프로젝트 `smart-task-manager-14ebb`에 연결되어 있습니다. Firebase의 웹 앱 설정값은 브라우저에 포함되는 공개 식별자이며, 과제 데이터 접근은 로그인과 Firestore 보안 규칙으로 제한합니다.

## 1. Firebase 준비 (다른 프로젝트로 바꿀 때만)

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 프로젝트를 만들고, 프로젝트에 **웹 앱(`</>`)**을 등록합니다.
2. 웹 앱 설정에 보이는 `firebaseConfig` 값을 준비합니다.
3. **Authentication → Sign-in method**에서 **이메일/비밀번호**를 사용 설정합니다.
4. **Firestore Database → 데이터베이스 만들기**를 진행합니다. 실제 배포에는 공개 테스트 규칙 대신 아래 5번의 사용자별 규칙을 적용합니다.
5. Firestore의 **규칙(Rules)** 화면에서 이 폴더의 `firestore.rules` 내용을 붙여 넣고 **게시**합니다. 이 규칙은 로그인한 사용자가 자기 과제에만 접근하도록 합니다.

공식 안내: [Firebase 웹 설정](https://firebase.google.com/docs/web/setup) · [이메일/비밀번호 인증](https://firebase.google.com/docs/auth/web/password-auth) · [Firestore 보안 규칙](https://firebase.google.com/docs/firestore/security/get-started)

## 2. 내 컴퓨터에서 실행

Node.js 24와 pnpm을 설치한 뒤 이 폴더에서 실행합니다.

현재 연결된 Firebase를 그대로 사용할 때는 `.env.local`이 필요 없습니다. 다른 프로젝트로 바꿀 때만 `Copy-Item .env.example .env.local`을 실행하고 새 Firebase 웹 앱 설정값을 채웁니다. 예를 들어 `firebaseConfig.apiKey`는 `VITE_FIREBASE_API_KEY`에, `firebaseConfig.authDomain`은 `VITE_FIREBASE_AUTH_DOMAIN`에 넣습니다. 필수 항목은 `API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `APP_ID`입니다. 빈 항목 앞뒤에 따옴표는 필요하지 않습니다.

```powershell
pnpm install
pnpm dev
```

터미널에 표시된 `http://localhost:5173/`을 열어 회원가입, 로그인, 과제 등록을 확인하세요. `.env.local`을 바꾸면 개발 서버를 다시 시작해야 합니다.

Firebase 설정값을 모두 제거하거나 초기화에 실패한 경우에만 **브라우저 저장 모드**로 전환됩니다. 이 모드의 과제는 기기 간 동기화되지 않습니다.

## 3. GitHub 저장소

[gamejuong-code/-](https://github.com/gamejuong-code/-) 저장소의 `main` 브랜치에 웹 프로젝트가 올라가 있습니다. 이후 수정사항을 올릴 때는 해당 저장소에서 다음 명령을 사용합니다.

```powershell
git add .
git commit -m "스마트 과제 관리 수정"
git push
```

`.gitignore`가 `.env.local`, `node_modules`, `dist`를 제외합니다. **원본 `과제목록.json`은 공개 저장소에 올리지 마세요.**

## 4. Vercel에 배포

1. [Vercel](https://vercel.com/)에 로그인하고 **Add New → Project**를 누릅니다.
2. `gamejuong-code/-` GitHub 저장소를 연결합니다.
3. Framework Preset이 **Vite**, Build Command가 `pnpm build`, Output Directory가 `dist`인지 확인합니다.
4. 현재 Firebase 프로젝트를 그대로 사용한다면 환경변수 추가 없이 배포할 수 있습니다. 다른 Firebase 프로젝트로 바꿨다면 **Environment Variables**에 `.env.local`의 `VITE_FIREBASE_*` 값들을 같은 이름으로 추가합니다. `.env.local` 파일 자체를 업로드하지 않습니다.
5. **Deploy**를 누르고 나온 `*.vercel.app` 주소에서 회원가입과 과제 저장을 확인합니다.

환경변수를 배포 후에 추가하거나 수정했다면 다시 배포해야 적용됩니다. 이후 GitHub의 `main` 브랜치에 push하면 Vercel이 자동으로 새 버전을 배포합니다.

공식 안내: [Vercel의 Vite 배포](https://vercel.com/docs/frameworks/frontend/vite) · [Git 연동](https://vercel.com/docs/git) · [환경변수](https://vercel.com/docs/environment-variables)

## 5. 기존 과제 가져오기

배포된 사이트에 로그인한 뒤 **JSON 가져오기**를 눌러 기존 `과제목록.json`을 선택합니다. 과제는 로그인한 계정의 Firestore 경로 `users/{uid}/tasks`에 저장됩니다. 원본 데이터 파일은 배포 파일에 포함하지 않았습니다. **내보내기**로 같은 형식의 백업을 받을 수 있습니다.

## 참고

- Firebase 웹 설정의 API 키는 웹 앱에 포함되는 식별자입니다. 과제 데이터 보호는 `firestore.rules`와 로그인에 달려 있습니다. [Firebase API 키 안내](https://firebase.google.com/docs/projects/api-keys)
- 마감 임박 안내는 사이트를 열어 둔 동안 화면에 표시됩니다. 브라우저를 닫아도 오는 푸시 알림은 구현되어 있지 않습니다.
