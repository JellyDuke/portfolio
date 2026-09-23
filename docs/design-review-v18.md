# v18 — frontend skill guided redesign

## Sources and selection

2026-09-22 GitHub 공식 저장소 정보와 원문을 조회했다. 아래 목록은 인기, 유지 관리 상태, 정적 포트폴리오와의 적합성을 기준으로 고른 다섯 후보이며 모든 프론트엔드 스킬에 대한 공식 순위가 아니다.

| Source | Applied contribution |
| --- | --- |
| [Anthropic Frontend Design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | 정보의 성격에 맞춘 섹션 구성, 한글 타이포그래피, 템플릿식 반복 축소 |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 디자인 시스템 검색, 스크롤 이야기 구조, 대비·포커스·터치·Three.js 성능 점검 |
| [Taste Skill](https://github.com/Leonxlnx/taste-skill) | 실제 정보에 근거한 위계, 제목과 간격 체계, 장식용 번호 및 과도한 배지 제거 |
| [Impeccable](https://github.com/pbakaus/impeccable) | 제품·디자인 문서, 구성 대비, 섹션별 모션, craft-floor 및 mechanical detector |
| [Vercel Web Design Guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) | 실제 버튼·링크·키보드·44px 조작, overflow와 focus, 이미지·폰트 예약, 최신 원문 규칙 |

Anthropic Frontend Design은 이미 설치된 스킬과 일치한다. 나머지 원문과 UI UX Pro Max 데이터·스크립트, Impeccable 참조 문서는 내려받아 적용했다. 개인 스킬 추가 등록은 서버에서 HTTP 422로 실패하여 영구 설치 성공을 주장하지 않는다. 검증된 로컬 스킬 파일은 personal-skills 작업 사본에 보존했다.

UI UX Pro Max의 최초 ‘developer portfolio interactive’ 검색은 문서형 제품을 추천하여 기각했다. 한 번 수정한 ‘personal portfolio’ 검색의 이야기 구조와 기본 가독성 원칙만 적용했다. 그 결과의 손글씨·brutalism·즉시 전환은 사용자의 정갈한 디자인과 부드러운 모션 요구에 맞지 않아 적용하지 않았다. threejs 스택 검색에서 GSAP 시퀀스, 프레임 내 지오메트리 생성 금지, 입력 처리 규칙을 점검했다.

Impeccable context를 실행하고 init/new-work/craft-floor를 읽었다. 시각 후보는 기술 문서, 접촉 시트, 전시 도록, 개인 업무 기록집, 도면, 스튜디오 서신, 현장 업무 로그로 검토했다. concept-seed의 로컬 결과는 네 번째인 개인 업무 기록집이었다. 외부 롤 서비스와 비교 보드는 접근되지 않아 완전한 비교 평가로 주장하지 않는다. 사용자에게 이미 지정받은 색상·카드 구조·모션·즉시 개선 요청을 우선했다. 추가 질문이나 임의의 작업 방식 설정을 저장하지 않았다.

## What changed

- 기존 styles.css/deck.css의 누적 덮어쓰기를 정리하고 토큰·컴포넌트·뷰포트 규칙으로 재작성.
- 첫 소개를 사진과 소개가 같은 열에 위치하는 2열 구성으로 변경. 1920×1080 사진 208×267, 데스크톱 짧은 높이 대응 추가.
- 최초 문구를 웹 개발과 현장 기술지원으로 균형 있게 변경. AI는 세 장면 중 한 항목.
- 일하는 방식의 큰 파란 패널을 제거하고 문장과 업무 태도의 타이포그래피 위계로 구성.
- 경력을 날짜·회사·업무 타임라인으로 재배치하고 모바일 선택 UI 유지.
- 기술 태그의 반복된 박스를 제거하고 목록으로 정리. 모든 기술 행 동일 스타일, CCTV 명시.
- 프로젝트의 현재 사이트와 아카이브를 구분하고 다음 프로젝트 추가 구조 유지. 가짜 작업과 성과 없음.
- 마지막 연락처를 잉크색 배경·명확한 이메일·읽기 쉬운 세부 정보로 재구성.
- 경력, 기술, 프로젝트, 교육 섹션에 각각 구분되는 GSAP 진입 시퀀스 추가.
- 소개 장면의 카드·3D 배경 색 전환 동기화. 회전 아이콘을 일관된 SVG로 변경.
- 하단 위치 탐색과 화살표는 44px 조작 영역. 메뉴 전환 기준 850px 일치.

## Verification

`npm test`, `npm run build`, `npm run check`, CSS PostCSS 파싱, 고유 ID 및 실제 기술명 유지 점검, `git diff --check` 통과. 실제 GSAP 런타임으로 한 단위 휠, 관성 차단, 역방향 이동, 키보드, 모바일 제스처, 모션 상시 동작, 상세 보기 별도 행, 읽기 창, 게이지 타이밍을 확인했다. 지오메트리·카메라 범위·재질·오브젝트 동작 검증 통과. 최종 배경 전환 추가 후 deck 회귀 확인 수행.

주요 본문·보조 문구·행동 색상 대비는 5.26:1 이상, 흰색/코발트는 7.14:1. GPU 없이 계산한 색상 조합의 수치다.

Impeccable detector를 변경된 HTML/CSS/JS에 한 번 실행했다. 그림자 색상과 대화상자의 테두리·그림자 중복을 정리했다. 목록과 섹션에서 나온 padding 경고는 padding-block과 내부 자식 padding을 읽지 못하는 정적 분석 결과로, 각 행 14–36px 및 카드 20–56px 간격을 코드에서 확인했다. 렌더링 검증으로 바꿔 주장하지 않는다.

**Not verified:** 관리형 preview daemon의 요청 디렉터리가 없어서 실제 브라우저 1920×1080·모바일 스크린샷과 GPU 셰이더/성능 검증 불가. 임의 개발 서버나 프로덕션 주소를 QA에 사용하지 않았다. JSDOM 치수는 테스트용 fixture다.
