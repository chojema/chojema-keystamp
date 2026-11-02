# Chojema KeyStamp

키보드 키캡 이미지와 애니메이션을 만드는 Windows, macOS용 앱입니다.

## 기능

- 키 입력: `C`, `Ctrl + Shift + Z`, `⌘⇧Z`처럼 입력하거나, 직접 누르거나, 화면 키보드에서 고릅니다.
- Windows와 Mac: 두 이미지를 나란히 보여 줍니다. `Win`과 `⌘`, `Ctrl`과 `⌃`, `Alt`와 `⌥`가 서로 대응합니다.
- 표시 선택: 이미지와 결과를 전부, Windows만, Mac만 보도록 고릅니다.
- 텍스트 결과: `[Ctrl]+[Shift]+[Z]`, `⊞+[E]`, `⌃⇧Z`처럼 문서에 붙여 넣을 글자를 각각 또는 함께 복사합니다.
- 2D 이미지: 문장 안에 넣기 좋은 평면 키캡을 PNG로 복사하거나 저장합니다.
- 각도: 톱뷰, 30°, 45°, 60° 프리셋과 드래그 회전을 지원합니다.
- 내보내기: SVG, PNG로 저장하거나 클립보드에 복사합니다.
- 주변 키: 옵션을 켜면 주변 키가 테두리가 흐려진 상태로 함께 보입니다.
- 애니메이션: 키를 누르는 동작을 HTML, GIF, APNG로 저장합니다.

## 알아둘 점

- `Ctrl + Alt + Del`, `Win + L`, `Cmd + Tab`처럼 운영체제가 먼저 처리하는 키는 직접 눌러 입력할 수 없습니다. 입력란에 글자로 적으세요.
- GIF는 반투명을 표현하지 못합니다. 투명 배경이 필요하면 APNG를 쓰세요.
- 설치 파일은 코드 서명이 되어 있지 않습니다. 처음 실행할 때 Windows SmartScreen이나 macOS Gatekeeper 경고가 나올 수 있습니다.

## 빌드

Node.js와 Rust가 필요합니다.

```
npm ci
npx tauri build
```

© Chulwoo Park. All rights reserved.
