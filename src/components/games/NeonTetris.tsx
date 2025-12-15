import { useRef, useEffect, useState, useCallback } from 'react';
import { useAccount, useReadContracts, useConnect, useConnectors, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, encodeAbiParameters } from 'viem';
import { useHomaCore } from '../../hooks/useHomaCore';
import { useEthPrice } from '../../hooks/useEthPrice';
import { HOMA_CORE_ADDRESS, HOMA_CORE_ABI, GAME_ADAPTER_ADDRESS } from '../../contracts/abi';

const SONEIUM_MINATO_CHAIN_ID = 1946;

interface NeonTetrisProps {
  onBack: () => void;
}

interface ProjectData {
  id: number;
  name: string;
  isOpen: boolean;
}

type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

interface Tetromino {
  type: TetrominoType;
  shape: number[][];
  x: number;
  y: number;
}

const COLS = 10;
const ROWS = 20;
const HEADER_HEIGHT = 44;

const COLORS: Record<TetrominoType, { main: string; glow: string }> = {
  I: { main: '#00f0ff', glow: '0 0 15px #00f0ff, 0 0 30px #00f0ff' },
  O: { main: '#ffd700', glow: '0 0 15px #ffd700, 0 0 30px #ffd700' },
  T: { main: '#a855f7', glow: '0 0 15px #a855f7, 0 0 30px #a855f7' },
  S: { main: '#22c55e', glow: '0 0 15px #22c55e, 0 0 30px #22c55e' },
  Z: { main: '#ef4444', glow: '0 0 15px #ef4444, 0 0 30px #ef4444' },
  J: { main: '#3b82f6', glow: '0 0 15px #3b82f6, 0 0 30px #3b82f6' },
  L: { main: '#f97316', glow: '0 0 15px #f97316, 0 0 30px #f97316' },
};

const SHAPES: Record<TetrominoType, number[][]> = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
};

const TETROMINO_TYPES: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

function shadeColor(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;
  return (
    '#' +
    (0x1000000 + (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 + (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 + (B < 255 ? (B < 1 ? 0 : B) : 255))
      .toString(16)
      .slice(1)
  );
}

export function NeonTetris({ onBack }: NeonTetrisProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>();
  const lastDropRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [screen, setScreen] = useState<'start' | 'playing' | 'paused' | 'gameover'>('start');
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [linesCleared, setLinesCleared] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('homa_tetris_highscore');
    return saved ? parseInt(saved) : 0;
  });
  const [donationAmount, setDonationAmount] = useState(1);
  const [selectedProject, setSelectedProject] = useState(0);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [holdUnlocked, setHoldUnlocked] = useState(false);
  const [futureSightUnlocked, setFutureSightUnlocked] = useState(false);
  const [timeFreezeActive, setTimeFreezeActive] = useState(false);
  const [timeFreezeEndTime, setTimeFreezeEndTime] = useState(0);
  const [flashOverlay, setFlashOverlay] = useState<string | null>(null);

  const [powerupMenuOpen, setPowerupMenuOpen] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingPowerup, setPendingPowerup] = useState<{ action: string; cost: number } | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const wasRunningRef = useRef(false);

  const [blockSize, setBlockSize] = useState(28);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });

  const gridRef = useRef<(TetrominoType | null)[][]>(
    Array(ROWS).fill(null).map(() => Array(COLS).fill(null))
  );
  const currentPieceRef = useRef<Tetromino | null>(null);
  const nextQueueRef = useRef<TetrominoType[]>([]);
  const heldPieceRef = useRef<TetrominoType | null>(null);
  const canHoldRef = useRef(true);
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const linesClearedRef = useRef(0);
  const isRunningRef = useRef(false);
  const flashingLinesRef = useRef<number[]>([]);
  const flashStartRef = useRef<number>(0);
  const timeFreezeActiveRef = useRef(false);
  const timeFreezeEndRef = useRef(0);
  const blockSizeRef = useRef(28);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastMoveXRef = useRef(0);
  const freezeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { connect } = useConnect();
  const connectors = useConnectors();
  const { donate, isPending, isConfirming, userAccumulation, projectCount, reset } = useHomaCore(address);
  const { usdToEth } = useEthPrice();
  
  const { writeContractAsync, isPending: isPowerupPending } = useWriteContract();
  const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: txHash });
  
  const isCorrectNetwork = chainId === SONEIUM_MINATO_CHAIN_ID;

  const handleConnectWallet = useCallback(() => {
    if (connectors.length > 0) {
      connect({ connector: connectors[0] });
    }
  }, [connect, connectors]);

  const ethCost = usdToEth(donationAmount);
  const userTickets = userAccumulation ? Number(userAccumulation[1]) : 0;
  const userCents = userAccumulation ? Number(userAccumulation[0]) : 0;
  const centsToNextTicket = 100 - (userCents % 100);

  const projectCalls = projectCount ? Array.from({ length: Number(projectCount) }, (_, i) => ({
    address: HOMA_CORE_ADDRESS as `0x${string}`,
    abi: HOMA_CORE_ABI,
    functionName: 'getProject' as const,
    args: [BigInt(i)]
  })) : [];

  const { data: projectsData } = useReadContracts({
    contracts: projectCalls,
    query: { enabled: projectCalls.length > 0 }
  });

  useEffect(() => {
    if (projectsData) {
      const loadedProjects: ProjectData[] = [];
      projectsData.forEach((result: { status: string; result?: unknown }, i: number) => {
        if (result.status === 'success' && result.result) {
          const [name, , , , , isOpen] = result.result as [string, string, bigint, bigint, boolean, boolean];
          loadedProjects.push({
            id: i,
            name: name || `Project ${i + 1}`,
            isOpen
          });
        }
      });
      setProjects(loadedProjects);
      if (loadedProjects.length > 0) {
        const firstOpen = loadedProjects.find(p => p.isOpen);
        if (firstOpen) setSelectedProject(firstOpen.id);
      }
    }
  }, [projectsData]);

  useEffect(() => {
    const calculateBlockSize = () => {
      const availableHeight = window.innerHeight - HEADER_HEIGHT;
      const availableWidth = window.innerWidth;
      const blockFromHeight = Math.floor(availableHeight / ROWS);
      const blockFromWidth = Math.floor(availableWidth / COLS);
      const computedSize = Math.min(blockFromHeight, blockFromWidth);
      const newBlockSize = Math.max(12, computedSize);
      const canvasWidth = newBlockSize * COLS;
      const offsetX = Math.floor((availableWidth - canvasWidth) / 2);
      setBlockSize(newBlockSize);
      blockSizeRef.current = newBlockSize;
      setCanvasOffset({ x: offsetX, y: 0 });
    };
    calculateBlockSize();
    window.addEventListener('resize', calculateBlockSize);
    return () => window.removeEventListener('resize', calculateBlockSize);
  }, []);

  const playTone = useCallback((freq: number, type: OscillatorType, duration: number) => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }, [soundEnabled]);

  const playSFX = useCallback((effect: string) => {
    if (effect === 'move') playTone(200, 'sine', 0.05);
    if (effect === 'rotate') playTone(400, 'sine', 0.08);
    if (effect === 'drop') playTone(100, 'square', 0.1);
    if (effect === 'clear') {
      playTone(600, 'square', 0.1);
      setTimeout(() => playTone(800, 'square', 0.1), 100);
    }
    if (effect === 'tetris') {
      playTone(600, 'square', 0.1);
      setTimeout(() => playTone(800, 'square', 0.1), 100);
      setTimeout(() => playTone(1000, 'square', 0.15), 200);
    }
    if (effect === 'gameover') {
      playTone(200, 'sawtooth', 0.3);
      setTimeout(() => playTone(150, 'sawtooth', 0.3), 200);
      setTimeout(() => playTone(100, 'sawtooth', 0.5), 400);
    }
    if (effect === 'powerup') {
      playTone(800, 'sine', 0.1);
      setTimeout(() => playTone(1000, 'sine', 0.1), 100);
      setTimeout(() => playTone(1200, 'sine', 0.15), 200);
    }
    if (effect === 'tnt') {
      playTone(80, 'square', 0.2);
      setTimeout(() => playTone(60, 'square', 0.3), 100);
    }
  }, [playTone]);

  const vibrate = useCallback((pattern: number | number[]) => {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }, []);

  const createPiece = useCallback((type: TetrominoType): Tetromino => {
    const shape = SHAPES[type].map(row => [...row]);
    return {
      type,
      shape,
      x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
      y: 0,
    };
  }, []);

  const getRandomPiece = useCallback((): TetrominoType => {
    return TETROMINO_TYPES[Math.floor(Math.random() * TETROMINO_TYPES.length)];
  }, []);

  const fillNextQueue = useCallback(() => {
    while (nextQueueRef.current.length < 3) {
      nextQueueRef.current.push(getRandomPiece());
    }
  }, [getRandomPiece]);

  const collision = useCallback((piece: Tetromino, grid: (TetrominoType | null)[][], offsetX = 0, offsetY = 0): boolean => {
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const newX = piece.x + x + offsetX;
          const newY = piece.y + y + offsetY;
          if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
          if (newY >= 0 && grid[newY][newX]) return true;
        }
      }
    }
    return false;
  }, []);

  const rotate = useCallback((piece: Tetromino): number[][] => {
    const rows = piece.shape.length;
    const cols = piece.shape[0].length;
    const rotated: number[][] = [];
    for (let x = 0; x < cols; x++) {
      rotated[x] = [];
      for (let y = rows - 1; y >= 0; y--) {
        rotated[x][rows - 1 - y] = piece.shape[y][x];
      }
    }
    return rotated;
  }, []);

  const getGhostY = useCallback((piece: Tetromino, grid: (TetrominoType | null)[][]): number => {
    let ghostY = piece.y;
    while (!collision({ ...piece, y: ghostY + 1 }, grid)) {
      ghostY++;
    }
    return ghostY;
  }, [collision]);

  const lockPiece = useCallback((piece: Tetromino, grid: (TetrominoType | null)[][]) => {
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const gridY = piece.y + y;
          const gridX = piece.x + x;
          if (gridY >= 0 && gridY < ROWS && gridX >= 0 && gridX < COLS) {
            grid[gridY][gridX] = piece.type;
          }
        }
      }
    }
    canHoldRef.current = true;
  }, []);

  const clearLines = useCallback((grid: (TetrominoType | null)[][]): number[] => {
    const linesToClear: number[] = [];
    for (let y = 0; y < ROWS; y++) {
      if (grid[y].every(cell => cell !== null)) {
        linesToClear.push(y);
      }
    }
    return linesToClear;
  }, []);

  const removeLines = useCallback((grid: (TetrominoType | null)[][], lines: number[]) => {
    lines.sort((a, b) => b - a);
    for (const line of lines) {
      grid.splice(line, 1);
      grid.unshift(Array(COLS).fill(null));
    }
  }, []);

  const calculateScore = useCallback((lines: number): number => {
    const scores = [0, 100, 300, 500, 800];
    return scores[lines] * levelRef.current;
  }, []);

  const resetGame = useCallback(() => {
    gridRef.current = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
    nextQueueRef.current = [];
    fillNextQueue();
    currentPieceRef.current = createPiece(nextQueueRef.current.shift()!);
    fillNextQueue();
    heldPieceRef.current = null;
    canHoldRef.current = true;
    scoreRef.current = 0;
    levelRef.current = 1;
    linesClearedRef.current = 0;
    flashingLinesRef.current = [];
    setScore(0);
    setLevel(1);
    setLinesCleared(0);
    setHoldUnlocked(false);
    setFutureSightUnlocked(false);
    setTimeFreezeActive(false);
    timeFreezeActiveRef.current = false;
  }, [createPiece, fillNextQueue]);

  const startGame = useCallback(() => {
    resetGame();
    isRunningRef.current = true;
    setScreen('playing');
    lastDropRef.current = performance.now();
  }, [resetGame]);

  const gameLoopFnRef = useRef<((timestamp: number) => void) | null>(null);

  const resumeGame = useCallback(() => {
    if (!isRunningRef.current) {
      isRunningRef.current = true;
      lastDropRef.current = performance.now();
      if (gameLoopFnRef.current) {
        gameLoopRef.current = requestAnimationFrame(gameLoopFnRef.current);
      }
    }
    setScreen('playing');
  }, []);

  const gameOver = useCallback(() => {
    isRunningRef.current = false;
    playSFX('gameover');
    vibrate([100, 50, 100, 50, 200]);
    if (scoreRef.current > highScore) {
      setHighScore(scoreRef.current);
      localStorage.setItem('homa_tetris_highscore', scoreRef.current.toString());
    }
    setScreen('gameover');
  }, [highScore, playSFX, vibrate]);

  const moveLeft = useCallback(() => {
    const piece = currentPieceRef.current;
    if (!piece || !isRunningRef.current) return;
    if (!collision(piece, gridRef.current, -1, 0)) {
      piece.x--;
      playSFX('move');
    }
  }, [collision, playSFX]);

  const moveRight = useCallback(() => {
    const piece = currentPieceRef.current;
    if (!piece || !isRunningRef.current) return;
    if (!collision(piece, gridRef.current, 1, 0)) {
      piece.x++;
      playSFX('move');
    }
  }, [collision, playSFX]);

  const moveDown = useCallback(() => {
    const piece = currentPieceRef.current;
    if (!piece || !isRunningRef.current) return;
    if (!collision(piece, gridRef.current, 0, 1)) {
      piece.y++;
      return true;
    }
    return false;
  }, [collision]);

  const rotatePiece = useCallback(() => {
    const piece = currentPieceRef.current;
    if (!piece || !isRunningRef.current) return;

    const rotated = rotate(piece);
    const testPiece = { ...piece, shape: rotated };

    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (!collision({ ...testPiece, x: testPiece.x + kick }, gridRef.current)) {
        piece.shape = rotated;
        piece.x += kick;
        playSFX('rotate');
        return;
      }
    }
  }, [collision, rotate, playSFX]);

  const hardDrop = useCallback(() => {
    const piece = currentPieceRef.current;
    if (!piece || !isRunningRef.current) return;

    const ghostY = getGhostY(piece, gridRef.current);
    const dropDistance = ghostY - piece.y;
    piece.y = ghostY;
    scoreRef.current += dropDistance * 2;
    setScore(scoreRef.current);
    playSFX('drop');
    vibrate(50);

    lockPiece(piece, gridRef.current);

    const linesToClear = clearLines(gridRef.current);
    if (linesToClear.length > 0) {
      flashingLinesRef.current = linesToClear;
      flashStartRef.current = performance.now();
      if (linesToClear.length === 4) {
        playSFX('tetris');
        vibrate([100, 50, 100, 50, 100]);
      } else {
        playSFX('clear');
        vibrate([50, 30, 50]);
      }
    } else {
      currentPieceRef.current = createPiece(nextQueueRef.current.shift()!);
      fillNextQueue();

      if (collision(currentPieceRef.current, gridRef.current)) {
        gameOver();
      }
    }
  }, [getGhostY, lockPiece, clearLines, createPiece, fillNextQueue, collision, gameOver, playSFX, vibrate]);

  const holdPiece = useCallback(() => {
    if (!holdUnlocked || !canHoldRef.current || !isRunningRef.current) return;
    const piece = currentPieceRef.current;
    if (!piece) return;

    canHoldRef.current = false;
    const currentType = piece.type;

    if (heldPieceRef.current) {
      currentPieceRef.current = createPiece(heldPieceRef.current);
    } else {
      currentPieceRef.current = createPiece(nextQueueRef.current.shift()!);
      fillNextQueue();
    }
    heldPieceRef.current = currentType;
    playSFX('rotate');
  }, [holdUnlocked, createPiece, fillNextQueue, playSFX]);

  const initiatePayment = useCallback((costUsd: number, action: string) => {
    if (!isConnected) return;

    const openProject = projects.find(p => p.id === selectedProject && p.isOpen);
    if (!openProject) return;

    wasRunningRef.current = isRunningRef.current;
    isRunningRef.current = false;

    setPendingPowerup({ action, cost: costUsd });
    setShowPaymentModal(true);
    setPowerupMenuOpen(false);
  }, [isConnected, projects, selectedProject]);

  const cancelPayment = useCallback(() => {
    setShowPaymentModal(false);
    setPendingPowerup(null);
    if (wasRunningRef.current) {
      resumeGame();
    }
  }, [resumeGame]);

  const applyPowerupEffect = useCallback((action: string) => {
    playSFX('powerup');
    vibrate([50, 30, 50, 30, 50]);

    if (action === 'tnt') {
      setFlashOverlay('rgba(255, 100, 0, 0.4)');
      setTimeout(() => setFlashOverlay(null), 150);
      const grid = gridRef.current;
      for (let i = 0; i < 3; i++) {
        if (grid.length > 0) {
          grid.pop();
          grid.unshift(Array(COLS).fill(null));
        }
      }
      playSFX('tnt');
    } else if (action === 'freeze') {
      if (freezeTimeoutRef.current) {
        clearTimeout(freezeTimeoutRef.current);
      }
      const endTime = Date.now() + 15000;
      setTimeFreezeActive(true);
      setTimeFreezeEndTime(endTime);
      timeFreezeActiveRef.current = true;
      timeFreezeEndRef.current = endTime;
      freezeTimeoutRef.current = setTimeout(() => {
        setTimeFreezeActive(false);
        timeFreezeActiveRef.current = false;
        freezeTimeoutRef.current = null;
      }, 15000);
    } else if (action === 'hold') {
      setHoldUnlocked(true);
    } else if (action === 'future') {
      setFutureSightUnlocked(true);
    }
  }, [playSFX, vibrate]);

  const confirmPayment = useCallback(async () => {
    if (!pendingPowerup) return;

    try {
      const ethAmount = usdToEth(pendingPowerup.cost);
      const usdCents = Math.round(pendingPowerup.cost * 100);
      
      const gameData = encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }, { type: 'string' }],
        [BigInt(scoreRef.current), BigInt(levelRef.current), 'tetris']
      );
      
      const hash = await writeContractAsync({
        address: HOMA_CORE_ADDRESS,
        abi: HOMA_CORE_ABI,
        functionName: 'donate',
        args: [
          BigInt(selectedProject),
          true,
          BigInt(usdCents),
          GAME_ADAPTER_ADDRESS as `0x${string}`,
          gameData
        ],
        value: parseEther(ethAmount.toFixed(18))
      });
      
      setTxHash(hash);
    } catch (err) {
      console.error('Power-up purchase failed:', err);
      cancelPayment();
    }
  }, [pendingPowerup, selectedProject, usdToEth, writeContractAsync, cancelPayment]);

  useEffect(() => {
    if (isTxConfirmed && pendingPowerup && txHash) {
      applyPowerupEffect(pendingPowerup.action);
      
      setShowPaymentModal(false);
      setPendingPowerup(null);
      setTxHash(undefined);
      
      if (wasRunningRef.current) {
        resumeGame();
      }
    }
  }, [isTxConfirmed, pendingPowerup, txHash, applyPowerupEffect, resumeGame]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (screen !== 'playing') return;
    e.preventDefault();
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };
    lastMoveXRef.current = 0;
  }, [screen]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (screen !== 'playing' || !touchStartRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;

    const swipeThreshold = Math.max(20, blockSizeRef.current);
    const cellsMoved = Math.floor(deltaX / swipeThreshold);
    const cellsDiff = cellsMoved - lastMoveXRef.current;

    if (cellsDiff > 0) {
      for (let i = 0; i < cellsDiff; i++) moveRight();
      lastMoveXRef.current = cellsMoved;
    } else if (cellsDiff < 0) {
      for (let i = 0; i < Math.abs(cellsDiff); i++) moveLeft();
      lastMoveXRef.current = cellsMoved;
    }
  }, [screen, moveLeft, moveRight]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (screen !== 'playing' || !touchStartRef.current) return;
    e.preventDefault();

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;
    const bs = blockSizeRef.current;

    const tapThreshold = Math.max(10, bs * 0.5);
    const swipeDownThreshold = Math.max(40, bs * 2);
    const swipeXTolerance = Math.max(30, bs * 1.5);

    const isTap = elapsed < 200 && Math.abs(deltaX) < tapThreshold && Math.abs(deltaY) < tapThreshold;
    const isSwipeDown = deltaY > swipeDownThreshold && Math.abs(deltaX) < swipeXTolerance;
    const isFastSwipe = elapsed < 200;

    if (isTap) {
      rotatePiece();
    } else if (isSwipeDown) {
      if (isFastSwipe) {
        hardDrop();
      } else {
        for (let i = 0; i < 3; i++) moveDown();
      }
    }

    touchStartRef.current = null;
    lastMoveXRef.current = 0;
  }, [screen, rotatePiece, hardDrop, moveDown]);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const bs = blockSizeRef.current;
    const canvasWidth = COLS * bs;
    const canvasHeight = ROWS * bs;

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (flashOverlay) {
      ctx.fillStyle = flashOverlay;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * bs, 0);
      ctx.lineTo(x * bs, canvasHeight);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * bs);
      ctx.lineTo(canvasWidth, y * bs);
      ctx.stroke();
    }

    const flashProgress = flashingLinesRef.current.length > 0
      ? (performance.now() - flashStartRef.current) / 200
      : 0;

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = gridRef.current[y][x];
        if (cell) {
          const isFlashing = flashingLinesRef.current.includes(y);
          if (isFlashing && flashProgress < 1) {
            ctx.fillStyle = `rgba(255, 255, 255, ${1 - flashProgress})`;
          } else {
            const color = COLORS[cell];
            const gradient = ctx.createLinearGradient(
              x * bs, y * bs,
              (x + 1) * bs, (y + 1) * bs
            );
            gradient.addColorStop(0, color.main);
            gradient.addColorStop(1, shadeColor(color.main, -30));
            ctx.fillStyle = gradient;
          }
          ctx.fillRect(x * bs + 1, y * bs + 1, bs - 2, bs - 2);

          if (!isFlashing || flashProgress >= 1) {
            ctx.strokeStyle = COLORS[cell].main;
            ctx.lineWidth = 2;
            ctx.shadowColor = COLORS[cell].main;
            ctx.shadowBlur = 8;
            ctx.strokeRect(x * bs + 2, y * bs + 2, bs - 4, bs - 4);
            ctx.shadowBlur = 0;
          }
        }
      }
    }

    const piece = currentPieceRef.current;
    if (piece && isRunningRef.current) {
      const ghostY = getGhostY(piece, gridRef.current);
      for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
          if (piece.shape[y][x]) {
            const drawX = (piece.x + x) * bs;
            const drawY = (ghostY + y) * bs;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(drawX + 1, drawY + 1, bs - 2, bs - 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(drawX + 2, drawY + 2, bs - 4, bs - 4);
          }
        }
      }

      const color = COLORS[piece.type];
      for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
          if (piece.shape[y][x]) {
            const drawX = (piece.x + x) * bs;
            const drawY = (piece.y + y) * bs;

            const gradient = ctx.createLinearGradient(
              drawX, drawY,
              drawX + bs, drawY + bs
            );
            gradient.addColorStop(0, color.main);
            gradient.addColorStop(1, shadeColor(color.main, -30));
            ctx.fillStyle = gradient;
            ctx.fillRect(drawX + 1, drawY + 1, bs - 2, bs - 2);

            ctx.strokeStyle = color.main;
            ctx.lineWidth = 2;
            ctx.shadowColor = color.main;
            ctx.shadowBlur = 12;
            ctx.strokeRect(drawX + 2, drawY + 2, bs - 4, bs - 4);
            ctx.shadowBlur = 0;
          }
        }
      }
    }
  }, [getGhostY, flashOverlay]);

  const gameLoop = useCallback((timestamp: number) => {
    if (!isRunningRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (flashingLinesRef.current.length > 0) {
      const flashDuration = 200;
      if (timestamp - flashStartRef.current >= flashDuration) {
        const points = calculateScore(flashingLinesRef.current.length);
        scoreRef.current += points;
        linesClearedRef.current += flashingLinesRef.current.length;
        setScore(scoreRef.current);
        setLinesCleared(linesClearedRef.current);

        const newLevel = Math.floor(linesClearedRef.current / 10) + 1;
        if (newLevel > levelRef.current) {
          levelRef.current = newLevel;
          setLevel(newLevel);
        }

        removeLines(gridRef.current, flashingLinesRef.current);
        flashingLinesRef.current = [];

        currentPieceRef.current = createPiece(nextQueueRef.current.shift()!);
        fillNextQueue();

        if (collision(currentPieceRef.current, gridRef.current)) {
          gameOver();
          draw(ctx);
          return;
        }
      }
    }

    let dropInterval = Math.max(100, 1000 - (levelRef.current - 1) * 100);
    if (timeFreezeActiveRef.current && Date.now() < timeFreezeEndRef.current) {
      dropInterval *= 4;
    }

    if (flashingLinesRef.current.length === 0 && timestamp - lastDropRef.current >= dropInterval) {
      const piece = currentPieceRef.current;
      if (piece) {
        if (!moveDown()) {
          lockPiece(piece, gridRef.current);

          const linesToClear = clearLines(gridRef.current);
          if (linesToClear.length > 0) {
            flashingLinesRef.current = linesToClear;
            flashStartRef.current = timestamp;
            if (linesToClear.length === 4) {
              playSFX('tetris');
              vibrate([100, 50, 100, 50, 100]);
            } else {
              playSFX('clear');
              vibrate([50, 30, 50]);
            }
          } else {
            currentPieceRef.current = createPiece(nextQueueRef.current.shift()!);
            fillNextQueue();

            if (collision(currentPieceRef.current, gridRef.current)) {
              gameOver();
              draw(ctx);
              return;
            }
          }
        }
        lastDropRef.current = timestamp;
      }
    }

    draw(ctx);
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [moveDown, lockPiece, clearLines, removeLines, createPiece, fillNextQueue, collision, gameOver, draw, calculateScore, playSFX, vibrate]);

  useEffect(() => {
    gameLoopFnRef.current = gameLoop;
  }, [gameLoop]);

  useEffect(() => {
    if (screen === 'playing') {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [screen, gameLoop]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (screen !== 'playing') return;
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          moveLeft();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          moveRight();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          moveDown();
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          rotatePiece();
          break;
        case ' ':
          e.preventDefault();
          hardDrop();
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          holdPiece();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, moveLeft, moveRight, moveDown, rotatePiece, hardDrop, holdPiece]);

  const handleDonate = useCallback(async () => {
    if (!isConnected) return;
    const openProject = projects.find(p => p.id === selectedProject && p.isOpen);
    if (!openProject) return;

    try {
      const usdCents = Math.round(donationAmount * 100);
      await donate(selectedProject, ethCost.toFixed(18), true, usdCents, GAME_ADAPTER_ADDRESS, { level: levelRef.current, score: scoreRef.current, gameId: 'tetris' });
    } catch (err) {
      console.error('Donation failed:', err);
    }
  }, [isConnected, projects, selectedProject, donate, ethCost, donationAmount]);

  const drawPiecePreview = useCallback((type: TetrominoType, size: number = 14) => {
    const shape = SHAPES[type];
    const color = COLORS[type];

    return (
      <div className="piece-preview-grid">
        {shape.map((row, y) => (
          <div key={y} className="piece-preview-row">
            {row.map((cell, x) => (
              <div
                key={x}
                className="piece-preview-cell"
                style={{
                  width: size,
                  height: size,
                  background: cell ? color.main : 'transparent',
                  boxShadow: cell ? color.glow : 'none',
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }, []);

  const freezeTimeRemaining = timeFreezeActive ? Math.max(0, Math.ceil((timeFreezeEndTime - Date.now()) / 1000)) : 0;

  return (
    <div className="tetris-container">
      {screen === 'start' && (
        <>
          <div className="tetris-header">
            <button onClick={onBack} className="back-btn">← Back</button>
            <h1 className="tetris-title">NEON TETRIS</h1>
            <button onClick={() => setSoundEnabled(!soundEnabled)} className="sound-btn">
              {soundEnabled ? '🔊' : '🔇'}
            </button>
          </div>
          <div className="tetris-start-screen">
            <div className="neon-logo">TETRIS</div>
            <p className="start-subtitle">Neon Edition</p>
            <button onClick={startGame} className="start-btn">START GAME</button>
            <div className="controls-info">
              <p>Touch: Tap=Rotate | Swipe=Move | Swipe Down=Drop</p>
              <p>Keyboard: ←→ Move | ↑ Rotate | Space Hard Drop</p>
            </div>
          </div>
        </>
      )}

      {screen === 'playing' && (
        <div className="tetris-immersive">
          <div className="immersive-header">
            <button className="imm-back-btn" onClick={onBack}>←</button>
            <div className="imm-stats">
              <span className="imm-stat">{score}</span>
              <span className="imm-stat-label">SCORE</span>
            </div>
            <div className="imm-stats">
              <span className="imm-stat">{level}</span>
              <span className="imm-stat-label">LVL</span>
            </div>
            <div className="imm-stats">
              <span className="imm-stat">{linesCleared}</span>
              <span className="imm-stat-label">LINES</span>
            </div>
            <button className="imm-sound-btn" onClick={() => setSoundEnabled(!soundEnabled)}>
              {soundEnabled ? '🔊' : '🔇'}
            </button>
          </div>

          <div
            className={`immersive-canvas-area ${timeFreezeActive ? 'freeze-glow' : ''}`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ paddingLeft: canvasOffset.x, paddingRight: canvasOffset.x }}
          >
            <canvas
              ref={canvasRef}
              width={COLS * blockSize}
              height={ROWS * blockSize}
              className="immersive-canvas"
            />

            <div className={`overlay-hold ${holdUnlocked ? '' : 'locked'}`}>
              <span className="overlay-label">HOLD</span>
              {holdUnlocked ? (
                heldPieceRef.current ? drawPiecePreview(heldPieceRef.current) : <div className="empty-slot">-</div>
              ) : (
                <div className="locked-icon">🔒</div>
              )}
            </div>

            <div className="overlay-next">
              <span className="overlay-label">NEXT</span>
              <div className="next-queue">
                {(futureSightUnlocked ? nextQueueRef.current.slice(0, 3) : nextQueueRef.current.slice(0, 1)).map((type, i) => (
                  <div key={i} className={`next-piece ${i > 0 ? 'secondary' : ''}`}>
                    {drawPiecePreview(type, i === 0 ? 12 : 10)}
                  </div>
                ))}
              </div>
              {!futureSightUnlocked && <div className="future-lock">+2 🔒</div>}
            </div>
          </div>

          {timeFreezeActive && (
            <div className="freeze-badge">❄️ {freezeTimeRemaining}s</div>
          )}

          <div className="fab-container">
            <button
              className={`fab-btn ${powerupMenuOpen ? 'open' : ''}`}
              onClick={() => setPowerupMenuOpen(!powerupMenuOpen)}
            >⚡</button>
            {powerupMenuOpen && (
              <div className="fab-menu">
                <button className="fab-item tnt" onClick={() => initiatePayment(0.10, 'tnt')} disabled={!isConnected || isPending || isConfirming}>
                  <span>🧨</span><span>$0.10</span>
                </button>
                <button className="fab-item freeze" onClick={() => initiatePayment(0.30, 'freeze')} disabled={!isConnected || isPending || isConfirming || timeFreezeActive}>
                  <span>❄️</span><span>$0.30</span>
                </button>
                <button className={`fab-item hold ${holdUnlocked ? 'done' : ''}`} onClick={() => initiatePayment(0.50, 'hold')} disabled={!isConnected || isPending || isConfirming || holdUnlocked}>
                  <span>👜</span><span>{holdUnlocked ? '✓' : '$0.50'}</span>
                </button>
                <button className={`fab-item future ${futureSightUnlocked ? 'done' : ''}`} onClick={() => initiatePayment(0.50, 'future')} disabled={!isConnected || isPending || isConfirming || futureSightUnlocked}>
                  <span>🔮</span><span>{futureSightUnlocked ? '✓' : '$0.50'}</span>
                </button>
              </div>
            )}
          </div>

          {showPaymentModal && pendingPowerup && (
            <div className="payment-overlay">
              <div className="payment-box">
                <h3>Confirm Purchase</h3>
                <p>Buy power-up for ${pendingPowerup.cost.toFixed(2)}?</p>
                <p className="eth-amt">{usdToEth(pendingPowerup.cost).toFixed(6)} ETH</p>
                <div className="payment-btns">
                  {!isCorrectNetwork ? (
                    <button 
                      className="pay-confirm" 
                      style={{ background: '#e0af68', color: '#000' }}
                      onClick={() => switchChain({ chainId: SONEIUM_MINATO_CHAIN_ID })}
                    >
                      ⚠️ Switch to Soneium
                    </button>
                  ) : (
                    <button 
                      className="pay-confirm" 
                      onClick={confirmPayment} 
                      disabled={isPowerupPending || isTxConfirming}
                    >
                      {isPowerupPending ? 'Signing...' : isTxConfirming ? 'Confirming...' : 'Confirm'}
                    </button>
                  )}
                  <button className="pay-cancel" onClick={cancelPayment} disabled={isPowerupPending || isTxConfirming}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {screen === 'paused' && (
        <div className="pause-overlay">
          <div className="pause-modal">
            <h2>PAUSED</h2>
            <button className="resume-btn" onClick={() => { isRunningRef.current = true; setScreen('playing'); }}>RESUME</button>
          </div>
        </div>
      )}

      {screen === 'gameover' && (
        <div className="gameover-screen">
          <div className="gameover-panel">
            <h2 className="gameover-title">GAME OVER</h2>

            <div className="score-grid">
              <div className="score-item"><span className="score-lbl">SCORE</span><span className="score-val">{score}</span></div>
              <div className="score-item"><span className="score-lbl">LEVEL</span><span className="score-val">{level}</span></div>
              <div className="score-item"><span className="score-lbl">LINES</span><span className="score-val">{linesCleared}</span></div>
              <div className="score-item highlight"><span className="score-lbl">BEST</span><span className="score-val">{highScore}</span></div>
            </div>

            {isConnected && (
              <div className="user-stats">
                <div className="stat-box"><div className="stat-num">{userTickets}</div><div className="stat-txt">Tickets</div></div>
                <div className="stat-box"><div className="stat-num">{userCents % 100}¢</div><div className="stat-txt">Accumulated</div></div>
                <div className="stat-box"><div className="stat-num gold">{centsToNextTicket}¢</div><div className="stat-txt gold">Next Ticket</div></div>
              </div>
            )}

            {!isConnected ? (
              <div className="connect-section">
                <p>Connect wallet to save score and donate!</p>
                <button className="btn-green" onClick={handleConnectWallet}>CONNECT WALLET</button>
              </div>
            ) : (
              <>
                <div className="donate-section">
                  <label>Select Project:</label>
                  <select value={selectedProject} onChange={(e) => setSelectedProject(parseInt(e.target.value))}>
                    {projects.filter(p => p.isOpen).map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                    {projects.filter(p => p.isOpen).length === 0 && <option>Loading...</option>}
                  </select>
                  <div className="donate-header"><span>Donate:</span><span className="usd-val">${donationAmount.toFixed(2)}</span></div>
                  <input type="range" min="0.1" max="10" step="0.1" value={donationAmount} onChange={(e) => setDonationAmount(parseFloat(e.target.value))} className="donate-slider" />
                  <div className="eth-val">{ethCost ? `${ethCost.toFixed(6)} ETH` : '...'}</div>
                  {donationAmount < 1 && <div className="acc-warn">Accumulates until $1</div>}
                </div>
                {!isCorrectNetwork ? (
                  <button className="btn-green btn-switch" onClick={() => switchChain({ chainId: SONEIUM_MINATO_CHAIN_ID })}>
                    Switch to Soneium
                  </button>
                ) : (
                  <button className="btn-green" onClick={() => { reset(); handleDonate(); }} disabled={isPending || isConfirming}>
                    {isPending || isConfirming ? 'Processing...' : 'SAVE SCORE & DONATE'}
                  </button>
                )}
              </>
            )}

            <div className="gameover-actions">
              <button className="btn-outline" onClick={startGame}>REPLAY</button>
              <button className="btn-exit" onClick={onBack}>EXIT</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .tetris-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #050505 0%, #0f172a 50%, #050505 100%);
          display: flex;
          flex-direction: column;
          touch-action: none;
        }

        .tetris-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          padding-top: max(12px, env(safe-area-inset-top));
        }

        .back-btn {
          background: rgba(255,255,255,0.1);
          border: none;
          color: #fff;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        }

        .tetris-title {
          font-size: 18px;
          font-weight: bold;
          background: linear-gradient(90deg, #00f0ff, #a855f7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .sound-btn {
          background: transparent;
          border: none;
          font-size: 24px;
          cursor: pointer;
        }

        .tetris-start-screen {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 20px;
          padding: 20px;
        }

        .neon-logo {
          font-size: 48px;
          font-weight: bold;
          color: #00f0ff;
          text-shadow: 0 0 10px #00f0ff, 0 0 20px #00f0ff, 0 0 40px #00f0ff;
          letter-spacing: 8px;
        }

        .start-subtitle {
          color: #a855f7;
          font-size: 18px;
          text-shadow: 0 0 10px #a855f7;
        }

        .start-btn {
          background: linear-gradient(135deg, #00f0ff 0%, #a855f7 100%);
          border: none;
          color: #000;
          padding: 16px 48px;
          border-radius: 12px;
          font-size: 20px;
          font-weight: bold;
          cursor: pointer;
          box-shadow: 0 0 20px rgba(0, 240, 255, 0.5);
        }

        .controls-info {
          color: #666;
          font-size: 12px;
          text-align: center;
          margin-top: 20px;
        }

        .tetris-immersive {
          position: fixed;
          inset: 0;
          background: #050505;
          display: flex;
          flex-direction: column;
          z-index: 50;
        }

        .immersive-header {
          height: ${HEADER_HEIGHT}px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 8px;
          padding-top: env(safe-area-inset-top);
          background: rgba(0,0,0,0.8);
          border-bottom: 1px solid rgba(0,240,255,0.2);
        }

        .imm-back-btn, .imm-sound-btn {
          background: rgba(0,0,0,0.5);
          border: 1px solid rgba(0,240,255,0.3);
          color: #00f0ff;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .imm-stats {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .imm-stat {
          font-size: 16px;
          font-weight: bold;
          color: #fff;
          text-shadow: 0 0 8px #00f0ff;
        }

        .imm-stat-label {
          font-size: 8px;
          color: rgba(0,240,255,0.7);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .immersive-canvas-area {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          touch-action: none;
        }

        .immersive-canvas-area.freeze-glow {
          box-shadow: inset 0 0 60px rgba(100,200,255,0.4);
        }

        .immersive-canvas {
          border: 1px solid rgba(0,240,255,0.3);
          touch-action: none;
        }

        .overlay-hold {
          position: absolute;
          top: 8px;
          left: 8px;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(0,240,255,0.3);
          border-radius: 8px;
          padding: 6px 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 10;
        }

        .overlay-hold.locked {
          opacity: 0.5;
          border-color: #444;
        }

        .overlay-label {
          font-size: 8px;
          color: #00f0ff;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 4px;
        }

        .locked-icon {
          font-size: 16px;
          padding: 4px;
        }

        .empty-slot {
          color: #666;
          font-size: 14px;
          padding: 4px;
        }

        .overlay-next {
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(0,240,255,0.3);
          border-radius: 8px;
          padding: 6px 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 10;
        }

        .next-queue {
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: center;
        }

        .next-piece.secondary {
          opacity: 0.5;
        }

        .future-lock {
          font-size: 8px;
          color: #666;
          margin-top: 4px;
        }

        .freeze-badge {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(100,200,255,0.9);
          color: #000;
          padding: 6px 16px;
          border-radius: 16px;
          font-size: 16px;
          font-weight: bold;
          z-index: 60;
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.05); }
        }

        .fab-container {
          position: fixed;
          bottom: 20px;
          right: 12px;
          z-index: 70;
          display: flex;
          flex-direction: column-reverse;
          align-items: center;
          gap: 8px;
          padding-bottom: env(safe-area-inset-bottom);
        }

        .fab-btn {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ffd700 0%, #ff8c00 100%);
          border: 2px solid rgba(255,255,255,0.3);
          font-size: 22px;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(255,215,0,0.4);
          transition: transform 0.2s;
        }

        .fab-btn.open {
          transform: rotate(45deg);
          background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
        }

        .fab-menu {
          display: flex;
          flex-direction: column;
          gap: 6px;
          animation: slideUp 0.2s ease-out;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .fab-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 6px 10px;
          border-radius: 10px;
          border: 2px solid;
          cursor: pointer;
          background: rgba(0,0,0,0.8);
          min-width: 54px;
          transition: transform 0.1s;
        }

        .fab-item:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .fab-item.done {
          border-style: dashed;
          opacity: 0.6;
        }

        .fab-item.tnt { border-color: #ef4444; color: #ef4444; }
        .fab-item.freeze { border-color: #38bdf8; color: #38bdf8; }
        .fab-item.hold { border-color: #a855f7; color: #a855f7; }
        .fab-item.future { border-color: #fbbf24; color: #fbbf24; }

        .fab-item span:first-child { font-size: 16px; }
        .fab-item span:last-child { font-size: 9px; font-weight: bold; margin-top: 2px; }

        .payment-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
        }

        .payment-box {
          background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%);
          border: 2px solid #ffd700;
          border-radius: 16px;
          padding: 24px 32px;
          text-align: center;
          max-width: 280px;
          box-shadow: 0 0 40px rgba(255,215,0,0.3);
        }

        .payment-box h3 { color: #ffd700; font-size: 18px; margin-bottom: 12px; }
        .payment-box p { color: #fff; margin-bottom: 6px; }
        .payment-box .eth-amt { color: #00f0ff; font-size: 13px; margin-bottom: 14px; }

        .payment-btns { display: flex; gap: 10px; justify-content: center; }

        .pay-confirm {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          border: none;
          color: #fff;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: bold;
          cursor: pointer;
        }

        .pay-confirm:disabled { opacity: 0.6; cursor: not-allowed; }

        .pay-cancel {
          background: transparent;
          border: 2px solid #666;
          color: #999;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: bold;
          cursor: pointer;
        }

        .pay-cancel:disabled { opacity: 0.6; cursor: not-allowed; }

        .pause-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }

        .pause-modal {
          background: rgba(10,10,20,0.95);
          border: 2px solid #00f0ff;
          border-radius: 16px;
          padding: 32px 48px;
          text-align: center;
        }

        .pause-modal h2 { color: #00f0ff; font-size: 28px; margin-bottom: 20px; text-shadow: 0 0 20px #00f0ff; }

        .resume-btn {
          background: linear-gradient(135deg, #00f0ff 0%, #a855f7 100%);
          border: none;
          color: #000;
          padding: 14px 32px;
          border-radius: 12px;
          font-size: 18px;
          font-weight: bold;
          cursor: pointer;
        }

        .gameover-screen {
          position: fixed;
          inset: 0;
          background: rgba(5,5,15,0.95);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 16px;
        }

        .gameover-panel {
          background: rgba(15,15,30,0.9);
          border: 2px solid #00f0ff;
          border-radius: 16px;
          padding: 24px;
          text-align: center;
          width: 100%;
          max-width: 340px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 0 40px rgba(0,240,255,0.2);
        }

        .gameover-title {
          color: #00f0ff;
          font-size: 24px;
          margin-bottom: 16px;
          text-shadow: 0 0 15px #00f0ff;
        }

        .score-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }

        .score-item {
          background: rgba(0,0,0,0.3);
          border-radius: 8px;
          padding: 8px;
        }

        .score-item.highlight { background: rgba(0,240,255,0.1); border: 1px solid rgba(0,240,255,0.3); }
        .score-lbl { display: block; font-size: 10px; color: #888; text-transform: uppercase; }
        .score-val { display: block; font-size: 20px; font-weight: bold; color: #fff; }

        .user-stats {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin-bottom: 16px;
        }

        .stat-box { text-align: center; }
        .stat-num { font-size: 18px; font-weight: bold; color: #00f0ff; }
        .stat-num.gold { color: #ffd700; }
        .stat-txt { font-size: 10px; color: #888; text-transform: uppercase; }
        .stat-txt.gold { color: #ffd700; }

        .connect-section { margin-bottom: 16px; }
        .connect-section p { color: #888; font-size: 13px; margin-bottom: 12px; }

        .btn-green {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          border: none;
          color: #fff;
          padding: 12px 24px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: bold;
          cursor: pointer;
          width: 100%;
          margin-bottom: 12px;
        }

        .btn-green:disabled { opacity: 0.6; cursor: not-allowed; }

        .donate-section {
          margin-bottom: 12px;
        }

        .donate-section label {
          display: block;
          color: #888;
          font-size: 12px;
          margin-bottom: 6px;
          text-align: left;
        }

        .donate-section select {
          width: 100%;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid #333;
          background: #1a1a2e;
          color: #fff;
          font-size: 14px;
          margin-bottom: 12px;
        }

        .donate-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6px;
          color: #fff;
          font-size: 14px;
        }

        .usd-val { color: #22c55e; font-weight: bold; }

        .donate-slider {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: linear-gradient(90deg, #818cf8, #34d399, #fbbf24);
          appearance: none;
          margin-bottom: 6px;
        }

        .donate-slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
          box-shadow: 0 0 8px rgba(0,0,0,0.5);
        }

        .eth-val { color: #00f0ff; font-size: 12px; margin-bottom: 6px; }
        .acc-warn { color: #fbbf24; font-size: 11px; }

        .gameover-actions {
          display: flex;
          gap: 12px;
          margin-top: 12px;
        }

        .btn-outline {
          flex: 1;
          background: transparent;
          border: 2px solid #00f0ff;
          color: #00f0ff;
          padding: 12px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: bold;
          cursor: pointer;
        }

        .btn-exit {
          flex: 1;
          background: transparent;
          border: 2px solid #666;
          color: #999;
          padding: 12px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: bold;
          cursor: pointer;
        }

        .piece-preview-grid { display: flex; flex-direction: column; }
        .piece-preview-row { display: flex; gap: 1px; }
        .piece-preview-cell { margin: 1px; }
      `}</style>
    </div>
  );
}
