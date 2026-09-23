# Assets 문서

`assets/`는 프론트엔드 코드와 분리된 공유 정적 파일 영역입니다.

- `images/`: 프로필과 콘텐츠 이미지
- `images/backgrounds/`: 사용자가 제공한 장식용 리본 배경 3개
- `fonts/`: 웹폰트와 라이선스
- `vendor/`: 빌드 시 의존성에서 준비되는 브라우저 라이브러리

배포 파일은 `npm run build`가 `dist/`로 복사합니다. `dist/`의 에셋을
직접 수정하지 않습니다.

## 2026-09-23 시안 배경

| 원본 | 배포용 복사본 | 적용 섹션 |
| --- | --- | --- |
| `first_background.png` | `images/backgrounds/home.png` | 1. 첫 소개 |
| `second_background.png` | `images/backgrounds/about.png` | 2. 일하는 방식 |
| `end_background.png` | `images/backgrounds/contact.png` | 7. 연락처 |

원본과 시안 7장은 루트에서 이동하거나 수정하지 않았습니다. 배경에는 장식적인
영문 문구·아이콘이 포함되어 있으므로 대체 텍스트 없이 접근성 트리에서 제외합니다.
실제 콘텐츠와 연락처는 이미지와 분리된 HTML로 제공합니다.
