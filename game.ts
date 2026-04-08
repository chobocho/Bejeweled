// ==========================================
// 1. 설정 및 상수 (Configuration)
// ==========================================
const COLS = 8;
const ROWS = 8;
const GEM_SIZE = 50; // 기본 크기 (반응형으로 조정됨)
const ANIMATION_SPEED = 0.2; // 0 ~ 1 (Swap speed)

// 색상 팔레트 (보석 종류)
const GEM_COLORS = [
    "#FF0000", // Red
    "#00FF00", // Green
    "#0000FF", // Blue
    "#FFFF00", // Yellow
    "#FF00FF", // Magenta
    "#00FFFF", // Cyan
    "#FFFFFF"  // White
];

const GEM_EMOJIS = [
    "💎", // 0 - 다이아몬드
    "⭐", // 1 - 별
    "🔥", // 2 - 불꽃
    "💧", // 3 - 물방울
    "🍀", // 4 - 네잎클로버
    "🌙", // 5 - 초승달
    "⚡", // 6 - 번개
    "🌸", // 7 - 벚꽃
    "✨", // 8 - 반짝임
    "🔮", // 9 - 수정구슬
    "🌈", // 10 - 무지개
    "👑", // 11 - 왕관
];

enum GameState {
    MENU,
    PLAYING_PUZZLE,
    PLAYING_ZEN,
    PAUSED,
    LEVEL_CLEAR,
    GAME_OVER,
    LEVEL_SELECT,
    CONTINUE_PROMPT,
    LEVEL_START
}

enum GemType {
    RED, GREEN, BLUE, YELLOW, MAGENTA, CYAN, WHITE
}

interface Gem {
    type: number;
    x: number; // Grid X
    y: number; // Grid Y
    drawX: number; // Animation X
    drawY: number; // Animation Y
    alpha: number; // For deletion effect
    isMatch: boolean;
}

interface PuzzleRecord {
    level: number;
    stars: number; // 1, 2, 3
    highScore: number;
}

interface ZenSaveData {
    score: number;
    board: number[][]; // Gem types
}

interface GameSaveData {
    id: string;
    lastLevel: number;
}

// ==========================================
// 2. 사운드 관리자 (Web Audio API)
// ==========================================
class SoundManager {
    private ctx: AudioContext | null = null;

    constructor() {
        try {
            // @ts-ignore
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        } catch (e) {
            console.error("Web Audio API not supported");
        }
    }

    playMatchSound(count: number) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // 매치된 개수에 따라 피치 높임 (경쾌한 느낌)
        const frequency = 440 + (count * 50);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(frequency * 2, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    playSelectSound() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }
}

// ==========================================
// 3. 데이터베이스 관리자 (IndexedDB)
// ==========================================
class DBManager {
    private dbName = "GemPuzzleDB";
    private dbVersion = 2;
    private db: IDBDatabase | null = null;

    constructor() {}

    async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event: any) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains("puzzle_records")) {
                    db.createObjectStore("puzzle_records", { keyPath: "level" });
                }
                if (!db.objectStoreNames.contains("zen_save")) {
                    db.createObjectStore("zen_save", { keyPath: "id" });
                }
                if (!db.objectStoreNames.contains("game_save")) {
                    db.createObjectStore("game_save", { keyPath: "id" });
                }
            };

            request.onsuccess = (event: any) => {
                this.db = event.target.result;
                resolve();
            };

            request.onerror = (event) => reject(event);
        });
    }

    async savePuzzleRecord(record: PuzzleRecord) {
        if (!this.db) return;
        // 기존 기록과 비교해 최고 별수·최고 점수만 저장
        const existing = await this.getPuzzleRecord(record.level);
        const best: PuzzleRecord = {
            level: record.level,
            stars: Math.max(record.stars, existing?.stars ?? 0),
            highScore: Math.max(record.highScore, existing?.highScore ?? 0)
        };
        const tx = this.db.transaction("puzzle_records", "readwrite");
        tx.objectStore("puzzle_records").put(best);
    }

    async getPuzzleRecord(level: number): Promise<PuzzleRecord | undefined> {
        if (!this.db) return undefined;
        return new Promise((resolve) => {
            const tx = this.db!.transaction("puzzle_records", "readonly");
            const req = tx.objectStore("puzzle_records").get(level);
            req.onsuccess = () => resolve(req.result);
        });
    }

    async saveZenState(data: ZenSaveData) {
        if (!this.db) return;
        const tx = this.db.transaction("zen_save", "readwrite");
        tx.objectStore("zen_save").put({ id: "current", ...data });
    }

    async loadZenState(): Promise<ZenSaveData | undefined> {
        if (!this.db) return undefined;
        return new Promise((resolve) => {
            const tx = this.db!.transaction("zen_save", "readonly");
            const req = tx.objectStore("zen_save").get("current");
            req.onsuccess = () => resolve(req.result);
        });
    }

    async saveGameProgress(level: number) {
        if (!this.db) return;
        const tx = this.db.transaction("game_save", "readwrite");
        tx.objectStore("game_save").put({ id: "current", lastLevel: level });
    }

    async loadGameProgress(): Promise<number | undefined> {
        if (!this.db) return undefined;
        return new Promise((resolve) => {
            const tx = this.db!.transaction("game_save", "readonly");
            const req = tx.objectStore("game_save").get("current");
            req.onsuccess = () => resolve(req.result?.lastLevel);
        });
    }

    async clearGameProgress() {
        if (!this.db) return;
        const tx = this.db.transaction("game_save", "readwrite");
        tx.objectStore("game_save").delete("current");
    }
}

// ==========================================
// 4. 게임 엔진 (Game Engine)
// ==========================================
class Game {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    db: DBManager;
    sound: SoundManager;

    width: number = 0;
    height: number = 0;
    scale: number = 1;
    offsetX: number = 0;
    offsetY: number = 0;

    state: GameState = GameState.MENU;

    // Game Data
    grid: Gem[][] = [];
    selectedGem: { x: number, y: number } | null = null;
    score: number = 0;

    // Puzzle Mode Data
    level: number = 1;
    timeLeft: number = 0;
    maxTime: number = 0;
    targetScore: number = 0;

    // Animation flags
    isProcessing: boolean = false;
    lastTime: number = 0;

    // Bug fix flags
    finishLevelCalled: boolean = false;
    levelClearTimer: ReturnType<typeof setTimeout> | null = null;

    // Chain combo feedback
    comboChain: number = 0;
    comboDisplayTimer: number = 0;

    // In-game menu / confirm dialog
    confirmAction: 'retry' | 'levelSelect' | null = null;
    showConfirm: boolean = false;

    // Level select data
    levelRecords: Map<number, PuzzleRecord> = new Map();
    lastSavedLevel: number = 1;

    // Menu card hit areas (set during drawMenu)
    _menuPuzzleCard: { x: number, y: number, w: number, h: number } | null = null;
    _menuZenCard:    { x: number, y: number, w: number, h: number } | null = null;

    // Level clear popup state
    clearStars: number = 0;
    clearHighScore: number = 0;
    _clearRetryBtn:  { x: number, y: number, w: number, h: number } | null = null;
    _clearNextBtn:   { x: number, y: number, w: number, h: number } | null = null;
    _clearSelectBtn: { x: number, y: number, w: number, h: number } | null = null;

    // Level start popup hit area
    _startBtn: { x: number, y: number, w: number, h: number } | null = null;

    // 입력 처리를 위한 추가 속성
    touchStartX: number = 0;
    touchStartY: number = 0;
    activeGem: { x: number, y: number } | null = null; // 드래그 시작한 보석
    levelSelectScrollY: number = 0;
    levelSelectPrevTouchY: number = 0;
    isDraggingLevelSelect: boolean = false;

    constructor() {
        this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
        this.ctx = this.canvas.getContext("2d")!;
        this.db = new DBManager();
        this.sound = new SoundManager();

        this.resize();
        window.addEventListener("resize", () => this.resize());

        // --- 입력 핸들링 수정 (마우스/터치 통합) ---

        // 터치 시작
        this.canvas.addEventListener("touchstart", (e) => {
            e.preventDefault(); // 스크롤 방지
            const touch = e.touches[0];
            this.handleInputDown(touch.clientX, touch.clientY);
        }, { passive: false });

        // 터치 이동 (스와이프 감지용)
        this.canvas.addEventListener("touchmove", (e) => {
            e.preventDefault();
            if (this.state !== GameState.LEVEL_SELECT) return;
            const touch = e.touches[0];
            const dy = touch.clientY - this.touchStartY;
            if (Math.abs(dy) > 15) {
                this.isDraggingLevelSelect = true;
            }
            if (this.isDraggingLevelSelect) {
                const delta = touch.clientY - this.levelSelectPrevTouchY;
                const cellH = 72;
                const headerH = 70;
                const maxScrollY = Math.max(0, (headerH + 20 * cellH) - this.height);
                this.levelSelectScrollY = Math.max(0, Math.min(maxScrollY, this.levelSelectScrollY - delta));
            }
            this.levelSelectPrevTouchY = touch.clientY;
        }, { passive: false });

        // 터치 끝 (스와이프 완료 처리)
        this.canvas.addEventListener("touchend", (e) => {
            e.preventDefault();
            // touchend에는 touches가 없으므로 changedTouches 사용
            const touch = e.changedTouches[0];
            this.handleInputUp(touch.clientX, touch.clientY);
        }, { passive: false });

        // 마우스 (데스크탑)
        this.canvas.addEventListener("mousedown", (e) => {
            this.handleInputDown(e.clientX, e.clientY);
        });

        this.canvas.addEventListener("mouseup", (e) => {
            this.handleInputUp(e.clientX, e.clientY);
        });

        this.canvas.addEventListener("wheel", (e) => {
            if (this.state !== GameState.LEVEL_SELECT) return;
            e.preventDefault();
            const cellH = 72;
            const headerH = 70;
            const maxScrollY = Math.max(0, (headerH + 20 * cellH) - this.height);
            this.levelSelectScrollY = Math.max(0, Math.min(maxScrollY, this.levelSelectScrollY + e.deltaY * 0.5));
        }, { passive: false });

        this.init().then(() => {
            this.loop(0);
        });
    }

    async init() {
        await this.db.init();
        const savedLevel = await this.db.loadGameProgress();
        if (savedLevel && savedLevel > 0) {
            this.lastSavedLevel = savedLevel;
            await this.loadLevelRecords();
            this.state = GameState.CONTINUE_PROMPT;
        }
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        // 1. 상단 UI 영역 (최소 60px ~ 최대 100px)
        // 폴드는 화면이 커서 비율(0.15)로 하면 너무 클 수 있으므로 max 제한을 둡니다.
        const uiMinHeight = 60;
        const uiMaxHeight = 100;
        const uiHeight = Math.max(uiMinHeight, Math.min(uiMaxHeight, this.height * 0.15));

        // 2. [핵심 수정] 하단 안전 여백 (Bottom Padding)
        // 브라우저 주소창이나 안드로이드 제스처 바를 위해 하단에 50px 정도 여유를 둡니다.
        const bottomPadding = 50;

        // 3. 게임 보드가 사용할 수 있는 실제 공간 계산
        const availableWidth = this.width;
        const availableHeight = this.height - uiHeight - bottomPadding;

        // 4. 보드 크기 결정 (가로/세로 중 작은 쪽에 맞춤)
        // 좌우 여백도 살짝 주기 위해 0.95 (95%) 사용
        let boardPixelSize = Math.min(availableWidth, availableHeight) * 0.95;

        // 5. 스케일 및 위치 계산
        this.scale = boardPixelSize / (COLS * GEM_SIZE);

        // 가로 중앙 정렬
        this.offsetX = (this.width - boardPixelSize) / 2;

        // 세로 위치: 상단 UI 바로 아래에서 시작하되,
        // 남은 공간(availableHeight) 내에서도 중앙에 오도록 미세 조정
        const verticalSpaceLeft = availableHeight - boardPixelSize;
        this.offsetY = uiHeight + (verticalSpaceLeft / 2);
    }
    // --- Game Logic ---

    startPuzzle(level: number) {
        this.db.saveGameProgress(level);
        this.finishLevelCalled = false;
        this.level = level;
        this.score = 0;

        // 난이도 조절
        this.maxTime = Math.max(20, Math.round(70 - level * 0.5));
        this.timeLeft = this.maxTime;
        this.targetScore = Math.floor(4000 + 150 * level + 5 * level * level);

        const colors = Math.min(GEM_EMOJIS.length, Math.floor(5 + (level - 1) / 10));
        this.initGrid(colors);

        // 레벨 시작 팝업 표시 (시작 버튼 누르기 전까지 타이머 정지)
        this.state = GameState.LEVEL_START;
    }

    async startZen() {
        this.state = GameState.PLAYING_ZEN;
        const saved = await this.db.loadZenState();
        if (saved) {
            this.score = saved.score;
            this.restoreGrid(saved.board);
        } else {
            this.score = 0;
            this.initGrid(6); // Zen mode - moderate difficulty
        }
    }

    initGrid(numColors: number) {
        this.grid = [];
        for (let y = 0; y < ROWS; y++) {
            this.grid[y] = [];
            for (let x = 0; x < COLS; x++) {
                this.grid[y][x] = this.createGem(x, y, numColors);
                // Prevent initial matches
                while (this.checkMatchAt(x, y)) {
                    this.grid[y][x] = this.createGem(x, y, numColors);
                }
            }
        }
    }

    restoreGrid(typeBoard: number[][]) {
        this.grid = [];
        for (let y = 0; y < ROWS; y++) {
            this.grid[y] = [];
            for (let x = 0; x < COLS; x++) {
                const gem = this.createGem(x, y, GEM_EMOJIS.length);
                gem.type = typeBoard[y][x];
                this.grid[y][x] = gem;
            }
        }
    }

    createGem(x: number, y: number, numColors: number): Gem {
        return {
            type: Math.floor(Math.random() * numColors),
            x: x,
            y: y,
            drawX: x,
            drawY: y,
            alpha: 1,
            isMatch: false
        };
    }

    checkMatchAt(x: number, y: number): boolean {
        const type = this.grid[y][x].type;
        // Horizontal
        if (x >= 2 && this.grid[y][x-1].type === type && this.grid[y][x-2].type === type) return true;
        // Vertical
        if (y >= 2 && this.grid[y-1][x].type === type && this.grid[y-2][x].type === type) return true;
        return false;
    }

    // 좌표 변환 헬퍼 함수
    getGridPos(clientX: number, clientY: number): { x: number, y: number } | null {
        // 캔버스의 실제 위치를 고려하여 좌표 보정 (가장 중요!)
        const rect = this.canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        const boardSize = COLS * GEM_SIZE * this.scale;

        // 보드 영역 밖인지 확인
        if (x < this.offsetX || x > this.offsetX + boardSize ||
            y < this.offsetY || y > this.offsetY + boardSize) {
            return null;
        }

        const gx = Math.floor((x - this.offsetX) / (GEM_SIZE * this.scale));
        const gy = Math.floor((y - this.offsetY) / (GEM_SIZE * this.scale));

        if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) {
            return { x: gx, y: gy };
        }
        return null;
    }

    handleInputDown(clientX: number, clientY: number) {
        if (this.isProcessing) return;

        this.levelSelectPrevTouchY = clientY;
        this.isDraggingLevelSelect = false;

        // 이어하기 프롬프트 처리
        if (this.state === GameState.CONTINUE_PROMPT) {
            const cardW = Math.min(360, this.width - 48);
            const cardY = this.height * 0.35;
            const cardH = 200;
            const btnW = Math.min(140, (cardW - 36) / 2);
            const btnH = 48;
            const btnY = cardY + cardH - 64;
            const continueX = this.width / 2 - btnW - 8;
            const newGameX = this.width / 2 + 8;
            if (clientY >= btnY && clientY <= btnY + btnH) {
                if (clientX >= continueX && clientX <= continueX + btnW) {
                    this.startPuzzle(this.lastSavedLevel);
                } else if (clientX >= newGameX && clientX <= newGameX + btnW) {
                    this.db.clearGameProgress();
                    this.state = GameState.MENU;
                }
            }
            return;
        }

        // 메뉴 카드 히트 테스트 (drawMenu에서 계산된 카드 위치 사용)
        if (this.state === GameState.MENU) {
            const pc = this._menuPuzzleCard;
            const zc = this._menuZenCard;
            if (pc && clientX >= pc.x && clientX <= pc.x + pc.w &&
                      clientY >= pc.y && clientY <= pc.y + pc.h) {
                this.startLevelSelect();
            } else if (zc && clientX >= zc.x && clientX <= zc.x + zc.w &&
                             clientY >= zc.y && clientY <= zc.y + zc.h) {
                this.startZen();
            }
            return;
        }

        // 레벨 선택 화면 처리
        if (this.state === GameState.LEVEL_SELECT) {
            this.touchStartX = clientX;
            this.touchStartY = clientY;
            if (clientX < 88 && clientY < 70) {
                this.state = GameState.MENU;
                this.levelSelectScrollY = 0;
                return;
            }
            // 탭/드래그 구분은 touchend(handleInputUp)에서 처리하므로 여기서는 아무것도 안 함
            return;
        }

        if (this.state === GameState.LEVEL_START) {
            const sb = this._startBtn;
            if (sb && clientX >= sb.x && clientX <= sb.x + sb.w &&
                      clientY >= sb.y && clientY <= sb.y + sb.h) {
                this.state = GameState.PLAYING_PUZZLE;
            }
            return;
        }

        if (this.state === GameState.LEVEL_CLEAR) {
            const rb = this._clearRetryBtn;
            const nb = this._clearNextBtn;
            const sb = this._clearSelectBtn;
            if (rb && clientX >= rb.x && clientX <= rb.x + rb.w && clientY >= rb.y && clientY <= rb.y + rb.h) {
                this.startPuzzle(this.level);
            } else if (nb && clientX >= nb.x && clientX <= nb.x + nb.w && clientY >= nb.y && clientY <= nb.y + nb.h) {
                if (this.level < 100) this.startPuzzle(this.level + 1);
                else this.state = GameState.MENU;
            } else if (sb && clientX >= sb.x && clientX <= sb.x + sb.w && clientY >= sb.y && clientY <= sb.y + sb.h) {
                this.startLevelSelect();
            }
            return;
        }

        if (this.state === GameState.GAME_OVER) {
            this.state = GameState.MENU;
            return;
        }

        // UI 버튼 처리 (Puzzle: 일시정지 메뉴, Zen: 나가기)
        if (this.state === GameState.PAUSED) {
            if (this.showConfirm) {
                // 확인 다이얼로그 버튼 히트 테스트
                const cardW = Math.min(280, this.width - 64);
                const cardX = (this.width - cardW) / 2;
                const cardH = 180;
                const cardY = (this.height - cardH) / 2;
                const btnW = (cardW - 48) / 2;
                const btnH = 44;
                const btnY = cardY + cardH - 56;
                const cancelX = cardX + 16;
                const confirmX = cardX + cardW / 2 + 8;
                if (clientY >= btnY && clientY <= btnY + btnH) {
                    if (clientX >= cancelX && clientX <= cancelX + btnW) {
                        this.showConfirm = false;
                    } else if (clientX >= confirmX && clientX <= confirmX + btnW) {
                        this.showConfirm = false;
                        const action = this.confirmAction;
                        this.confirmAction = null;
                        if (action === 'retry') {
                            this.startPuzzle(this.level);
                        } else if (action === 'levelSelect') {
                            this.startLevelSelect();
                        }
                    }
                }
            } else {
                // 인게임 메뉴 버튼 히트 테스트
                const cardW = Math.min(300, this.width - 48);
                const cardX = (this.width - cardW) / 2;
                const cardH = 280;
                const cardY = (this.height - cardH) / 2;
                const btnW = cardW - 40;
                const btnH = 50;
                const btnX = cardX + 20;
                const resumeY = cardY + 90;
                const retryY = resumeY + btnH + 12;
                const selectY = retryY + btnH + 12;
                if (clientX >= btnX && clientX <= btnX + btnW) {
                    if (clientY >= resumeY && clientY <= resumeY + btnH) {
                        this.state = GameState.PLAYING_PUZZLE;
                    } else if (clientY >= retryY && clientY <= retryY + btnH) {
                        this.confirmAction = 'retry';
                        this.showConfirm = true;
                    } else if (clientY >= selectY && clientY <= selectY + btnH) {
                        this.confirmAction = 'levelSelect';
                        this.showConfirm = true;
                    }
                }
            }
            return;
        }

        if (clientX > this.width - 80 && clientY < this.offsetY) {
            if (this.state === GameState.PLAYING_PUZZLE) {
                this.showConfirm = false;
                this.confirmAction = null;
                this.state = GameState.PAUSED;
            } else if (this.state === GameState.PLAYING_ZEN) {
                this.saveState(); // PLAYING_ZEN 상태일 때 먼저 저장
                this.state = GameState.MENU;
            }
            return;
        }

        // 보석 터치 시작
        const pos = this.getGridPos(clientX, clientY);
        if (pos) {
            this.touchStartX = clientX;
            this.touchStartY = clientY;
            this.activeGem = pos;
        } else {
            this.activeGem = null;
        }
    }

    handleInputUp(clientX: number, clientY: number) {
        // 레벨 선택 화면: 드래그 아니면 탭으로 레벨 선택
        if (this.state === GameState.LEVEL_SELECT) {
            if (!this.isDraggingLevelSelect) {
                if (clientX < 88 && clientY < 70) {
                    this.state = GameState.MENU;
                    this.levelSelectScrollY = 0;
                } else {
                    const level = this.getLevelFromClick(clientX, clientY);
                    if (level !== null) {
                        this.startPuzzle(level);
                    }
                }
            }
            this.isDraggingLevelSelect = false;
            this.activeGem = null;
            return;
        }

        if (!this.activeGem || this.isProcessing) return;

        const endPos = this.getGridPos(clientX, clientY);
        const dx = clientX - this.touchStartX;
        const dy = clientY - this.touchStartY;
        const dist = Math.sqrt(dx*dx + dy*dy);

        // 1. 스와이프 (드래그) 감지
        // 30px 이상 움직였으면 스와이프로 간주
        if (dist > 30) {
            let tx = this.activeGem.x;
            let ty = this.activeGem.y;

            if (Math.abs(dx) > Math.abs(dy)) {
                // 좌우 이동
                tx += dx > 0 ? 1 : -1;
            } else {
                // 상하 이동
                ty += dy > 0 ? 1 : -1;
            }

            // 유효한 범위 내라면 교체 시도
            if (tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS) {
                this.sound.playSelectSound();
                this.swapGems(this.activeGem.x, this.activeGem.y, tx, ty);
                this.selectedGem = null; // 선택 상태 해제
            }
        }
        // 2. 탭 (클릭) 감지
        else if (endPos && endPos.x === this.activeGem.x && endPos.y === this.activeGem.y) {
            this.handleGemClick(this.activeGem.x, this.activeGem.y);
        }

        this.activeGem = null;
    }


    handleGemClick(x: number, y: number) {
        this.sound.playSelectSound();

        if (!this.selectedGem) {
            this.selectedGem = { x, y };
        } else {
            const sx = this.selectedGem.x;
            const sy = this.selectedGem.y;

            // Check adjacency
            if (Math.abs(sx - x) + Math.abs(sy - y) === 1) {
                this.swapGems(sx, sy, x, y);
            }
            this.selectedGem = null;
        }
    }

    async swapGems(x1: number, y1: number, x2: number, y2: number) {
        this.isProcessing = true;

        // Swap data
        const temp = this.grid[y1][x1];
        this.grid[y1][x1] = this.grid[y2][x2];
        this.grid[y2][x2] = temp;

        // Update coordinates for animation logic
        this.grid[y1][x1].x = x1;
        this.grid[y1][x1].y = y1;
        this.grid[y2][x2].x = x2;
        this.grid[y2][x2].y = y2;

        // Wait for visual swap (simple timeout for this demo)
        await new Promise(r => setTimeout(r, 200));

        const matches = this.findMatches();

        if (matches.length > 0) {
            await this.processMatches(matches);
        } else {
            // Revert if no match
            const tempRevert = this.grid[y1][x1];
            this.grid[y1][x1] = this.grid[y2][x2];
            this.grid[y2][x2] = tempRevert;

            this.grid[y1][x1].x = x1;
            this.grid[y1][x1].y = y1;
            this.grid[y2][x2].x = x2;
            this.grid[y2][x2].y = y2;

            // Penalty? No, just invalid move sound maybe.
        }

        this.isProcessing = false;
        this.saveState(); // Save after move
    }

    findMatches(): Gem[] {
        let matchedGems = new Set<Gem>();

        // Horizontal
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS - 2; x++) {
                const type = this.grid[y][x].type;
                if (this.grid[y][x+1].type === type && this.grid[y][x+2].type === type) {
                    matchedGems.add(this.grid[y][x]);
                    matchedGems.add(this.grid[y][x+1]);
                    matchedGems.add(this.grid[y][x+2]);
                }
            }
        }
        // Vertical
        for (let x = 0; x < COLS; x++) {
            for (let y = 0; y < ROWS - 2; y++) {
                const type = this.grid[y][x].type;
                if (this.grid[y+1][x].type === type && this.grid[y+2][x].type === type) {
                    matchedGems.add(this.grid[y][x]);
                    matchedGems.add(this.grid[y+1][x]);
                    matchedGems.add(this.grid[y+2][x]);
                }
            }
        }
        return Array.from(matchedGems);
    }

    async processMatches(matches: Gem[], chainLevel: number = 1) {
        this.sound.playMatchSound(matches.length);

        // 매치 크기 보너스: 6개+ → ×2.5, 4~5개 → ×1.5, 3개 → ×1.0
        const sizeMultiplier = matches.length >= 6 ? 2.5
                             : matches.length >= 4 ? 1.5
                             : 1.0;
        // 연쇄(cascade) 보너스: 체인마다 0.75씩 누적, 최대 ×4.0
        const chainMultiplier = Math.min(4.0, 1.0 + (chainLevel - 1) * 0.75);
        const pointsPerGem = Math.floor(50 * sizeMultiplier * chainMultiplier);

        for (const gem of matches) {
            gem.isMatch = true;
            this.score += pointsPerGem;
        }

        // 체인 콤보 표시 (2연쇄 이상)
        if (chainLevel >= 2) {
            this.comboChain = chainLevel;
            this.comboDisplayTimer = 1.2;
        }

        // 시간 보너스: 최초 매치(chainLevel=1)만 적용, 0.5초/gem
        if (this.state === GameState.PLAYING_PUZZLE && chainLevel === 1) {
            this.timeLeft = Math.min(this.maxTime, this.timeLeft + matches.length * 0.5);
        }

        // Wait for disappear
        await new Promise(r => setTimeout(r, 200));

        // Refill logic
        this.applyGravity();
        await new Promise(r => setTimeout(r, 200));

        // Chain Reaction
        const newMatches = this.findMatches();
        if (newMatches.length > 0) {
            await this.processMatches(newMatches, chainLevel + 1);
        }
    }

    applyGravity() {
        let colors = 5;
        if (this.state === GameState.PLAYING_PUZZLE) {
            colors = Math.min(GEM_EMOJIS.length, Math.floor(5 + (this.level - 1) / 10));
        }
        for (let x = 0; x < COLS; x++) {
            // 살아있는 보석만 아래쪽부터 모음
            const surviving: Gem[] = [];
            for (let y = ROWS - 1; y >= 0; y--) {
                if (this.grid[y][x] && !this.grid[y][x].isMatch) {
                    surviving.push(this.grid[y][x]);
                }
            }
            // 아래쪽부터 살아있는 보석 배치
            for (let i = 0; i < surviving.length; i++) {
                const newY = ROWS - 1 - i;
                surviving[i].y = newY;
                surviving[i].drawY = newY;
                this.grid[newY][x] = surviving[i];
            }
            // 위쪽 빈 자리에 새 보석 생성
            const emptyCount = ROWS - surviving.length;
            for (let i = 0; i < emptyCount; i++) {
                this.grid[i][x] = this.createGem(x, i, colors);
            }
        }
    }

    saveState() {
        if (this.state === GameState.PLAYING_ZEN) {
            const simpleBoard = this.grid.map(row => row.map(g => g.type));
            this.db.saveZenState({ score: this.score, board: simpleBoard });
        }
    }

    finishLevel() {
        this.finishLevelCalled = true;
        const stars = this.score >= this.targetScore * 2 ? 3 : (this.score >= this.targetScore * 1.5 ? 2 : 1);
        this.clearStars = stars;
        this.db.savePuzzleRecord({ level: this.level, stars: stars, highScore: this.score });
        // 이전 최고 점수 캐시에서 읽기
        const existing = this.levelRecords.get(this.level);
        this.clearHighScore = Math.max(this.score, existing?.highScore ?? 0);
        // levelRecords 캐시 갱신
        this.levelRecords.set(this.level, {
            level: this.level,
            stars: Math.max(stars, existing?.stars ?? 0),
            highScore: this.clearHighScore
        });
        this.state = GameState.LEVEL_CLEAR;
    }

    // --- Rendering ---

    loop(timestamp: number) {
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
        this.lastTime = timestamp;

        this.update(dt);
        this.draw();

        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt: number) {
        // 콤보 표시 타이머
        if (this.comboDisplayTimer > 0) {
            this.comboDisplayTimer -= dt;
        }

        if (this.state === GameState.PLAYING_PUZZLE) {
            this.timeLeft -= dt;
            if (this.timeLeft <= 0) {
                this.state = GameState.GAME_OVER;
            }
            // 체인이 완전히 끝난 후에만 레벨 완료 처리 (isProcessing 중엔 별 계산 연기)
            if (this.score >= this.targetScore && !this.finishLevelCalled && !this.isProcessing) {
                this.finishLevel();
            }
        }

        // Animation Interpolation
        // 수정된 부분: grid가 초기화되지 않았거나 행이 없으면 건너뜀
        if (this.grid.length === 0) return;

        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const gem = this.grid[y][x];
                if (gem) {
                    // Simple lerp
                    gem.drawX += (gem.x - gem.drawX) * 0.2;
                    gem.drawY += (gem.y - gem.drawY) * 0.2;
                }
            }
        }
    }

    draw() {
        // 1. 화면 지우기
        this.ctx.fillStyle = "#222";
        this.ctx.fillRect(0, 0, this.width, this.height);

        // 이어하기 프롬프트 (UI 바 없이 전체 화면)
        if (this.state === GameState.CONTINUE_PROMPT) {
            this.drawContinuePrompt();
            return;
        }

        // 2. UI 그리기
        this.drawUI();

        // 메뉴 상태면 여기서 종료
        if (this.state === GameState.MENU) {
            this.drawMenu();
            return;
        }

        // 레벨 선택 화면
        if (this.state === GameState.LEVEL_SELECT) {
            this.drawLevelSelect();
            return;
        }

        // 레벨 시작 팝업 (전체 화면)
        if (this.state === GameState.LEVEL_START) {
            this.drawLevelStartPopup();
            return;
        }

        // ============================================================
        // [수정 핵심] Grid가 아직 생성되지 않았으면 여기서 그리기 중단
        // 비동기 로딩(Zen 모드) 중에 에러가 나는 것을 막아줍니다.
        // ============================================================
        if (!this.grid || this.grid.length === 0) {
            // 로딩 중이라는 표시를 띄워도 좋습니다.
            this.ctx.fillStyle = "white";
            this.ctx.textAlign = "center";
            this.ctx.fillText("Loading...", this.width / 2, this.height / 2);
            return;
        }

        // 3. 보드 배경 그리기
        const boardSize = COLS * GEM_SIZE * this.scale;
        this.ctx.fillStyle = "#111";
        this.ctx.fillRect(this.offsetX - 10, this.offsetY - 10, boardSize + 20, boardSize + 20);

        // 4. 보석 그리기
        const cellSize = GEM_SIZE * this.scale;
        for (let y = 0; y < ROWS; y++) {
            // [안전 장치] 해당 행(Row)이 존재하는지 확인
            if (!this.grid[y]) continue;

            for (let x = 0; x < COLS; x++) {
                const gem = this.grid[y][x];
                // gem이 있고, 매치되어 사라지는 중이 아닐 때만 그림 (또는 사라지는 효과 구현 시 변경)
                if (gem && !gem.isMatch) {
                    this.drawGem(gem.drawX, gem.drawY, gem.type, cellSize, this.selectedGem !== null && gem.x === this.selectedGem.x && gem.y === this.selectedGem.y);
                }
            }
        }

        // 5. 오버레이(일시정지, 게임오버 등) 그리기
        if (this.state === GameState.PAUSED) {
            this.drawGameMenu();
            if (this.showConfirm) this.drawConfirmDialog();
        } else if (this.state === GameState.GAME_OVER) {
            this.drawOverlay("GAME OVER", "탭하여 메뉴로");
        } else if (this.state === GameState.LEVEL_CLEAR) {
            this.drawLevelClearPopup();
        }

        // 6. 연쇄(Chain) 콤보 표시 (가독성 강화: 반투명 pill 배경)
        if (this.comboDisplayTimer > 0 && this.comboChain >= 2) {
            const alpha = Math.min(1, this.comboDisplayTimer * 2);
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const fontSize = Math.min(52, 26 + this.comboChain * 5);
            this.ctx.font = `bold ${fontSize}px Arial`;
            const isRed = this.comboChain >= 4;
            const fillColor = isRed ? '#ff8844' : '#FFD700';
            const glowColor = isRed ? '#ff4444' : '#FFD700';
            const cy = this.height * 0.42;
            const textW = this.ctx.measureText(`Chain ×${this.comboChain}!`).width;
            const padX = 20, padY = 10;
            // 반투명 pill 배경
            this.ctx.fillStyle = 'rgba(0,0,0,0.65)';
            this.ctx.beginPath();
            this.ctx.roundRect(this.width / 2 - textW / 2 - padX, cy - fontSize / 2 - padY, textW + padX * 2, fontSize + padY * 2, fontSize / 2 + padY);
            this.ctx.fill();
            this.ctx.strokeStyle = isRed ? 'rgba(255,68,68,0.6)' : 'rgba(255,215,0,0.5)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            // 텍스트
            this.ctx.shadowColor = glowColor;
            this.ctx.shadowBlur = 24;
            this.ctx.fillStyle = fillColor;
            this.ctx.fillText(`Chain ×${this.comboChain}!`, this.width / 2, cy);
            this.ctx.shadowBlur = 0;
            this.ctx.restore();
        }
    }

    drawGameMenu() {
        // 반투명 배경
        this.ctx.fillStyle = 'rgba(0,0,0,0.75)';
        this.ctx.fillRect(0, 0, this.width, this.height);

        const cardW = Math.min(300, this.width - 48);
        const cardX = (this.width - cardW) / 2;
        const cardH = 280;
        const cardY = (this.height - cardH) / 2;

        // 카드 배경
        const cardGrad = this.ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
        cardGrad.addColorStop(0, '#1e2244');
        cardGrad.addColorStop(1, '#141828');
        this.ctx.fillStyle = cardGrad;
        this.ctx.beginPath();
        this.ctx.roundRect(cardX, cardY, cardW, cardH, 16);
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(108,99,255,0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.roundRect(cardX, cardY, cardW, cardH, 16);
        this.ctx.stroke();

        // 타이틀
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 22px Arial';
        this.ctx.fillText('⏸  일시 정지', this.width / 2, cardY + 36);

        // 레벨·점수 정보
        this.ctx.fillStyle = '#b0baff';
        this.ctx.font = '14px Arial';
        this.ctx.fillText(`레벨 ${this.level}  |  점수 ${this.score}`, this.width / 2, cardY + 64);

        const btnW = cardW - 40;
        const btnH = 50;
        const btnX = cardX + 20;
        const resumeY = cardY + 90;
        const retryY = resumeY + btnH + 12;
        const selectY = retryY + btnH + 12;

        // 계속하기 (초록)
        const rg = this.ctx.createLinearGradient(btnX, resumeY, btnX, resumeY + btnH);
        rg.addColorStop(0, '#4CAF50'); rg.addColorStop(1, '#2e7d32');
        this.ctx.fillStyle = rg;
        this.ctx.beginPath();
        this.ctx.roundRect(btnX, resumeY, btnW, btnH, 12);
        this.ctx.fill();
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('▶  계속하기', this.width / 2, resumeY + btnH / 2);

        // 다시하기 (주황)
        const rg2 = this.ctx.createLinearGradient(btnX, retryY, btnX, retryY + btnH);
        rg2.addColorStop(0, '#FF9800'); rg2.addColorStop(1, '#e65100');
        this.ctx.fillStyle = rg2;
        this.ctx.beginPath();
        this.ctx.roundRect(btnX, retryY, btnW, btnH, 12);
        this.ctx.fill();
        this.ctx.fillStyle = 'white';
        this.ctx.fillText('↺  다시하기', this.width / 2, retryY + btnH / 2);

        // 레벨 선택 (파랑)
        const rg3 = this.ctx.createLinearGradient(btnX, selectY, btnX, selectY + btnH);
        rg3.addColorStop(0, '#2196F3'); rg3.addColorStop(1, '#0d47a1');
        this.ctx.fillStyle = rg3;
        this.ctx.beginPath();
        this.ctx.roundRect(btnX, selectY, btnW, btnH, 12);
        this.ctx.fill();
        this.ctx.fillStyle = 'white';
        this.ctx.fillText('☰  레벨 선택', this.width / 2, selectY + btnH / 2);
    }

    drawConfirmDialog() {
        // 추가 어두운 배경
        this.ctx.fillStyle = 'rgba(0,0,0,0.55)';
        this.ctx.fillRect(0, 0, this.width, this.height);

        const cardW = Math.min(280, this.width - 64);
        const cardX = (this.width - cardW) / 2;
        const cardH = 180;
        const cardY = (this.height - cardH) / 2;

        const cg = this.ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
        cg.addColorStop(0, '#252840'); cg.addColorStop(1, '#1a1c30');
        this.ctx.fillStyle = cg;
        this.ctx.beginPath();
        this.ctx.roundRect(cardX, cardY, cardW, cardH, 16);
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.roundRect(cardX, cardY, cardW, cardH, 16);
        this.ctx.stroke();

        // 메시지
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 17px Arial';
        const title = this.confirmAction === 'retry'
            ? `레벨 ${this.level}을 다시 시작할까요?`
            : '레벨 선택으로 이동할까요?';
        this.ctx.fillText(title, this.width / 2, cardY + 42);
        this.ctx.fillStyle = 'rgba(255,180,50,0.85)';
        this.ctx.font = '13px Arial';
        this.ctx.fillText('현재 진행 상황이 초기화됩니다', this.width / 2, cardY + 72);

        // 버튼
        const btnW = (cardW - 48) / 2;
        const btnH = 44;
        const btnY = cardY + cardH - 56;
        const cancelX = cardX + 16;
        const confirmX = cardX + cardW / 2 + 8;

        // 취소 (투명)
        this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
        this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.roundRect(cancelX, btnY, btnW, btnH, 10);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.fillStyle = 'rgba(255,255,255,0.75)';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('취소', cancelX + btnW / 2, btnY + btnH / 2);

        // 확인 (액션별 색상)
        const c1 = this.confirmAction === 'retry' ? '#FF5722' : '#2196F3';
        const c2 = this.confirmAction === 'retry' ? '#b71c1c' : '#0d47a1';
        const fg = this.ctx.createLinearGradient(confirmX, btnY, confirmX, btnY + btnH);
        fg.addColorStop(0, c1); fg.addColorStop(1, c2);
        this.ctx.fillStyle = fg;
        this.ctx.beginPath();
        this.ctx.roundRect(confirmX, btnY, btnW, btnH, 10);
        this.ctx.fill();
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText(
            this.confirmAction === 'retry' ? '다시하기' : '이동',
            confirmX + btnW / 2, btnY + btnH / 2
        );
    }

    drawGem(x: number, y: number, type: number, size: number, isSelected: boolean) {
        const px = this.offsetX + x * size;
        const py = this.offsetY + y * size;

        // 선택 하이라이트 (이모지 뒤에 먼저 그림)
        if (isSelected) {
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
            this.ctx.fillRect(px + 2, py + 2, size - 4, size - 4);
            this.ctx.strokeStyle = "white";
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(px, py, size, size);
        }

        // 이모지 렌더링
        const emoji = GEM_EMOJIS[type] ?? "💎";
        this.ctx.font = `${size * 0.75}px sans-serif`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText(emoji, px + size / 2, py + size / 2);
    }

    drawUI() {
        // UI 영역의 높이
        const headerHeight = this.offsetY;

        // 텍스트 기준점 (대략 상단 40% 지점)
        const safelyY = headerHeight * 0.4;

        // 좁은 화면 체크 (폴드 접은 화면 등 모바일 포트레이트 기준)
        const isNarrow = this.width < 450;

        // 1. 공통 폰트 설정
        this.ctx.fillStyle = "white";
        // 좁은 화면이면 폰트를 조금 줄임 (20px -> 18px)
        this.ctx.font = isNarrow ? "bold 18px sans-serif" : "bold 22px sans-serif";
        this.ctx.textBaseline = "middle";

        // 2. 점수 (항상 왼쪽)
        this.ctx.textAlign = "left";
        this.ctx.fillText(`Score: ${this.score}`, 20, safelyY);

        // 3. 버튼 (항상 오른쪽 끝)
        this.ctx.textAlign = "right";
        const btnText = this.state === GameState.PLAYING_ZEN ? "EXIT" : "||";
        this.ctx.fillText(btnText, this.width - 20, safelyY);

        // 4. 레벨 및 타이머 (퍼즐 모드일 때만)
        if (this.state === GameState.PLAYING_PUZZLE) {

            if (isNarrow) {
                // [수정됨] 좁은 화면: 레벨을 중앙이 아닌 오른쪽 버튼 옆에 배치
                // 버튼("||")의 너비를 고려해 약 40~50px 왼쪽으로 이동
                this.ctx.textAlign = "right";
                this.ctx.fillText(`Lv.${this.level}`, this.width - 50, safelyY);
            } else {
                // 넓은 화면: 기존대로 중앙 배치
                this.ctx.textAlign = "center";
                this.ctx.fillText(`Level: ${this.level}`, this.width / 2, safelyY);
            }

            // 타이머 바
            const barHeight = 10;
            const barY = safelyY + 25;
            const barWidth = this.width - 40;

            // 배경 바
            this.ctx.fillStyle = "#333";
            this.ctx.beginPath();
            this.ctx.roundRect(20, barY, barWidth, barHeight, 5);
            this.ctx.fill();

            // 진행 바 (컬러풀: 파랑→초록→노랑→빨강)
            const timeRatio = Math.max(0, this.timeLeft / this.maxTime);
            let barColor: string;
            let barGlow: string;
            if (timeRatio > 0.6) {
                barColor = '#4A90E2'; barGlow = 'rgba(74,144,226,0.7)';
            } else if (timeRatio > 0.3) {
                barColor = '#4CAF50'; barGlow = 'rgba(76,175,80,0.7)';
            } else if (timeRatio > 0.1) {
                barColor = '#FFC107'; barGlow = 'rgba(255,193,7,0.8)';
            } else {
                barColor = '#F44336'; barGlow = 'rgba(244,67,54,0.9)';
            }
            this.ctx.shadowColor = barGlow;
            this.ctx.shadowBlur = 8;
            this.ctx.fillStyle = barColor;
            this.ctx.beginPath();
            this.ctx.roundRect(20, barY, barWidth * timeRatio, barHeight, 5);
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }
        else if (this.state === GameState.PLAYING_ZEN) {
            // 젠 모드 텍스트
            this.ctx.textAlign = "center";
            this.ctx.fillStyle = "#aaa";
            this.ctx.font = isNarrow ? "14px sans-serif" : "16px sans-serif";
            // 좁은 화면에서는 겹치지 않게 타이머 바 위치(조금 아래)에 텍스트 표시
            const textY = isNarrow ? safelyY + 25 : safelyY;
            this.ctx.fillText("ZEN MODE", this.width / 2, textY);
        }
    }

    drawMenu() {
        const ctx = this.ctx;
        const cx = this.width / 2;

        // 배경: 딥 스페이스 그라디언트
        const bg = ctx.createLinearGradient(0, 0, 0, this.height);
        bg.addColorStop(0, '#0d0f1e');
        bg.addColorStop(1, '#1a0a2e');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this.width, this.height);

        // 별빛 효과 (고정 패턴)
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        const stars = [[0.1,0.08],[0.85,0.12],[0.3,0.18],[0.7,0.06],[0.55,0.22],[0.2,0.3],[0.9,0.25],[0.4,0.05]];
        for (const [sx, sy] of stars) {
            ctx.beginPath();
            ctx.arc(sx * this.width, sy * this.height, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // 타이틀
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 38px Arial';
        ctx.shadowColor = 'rgba(150,100,255,0.8)';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#ffffff';
        ctx.fillText('💎 GEM PUZZLE', cx, this.height * 0.22);
        ctx.shadowBlur = 0;

        // 서브타이틀
        ctx.font = '14px Arial';
        ctx.fillStyle = 'rgba(176,186,255,0.7)';
        ctx.fillText('모드를 선택하세요', cx, this.height * 0.31);

        // 카드 공통 크기
        const cardW = Math.min(300, this.width - 48);
        const cardH = 110;
        const cardX = cx - cardW / 2;
        const gap = 20;
        const totalCards = 2 * cardH + gap;
        const startY = (this.height - totalCards) / 2 + this.height * 0.06;

        // --- 퍼즐 모드 카드 ---
        const p1Y = startY;
        const puzzleGrad = ctx.createLinearGradient(cardX, p1Y, cardX, p1Y + cardH);
        puzzleGrad.addColorStop(0, '#1a2d1a');
        puzzleGrad.addColorStop(1, '#0d1a0d');
        ctx.fillStyle = puzzleGrad;
        ctx.beginPath();
        ctx.roundRect(cardX, p1Y, cardW, cardH, 16);
        ctx.fill();

        ctx.strokeStyle = 'rgba(80,220,100,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(cardX, p1Y, cardW, cardH, 16);
        ctx.stroke();

        ctx.textBaseline = 'middle';
        ctx.font = 'bold 22px Arial';
        ctx.fillStyle = '#90EE90';
        ctx.fillText('🔷 퍼즐 모드', cx, p1Y + 36);
        ctx.font = '13px Arial';
        ctx.fillStyle = 'rgba(200,240,200,0.65)';
        ctx.fillText('레벨 1~100 · 시간 제한 · 별점 기록', cx, p1Y + 68);
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = 'rgba(144,238,144,0.8)';
        ctx.fillText('▶  시작하기', cx, p1Y + 92);

        // --- 젠 모드 카드 ---
        const p2Y = startY + cardH + gap;
        const zenGrad = ctx.createLinearGradient(cardX, p2Y, cardX, p2Y + cardH);
        zenGrad.addColorStop(0, '#0d1a2d');
        zenGrad.addColorStop(1, '#0a1020');
        ctx.fillStyle = zenGrad;
        ctx.beginPath();
        ctx.roundRect(cardX, p2Y, cardW, cardH, 16);
        ctx.fill();

        ctx.strokeStyle = 'rgba(80,160,255,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(cardX, p2Y, cardW, cardH, 16);
        ctx.stroke();

        ctx.font = 'bold 22px Arial';
        ctx.fillStyle = '#87CEEB';
        ctx.fillText('🧘 명상 모드', cx, p2Y + 36);
        ctx.font = '13px Arial';
        ctx.fillStyle = 'rgba(180,220,255,0.65)';
        ctx.fillText('시간 제한 없음 · 자유 플레이 · 자동 저장', cx, p2Y + 68);
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = 'rgba(135,206,235,0.8)';
        ctx.fillText('▶  시작하기', cx, p2Y + 92);

        // 카드 위치를 속성에 저장 (히트 테스트용)
        this._menuPuzzleCard = { x: cardX, y: p1Y, w: cardW, h: cardH };
        this._menuZenCard    = { x: cardX, y: p2Y, w: cardW, h: cardH };

        ctx.textBaseline = 'alphabetic';
    }

    drawOverlay(title: string, subtitle: string) {
        this.ctx.fillStyle = "rgba(0,0,0,0.7)";
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.ctx.fillStyle = "white";
        this.ctx.textAlign = "center";
        this.ctx.font = "bold 30px Arial";
        this.ctx.fillText(title, this.width / 2, this.height / 2 - 20);
        this.ctx.font = "20px Arial";
        this.ctx.fillText(subtitle, this.width / 2, this.height / 2 + 20);
    }

    drawLevelClearPopup() {
        const ctx = this.ctx;
        const cx = this.width / 2;

        // 어두운 오버레이
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.fillRect(0, 0, this.width, this.height);

        const cardW = Math.min(320, this.width - 32);
        const cardH = 390;
        const cardX = cx - cardW / 2;
        const cardY = (this.height - cardH) / 2;
        const r = 16;

        // 카드 배경
        const cg = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
        cg.addColorStop(0, '#1e2244');
        cg.addColorStop(1, '#141828');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, r);
        ctx.fill();
        ctx.strokeStyle = 'rgba(108,99,255,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, r);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 타이틀
        ctx.font = 'bold 26px Arial';
        ctx.shadowColor = 'rgba(150,200,100,0.9)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#ffffff';
        ctx.fillText('✨ LEVEL CLEAR!', cx, cardY + 40);
        ctx.shadowBlur = 0;

        // 레벨 번호
        ctx.font = 'bold 18px Arial';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`LEVEL  ${this.level}`, cx, cardY + 75);

        // 별 표시
        const starY = cardY + 115;
        const starFontSize = Math.min(36, cardW / 5);
        ctx.font = `${starFontSize}px Arial`;
        const starSpacing = starFontSize * 1.2;
        for (let i = 1; i <= 3; i++) {
            ctx.fillStyle = i <= this.clearStars ? '#FFD700' : 'rgba(255,255,255,0.2)';
            if (i <= this.clearStars) { ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 12; }
            ctx.fillText(i <= this.clearStars ? '★' : '☆', cx + (i - 2) * starSpacing, starY);
            ctx.shadowBlur = 0;
        }

        // 점수
        ctx.font = 'bold 28px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(this.score.toLocaleString(), cx, cardY + 162);

        ctx.font = '13px Arial';
        ctx.fillStyle = '#b0baff';
        ctx.fillText('이번 점수', cx, cardY + 185);

        ctx.font = '14px Arial';
        ctx.fillStyle = '#90EE90';
        ctx.fillText(`최고 기록: ${this.clearHighScore.toLocaleString()}`, cx, cardY + 212);

        // 구분선
        ctx.strokeStyle = 'rgba(108,99,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cardX + 20, cardY + 232);
        ctx.lineTo(cardX + cardW - 20, cardY + 232);
        ctx.stroke();

        // 버튼 3개
        const btnH = 46;
        const btnY = cardY + cardH - 70;
        const totalBtnW = cardW - 24;
        const btnW = (totalBtnW - 12) / 3;
        const b1x = cardX + 12;
        const b2x = b1x + btnW + 6;
        const b3x = b2x + btnW + 6;

        const buttons = [
            { x: b1x, label: '↺ 다시하기', grad: ['#FF9800','#e65100'] as [string,string] },
            { x: b2x, label: '→ 다음레벨', grad: ['#4CAF50','#2e7d32'] as [string,string] },
            { x: b3x, label: '☰ 레벨선택', grad: ['#2196F3','#0d47a1'] as [string,string] },
        ];
        for (const btn of buttons) {
            const bg2 = ctx.createLinearGradient(btn.x, btnY, btn.x, btnY + btnH);
            bg2.addColorStop(0, btn.grad[0]);
            bg2.addColorStop(1, btn.grad[1]);
            ctx.fillStyle = bg2;
            ctx.beginPath();
            ctx.roundRect(btn.x, btnY, btnW, btnH, 10);
            ctx.fill();
            ctx.font = 'bold 12px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(btn.label, btn.x + btnW / 2, btnY + btnH / 2);
        }

        this._clearRetryBtn  = { x: b1x, y: btnY, w: btnW, h: btnH };
        this._clearNextBtn   = { x: b2x, y: btnY, w: btnW, h: btnH };
        this._clearSelectBtn = { x: b3x, y: btnY, w: btnW, h: btnH };

        ctx.textBaseline = 'alphabetic';
    }

    drawLevelStartPopup() {
        const ctx = this.ctx;
        const cx = this.width / 2;

        // 딥 스페이스 배경
        const bg = ctx.createLinearGradient(0, 0, 0, this.height);
        bg.addColorStop(0, '#0d0f1e');
        bg.addColorStop(1, '#1a0a2e');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this.width, this.height);

        const cardW = Math.min(320, this.width - 32);
        const cardH = 370;
        const cardX = cx - cardW / 2;
        const cardY = (this.height - cardH) / 2;
        const r = 16;

        // 카드
        const cg = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
        cg.addColorStop(0, '#1e2244');
        cg.addColorStop(1, '#141828');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, r);
        ctx.fill();
        ctx.strokeStyle = 'rgba(108,99,255,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, r);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 레벨 타이틀
        ctx.font = 'bold 28px Arial';
        ctx.shadowColor = 'rgba(120,100,255,0.9)';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`🎯  LEVEL  ${this.level}`, cx, cardY + 48);
        ctx.shadowBlur = 0;

        // 시간 제한
        ctx.font = '14px Arial';
        ctx.fillStyle = '#b0baff';
        ctx.fillText(`제한 시간: ${this.maxTime}초`, cx, cardY + 88);

        // 목표 점수
        ctx.font = '14px Arial';
        ctx.fillStyle = '#90EE90';
        ctx.fillText(`목표 점수: ${this.targetScore.toLocaleString()}`, cx, cardY + 112);

        // 구분선
        ctx.strokeStyle = 'rgba(108,99,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cardX + 20, cardY + 134);
        ctx.lineTo(cardX + cardW - 20, cardY + 134);
        ctx.stroke();

        // 별 도전 목표
        const star1 = this.targetScore;
        const star2 = Math.floor(this.targetScore * 1.5);
        const star3 = this.targetScore * 2;

        const challenges = [
            { stars: 1, score: star1,  color: 'rgba(255,255,255,0.65)', glow: '' },
            { stars: 2, score: star2,  color: '#90EE90',                glow: 'rgba(144,238,144,0.5)' },
            { stars: 3, score: star3,  color: '#FFD700',                glow: 'rgba(255,215,0,0.6)' },
        ];
        let cy2 = cardY + 162;
        for (const ch of challenges) {
            const stars = '★'.repeat(ch.stars) + '☆'.repeat(3 - ch.stars);
            ctx.font = 'bold 15px Arial';
            if (ch.glow) { ctx.shadowColor = ch.glow; ctx.shadowBlur = 8; }
            ctx.fillStyle = ch.color;
            ctx.fillText(`${stars}   ${ch.score.toLocaleString()} 점`, cx, cy2);
            ctx.shadowBlur = 0;
            cy2 += 34;
        }

        // 구분선
        ctx.strokeStyle = 'rgba(108,99,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cardX + 20, cardY + 268);
        ctx.lineTo(cardX + cardW - 20, cardY + 268);
        ctx.stroke();

        // 시작 버튼
        const btnW = Math.min(180, cardW - 48);
        const btnH = 52;
        const btnX = cx - btnW / 2;
        const btnY = cardY + cardH - 80;

        const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
        btnGrad.addColorStop(0, '#7c73ff');
        btnGrad.addColorStop(1, '#4a43cc');
        ctx.fillStyle = btnGrad;
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, btnW, btnH, 14);
        ctx.fill();

        ctx.font = 'bold 17px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255,255,255,0.3)';
        ctx.shadowBlur = 6;
        ctx.fillText('▶  게임 시작', cx, btnY + btnH / 2);
        ctx.shadowBlur = 0;

        this._startBtn = { x: btnX, y: btnY, w: btnW, h: btnH };

        ctx.textBaseline = 'alphabetic';
    }

    async loadLevelRecords() {
        for (let i = 1; i <= 100; i++) {
            const record = await this.db.getPuzzleRecord(i);
            if (record) this.levelRecords.set(i, record);
        }
    }

    startLevelSelect() {
        this.levelSelectScrollY = 0;
        this.isDraggingLevelSelect = false;
        this.loadLevelRecords().then(() => {
            this.state = GameState.LEVEL_SELECT;
        });
    }

    isLevelUnlocked(level: number): boolean {
        if (level === 1) return true;
        return this.levelRecords.has(level - 1);
    }

    drawContinuePrompt() {
        // 배경
        const bg = this.ctx.createLinearGradient(0, 0, 0, this.height);
        bg.addColorStop(0, '#0d0f1e');
        bg.addColorStop(1, '#1a0a2e');
        this.ctx.fillStyle = bg;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // 타이틀
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 32px Arial';
        this.ctx.fillText('💎 GEM PUZZLE', this.width / 2, this.height * 0.22);

        // 카드
        const cardW = Math.min(360, this.width - 48);
        const cardX = (this.width - cardW) / 2;
        const cardY = this.height * 0.35;
        const cardH = 200;

        const cardGrad = this.ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
        cardGrad.addColorStop(0, '#1e2244');
        cardGrad.addColorStop(1, '#141828');
        this.ctx.fillStyle = cardGrad;
        this.ctx.beginPath();
        this.ctx.roundRect(cardX, cardY, cardW, cardH, 16);
        this.ctx.fill();

        this.ctx.strokeStyle = 'rgba(108,99,255,0.45)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.roundRect(cardX, cardY, cardW, cardH, 16);
        this.ctx.stroke();

        // 저장 정보
        this.ctx.fillStyle = '#b0baff';
        this.ctx.font = '15px Arial';
        this.ctx.fillText('진행 중인 게임이 있습니다', this.width / 2, cardY + 44);

        this.ctx.fillStyle = '#FFD700';
        this.ctx.font = 'bold 30px Arial';
        this.ctx.fillText(`레벨 ${this.lastSavedLevel}`, this.width / 2, cardY + 92);

        this.ctx.fillStyle = 'rgba(255,255,255,0.45)';
        this.ctx.font = '14px Arial';
        this.ctx.fillText('에서 이어하기', this.width / 2, cardY + 126);

        // 버튼
        const btnW = Math.min(140, (cardW - 36) / 2);
        const btnH = 48;
        const btnY = cardY + cardH - 64;
        const continueX = this.width / 2 - btnW - 8;
        const newGameX = this.width / 2 + 8;

        // 이어하기 버튼 (퍼플 그라디언트)
        const contGrad = this.ctx.createLinearGradient(continueX, btnY, continueX, btnY + btnH);
        contGrad.addColorStop(0, '#7c73ff');
        contGrad.addColorStop(1, '#4a43cc');
        this.ctx.fillStyle = contGrad;
        this.ctx.beginPath();
        this.ctx.roundRect(continueX, btnY, btnW, btnH, 12);
        this.ctx.fill();

        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 15px Arial';
        this.ctx.fillText('이어하기', continueX + btnW / 2, btnY + btnH / 2);

        // 새로 시작 버튼 (투명)
        this.ctx.fillStyle = 'rgba(255,255,255,0.08)';
        this.ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.roundRect(newGameX, btnY, btnW, btnH, 12);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
        this.ctx.font = 'bold 15px Arial';
        this.ctx.fillText('새로 시작', newGameX + btnW / 2, btnY + btnH / 2);
    }

    getLevelFromClick(clientX: number, clientY: number): number | null {
        const cellH = 72;
        const headerH = 70;
        if (clientY < headerH) return null;

        const cols = 5;
        const cellW = this.width / cols;
        const col = Math.floor(clientX / cellW);
        const row = Math.floor((clientY - headerH + this.levelSelectScrollY) / cellH);
        const level = row * cols + col + 1;

        if (level >= 1 && level <= 100 && this.isLevelUnlocked(level)) return level;
        return null;
    }

    drawLevelSelect() {
        const cellH = 72;
        const headerH = 70;
        const cols = 5;
        const cellW = this.width / cols;
        const inset = 4;

        // === 배경: 딥 스페이스 그라디언트 ===
        const bg = this.ctx.createLinearGradient(0, 0, 0, this.height);
        bg.addColorStop(0, '#0d0f1e');
        bg.addColorStop(1, '#1a0a2e');
        this.ctx.fillStyle = bg;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // === 헤더 ===
        const headerGrad = this.ctx.createLinearGradient(0, 0, 0, headerH);
        headerGrad.addColorStop(0, '#1e2244');
        headerGrad.addColorStop(1, '#141828');
        this.ctx.fillStyle = headerGrad;
        this.ctx.fillRect(0, 0, this.width, headerH);

        // 헤더 하단 네온 구분선
        const sepGrad = this.ctx.createLinearGradient(0, 0, this.width, 0);
        sepGrad.addColorStop(0, 'rgba(108,99,255,0)');
        sepGrad.addColorStop(0.3, 'rgba(108,99,255,0.9)');
        sepGrad.addColorStop(0.7, 'rgba(255,101,132,0.9)');
        sepGrad.addColorStop(1, 'rgba(255,101,132,0)');
        this.ctx.fillStyle = sepGrad;
        this.ctx.fillRect(0, headerH - 2, this.width, 2);

        // 뒤로가기 필 버튼
        this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
        this.ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.roundRect(8, 18, 76, 32, 16);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.fillStyle = 'rgba(255,255,255,0.85)';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.font = '13px Arial';
        this.ctx.fillText('← Back', 46, 34);

        // 타이틀
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.font = 'bold 20px Arial';
        this.ctx.fillText('SELECT LEVEL', this.width / 2, headerH / 2);

        // === 스크롤 영역 클리핑 ===
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(0, headerH, this.width, this.height - headerH);
        this.ctx.clip();

        for (let i = 0; i < 100; i++) {
            const level = i + 1;
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cellTop = headerH + row * cellH - this.levelSelectScrollY;
            const cellBot = cellTop + cellH;

            if (cellBot < headerH || cellTop > this.height) continue;

            const cx = col * cellW + cellW / 2;
            const cy = cellTop + cellH / 2;

            const record = this.levelRecords.get(level);
            const stars = record ? record.stars : 0;
            const unlocked = this.isLevelUnlocked(level);

            const rx = col * cellW + inset;
            const ry = cellTop + inset;
            const rw = cellW - inset * 2;
            const rh = cellH - inset * 2;

            if (!unlocked) {
                // 잠긴 셀
                const lockGrad = this.ctx.createLinearGradient(rx, ry, rx, ry + rh);
                lockGrad.addColorStop(0, '#131318');
                lockGrad.addColorStop(1, '#0a0a10');
                this.ctx.fillStyle = lockGrad;
                this.ctx.beginPath();
                this.ctx.roundRect(rx, ry, rw, rh, 10);
                this.ctx.fill();

                this.ctx.strokeStyle = 'rgba(255,255,255,0.07)';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.roundRect(rx, ry, rw, rh, 10);
                this.ctx.stroke();

                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillStyle = 'rgba(255,255,255,0.18)';
                this.ctx.font = '12px Arial';
                this.ctx.fillText(`${level}`, cx, cy - 9);
                this.ctx.font = '15px Arial';
                this.ctx.fillText('🔒', cx, cy + 9);
                continue;
            }

            // 3성 셀: 황금 글로우
            if (stars === 3) {
                this.ctx.shadowColor = 'rgba(255,200,50,0.55)';
                this.ctx.shadowBlur = 14;
            }

            // 셀 그라디언트 배경
            const grad = this.ctx.createLinearGradient(rx, ry, rx, ry + rh);
            if (stars === 3) {
                grad.addColorStop(0, '#3d2800');
                grad.addColorStop(1, '#1e1400');
            } else if (stars === 2) {
                grad.addColorStop(0, '#2a2010');
                grad.addColorStop(1, '#141008');
            } else if (stars === 1) {
                grad.addColorStop(0, '#1c3020');
                grad.addColorStop(1, '#0e180f');
            } else {
                grad.addColorStop(0, '#1e2244');
                grad.addColorStop(1, '#121628');
            }
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.roundRect(rx, ry, rw, rh, 10);
            this.ctx.fill();

            this.ctx.shadowBlur = 0;

            // 셀 테두리
            this.ctx.lineWidth = 1;
            if (stars === 3) {
                this.ctx.strokeStyle = 'rgba(255,200,50,0.65)';
            } else if (stars > 0) {
                this.ctx.strokeStyle = 'rgba(100,210,100,0.35)';
            } else {
                this.ctx.strokeStyle = 'rgba(100,120,255,0.25)';
            }
            this.ctx.beginPath();
            this.ctx.roundRect(rx, ry, rw, rh, 10);
            this.ctx.stroke();

            // 레벨 번호
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const textY = stars > 0 ? cy - 9 : cy;

            if (stars === 3) {
                this.ctx.fillStyle = '#FFD700';
            } else if (stars > 0) {
                this.ctx.fillStyle = '#90EE90';
            } else {
                this.ctx.fillStyle = '#b0baff';
            }
            this.ctx.font = 'bold 15px Arial';
            this.ctx.fillText(`${level}`, cx, textY);

            // 별 표시 (채운 별 + 빈 별)
            if (stars > 0) {
                this.ctx.fillStyle = '#FFD700';
                this.ctx.font = '11px Arial';
                this.ctx.fillText('★'.repeat(stars) + '☆'.repeat(3 - stars), cx, cy + 10);
            }
        }

        this.ctx.restore();

        // === 스크롤바 ===
        const totalH = 20 * cellH;
        const maxScrollY = Math.max(0, (headerH + totalH) - this.height);
        if (maxScrollY > 0) {
            const trackH = this.height - headerH - 8;
            const thumbRatio = (this.height - headerH) / (headerH + totalH);
            const thumbH = Math.max(28, trackH * thumbRatio);
            const thumbY = headerH + 4 + (this.levelSelectScrollY / maxScrollY) * (trackH - thumbH);
            this.ctx.fillStyle = 'rgba(255,255,255,0.22)';
            this.ctx.beginPath();
            this.ctx.roundRect(this.width - 5, thumbY, 3, thumbH, 2);
            this.ctx.fill();
        }
    }
}

// Start Game
window.onload = () => {
    new Game();
};