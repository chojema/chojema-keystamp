# Chojema KeyStamp

한국어 | [English](README.en.md)

키보드 키캡 이미지와 애니메이션을 만드는 데스크톱 앱입니다.

## 다운로드

[최신 릴리스](https://github.com/chojema/chojema-keystamp/releases/latest)에서 Windows 설치 파일을 받으세요. macOS용은 아직 제공하지 않습니다.

설치 파일은 코드 서명이 되어 있지 않아 처음 실행할 때 Windows SmartScreen 경고가 나올 수 있습니다. `추가 정보`를 누른 뒤 `실행`을 선택하면 설치할 수 있습니다.

## 기능

- **키 입력:** `C`, `Ctrl + Shift + Z`, `⌘⇧Z`처럼 입력하거나, 직접 누르거나, 화면 키보드에서 고릅니다.
- **Windows와 Mac:** 이미지와 결과를 전부, Windows만, Mac만 보도록 고릅니다. `Win`과 `⌘`, `Ctrl`과 `⌃`, `Alt`와 `⌥`가 서로 대응합니다.
- **각도:** 톱뷰, 30°, 45°, 60° 프리셋과 드래그 회전을 지원합니다.
- **내보내기:** SVG, PNG로 저장하거나 클립보드에 복사합니다.
- **텍스트 결과:** `[Ctrl]+[Shift]+[Z]`, `⊞+[E]`, `⌃⇧Z`처럼 문서에 붙여 넣을 글자를 각각 또는 함께 복사합니다.
- **2D 이미지:** 문장 안에 넣기 좋은 평면 키캡을 PNG로 복사하거나 저장합니다.
- **주변 키:** 옵션을 켜면 주변 키가 테두리가 흐려진 상태로 함께 보입니다. ANSI, ISO, 한글 배열을 지원합니다.
- **한글 자모:** 알파벳과 한글 자모를 Windows와 Mac 배치에 맞춰 함께 표시합니다.
- **애니메이션:** 키를 누르는 동작을 HTML, GIF, APNG로 저장합니다.

## 알아둘 점

- `Ctrl + Alt + Del`, `Win + L`, `Cmd + Tab`처럼 운영체제가 먼저 처리하는 키는 직접 눌러 입력할 수 없습니다. 입력란에 글자로 적으세요.
- 키는 1:1로 대응합니다. `Ctrl + C`의 Mac 결과는 `⌘C`가 아니라 `⌃C`입니다.
- GIF는 반투명을 표현하지 못합니다. 투명 배경이 필요하면 APNG를 쓰세요.
- 앱 화면은 시스템 언어를 따릅니다. 한국어 시스템에서는 한국어, 그 외에는 영어로 표시됩니다.

## 빌드

Node.js와 Rust가 필요합니다.

```
npm ci
npx tauri build
```

## 릴리스 노트

- [v0.1.0](release-notes/v0.1.0.md)

## 저작권

© Chulwoo Park. All rights reserved.

포함된 오픈 소스 구성 요소의 고지는 앱의 `오픈 소스 고지`에서 볼 수 있습니다. Windows는 Microsoft Corporation의 상표이고 Mac과 macOS는 Apple Inc.의 상표입니다. 이 앱은 두 회사와 관련이 없습니다.
