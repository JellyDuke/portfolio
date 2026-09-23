# Frontend 문서

- `PRODUCT.md`: 제품 목적과 확정된 요구사항
- `DESIGN.md`: 시각·인터랙션 설계 기준
- `reviews/`: 버전별 디자인 검토 기록

실제 CSS는 `frontend/styles/`에서 토큰, 기본값, 내비게이션, 컴포넌트,
모션, 일반 반응형, 덱, 대화상자, 덱 반응형 역할로 구분합니다.

## CSS 수정 위치

| 파일 | 책임 |
| --- | --- |
| `tokens.css` | 웹폰트, 색상·간격·글꼴 크기 공통 변수 |
| `base.css` | 기본 HTML 스타일, 접근성, 공통 도우미 클래스 |
| `navigation.css` | 브랜드, 헤더, 메뉴 |
| `components.css` | 버튼, 소개·경력·기술·프로젝트·학력·연락처 구성요소 |
| `motion.css` | CSS 키프레임 애니메이션 |
| `responsive.css` | 일반 구성요소의 화면 너비별 조정 |
| `deck.css` | 한 화면 한 카드 배치와 덱 탐색 UI |
| `dialog.css` | 교육 상세 대화상자 |
| `deck-responsive.css` | 덱의 너비·높이별 조정과 마지막 덮어쓰기 규칙 |
| `scenic-sections.css` | 제공 배경을 쓰는 1·2·7번의 배치·화면별 가독성 |
| `editorial-sections.css` | 3~6번의 공통 머리말·기록형 카드 배치 |

`frontend/index.html`의 위 순서로 로드합니다. 기존 우선순위 보존을 위해
일부 연락처 반응형 규칙은 `components.css`에, 마지막 연락처·대화상자
규칙은 `deck-responsive.css`에 남아 있습니다. 이를 옮길 때는 겹치는
선택자의 적용 순서도 함께 확인합니다.

CSS의 `url(...)`은 HTML이 아닌 해당 CSS 파일의 위치를 기준으로 합니다.
예를 들어 `styles/tokens.css`의 폰트 경로는 `../fonts/PretendardVariable.woff2`입니다.
개발 서버는 `assets/`를 사이트 루트에 제공하고, 빌드 시에는 같은 자산을
`dist/` 루트에 복사합니다.

2026-09-23 시안 반영 규칙은 마지막 두 파일에 모았습니다. 배경 레이어는
`deck.js`가 갱신하는 `data-active-section`을 구독하는 CSS로 전환합니다.
배경 자체는 장식 이미지이며 모든 제목·설명·연락처·선택 버튼은 HTML입니다.
큰 화면의 2번 설명은 배경 아이콘에 맞춰 배치하고, 1100px 이하에서는
일반 목록으로 바꿉니다. 3D 조작은 기술·활용 섹션에서 유지합니다.

## CSS 자동 검사

- `npm run lint:css`: 직접 작성하는 `frontend/**/*.css`의 오류·이름 규칙 검사
- `npm run lint:css:fix`: 자동 수정 가능한 오류만 수정
- `npm run check`: 위 CSS 검사와 배포 JavaScript 구문 검사
- `npm test`: 동작 회귀 검사와 CSS가 참조하는 로컬 자산 존재 확인

`stylelint.config.mjs`에서 기본 오류 검사와 소문자 `kebab-case` 클래스·ID·
사용자 정의 속성·키프레임 이름을 적용합니다. 중복 선택자, 잘못된 속성·값,
단축 속성의 불필요한 덮어쓰기도 검사합니다. 생성물 `dist/`와 외부 자산은
제외하고, 의도적인 덱·대화상자 덮어쓰기는 화면 크기별 기존 테스트로 확인합니다.

GitHub의 기존 검증 작업도 `npm run check`를 실행하므로 사용자 푸시 후
같은 CSS 규칙이 적용됩니다. Stylelint가 실제 브라우저 화면 검증을 대신하지는 않습니다.
