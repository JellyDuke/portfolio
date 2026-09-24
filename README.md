# 박주호 포트폴리오

ChatGPT Sites에 배포되는 정적 포트폴리오 프로젝트입니다.

## 폴더 구조

```text
portfolio/
├─ frontend/          # HTML과 브라우저 JavaScript
│  ├─ styles/         # 토큰·기본·컴포넌트·덱·반응형 CSS
│  └─ portfolio/      # 캐릭터·폴더 연출과 홀로그램 작업 목록을 담은 개인 포트폴리오 페이지
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

## 포트폴리오 Blender 모델

`/portfolio/`는 [편집용 Blender 원본](assets/source/blender/portfolio-character-motion-v3.blend)의
[스킨 인물 GLB](assets/models/portfolio-character-v3.glb)와
[폴더·종이 GLB](assets/models/portfolio-props-v3.glb)를 함께 사용합니다.
증명사진의 얼굴형·눈매·가르마를 형상 참고로 삼았으며 사진을 얼굴에 투영하지 않습니다.
MakeHuman의 CC0 인체·의상·피부를 조형하고, 손가락 골격과 눈꺼풀 변형을 포함합니다.
두 자산이 준비되면 같은 13.6초 시계로 재생합니다. 로드 실패 시 기본 형상으로
전환되고, 종이는 표지가 열린 뒤에만 한 장씩 나옵니다.
마지막에는 작은 번호·작품명·연결 상태가 정렬된 홀로그램 목록으로 이어집니다.
목록은 화면을 덮거나 크게 확대하지 않으며 인물과 폴더가 뒤에 남습니다.
광원이 먼저 켜진 뒤 네 줄이 순서대로 맺히며, 개발 서버와 배포 빌드의 캐시 키를 분리해 이전 종이 스타일이 섞이지 않게 합니다.

Blender 4.5 LTS에서 원본을 다시 만들려면 다음 순서로 실행합니다.

```bash
node scripts/export-portfolio-poses.mjs --rig
blender --background --factory-startup --python-exit-code 1 --python scripts/blender/build-character.py
blender --background --factory-startup --python-exit-code 1 --python scripts/blender/build-character-motion.py
npm run build
```

생성에는 로컬 `assets/source/blender/vendor/`의 MPFB 2.0.17과 CC0 core assets가
필요합니다. 이 도구 캐시는 Git과 배포에서 제외합니다. 출처와 라이선스는
[자산 고지](assets/models/CHARACTER-LICENSE.md)에 기록합니다.
`character-v3-face.png`와 `character-v3-motion-*.png`에서 얼굴·접촉 자세를 검토합니다.
로컬에서 `/portfolio/?review=6.5`처럼 시간을 지정하면 해당 장면을 멈춰 볼 수 있습니다.
`assets/source/blender/`는 배포되지 않고 `assets/models/`의 GLB와 고지만 포함됩니다.

CSS는 `frontend/styles/`에서 역할별로 관리합니다. 파일 로드 순서는
`frontend/index.html`에 선언된 순서가 곧 스타일 우선순위이므로 유지합니다.
역할별 수정 위치와 자산 경로 기준은 로컬의 `docs/frontend/README.md`와
`docs/assets/README.md`를 참고합니다. `docs/`는 Git에 올리지 않는 개인 작업 문서입니다.

`npm run check`에는 Stylelint CSS 검사도 포함됩니다. CSS만 검사하려면
`npm run lint:css`, 자동 수정 가능한 규칙을 적용하려면 `npm run lint:css:fix`를 사용합니다.
자동 수정 후에는 변경 내용을 확인하고 다시 빌드합니다.

프로젝트 기록의 기존 개인 포트폴리오 카드가 `/portfolio/`를 새 탭에서 엽니다.
목록 01~04의 작품명과 링크·다운로드 연결은 `frontend/portfolio/projects.js`에서 관리합니다.
상세 구성은 로컬 문서 `docs/frontend/PORTFOLIO.md`에 정리합니다.

Git 커밋·병합·GitHub 푸시는 프로젝트 소유자가 수행합니다. Codex는
GitHub의 `origin/main`에 새 커밋이 확인된 경우에만 ChatGPT Sites 배포를
담당합니다.
