# 변경 이력 (History)

## 2026-04-09 (6차)

### 기능 추가/개선: 인게임 메뉴, 다시하기, 레벨 선택, 최고 기록 보존

#### 1. 보석 종류 조정 (난이도 강화)

| 레벨 | 이전 | 이후 |
|------|------|------|
| 1 | 3종 | **5종** |
| 10 | 3종 | 5종 |
| 20 | 4종 | 6종 |
| 50 | 7종 | 9종 |
| 71+ | 12종 | 12종 |

#### 2. 인게임 메뉴 (일시정지 화면 개편)

- 기존: 어디든 탭 하면 재개
- 신규: `||` 버튼 → 카드 형태 메뉴 표시
  - **▶ 계속하기** (초록): 게임 재개
  - **↺ 다시하기** (주황): 확인 다이얼로그 → 같은 레벨 재시작
  - **☰ 레벨 선택** (파랑): 확인 다이얼로그 → 레벨 선택 화면

#### 3. 확인 다이얼로그

- "다시하기" / "레벨 선택" 선택 시 경고 카드 표시
- "현재 진행 상황이 초기화됩니다" 경고 문구
- [취소] / [다시하기 or 이동] 버튼

#### 4. 최고 기록 보존 (`savePuzzleRecord`)

- 다시하기 시 이전보다 낮은 점수/별이 나와도 기존 최고 기록 유지
- `stars = max(new, existing)`, `highScore = max(new, existing)`

**수정 파일**
- `game.ts`: `DBManager.savePuzzleRecord()`, `startPuzzle()`, `applyGravity()`, `handleInputDown()`, `draw()`, `drawGameMenu()`, `drawConfirmDialog()`, 속성 추가
- `game.js`: 동일 수정

---

## 2026-04-09 (5차)

### 기능 개선: 퍼즐 모드 난이도 강화 (Bejeweled 원작 참고)

**참고 자료**: Bejeweled Wiki, Bejeweled Fandom (Flame Gem, Star Gem, Hypercube, Score Multiplier)

#### 변경 내용

| 항목 | 이전 | 이후 |
|------|------|------|
| 기본 점수 | 100pt/gem | 50pt/gem |
| 4~5매치 보너스 | 없음 | ×1.5 |
| 6매치 이상 보너스 | 없음 | ×2.5 |
| 연쇄(cascade) 보너스 | 없음 | ×1.0 → ×1.75 → ×2.5 → ×3.25 → ×4.0 |
| 시간 보너스 | +1초/gem (매 연쇄 모두) | +0.5초/gem (최초 매치만) |
| 시간 공식 | `max(30, 60 - floor((lv-1)/5)×2)` | `max(20, 70 - lv×0.5)` |
| 목표점수 공식 | `lv × 1500` (선형) | `4000 + 150×lv + 5×lv²` (이차) |
| 보석 종류 증가 | 100레벨에 걸쳐 균등 | 10레벨마다 +1종 (더 급격한 초반) |
| 별 기준 | ×1.2/×1.5 | ×1.5/×2.0 (상향) |
| 체인 시각효과 | 없음 | "Chain ×N!" 골드/레드 글로우 표시 |

**레벨별 수치 (개선 후)**

| 레벨 | 시간 | 목표점수 | 보석종류 |
|------|------|---------|---------|
| 1 | 70s | 4,155 | 3종 |
| 10 | 65s | 6,000 | 3종 |
| 20 | 60s | 9,000 | 4종 |
| 50 | 45s | 24,000 | 7종 |
| 100 | 20s | 69,000 | 12종 |

**Chain 배율표**

| 연쇄 단계 | 배율 | 3매치 득점 |
|----------|------|-----------|
| Chain 1 (첫 매치) | ×1.00 | 150pt |
| Chain 2 | ×1.75 | 261pt |
| Chain 3 | ×2.50 | 375pt |
| Chain 4 | ×3.25 | 486pt |
| Chain 5+ | ×4.00 | 600pt |

**수정 파일**
- `game.ts`: `startPuzzle()`, `processMatches()`, `applyGravity()`, `finishLevel()`, `update()`, `draw()`, 속성 추가
- `game.js`: 동일 수정

---

## 2026-04-09 (4차)

### 문서 업데이트: README.md 전면 재작성

- 게임 소개, 플레이 방법, 모드 설명, 기술 스택, 파일 구조 추가
- 최신 기능(이어하기, 레벨 잠금, 모던 UI, 이모지 보석 등) 반영
- 개발 요구사항 원본 보존

---

## 2026-04-09 (3차)

### 기능 추가: 이어하기/새로 시작 화면 + 레벨 순차 잠금

#### 1. 이어하기/새로 시작 (CONTINUE_PROMPT)

**동작 방식**
- 앱 재오픈 시 저장된 진행 레벨이 있으면 `CONTINUE_PROMPT` 화면 표시
- "이어하기" 버튼: 저장된 레벨부터 퍼즐 시작
- "새로 시작" 버튼: 저장 초기화 후 메인 메뉴로 이동 (별 기록은 보존)
- `startPuzzle(level)` 호출 시마다 마지막 레벨 자동 저장

**구현 내용**
- `GameState.CONTINUE_PROMPT` (값 7) 신규 추가
- `DBManager` 버전 1 → 2 업그레이드, `game_save` 오브젝트 스토어 신규 생성
- `DBManager` 메서드 추가: `saveGameProgress()`, `loadGameProgress()`, `clearGameProgress()`
- `Game` 속성 추가: `lastSavedLevel`
- `init()`: DB 초기화 후 저장 레벨 확인 → 있으면 `levelRecords` 로드 후 `CONTINUE_PROMPT` 상태 진입
- `startPuzzle()`: 호출 시 `saveGameProgress(level)` 자동 호출
- `drawContinuePrompt()`: 딥 스페이스 배경 + 카드 UI + 퍼플 "이어하기" / 투명 "새로 시작" 버튼
- `handleInputDown()`: `CONTINUE_PROMPT` 버튼 좌표 히트 테스트 추가
- `draw()`: `CONTINUE_PROMPT` 상태 분기 추가 (UI 바 없이 전체 화면)

#### 2. 레벨 순차 잠금

**동작 방식**
- 레벨 1은 항상 해금
- 레벨 N은 레벨 N-1의 클리어 이력(`levelRecords`)이 있어야 해금
- 잠긴 레벨은 클릭해도 반응 없음

**구현 내용**
- `isLevelUnlocked(level)` 헬퍼 메서드 추가
- `getLevelFromClick()`: `isLevelUnlocked()` 검사 추가 (잠긴 레벨 → `null` 반환)
- `drawLevelSelect()`: 잠긴 셀 별도 렌더링 — 극도로 어두운 그라디언트 + 🔒 아이콘 + 흐릿한 레벨 번호

**수정 파일**
- `game.ts`, `game.js` 동일 수정

---

## 2026-04-09 (2차)

### 버그 수정: 레벨 선택 화면에서 레벨 탭 시 게임이 시작되지 않는 문제

**증상**
- 레벨 선택 화면에서 레벨을 탭(터치)해도 게임으로 넘어가지 않음

**원인**
- `handleInputDown()`에서 `LEVEL_SELECT` 상태일 때 `touchStartX/Y`를 설정하지 않아 발생
- `touchmove` 이벤트에서 드래그 여부를 판단하는 `dy = touch.clientY - this.touchStartY` 계산 시, `touchStartY`가 이전 게임 플레이 중의 좌표값(오래된 stale 값)을 그대로 사용
- 결과적으로 `Math.abs(dy) > 15` 조건이 항상 참이 되어 `isDraggingLevelSelect = true`로 잘못 설정됨
- `handleInputUp()`에서 `!isDraggingLevelSelect` 조건에 의해 레벨 선택 로직이 실행되지 않음

**수정 내용**
- `game.ts`, `game.js` 의 `handleInputDown()` 함수 내 `LEVEL_SELECT` 블록 진입 시 `touchStartX = clientX`, `touchStartY = clientY` 를 설정하도록 수정

**수정 파일**
- `game.ts`: `handleInputDown()` — LEVEL_SELECT 블록 상단에 touchStartX/Y 초기화 추가
- `game.js`: 동일 수정 (컴파일 결과물 직접 수정)

### 기능 개선: 레벨 선택 화면 UI 현대화 (모던 리디자인)

**변경 내용**

| 항목 | 이전 | 이후 |
|------|------|------|
| 배경 | 단색 `rgba(0,0,0,0.95)` | 딥 스페이스 그라디언트 `#0d0f1e → #1a0a2e` |
| 헤더 | 단색 `#222` | 그라디언트 `#1e2244 → #141828` |
| 헤더 구분선 | 없음 | 퍼플→핑크 네온 그라디언트 라인 |
| 뒤로가기 버튼 | `< BACK` 텍스트 | 반투명 필(Pill) 버튼 `← Back` |
| 셀 모양 | 직사각형 (`fillRect`) | 라운드 카드 (`roundRect`, radius=10) |
| 셀 배경 | 단색 2종 | 별 개수별 그라디언트 4종 |
| 별 표시 | `★` 채운 별만 | `★☆` 채운 별 + 빈 별 표시 |
| 3성 셀 | 없음 | 황금 글로우 (`shadowBlur = 14`) |
| 셀 테두리 | 없음 | 별 상태별 컬러 테두리 (blue/green/gold) |
| 레벨 번호 색상 | 흰색 단일 | 별 상태별 3색 (blue/green/gold) |
| 셀 높이 | 60px | 72px |
| 헤더 높이 | 80px | 70px |
| 스크롤바 | 흰색 반투명 | 더 얇고 세련된 pill 형태 |

**별 상태별 셀 색상**
- 미클리어 (0성): 딥 블루 그라디언트, 파란 테두리, 숫자 연보라(`#b0baff`)
- 1성: 딥 그린 그라디언트, 초록 테두리, 숫자 연초록(`#90EE90`)
- 2성: 딥 앰버 그라디언트, 초록 테두리, 숫자 연초록
- 3성: 딥 골드 그라디언트, 황금 테두리 + 글로우, 숫자 골드(`#FFD700`)

**수정 파일**
- `game.ts`: `drawLevelSelect()`, `getLevelFromClick()`, touchmove/wheel 핸들러, handleInputDown/Up 좌표 조건
- `game.js`: 동일 수정

---

## 이전 변경 이력 (git log 기준)

| 커밋 | 내용 |
|------|------|
| f2d2729 | 보석 모양을 이모지로 교체(12종), 레벨별 보석 종류 확장, 레벨 선택 화면 터치/휠 스크롤 추가 (Fold 7 대응) |
| 0c3088d | 다중 버그 수정(선택 하이라이트, finishLevel 중복 호출, dt clamp 등), 레벨 선택 화면 추가, 테스트 31개 추가 |
| aa89b87 | 모바일 UI 버그 수정 |
| f9538f5 | 명상 모드 종료 버튼 추가, 모바일 UI 버그 수정 |
| 4b1a804 | 명상 모드 버그 수정, 모바일 버그 수정 |
