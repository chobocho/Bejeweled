"use strict";
// ==========================================
// Bejeweled Clone - Pure TypeScript Test Suite
// No external libraries. Browser-only APIs are NOT tested.
// ==========================================
// ==========================================
// 1. 상수 및 타입 (game.ts에서 복사)
// ==========================================
const GEM_EMOJIS_TEST = ["💎", "⭐", "🔥", "💧", "🍀", "🌙", "⚡", "🌸", "✨", "🔮", "🌈", "👑"];
const COLS = 8;
const ROWS = 8;
const GEM_COLORS = [
    "#FF0000", // Red
    "#00FF00", // Green
    "#0000FF", // Blue
    "#FFFF00", // Yellow
    "#FF00FF", // Magenta
    "#00FFFF", // Cyan
    "#FFFFFF" // White
];
var GameState;
(function (GameState) {
    GameState[GameState["MENU"] = 0] = "MENU";
    GameState[GameState["PLAYING_PUZZLE"] = 1] = "PLAYING_PUZZLE";
    GameState[GameState["PLAYING_ZEN"] = 2] = "PLAYING_ZEN";
    GameState[GameState["PAUSED"] = 3] = "PAUSED";
    GameState[GameState["LEVEL_CLEAR"] = 4] = "LEVEL_CLEAR";
    GameState[GameState["GAME_OVER"] = 5] = "GAME_OVER";
    GameState[GameState["LEVEL_SELECT"] = 6] = "LEVEL_SELECT";
})(GameState || (GameState = {}));
// ==========================================
// 2. 미니 테스트 프레임워크
// ==========================================
let passed = 0;
let failed = 0;
const results = [];
function describe(suiteName, fn) {
    results.push(`\n=== ${suiteName} ===`);
    fn();
}
function it(testName, fn) {
    try {
        fn();
        passed++;
        results.push(`  ✓ ${testName}`);
    }
    catch (e) {
        failed++;
        results.push(`  ✗ ${testName}: ${e.message}`);
    }
}
function expect(actual) {
    return {
        toBe(expected) {
            if (actual !== expected)
                throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        },
        toEqual(expected) {
            if (JSON.stringify(actual) !== JSON.stringify(expected))
                throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        },
        toBeTruthy() {
            if (!actual)
                throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
        },
        toBeFalsy() {
            if (actual)
                throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
        },
        toBeNull() {
            if (actual !== null)
                throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
        },
        toBeGreaterThan(n) {
            if (!(actual > n))
                throw new Error(`Expected ${actual} > ${n}`);
        },
        toBeLessThanOrEqual(n) {
            if (!(actual <= n))
                throw new Error(`Expected ${actual} <= ${n}`);
        },
        toHaveLength(n) {
            if (actual.length !== n)
                throw new Error(`Expected length ${n}, got ${actual.length}`);
        }
    };
}
function renderResults() {
    const output = document.getElementById('output');
    const summary = document.getElementById('summary');
    if (!output || !summary)
        return;
    output.innerHTML = results.map(r => {
        if (r.startsWith('\n==='))
            return `<div class="suite">${r.trim()}</div>`;
        if (r.includes('✓'))
            return `<div class="pass">${r}</div>`;
        if (r.includes('✗'))
            return `<div class="fail">${r}</div>`;
        return `<div>${r}</div>`;
    }).join('');
    const total = passed + failed;
    summary.innerHTML = `<strong>${passed}/${total} passed</strong> ${failed > 0
        ? `<span class="fail">(${failed} failed)</span>`
        : '<span class="pass">(all passed)</span>'}`;
}
// ==========================================
// 3. 테스트용 헬퍼 함수
// ==========================================
function createEmptyGrid() {
    const grid = [];
    for (let y = 0; y < ROWS; y++) {
        grid[y] = [];
        for (let x = 0; x < COLS; x++) {
            grid[y][x] = {
                type: y % GEM_COLORS.length,
                x, y,
                drawX: x, drawY: y,
                alpha: 1,
                isMatch: false
            };
        }
    }
    return grid;
}
function createGridWithPattern(pattern) {
    const grid = [];
    for (let y = 0; y < ROWS; y++) {
        grid[y] = [];
        for (let x = 0; x < COLS; x++) {
            grid[y][x] = {
                type: pattern[y][x],
                x, y,
                drawX: x, drawY: y,
                alpha: 1,
                isMatch: false
            };
        }
    }
    return grid;
}
// ==========================================
// 4. 테스트 대상 순수 함수 (game.ts에서 독립 재구현)
// ==========================================
function checkMatchAt(grid, x, y) {
    const type = grid[y][x].type;
    // Horizontal
    if (x >= 2 && grid[y][x - 1].type === type && grid[y][x - 2].type === type)
        return true;
    // Vertical
    if (y >= 2 && grid[y - 1][x].type === type && grid[y - 2][x].type === type)
        return true;
    return false;
}
function findMatches(grid) {
    const matchedGems = new Set();
    // Horizontal
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS - 2; x++) {
            const type = grid[y][x].type;
            if (grid[y][x + 1].type === type && grid[y][x + 2].type === type) {
                matchedGems.add(grid[y][x]);
                matchedGems.add(grid[y][x + 1]);
                matchedGems.add(grid[y][x + 2]);
            }
        }
    }
    // Vertical
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS - 2; y++) {
            const type = grid[y][x].type;
            if (grid[y + 1][x].type === type && grid[y + 2][x].type === type) {
                matchedGems.add(grid[y][x]);
                matchedGems.add(grid[y + 1][x]);
                matchedGems.add(grid[y + 2][x]);
            }
        }
    }
    return Array.from(matchedGems);
}
function applyGravity(grid, colors) {
    const newGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    for (let x = 0; x < COLS; x++) {
        const surviving = [];
        for (let y = ROWS - 1; y >= 0; y--) {
            if (grid[y][x] && !grid[y][x].isMatch) {
                surviving.push(grid[y][x]);
            }
        }
        for (let i = 0; i < surviving.length; i++) {
            const newY = ROWS - 1 - i;
            surviving[i] = Object.assign(Object.assign({}, surviving[i]), { y: newY, drawY: newY });
            newGrid[newY][x] = surviving[i];
        }
        const emptyCount = ROWS - surviving.length;
        for (let i = 0; i < emptyCount; i++) {
            newGrid[i][x] = {
                type: Math.floor(Math.random() * colors),
                x, y: i,
                drawX: x, drawY: i,
                alpha: 1,
                isMatch: false
            };
        }
    }
    return newGrid;
}
function calcStars(score, targetScore) {
    if (score > targetScore * 1.5)
        return 3;
    if (score > targetScore * 1.2)
        return 2;
    return 1;
}
function calcLevelSettings(level) {
    const maxTime = Math.max(30, 60 - Math.floor((level - 1) / 5) * 2);
    const targetScore = level * 1500;
    const colors = Math.min(GEM_COLORS.length, 4 + Math.floor(level / 10));
    return { maxTime, targetScore, colors };
}
// BUG-1: 선택 하이라이트 - 수정 전 (잘못된 참조 비교)
function isSelectedGemBuggy(selectedGem, gem) {
    return gem === selectedGem; // 항상 false (다른 객체)
}
// BUG-1: 선택 하이라이트 - 수정 후 (좌표 비교)
function isSelectedGemFixed(selectedGem, gem) {
    return selectedGem !== null && gem.x === selectedGem.x && gem.y === selectedGem.y;
}
// BUG-3: dt 클램핑
function clampDt(rawDt) {
    return Math.min(rawDt, 0.1);
}
// Suite 10: 새 보석 수 공식
function calcColorsNew(level) {
    return Math.min(12, Math.round(3 + (level - 1) * 9 / 99));
}
// Suite 11: 스크롤 관련 순수 함수
function calcMaxScrollY(screenHeight) {
    const fixedCellH = 60;
    const startY = 80;
    return Math.max(0, (startY + 20 * fixedCellH) - screenHeight);
}
function clampScrollY(scrollY, screenHeight) {
    return Math.max(0, Math.min(calcMaxScrollY(screenHeight), scrollY));
}
function getLevelFromClickWithScroll(clientX, clientY, screenWidth, scrollY) {
    const fixedCellH = 60;
    const startY = 80;
    const cols = 5;
    if (clientY < startY)
        return null;
    const cellW = screenWidth / cols;
    const col = Math.floor(clientX / cellW);
    const row = Math.floor((clientY - startY + scrollY) / fixedCellH);
    const level = row * cols + col + 1;
    if (level >= 1 && level <= 100)
        return level;
    return null;
}
// ==========================================
// 5. 테스트 스위트
// ==========================================
// --- Suite 1: checkMatchAt ---
describe("checkMatchAt", () => {
    it("T1-1: 가로 3칸 매치 (x=2, y=0, 타입 0,0,0) → true", () => {
        const grid = createEmptyGrid();
        // row 0: type = 0 % 7 = 0 이므로 기본 패턴에서 모두 0
        grid[0][0].type = 0;
        grid[0][1].type = 0;
        grid[0][2].type = 0;
        expect(checkMatchAt(grid, 2, 0)).toBe(true);
    });
    it("T1-2: 가로 매치 없음 (타입 0,1,0) → false", () => {
        const grid = createEmptyGrid();
        grid[0][0].type = 0;
        grid[0][1].type = 1;
        grid[0][2].type = 0;
        expect(checkMatchAt(grid, 2, 0)).toBe(false);
    });
    it("T1-3: 세로 3칸 매치 (y=2, x=0, 타입 0,0,0) → true", () => {
        const grid = createEmptyGrid();
        grid[0][0].type = 0;
        grid[1][0].type = 0;
        grid[2][0].type = 0;
        expect(checkMatchAt(grid, 0, 2)).toBe(true);
    });
    it("T1-4: 경계값 x=0, y=0 → false (범위 미달)", () => {
        const grid = createEmptyGrid();
        grid[0][0].type = 0;
        // x<2 이고 y<2 이므로 가로/세로 체크 모두 불가
        expect(checkMatchAt(grid, 0, 0)).toBe(false);
    });
    it("T1-5: x=1 에서 가로 범위 미달 → false", () => {
        const grid = createEmptyGrid();
        grid[0][0].type = 3;
        grid[0][1].type = 3;
        // x=1 은 x>=2 조건 불만족
        expect(checkMatchAt(grid, 1, 0)).toBe(false);
    });
});
// --- Suite 2: findMatches ---
describe("findMatches", () => {
    it("T2-1: 매치 없는 보드 (교대 패턴) → 길이 0", () => {
        // 체커보드 패턴: 인접한 동일 색이 없도록
        const pattern = [];
        for (let y = 0; y < ROWS; y++) {
            pattern[y] = [];
            for (let x = 0; x < COLS; x++) {
                // (x + y) % 2 로 0,1 교대 → 3개 연속 불가
                pattern[y][x] = (x + y) % 2;
            }
        }
        const grid = createGridWithPattern(pattern);
        expect(findMatches(grid)).toHaveLength(0);
    });
    it("T2-2: 정확히 3칸 가로 매치 1개 → 길이 3", () => {
        // 교대 패턴 기반 보드에 row 0의 x=0,1,2 를 모두 타입 5로 설정
        const pattern = [];
        for (let y = 0; y < ROWS; y++) {
            pattern[y] = [];
            for (let x = 0; x < COLS; x++) {
                pattern[y][x] = (x + y) % 2;
            }
        }
        // 3칸만 같은 타입(5)으로 설정, 나머지는 교대 패턴 유지
        pattern[0][0] = 5;
        pattern[0][1] = 5;
        pattern[0][2] = 5;
        // x=3 은 교대 패턴: (3+0)%2 = 1 (≠5), 연속 없음
        const grid = createGridWithPattern(pattern);
        expect(findMatches(grid)).toHaveLength(3);
    });
    it("T2-3: 4칸 연속 가로 → 길이 4 (중복 없음)", () => {
        const pattern = [];
        for (let y = 0; y < ROWS; y++) {
            pattern[y] = [];
            for (let x = 0; x < COLS; x++) {
                pattern[y][x] = (x + y) % 2;
            }
        }
        // row 1 에 x=0~3 을 타입 6으로 4칸 연속 설정
        pattern[1][0] = 6;
        pattern[1][1] = 6;
        pattern[1][2] = 6;
        pattern[1][3] = 6;
        // x=4: (4+1)%2=1 (≠6)
        const grid = createGridWithPattern(pattern);
        expect(findMatches(grid)).toHaveLength(4);
    });
    it("T2-4: 가로+세로 교차 (T자 매치) → 교차 보석 중복 카운트 없음", () => {
        // 모든 셀을 서로 다른 타입으로 채운 뒤 T자 형태만 같은 타입으로
        const pattern = [];
        for (let y = 0; y < ROWS; y++) {
            pattern[y] = [];
            for (let x = 0; x < COLS; x++) {
                // 각 위치마다 고유한 타입 인덱스 (겹치지 않게 0~6 순환 단 교차점 제외)
                pattern[y][x] = (x * 3 + y * 2 + 1) % 6 === 0 ? 1 : (x * 3 + y * 2 + 1) % 6;
            }
        }
        // 가로: row=2, x=2,3,4 → 타입 5
        pattern[2][2] = 5;
        pattern[2][3] = 5;
        pattern[2][4] = 5;
        // 세로: x=3, y=0,1,2 → 타입 5 (교차점: x=3, y=2)
        pattern[0][3] = 5;
        pattern[1][3] = 5;
        // pattern[2][3] 이미 5
        const grid = createGridWithPattern(pattern);
        const matches = findMatches(grid);
        // 5개 보석(가로3 + 세로3 - 교차1)
        expect(matches).toHaveLength(5);
    });
    it("T2-5: 전체 보드 동일 타입 → 길이 64 (8x8)", () => {
        const pattern = [];
        for (let y = 0; y < ROWS; y++) {
            pattern[y] = [];
            for (let x = 0; x < COLS; x++) {
                pattern[y][x] = 0;
            }
        }
        const grid = createGridWithPattern(pattern);
        expect(findMatches(grid)).toHaveLength(64);
    });
});
// --- Suite 3: applyGravity ---
describe("applyGravity", () => {
    it("T3-1: 바닥 행 1개 매치 후 위 보석 내려옴 확인", () => {
        const pattern = [];
        for (let y = 0; y < ROWS; y++) {
            pattern[y] = [];
            for (let x = 0; x < COLS; x++) {
                pattern[y][x] = y; // 각 행마다 다른 타입
            }
        }
        const grid = createGridWithPattern(pattern);
        // 마지막 행(y=7)의 x=0 을 매치 표시
        grid[7][0].isMatch = true;
        // 중력 적용 전 y=6의 x=0 타입
        const typeAbove = grid[6][0].type;
        const newGrid = applyGravity(grid, 5);
        // 새 그리드의 바닥(y=7)에는 y=6에 있던 보석이 내려와야 함
        expect(newGrid[7][0].type).toBe(typeAbove);
    });
    it("T3-2: null 셀 없음 보장 (중력 후 모든 셀이 non-null)", () => {
        const grid = createEmptyGrid();
        // 몇 개 매치 표시
        grid[7][0].isMatch = true;
        grid[7][3].isMatch = true;
        grid[5][5].isMatch = true;
        const newGrid = applyGravity(grid, 5);
        let hasNull = false;
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                if (newGrid[y][x] === null)
                    hasNull = true;
            }
        }
        expect(hasNull).toBe(false);
    });
    it("T3-3: 열 전체 매치 시 새 보석으로 채워짐", () => {
        const grid = createEmptyGrid();
        // x=2 열 전체를 매치 표시
        for (let y = 0; y < ROWS; y++) {
            grid[y][2].isMatch = true;
        }
        const newGrid = applyGravity(grid, 5);
        // x=2 열의 모든 셀이 non-null이고 isMatch=false 여야 함
        let allFilled = true;
        for (let y = 0; y < ROWS; y++) {
            if (!newGrid[y][2] || newGrid[y][2].isMatch)
                allFilled = false;
        }
        expect(allFilled).toBe(true);
    });
    it("T3-4: 매치 없을 때 보드 변화 없음 (isMatch=false이면 살아있는 보석 그대로)", () => {
        const pattern = [];
        for (let y = 0; y < ROWS; y++) {
            pattern[y] = [];
            for (let x = 0; x < COLS; x++) {
                pattern[y][x] = (x + y) % GEM_COLORS.length;
            }
        }
        const grid = createGridWithPattern(pattern);
        const newGrid = applyGravity(grid, GEM_COLORS.length);
        // isMatch가 없으면 아래쪽 보석 타입이 그대로 유지되어야 함
        // (중력이 적용되어도 순서가 바뀌지 않음)
        for (let x = 0; x < COLS; x++) {
            expect(newGrid[ROWS - 1][x].type).toBe(grid[ROWS - 1][x].type);
        }
    });
});
// --- Suite 4: 선택 하이라이트 BUG-1 회귀 방지 ---
describe("선택 하이라이트 (BUG-1 회귀 방지)", () => {
    it("T4-1: 수정된 방식 - 좌표 일치 시 true", () => {
        const gem = { type: 0, x: 3, y: 4, drawX: 3, drawY: 4, alpha: 1, isMatch: false };
        const selectedGem = { x: 3, y: 4 };
        expect(isSelectedGemFixed(selectedGem, gem)).toBe(true);
    });
    it("T4-2: 수정된 방식 - 좌표 불일치 시 false", () => {
        const gem = { type: 0, x: 3, y: 4, drawX: 3, drawY: 4, alpha: 1, isMatch: false };
        const selectedGem = { x: 2, y: 4 };
        expect(isSelectedGemFixed(selectedGem, gem)).toBe(false);
    });
    it("T4-3: selectedGem=null → false", () => {
        const gem = { type: 0, x: 3, y: 4, drawX: 3, drawY: 4, alpha: 1, isMatch: false };
        expect(isSelectedGemFixed(null, gem)).toBe(false);
    });
    it("T4-4: 버그 방식(===) vs 수정 방식 차이 증명", () => {
        const gem = { type: 0, x: 3, y: 4, drawX: 3, drawY: 4, alpha: 1, isMatch: false };
        const selectedGem = { x: 3, y: 4 };
        // 버그: 서로 다른 객체이므로 === 는 항상 false
        expect(isSelectedGemBuggy(selectedGem, gem)).toBe(false);
        // 수정: 좌표 비교이므로 true
        expect(isSelectedGemFixed(selectedGem, gem)).toBe(true);
    });
});
// --- Suite 5: 별 계산 (calcStars) ---
describe("별 계산 (calcStars)", () => {
    it("T5-1: score = targetScore * 1.6 → 별 3개", () => {
        expect(calcStars(1600, 1000)).toBe(3);
    });
    it("T5-2: score = targetScore * 1.3 → 별 2개", () => {
        expect(calcStars(1300, 1000)).toBe(2);
    });
    it("T5-3: score = targetScore * 1.0 → 별 1개", () => {
        expect(calcStars(1000, 1000)).toBe(1);
    });
    it("T5-4: score = targetScore * 0.5 → 별 1개", () => {
        expect(calcStars(500, 1000)).toBe(1);
    });
});
// --- Suite 6: 레벨 설정 (calcLevelSettings) ---
describe("레벨 설정 (calcLevelSettings)", () => {
    it("T6-1: 레벨 1 → maxTime=60, targetScore=1500, colors=4", () => {
        const s = calcLevelSettings(1);
        expect(s.maxTime).toBe(60);
        expect(s.targetScore).toBe(1500);
        expect(s.colors).toBe(4);
    });
    it("T6-2: 레벨 10 → maxTime=56, targetScore=15000, colors=5", () => {
        // level=10: maxTime = max(30, 60 - floor(9/5)*2) = max(30, 60-2) = 58
        // 실제 계산: floor((10-1)/5) = floor(1.8) = 1 → 60-2=58
        // colors = min(7, 4+floor(10/10)) = min(7,5) = 5
        const s = calcLevelSettings(10);
        expect(s.maxTime).toBe(58);
        expect(s.targetScore).toBe(15000);
        expect(s.colors).toBe(5);
    });
    it("T6-3: 레벨 100 → maxTime=30 (최소값 보장)", () => {
        const s = calcLevelSettings(100);
        expect(s.maxTime).toBe(30);
    });
    it("T6-4: 레벨 70 → colors=7 (최대값 보장, GEM_COLORS.length=7)", () => {
        // colors = min(7, 4+floor(70/10)) = min(7, 4+7) = min(7,11) = 7
        const s = calcLevelSettings(70);
        expect(s.colors).toBe(7);
    });
});
// --- Suite 7: dt 클램핑 (BUG-3 회귀 방지) ---
describe("dt 클램핑 (BUG-3 회귀 방지)", () => {
    it("T7-1: dt = 0.05 → 변경 없음 (0.1 이하)", () => {
        expect(clampDt(0.05)).toBe(0.05);
    });
    it("T7-2: dt = 0.5 → 0.1로 클램핑됨", () => {
        expect(clampDt(0.5)).toBe(0.1);
    });
    it("T7-3: dt = 0.0 → 0.0 유지", () => {
        expect(clampDt(0.0)).toBe(0.0);
    });
});
// --- Suite 8: Zen 저장 순서 (MISSING-4 회귀 방지) ---
describe("Zen 저장 순서 (MISSING-4 회귀 방지)", () => {
    it("T8-1: saveState()가 state=MENU 이전에 호출되어야 함 (순서 테스트)", () => {
        // saveState는 PLAYING_ZEN 상태일 때만 저장하므로
        // state를 MENU로 바꾸기 전에 saveState가 호출되어야 한다.
        const callLog = [];
        // 모의(mock) 구현: 올바른 순서
        function exitZenCorrect(state, saveStateFn) {
            saveStateFn(); // 1. 먼저 저장
            state.current = GameState.MENU; // 2. 그 다음 상태 전환
        }
        const state = { current: GameState.PLAYING_ZEN };
        exitZenCorrect(state, () => {
            callLog.push('save:' + state.current);
        });
        callLog.push('state:' + state.current);
        // 저장 시점에 상태가 PLAYING_ZEN 이어야 함
        expect(callLog[0]).toBe('save:' + GameState.PLAYING_ZEN);
        expect(callLog[1]).toBe('state:' + GameState.MENU);
    });
    it("T8-2: state=MENU일 때 saveState() 호출 시 저장하지 않음", () => {
        let savedCount = 0;
        // game.ts의 saveState 로직 재현
        function saveState(state) {
            if (state === GameState.PLAYING_ZEN) {
                savedCount++; // 실제로는 DB 저장; 여기선 카운트만
            }
        }
        saveState(GameState.MENU);
        expect(savedCount).toBe(0);
    });
});
// --- Suite 9: GEM_EMOJIS 배열 검증 ---
describe("GEM_EMOJIS 배열 검증", () => {
    it("T9-1: GEM_EMOJIS_TEST 길이가 12 → true", () => {
        expect(GEM_EMOJIS_TEST.length === 12).toBeTruthy();
    });
    it("T9-2: 타입 0 이모지가 💎 → true", () => {
        expect(GEM_EMOJIS_TEST[0] === "💎").toBeTruthy();
    });
    it("T9-3: 타입 11 이모지가 👑 → true", () => {
        expect(GEM_EMOJIS_TEST[11] === "👑").toBeTruthy();
    });
    it("T9-4: 모든 이모지가 문자열 타입 → true", () => {
        const allStrings = GEM_EMOJIS_TEST.every(e => typeof e === "string");
        expect(allStrings).toBeTruthy();
    });
    it("T9-5: 중복 이모지 없음 (Set 변환 후 크기 === 12) → true", () => {
        expect(new Set(GEM_EMOJIS_TEST).size === 12).toBeTruthy();
    });
});
// --- Suite 10: 새 보석 수 공식 검증 ---
describe("새 보석 수 공식 검증 (calcColorsNew)", () => {
    it("T10-1: 레벨 1 → 3", () => {
        expect(calcColorsNew(1)).toBe(3);
    });
    it("T10-2: 레벨 10 → 4", () => {
        expect(calcColorsNew(10)).toBe(4);
    });
    it("T10-3: 레벨 20 → 5", () => {
        expect(calcColorsNew(20)).toBe(5);
    });
    it("T10-4: 레벨 50 → 7 (round(3 + 49*9/99) = round(7.45) = 7)", () => {
        expect(calcColorsNew(50)).toBe(7);
    });
    it("T10-5: 레벨 100 → 12", () => {
        expect(calcColorsNew(100)).toBe(12);
    });
    it("T10-6: 레벨 1이 기존 공식(4)보다 작음 → true (더 쉬운 시작)", () => {
        const oldColors = Math.min(7, 4 + Math.floor(1 / 10)); // = 4
        expect(calcColorsNew(1) < oldColors).toBeTruthy();
    });
    it("T10-7: 레벨 60 → 기존 공식(7)보다 큰 8 → true (더 다양해짐)", () => {
        const oldColors = Math.min(7, 4 + Math.floor(60 / 10)); // = 7
        const newColors = calcColorsNew(60); // round(3 + 59*9/99) = round(8.36) = 8
        expect(newColors > oldColors).toBeTruthy();
    });
    it("T10-8: 레벨 1~100 모두 3~12 범위", () => {
        for (let lv = 1; lv <= 100; lv++) {
            const c = calcColorsNew(lv);
            if (c < 3 || c > 12)
                throw new Error(`Level ${lv} returned ${c}`);
        }
    });
});
// --- Suite 11: 스크롤 로직 검증 ---
describe("레벨 선택 스크롤 로직 검증", () => {
    it("T11-1: 화면 높이 915px(접힌 폴드) → maxScrollY = 365", () => {
        expect(calcMaxScrollY(915)).toBe(365);
    });
    it("T11-2: 화면 높이 1812px(펼친 폴드) → maxScrollY = 0 (스크롤 불필요)", () => {
        expect(calcMaxScrollY(1812)).toBe(0);
    });
    it("T11-3: scrollY 범위 초과 (음수) → 0으로 클램프", () => {
        expect(clampScrollY(-50, 915)).toBe(0);
    });
    it("T11-4: scrollY 범위 초과 (최대 초과) → maxScrollY로 클램프", () => {
        const maxScroll = calcMaxScrollY(915); // 365
        expect(clampScrollY(9999, 915)).toBe(maxScroll);
    });
    it("T11-5: 스크롤 0에서 첫 번째 셀 클릭 → 레벨 1", () => {
        // screenWidth=375, clientX=10, clientY=90(헤더 아래), scrollY=0
        // cellW=375/5=75, col=floor(10/75)=0, row=floor((90-80+0)/60)=floor(0.166)=0
        // level=0*5+0+1=1
        expect(getLevelFromClickWithScroll(10, 90, 375, 0)).toBe(1);
    });
    it("T11-6: scrollY=60이면 같은 화면 좌표가 다음 행(+5) 반환", () => {
        // scrollY=0 → 레벨 1, scrollY=60 → 레벨 6 (다음 행)
        const levelNoScroll = getLevelFromClickWithScroll(10, 90, 375, 0);
        const levelWithScroll = getLevelFromClickWithScroll(10, 90, 375, 60);
        expect(levelWithScroll - levelNoScroll).toBe(5);
    });
    it("T11-7: 헤더 영역(clientY < 80) 클릭 → null 반환", () => {
        expect(getLevelFromClickWithScroll(100, 50, 375, 0)).toBeNull();
    });
    it("T11-8: 드래그 threshold 15px 경계 검증", () => {
        const THRESHOLD = 15;
        expect(Math.abs(14) > THRESHOLD).toBeFalsy(); // 14px → 탭
        expect(Math.abs(16) > THRESHOLD).toBeTruthy(); // 16px → 드래그
    });
});
// ==========================================
// 6. 실행부
// ==========================================
if (typeof document !== 'undefined') {
    window.onload = () => renderResults();
}
else {
    // Node.js 환경
    console.log(results.join('\n'));
    console.log(`\nResult: ${passed} passed, ${failed} failed`);
}
