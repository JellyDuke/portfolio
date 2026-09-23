// 직접 관리하는 CSS의 오류와 이름 규칙을 검사한다. 배포 생성물과 외부 자산은 제외한다.
/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-recommended'],
  ignoreFiles: ['dist/**', 'assets/**', 'node_modules/**'],
  reportNeedlessDisables: true,
  reportInvalidScopeDisables: true,
  reportDescriptionlessDisables: true,
  rules: {
    'color-no-invalid-hex': true,
    'unit-no-unknown': true,
    'selector-class-pattern': '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
    'selector-id-pattern': '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
    'custom-property-pattern': '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
    'keyframes-name-pattern': '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
    // 덱과 대화상자의 의도적인 덮어쓰기는 실제 DOM과 로드 순서에 의존한다.
    // 선택자 우선순위만 비교하는 경고 대신 기존 화면별 회귀 테스트로 확인한다.
    'no-descending-specificity': null,
  },
};
