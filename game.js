var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
})(GameState || (GameState = {}));
var GemType;
(function (GemType) {
    GemType[GemType["RED"] = 0] = "RED";
    GemType[GemType["GREEN"] = 1] = "GREEN";
    GemType[GemType["BLUE"] = 2] = "BLUE";
    GemType[GemType["YELLOW"] = 3] = "YELLOW";
    GemType[GemType["MAGENTA"] = 4] = "MAGENTA";
    GemType[GemType["CYAN"] = 5] = "CYAN";
    GemType[GemType["WHITE"] = 6] = "WHITE";
})(GemType || (GemType = {}));
// ==========================================
// 2. 사운드 관리자 (Web Audio API)
// ==========================================
class SoundManager {
    constructor() {
        this.ctx = null;
        try {
            // @ts-ignore
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        catch (e) {
            console.error("Web Audio API not supported");
        }
    }
    playMatchSound(count) {
        if (!this.ctx)
            return;
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
        if (!this.ctx)
            return;
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
    constructor() {
        this.dbName = "GemPuzzleDB";
        this.dbVersion = 1;
        this.db = null;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains("puzzle_records")) {
                        db.createObjectStore("puzzle_records", { keyPath: "level" });
                    }
                    if (!db.objectStoreNames.contains("zen_save")) {
                        db.createObjectStore("zen_save", { keyPath: "id" });
                    }
                };
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve();
                };
                request.onerror = (event) => reject(event);
            });
        });
    }
    savePuzzleRecord(record) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.db)
                return;
            const tx = this.db.transaction("puzzle_records", "readwrite");
            tx.objectStore("puzzle_records").put(record);
        });
    }
    getPuzzleRecord(level) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.db)
                return undefined;
            return new Promise((resolve) => {
                const tx = this.db.transaction("puzzle_records", "readonly");
                const req = tx.objectStore("puzzle_records").get(level);
                req.onsuccess = () => resolve(req.result);
            });
        });
    }
    saveZenState(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.db)
                return;
            const tx = this.db.transaction("zen_save", "readwrite");
            tx.objectStore("zen_save").put(Object.assign({ id: "current" }, data));
        });
    }
    loadZenState() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.db)
                return undefined;
            return new Promise((resolve) => {
                const tx = this.db.transaction("zen_save", "readonly");
                const req = tx.objectStore("zen_save").get("current");
                req.onsuccess = () => resolve(req.result);
            });
        });
    }
}
// ==========================================
// 4. 게임 엔진 (Game Engine)
// ==========================================
class Game {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.state = GameState.MENU;
        // Game Data
        this.grid = [];
        this.selectedGem = null;
        this.score = 0;
        // Puzzle Mode Data
        this.level = 1;
        this.timeLeft = 0;
        this.maxTime = 0;
        this.targetScore = 0;
        // Animation flags
        this.isProcessing = false;
        this.lastTime = 0;
        this.canvas = document.getElementById("gameCanvas");
        this.ctx = this.canvas.getContext("2d");
        this.db = new DBManager();
        this.sound = new SoundManager();
        this.resize();
        window.addEventListener("resize", () => this.resize());
        // Input Handling
        this.canvas.addEventListener("mousedown", (e) => this.handleInputStart(e.clientX, e.clientY));
        this.canvas.addEventListener("touchstart", (e) => {
            // e.preventDefault(); // prevents standard scroll, handled by CSS touch-action
            this.handleInputStart(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });
        this.init().then(() => {
            this.loop(0);
        });
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.init();
        });
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
    startPuzzle(level) {
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
    startZen() {
        return __awaiter(this, void 0, void 0, function* () {
            this.state = GameState.PLAYING_ZEN;
            const saved = yield this.db.loadZenState();
            if (saved) {
                this.score = saved.score;
                this.restoreGrid(saved.board);
            }
            else {
                this.score = 0;
                this.initGrid(5); // Zen is moderate difficulty
            }
        });
    }
    initGrid(numColors) {
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
    restoreGrid(typeBoard) {
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
    createGem(x, y, numColors) {
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
    checkMatchAt(x, y) {
        const type = this.grid[y][x].type;
        // Horizontal
        if (x >= 2 && this.grid[y][x - 1].type === type && this.grid[y][x - 2].type === type)
            return true;
        // Vertical
        if (y >= 2 && this.grid[y - 1][x].type === type && this.grid[y - 2][x].type === type)
            return true;
        return false;
    }
    handleInputStart(clientX, clientY) {
        if (this.isProcessing)
            return;
        // UI Click Handling (Simple regions)
        if (this.state === GameState.MENU) {
            if (clientY > this.height / 2 - 50 && clientY < this.height / 2) {
                // Puzzle Start (Level 1 or stored max?)
                // For simplicity, showing Level selection could be complex.
                // Let's start at Level 1 or last played logic.
                // Here: Start Level 1
                this.startPuzzle(1);
            }
            else if (clientY > this.height / 2 + 20 && clientY < this.height / 2 + 70) {
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
    handleGemClick(x, y) {
        this.sound.playSelectSound();
        if (!this.selectedGem) {
            this.selectedGem = { x, y };
        }
        else {
            const sx = this.selectedGem.x;
            const sy = this.selectedGem.y;
            // Check adjacency
            if (Math.abs(sx - x) + Math.abs(sy - y) === 1) {
                this.swapGems(sx, sy, x, y);
            }
            this.selectedGem = null;
        }
    }
    swapGems(x1, y1, x2, y2) {
        return __awaiter(this, void 0, void 0, function* () {
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
            yield new Promise(r => setTimeout(r, 200));
            const matches = this.findMatches();
            if (matches.length > 0) {
                yield this.processMatches(matches);
            }
            else {
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
        });
    }
    findMatches() {
        let matchedGems = new Set();
        // Horizontal
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS - 2; x++) {
                const type = this.grid[y][x].type;
                if (this.grid[y][x + 1].type === type && this.grid[y][x + 2].type === type) {
                    matchedGems.add(this.grid[y][x]);
                    matchedGems.add(this.grid[y][x + 1]);
                    matchedGems.add(this.grid[y][x + 2]);
                }
            }
        }
        // Vertical
        for (let x = 0; x < COLS; x++) {
            for (let y = 0; y < ROWS - 2; y++) {
                const type = this.grid[y][x].type;
                if (this.grid[y + 1][x].type === type && this.grid[y + 2][x].type === type) {
                    matchedGems.add(this.grid[y][x]);
                    matchedGems.add(this.grid[y + 1][x]);
                    matchedGems.add(this.grid[y + 2][x]);
                }
            }
        }
        return Array.from(matchedGems);
    }
    processMatches(matches) {
        return __awaiter(this, void 0, void 0, function* () {
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
            yield new Promise(r => setTimeout(r, 200));
            // Refill logic
            this.applyGravity();
            yield new Promise(r => setTimeout(r, 200));
            // Chain Reaction
            const newMatches = this.findMatches();
            if (newMatches.length > 0) {
                yield this.processMatches(newMatches);
            }
        });
    }
    applyGravity() {
        for (let x = 0; x < COLS; x++) {
            let emptySlots = 0;
            for (let y = ROWS - 1; y >= 0; y--) {
                if (this.grid[y][x].isMatch) {
                    emptySlots++;
                }
                else if (emptySlots > 0) {
                    // Move down
                    this.grid[y + emptySlots][x] = this.grid[y][x];
                    this.grid[y + emptySlots][x].y += emptySlots;
                    this.grid[y][x] = null; // Temporary
                }
            }
            // Fill top
            for (let y = 0; y < emptySlots; y++) {
                // Determine num colors based on level (if puzzle)
                let colors = 5;
                if (this.state === GameState.PLAYING_PUZZLE) {
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
            }
            else {
                this.state = GameState.MENU; // Game Complete
            }
        }, 3000);
    }
    // --- Rendering ---
    loop(timestamp) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        this.update(dt);
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    }
    update(dt) {
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
        // 수정된 부분: grid가 초기화되지 않았거나 행이 없으면 건너뜀
        if (this.grid.length === 0)
            return;
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
        }
        else if (this.state === GameState.GAME_OVER) {
            this.drawOverlay("GAME OVER", "Click to Menu");
        }
        else if (this.state === GameState.LEVEL_CLEAR) {
            this.drawOverlay("LEVEL CLEARED!", "Next Level starting...");
        }
    }
    drawGem(x, y, type, size, isSelected) {
        const px = this.offsetX + x * size;
        const py = this.offsetY + y * size;
        const pad = size * 0.1;
        this.ctx.fillStyle = GEM_COLORS[type];
        // Shape variations based on type (optional, for accessibility)
        this.ctx.beginPath();
        if (type % 2 === 0) {
            // Circle-ish
            this.ctx.arc(px + size / 2, py + size / 2, size / 2 - pad, 0, Math.PI * 2);
        }
        else {
            // Rect
            this.ctx.rect(px + pad, py + pad, size - pad * 2, size - pad * 2);
        }
        this.ctx.fill();
        // Shine
        this.ctx.fillStyle = "rgba(255,255,255,0.3)";
        this.ctx.beginPath();
        this.ctx.arc(px + size / 3, py + size / 3, size / 6, 0, Math.PI * 2);
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
    drawOverlay(title, subtitle) {
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
