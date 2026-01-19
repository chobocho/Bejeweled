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

enum GameState {
    MENU,
    PLAYING_PUZZLE,
    PLAYING_ZEN,
    PAUSED,
    LEVEL_CLEAR,
    GAME_OVER
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
    private dbVersion = 1;
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
        const tx = this.db.transaction("puzzle_records", "readwrite");
        tx.objectStore("puzzle_records").put(record);
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

    constructor() {
        this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
        this.ctx = this.canvas.getContext("2d")!;
        this.db = new DBManager();
        this.sound = new SoundManager();

        this.resize();
        window.addEventListener("resize", () => this.resize());

        // Input Handling
        this.canvas.addEventListener("mousedown", (e) => this.handleInputStart(e.clientX, e.clientY));
        this.canvas.addEventListener("touchstart", (e) => {
            // e.preventDefault(); // prevents standard scroll, handled by CSS touch-action
            this.handleInputStart(e.touches[0].clientX, e.touches[0].clientY);
        }, {passive: false});

        this.init().then(() => {
            this.loop(0);
        });
    }

    async init() {
        await this.db.init();
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        // Calculate board scale and position
        const boardSize = Math.min(this.width, this.height * 0.8); // Leave space for UI
        this.scale = boardSize / (COLS * GEM_SIZE);
        this.offsetX = (this.width - boardSize) / 2;
        this.offsetY = (this.height - boardSize) / 2 + 50; // Offset for header
    }

    // --- Game Logic ---

    startPuzzle(level: number) {
        this.state = GameState.PLAYING_PUZZLE;
        this.level = level;
        this.score = 0;

        // 난이도 조절: 레벨이 오를수록 시간은 줄고(최소 30초), 목표 점수는 높아짐
        this.maxTime = Math.max(30, 60 - Math.floor((level - 1) / 5) * 2);
        this.timeLeft = this.maxTime;
        this.targetScore = level * 1500;

        // 색상 수 조절: 레벨 10까지 4색, 20까지 5색...
        const colors = Math.min(GEM_COLORS.length, 4 + Math.floor(level / 10));
        this.initGrid(colors);
    }

    async startZen() {
        this.state = GameState.PLAYING_ZEN;
        const saved = await this.db.loadZenState();
        if (saved) {
            this.score = saved.score;
            this.restoreGrid(saved.board);
        } else {
            this.score = 0;
            this.initGrid(5); // Zen is moderate difficulty
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
                const gem = this.createGem(x, y, 7); // Max colors safe
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

    handleInputStart(clientX: number, clientY: number) {
        if (this.isProcessing) return;

        // UI Click Handling (Simple regions)
        if (this.state === GameState.MENU) {
            if (clientY > this.height / 2 - 50 && clientY < this.height / 2) {
                // Puzzle Start (Level 1 or stored max?)
                // For simplicity, showing Level selection could be complex.
                // Let's start at Level 1 or last played logic.
                // Here: Start Level 1
                this.startPuzzle(1);
            } else if (clientY > this.height / 2 + 20 && clientY < this.height / 2 + 70) {
                this.startZen();
            }
            return;
        }

        if (this.state === GameState.LEVEL_CLEAR || this.state === GameState.GAME_OVER) {
            this.state = GameState.MENU;
            return;
        }

        // Pause Button (Top Right)
        if (this.state === GameState.PLAYING_PUZZLE && clientX > this.width - 60 && clientY < 60) {
            this.state = GameState.PAUSED;
            return;
        }
        if (this.state === GameState.PAUSED) {
            this.state = GameState.PLAYING_PUZZLE;
            return;
        }

        // Board Interaction
        const boardSize = COLS * GEM_SIZE * this.scale;
        if (clientX >= this.offsetX && clientX <= this.offsetX + boardSize &&
            clientY >= this.offsetY && clientY <= this.offsetY + boardSize) {

            const gx = Math.floor((clientX - this.offsetX) / (GEM_SIZE * this.scale));
            const gy = Math.floor((clientY - this.offsetY) / (GEM_SIZE * this.scale));

            this.handleGemClick(gx, gy);
        }
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

    async processMatches(matches: Gem[]) {
        this.sound.playMatchSound(matches.length);

        // Remove gems logic
        for (const gem of matches) {
            gem.isMatch = true;
            this.score += 100;
        }

        // Time Bonus (Puzzle Mode)
        if (this.state === GameState.PLAYING_PUZZLE) {
            this.timeLeft = Math.min(this.maxTime, this.timeLeft + matches.length);
        }

        // Wait for disappear
        await new Promise(r => setTimeout(r, 200));

        // Refill logic
        this.applyGravity();
        await new Promise(r => setTimeout(r, 200));

        // Chain Reaction
        const newMatches = this.findMatches();
        if (newMatches.length > 0) {
            await this.processMatches(newMatches);
        }
    }

    applyGravity() {
        for (let x = 0; x < COLS; x++) {
            let emptySlots = 0;
            for (let y = ROWS - 1; y >= 0; y--) {
                if (this.grid[y][x].isMatch) {
                    emptySlots++;
                } else if (emptySlots > 0) {
                    // Move down
                    this.grid[y + emptySlots][x] = this.grid[y][x];
                    this.grid[y + emptySlots][x].y += emptySlots;
                    this.grid[y][x] = null as any; // Temporary
                }
            }
            // Fill top
            for (let y = 0; y < emptySlots; y++) {
                // Determine num colors based on level (if puzzle)
                let colors = 5;
                if(this.state === GameState.PLAYING_PUZZLE) {
                    colors = Math.min(GEM_COLORS.length, 4 + Math.floor(this.level / 10));
                }
                this.grid[y][x] = this.createGem(x, y, colors);
                // Start above screen for animation effect (simplified here just spawn)
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
        const stars = this.score > this.targetScore * 1.5 ? 3 : (this.score > this.targetScore * 1.2 ? 2 : 1);
        this.db.savePuzzleRecord({ level: this.level, stars: stars, highScore: this.score });
        this.state = GameState.LEVEL_CLEAR;

        // Next Level Prep
        setTimeout(() => {
            if (this.level < 100) {
                this.startPuzzle(this.level + 1);
            } else {
                this.state = GameState.MENU; // Game Complete
            }
        }, 3000);
    }

    // --- Rendering ---

    loop(timestamp: number) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        this.update(dt);
        this.draw();

        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt: number) {
        if (this.state === GameState.PLAYING_PUZZLE) {
            this.timeLeft -= dt;
            if (this.timeLeft <= 0) {
                this.state = GameState.GAME_OVER;
            }
            if (this.score >= this.targetScore) {
                this.finishLevel();
            }
        }

        // Animation Interpolation
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
        // Clear
        this.ctx.fillStyle = "#222";
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Header
        this.drawUI();

        // Menu Override
        if (this.state === GameState.MENU) {
            this.drawMenu();
            return;
        }

        // Board Background
        const boardSize = COLS * GEM_SIZE * this.scale;
        this.ctx.fillStyle = "#111";
        this.ctx.fillRect(this.offsetX - 10, this.offsetY - 10, boardSize + 20, boardSize + 20);

        // Gems
        const cellSize = GEM_SIZE * this.scale;
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const gem = this.grid[y][x];
                if (gem && !gem.isMatch) {
                    this.drawGem(gem.drawX, gem.drawY, gem.type, cellSize, gem === this.selectedGem);
                }
            }
        }

        // Overlays
        if (this.state === GameState.PAUSED) {
            this.drawOverlay("PAUSED", "Click to Resume");
        } else if (this.state === GameState.GAME_OVER) {
            this.drawOverlay("GAME OVER", "Click to Menu");
        } else if (this.state === GameState.LEVEL_CLEAR) {
            this.drawOverlay("LEVEL CLEARED!", "Next Level starting...");
        }
    }

    drawGem(x: number, y: number, type: number, size: number, isSelected: boolean) {
        const px = this.offsetX + x * size;
        const py = this.offsetY + y * size;
        const pad = size * 0.1;

        this.ctx.fillStyle = GEM_COLORS[type];

        // Shape variations based on type (optional, for accessibility)
        this.ctx.beginPath();
        if (type % 2 === 0) {
            // Circle-ish
            this.ctx.arc(px + size/2, py + size/2, size/2 - pad, 0, Math.PI * 2);
        } else {
            // Rect
            this.ctx.rect(px + pad, py + pad, size - pad*2, size - pad*2);
        }
        this.ctx.fill();

        // Shine
        this.ctx.fillStyle = "rgba(255,255,255,0.3)";
        this.ctx.beginPath();
        this.ctx.arc(px + size/3, py + size/3, size/6, 0, Math.PI * 2);
        this.ctx.fill();

        if (isSelected) {
            this.ctx.strokeStyle = "white";
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(px, py, size, size);
        }
    }

    drawUI() {
        this.ctx.fillStyle = "white";
        this.ctx.font = "20px Arial";
        this.ctx.textAlign = "left";
        this.ctx.fillText(`Score: ${this.score}`, 20, 40);

        if (this.state === GameState.PLAYING_PUZZLE) {
            this.ctx.textAlign = "center";
            this.ctx.fillText(`Level: ${this.level}`, this.width / 2, 40);

            // Time Bar
            this.ctx.fillStyle = "#444";
            this.ctx.fillRect(20, 60, this.width - 40, 10);
            const timeRatio = Math.max(0, this.timeLeft / this.maxTime);
            this.ctx.fillStyle = timeRatio > 0.3 ? "green" : "red";
            this.ctx.fillRect(20, 60, (this.width - 40) * timeRatio, 10);

            // Pause Button
            this.ctx.fillStyle = "white";
            this.ctx.textAlign = "right";
            this.ctx.fillText("||", this.width - 20, 40);
        }
    }

    drawMenu() {
        this.ctx.fillStyle = "rgba(0,0,0,0.8)";
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.ctx.fillStyle = "white";
        this.ctx.textAlign = "center";

        this.ctx.font = "bold 40px Arial";
        this.ctx.fillText("GEM PUZZLE", this.width / 2, this.height / 3);

        // Buttons
        this.ctx.fillStyle = "#4CAF50";
        this.ctx.fillRect(this.width / 2 - 100, this.height / 2 - 50, 200, 50);
        this.ctx.fillStyle = "white";
        this.ctx.font = "20px Arial";
        this.ctx.fillText("PUZZLE MODE", this.width / 2, this.height / 2 - 18);

        this.ctx.fillStyle = "#2196F3";
        this.ctx.fillRect(this.width / 2 - 100, this.height / 2 + 20, 200, 50);
        this.ctx.fillStyle = "white";
        this.ctx.fillText("ZEN MODE", this.width / 2, this.height / 2 + 52);
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
}

// Start Game
window.onload = () => {
    new Game();
};