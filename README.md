# 박주호 포트폴리오

ChatGPT Sites에 배포되는 정적 포트폴리오 프로젝트입니다.

## 폴더 구조

```text
portfolio/
├─ frontend/          # HTML과 브라우저 JavaScript
│  └─ styles/         # 토큰·기본·컴포넌트·덱·반응형 CSS
├─ backend/           # 향후 서버 코드 위치 (현재 백엔드 없음)
├─ assets/            # 배포 이미지·폰트·라이브러리와 비배포 원본(source/)
├─ docs/              # 로컬 전용 문서(Git 추적 제외)
│  ├─ frontend/       # 제품·디자인·검토 문서와 시안(mockups/)
│  ├─ backend/        # 백엔드 구조 문서
│  └─ assets/         # 에셋 관리 문서와 미사용 ChatGPT 생성 이미지
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

`dist/`는 직접 수정하지 않습니다. `frontend/`와 배포용 `assets/`를 수정한 뒤
`npm run build`를 실행하면 Sites 배포 결과가 생성됩니다.
`assets/source/`의 원본·시안은 빌드 결과에 포함되지 않습니다.

CSS는 `frontend/styles/`에서 역할별로 관리합니다. 파일 로드 순서는
`frontend/index.html`에 선언된 순서가 곧 스타일 우선순위이므로 유지합니다.
역할별 수정 위치와 자산 경로 기준은 로컬의 `docs/frontend/README.md`와
`docs/assets/README.md`를 참고합니다. `docs/`는 Git에 올리지 않는 개인 작업 문서입니다.

`npm run check`에는 Stylelint CSS 검사도 포함됩니다. CSS만 검사하려면
`npm run lint:css`, 자동 수정 가능한 규칙을 적용하려면 `npm run lint:css:fix`를 사용합니다.
자동 수정 후에는 변경 내용을 확인하고 다시 빌드합니다.

Git 커밋·병합·GitHub 푸시는 프로젝트 소유자가 수행합니다. Codex는
GitHub의 `origin/main`에 새 커밋이 확인된 경우에만 ChatGPT Sites 배포를
담당합니다.
