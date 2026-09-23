# 박주호 포트폴리오

ChatGPT Sites에 배포되는 정적 포트폴리오 프로젝트입니다.

## 폴더 구조

```text
portfolio/
├─ frontend/          # HTML과 브라우저 JavaScript
│  └─ styles/         # 토큰·기본·컴포넌트·덱·반응형 CSS
├─ backend/           # 향후 서버 코드 위치 (현재 백엔드 없음)
├─ assets/            # 이미지, 폰트, 외부 라이브러리
├─ docs/
│  ├─ frontend/       # 제품·디자인·검토 문서
│  ├─ backend/        # 백엔드 구조 문서
│  └─ assets/         # 에셋 관리 문서
├─ scripts/           # 빌드와 검증 스크립트
└─ dist/              # Sites 배포용 생성 결과
```

## 실행

```bash
npm ci
npm run dev
```

## 검증 및 빌드

```bash
npm run build
npm run check
npm test
```

`dist/`는 직접 수정하지 않습니다. `frontend/`와 `assets/`를 수정한 뒤
`npm run build`를 실행하면 Sites 배포 결과가 생성됩니다.

CSS는 `frontend/styles/`에서 역할별로 관리합니다. 파일 로드 순서는
`frontend/index.html`에 선언된 순서가 곧 스타일 우선순위이므로 유지합니다.

Git 커밋·병합·GitHub 푸시는 프로젝트 소유자가 수행합니다. Codex는
GitHub의 `origin/main`에 새 커밋이 확인된 경우에만 ChatGPT Sites 배포를
담당합니다.
