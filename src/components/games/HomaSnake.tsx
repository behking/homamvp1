import { useRef, useEffect, useState, useCallback } from 'react';
import { useAccount, useReadContracts, useConnect, useConnectors, useSwitchChain } from 'wagmi';
import { useHomaCore } from '../../hooks/useHomaCore';
import { useEthPrice } from '../../hooks/useEthPrice';
import { HOMA_CORE_ADDRESS, HOMA_CORE_ABI, GAME_ADAPTER_ADDRESS } from '../../contracts/abi';

const SONEIUM_MINATO_CHAIN_ID = 1946;

interface HomaSnakeProps {
  onBack: () => void;
}

interface SnakeSegment {
  x: number;
  y: number;
}

interface Item {
  x: number;
  y: number;
  type: 'apple' | 'gem' | 'coin';
  life: number;
  color: string;
}

interface Obstacle {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface Velocity {
  x: number;
  y: number;
}

interface ProjectData {
  id: number;
  name: string;
  isOpen: boolean;
}

type ViewMode = 'dpad' | 'fullscreen';

const HEADER_HEIGHT = 44;
const GAME_SPEED = 150;

export function HomaSnake({ onBack }: HomaSnakeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>();
  const lastUpdateRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const [screen, setScreen] = useState<'start' | 'playing' | 'gameover' | 'settings'>('start');
  const [viewMode, setViewMode] = useState<ViewMode>('dpad');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('homa_snake_highscore');
    return saved ? parseInt(saved) : 0;
  });
  const [wallCollision, setWallCollision] = useState(true);
  const [mazeMode, setMazeMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrateEnabled, setVibrateEnabled] = useState(true);
  const [donationAmount, setDonationAmount] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 350, height: 400 });
  const [selectedProject, setSelectedProject] = useState(0);
  const [projects, setProjects] = useState<ProjectData[]>([]);

  const snakeRef = useRef<SnakeSegment[]>([]);
  const velocityRef = useRef<Velocity>({ x: 0, y: 0 });
  const nextVelocityRef = useRef<Velocity>({ x: 0, y: 0 });
  const itemsRef = useRef<Item[]>([]);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const scoreRef = useRef(0);
  const isRunningRef = useRef(false);
  const wallCollisionRef = useRef(true);
  const tileCountRef = useRef({ x: 14, y: 16 });
  const gridSizeRef = useRef(20);
  const viewModeRef = useRef<ViewMode>('dpad');

  const { address, isConnected, chainId } = useAccount();
  const isCorrectNetwork = chainId === SONEIUM_MINATO_CHAIN_ID;
  const { switchChain } = useSwitchChain();
  const { connect } = useConnect();
  const connectors = useConnectors();
  const { donate, isPending, isConfirming, userAccumulation, projectCount } = useHomaCore(address);
  const { usdToEth } = useEthPrice();

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

  const recalculateCanvasSize = useCallback((mode: ViewMode) => {
    const screenHeight = window.innerHeight;
    const screenWidth = window.innerWidth;
    
    let availableHeight: number;
    if (mode === 'dpad') {
      availableHeight = Math.floor(screenHeight * 0.65) - HEADER_HEIGHT;
    } else {
      availableHeight = screenHeight - HEADER_HEIGHT;
    }
    
    const availableWidth = screenWidth;
    const targetCols = 14;
    const targetRows = Math.floor((availableHeight / availableWidth) * targetCols);
    const gs = Math.max(16, Math.floor(Math.min(availableWidth / targetCols, availableHeight / Math.max(1, targetRows))));
    const finalCols = Math.floor(availableWidth / gs);
    const finalRows = Math.floor(availableHeight / gs);
    
    gridSizeRef.current = gs;
    tileCountRef.current = { x: finalCols, y: finalRows };
    setCanvasSize({ width: finalCols * gs, height: finalRows * gs });
  }, []);

  useEffect(() => {
    viewModeRef.current = viewMode;
    recalculateCanvasSize(viewMode);
  }, [viewMode, recalculateCanvasSize]);

  useEffect(() => {
    const handleResize = () => {
      recalculateCanvasSize(viewModeRef.current);
    };
    window.addEventListener('resize', handleResize);
    recalculateCanvasSize(viewMode);
    return () => window.removeEventListener('resize', handleResize);
  }, [recalculateCanvasSize, viewMode]);

  useEffect(() => {
    wallCollisionRef.current = wallCollision;
  }, [wallCollision]);

  const vibrate = useCallback((pattern: number | number[]) => {
    if (vibrateEnabled && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }, [vibrateEnabled]);

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
    if (effect === 'eat') playTone(600, 'sine', 0.1);
    if (effect === 'bonus') playTone(800, 'square', 0.2);
    if (effect === 'die') {
      playTone(150, 'sawtooth', 0.5);
      playTone(100, 'sawtooth', 0.5);
    }
  }, [playTone]);

  const createParticles = useCallback((x: number, y: number, color: string) => {
    const gs = gridSizeRef.current;
    for (let i = 0; i < 5; i++) {
      particlesRef.current.push({
        x: x * gs + gs / 2,
        y: y * gs + gs / 2,
        vx: (Math.random() - 0.5) * gs,
        vy: (Math.random() - 0.5) * gs,
        life: 1.0,
        color
      });
    }
  }, []);

  const spawnItem = useCallback((forceType?: 'apple' | 'gem' | 'coin') => {
    let type: 'apple' | 'gem' | 'coin';
    if (forceType) {
      type = forceType;
    } else {
      const r = Math.random();
      type = r < 0.1 ? 'coin' : (r < 0.3 ? 'gem' : 'apple');
    }

    const life = type === 'coin' ? 60 : (type === 'gem' ? 90 : 150);
    const color = type === 'apple' ? '#f7768e' : (type === 'gem' ? '#7aa2f7' : '#ffd700');

    const tc = tileCountRef.current;
    let x: number, y: number;
    let attempts = 0;
    do {
      x = Math.floor(Math.random() * tc.x);
      y = Math.floor(Math.random() * tc.y);
      attempts++;
      if (attempts > 100) break;
    } while (
      snakeRef.current.some(s => s.x === x && s.y === y) ||
      obstaclesRef.current.some(o => o.x === x && o.y === y) ||
      itemsRef.current.some(i => i.x === x && i.y === y)
    );

    itemsRef.current.push({ x, y, type, life, color });
  }, []);

  const generateObstacles = useCallback(() => {
    const tc = tileCountRef.current;
    obstaclesRef.current = [];
    for (let i = 0; i < 10; i++) {
      let ox = Math.floor(Math.random() * (tc.x - 2)) + 1;
      let oy = Math.floor(Math.random() * (tc.y - 2)) + 1;
      const midX = Math.floor(tc.x / 2);
      const midY = Math.floor(tc.y / 2);
      if (Math.abs(ox - midX) < 5 && Math.abs(oy - midY) < 5) {
        i--;
        continue;
      }
      obstaclesRef.current.push({ x: ox, y: oy });
    }
  }, []);

  const turn = useCallback((dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
    const vel = velocityRef.current;
    if (dir === 'UP' && vel.y !== 1) nextVelocityRef.current = { x: 0, y: -1 };
    if (dir === 'DOWN' && vel.y !== -1) nextVelocityRef.current = { x: 0, y: 1 };
    if (dir === 'LEFT' && vel.x !== 1) nextVelocityRef.current = { x: -1, y: 0 };
    if (dir === 'RIGHT' && vel.x !== -1) nextVelocityRef.current = { x: 1, y: 0 };
    vibrate(10);
  }, [vibrate]);

  const gameOver = useCallback(() => {
    isRunningRef.current = false;
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    playSFX('die');
    vibrate([100, 50, 100]);

    const finalScore = scoreRef.current;
    if (finalScore > highScore) {
      setHighScore(finalScore);
      localStorage.setItem('homa_snake_highscore', finalScore.toString());
    }

    setScreen('gameover');
  }, [highScore, playSFX, vibrate]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const gs = gridSizeRef.current;

    ctx.fillStyle = '#1a1b26';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(122, 162, 247, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += gs) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += gs) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    if (viewModeRef.current === 'fullscreen') {
      ctx.strokeStyle = 'rgba(122, 162, 247, 0.12)';
      ctx.lineWidth = 1;
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(canvas.width, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(canvas.width, 0);
      ctx.lineTo(0, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = '#4b4e6d';
    for (const o of obstaclesRef.current) {
      ctx.fillRect(o.x * gs, o.y * gs, gs, gs);
      ctx.strokeStyle = '#6c5ce7';
      ctx.strokeRect(o.x * gs, o.y * gs, gs, gs);
    }

    for (const item of itemsRef.current) {
      if (item.life < 25 && item.life % 5 === 0) continue;

      ctx.shadowBlur = 15;
      ctx.shadowColor = item.color;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(item.x * gs + gs / 2, item.y * gs + gs / 2, gs / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#fff';
      ctx.font = `${gs - 4}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const icon = item.type === 'apple' ? '🍎' : (item.type === 'gem' ? '💎' : '⚡');

      if (item.life < 50) {
        ctx.fillStyle = item.color;
        ctx.font = '10px Arial';
        ctx.fillText(Math.ceil(item.life / 10).toString(), item.x * gs + gs / 2, item.y * gs - 5);
      }

      ctx.font = `${gs - 4}px Arial`;
      ctx.fillText(icon, item.x * gs + gs / 2, item.y * gs + gs / 2 + 2);
    }

    const vel = velocityRef.current;
    for (let i = 0; i < snakeRef.current.length; i++) {
      const s = snakeRef.current[i];
      const color = i === 0 ? '#9ece6a' : '#73daca';
      const glow = i === 0 ? 10 : 0;

      ctx.shadowBlur = glow;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      (ctx as any).roundRect(s.x * gs + 1, s.y * gs + 1, gs - 2, gs - 2, 4);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (i === 0) {
        ctx.fillStyle = '#1a1b26';
        const sX = s.x * gs;
        const sY = s.y * gs;
        if (vel.x === 1) {
          ctx.fillRect(sX + gs * 0.6, sY + gs * 0.2, 3, 3);
          ctx.fillRect(sX + gs * 0.6, sY + gs * 0.6, 3, 3);
        } else if (vel.x === -1) {
          ctx.fillRect(sX + gs * 0.2, sY + gs * 0.2, 3, 3);
          ctx.fillRect(sX + gs * 0.2, sY + gs * 0.6, 3, 3);
        } else if (vel.y === -1) {
          ctx.fillRect(sX + gs * 0.2, sY + gs * 0.2, 3, 3);
          ctx.fillRect(sX + gs * 0.6, sY + gs * 0.2, 3, 3);
        } else {
          ctx.fillRect(sX + gs * 0.2, sY + gs * 0.6, 3, 3);
          ctx.fillRect(sX + gs * 0.6, sY + gs * 0.6, 3, 3);
        }
      }
    }

    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx * 0.2;
      p.y += p.vy * 0.2;
      p.life -= 0.05;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      if (p.life <= 0) particlesRef.current.splice(i, 1);
    }
  }, []);

  const update = useCallback(() => {
    if (!isRunningRef.current) return;

    velocityRef.current = { ...nextVelocityRef.current };
    const vel = velocityRef.current;
    const snake = snakeRef.current;
    const tc = tileCountRef.current;

    let head = { x: snake[0].x + vel.x, y: snake[0].y + vel.y };

    if (wallCollisionRef.current) {
      if (head.x < 0 || head.x >= tc.x || head.y < 0 || head.y >= tc.y) {
        gameOver();
        return;
      }
    } else {
      if (head.x < 0) head.x = tc.x - 1;
      if (head.x >= tc.x) head.x = 0;
      if (head.y < 0) head.y = tc.y - 1;
      if (head.y >= tc.y) head.y = 0;
    }

    for (const s of snake) {
      if (head.x === s.x && head.y === s.y) {
        gameOver();
        return;
      }
    }
    for (const o of obstaclesRef.current) {
      if (head.x === o.x && head.y === o.y) {
        gameOver();
        return;
      }
    }

    snake.unshift(head);

    let ate = false;
    for (let i = itemsRef.current.length - 1; i >= 0; i--) {
      const item = itemsRef.current[i];
      item.life--;

      if (head.x === item.x && head.y === item.y) {
        if (item.type === 'apple') {
          scoreRef.current += 10;
          playSFX('eat');
          vibrate(20);
        } else if (item.type === 'gem') {
          scoreRef.current += 50;
          playSFX('bonus');
          vibrate([30, 50, 30]);
        } else {
          scoreRef.current += 100;
          playSFX('bonus');
          vibrate(100);
        }
        setScore(scoreRef.current);
        createParticles(head.x, head.y, item.color);
        itemsRef.current.splice(i, 1);
        ate = true;
        break;
      }

      if (item.life <= 0) {
        itemsRef.current.splice(i, 1);
        if (itemsRef.current.length === 0) spawnItem('apple');
      }
    }

    if (!ate) {
      snake.pop();
    } else {
      spawnItem();
      if (Math.random() < 0.3) spawnItem();
    }
  }, [gameOver, playSFX, vibrate, createParticles, spawnItem]);

  const gameLoop = useCallback((timestamp: number) => {
    if (!isRunningRef.current) return;

    if (timestamp - lastUpdateRef.current >= GAME_SPEED) {
      update();
      lastUpdateRef.current = timestamp;
    }

    draw();
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [update, draw]);

  const startGame = useCallback(() => {
    recalculateCanvasSize(viewMode);
    
    setTimeout(() => {
      const tc = tileCountRef.current;
      const midX = Math.floor(tc.x / 2);
      const midY = Math.floor(tc.y / 2);

      snakeRef.current = [
        { x: midX, y: midY },
        { x: midX - 1, y: midY },
        { x: midX - 2, y: midY }
      ];
      velocityRef.current = { x: 1, y: 0 };
      nextVelocityRef.current = { x: 1, y: 0 };
      itemsRef.current = [];
      particlesRef.current = [];
      obstaclesRef.current = [];
      scoreRef.current = 0;
      setScore(0);

      if (mazeMode) generateObstacles();
      spawnItem('apple');

      isRunningRef.current = true;
      setScreen('playing');

      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      lastUpdateRef.current = performance.now();
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    }, 50);
  }, [mazeMode, generateObstacles, spawnItem, gameLoop, recalculateCanvasSize, viewMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (screen !== 'playing') return;
      if (e.key === 'ArrowUp' || e.key === 'w') turn('UP');
      if (e.key === 'ArrowDown' || e.key === 's') turn('DOWN');
      if (e.key === 'ArrowLeft' || e.key === 'a') turn('LEFT');
      if (e.key === 'ArrowRight' || e.key === 'd') turn('RIGHT');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, turn]);

  useEffect(() => {
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (screen !== 'playing' || viewMode !== 'fullscreen') return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, [screen, viewMode]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (screen !== 'playing' || viewMode !== 'fullscreen') return;
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = Date.now() - touchStartRef.current.time;

    if (dist > 30 && elapsed < 500) {
      if (Math.abs(dx) > Math.abs(dy)) {
        turn(dx > 0 ? 'RIGHT' : 'LEFT');
      } else {
        turn(dy > 0 ? 'DOWN' : 'UP');
      }
    } else if (dist < 20) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const qdx = x - centerX;
      const qdy = y - centerY;

      if (Math.abs(qdx) > Math.abs(qdy)) {
        turn(qdx > 0 ? 'RIGHT' : 'LEFT');
      } else {
        turn(qdy > 0 ? 'DOWN' : 'UP');
      }
    }

    touchStartRef.current = null;
  }, [screen, viewMode, turn]);

  const handleDpadPress = useCallback((dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
    turn(dir);
  }, [turn]);

  const handleDonate = async () => {
    if (!isConnected || !ethCost) return;
    try {
      const usdCents = Math.round(donationAmount * 100);
      await donate(selectedProject, ethCost.toFixed(8), true, usdCents, GAME_ADAPTER_ADDRESS, { level: 1, score, gameId: 'snake' });
    } catch (e) {
      console.error('Donation failed:', e);
    }
  };

  const toggleViewMode = () => {
    setViewMode(prev => prev === 'dpad' ? 'fullscreen' : 'dpad');
  };

  return (
    <div className="snake-container">
      {screen === 'settings' && (
        <div className="settings-overlay">
          <div className="settings-modal">
            <h2>SETTINGS</h2>
            <div className="setting-row">
              <span>Sound</span>
              <button className={`toggle-btn ${soundEnabled ? 'on' : ''}`} onClick={() => setSoundEnabled(!soundEnabled)}>
                {soundEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="setting-row">
              <span>Vibrate</span>
              <button className={`toggle-btn ${vibrateEnabled ? 'on' : ''}`} onClick={() => setVibrateEnabled(!vibrateEnabled)}>
                {vibrateEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <button className="btn-outline" onClick={() => setScreen('start')}>CLOSE</button>
          </div>
        </div>
      )}

      {screen === 'start' && (
        <div className="start-screen">
          <div className="start-header">
            <button className="back-btn" onClick={onBack}>← Back</button>
            <button className="settings-btn" onClick={() => setScreen('settings')}>⚙️</button>
          </div>

          <h1 className="game-title">HOMA SNAKE</h1>

          <div className="mode-buttons">
            <button className={`mode-btn ${wallCollision ? 'active' : ''}`} onClick={() => setWallCollision(!wallCollision)}>
              WALLS: {wallCollision ? 'ON' : 'OFF'}
            </button>
            <button className={`mode-btn ${mazeMode ? 'active' : ''}`} onClick={() => setMazeMode(!mazeMode)}>
              OBSTACLES: {mazeMode ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="control-mode-section">
            <p className="section-label">Control Mode</p>
            <div className="mode-buttons">
              <button className={`mode-btn ${viewMode === 'dpad' ? 'active' : ''}`} onClick={() => setViewMode('dpad')}>
                🎮 D-Pad
              </button>
              <button className={`mode-btn ${viewMode === 'fullscreen' ? 'active' : ''}`} onClick={() => setViewMode('fullscreen')}>
                👆 Gestures
              </button>
            </div>
          </div>

          <div className="legend">
            <div className="legend-item"><span>🍎 Apple</span><span className="pts apple">+10</span></div>
            <div className="legend-item"><span>💎 Gem</span><span className="pts gem">+50</span></div>
            <div className="legend-item"><span>⚡ Coin</span><span className="pts coin">+100</span></div>
          </div>

          <button className="play-btn" onClick={startGame}>PLAY</button>

          <p className="best-score">Best: {highScore}</p>

          <div className="controls-hint">
            {viewMode === 'dpad' ? (
              <p>Use the D-Pad to control the snake</p>
            ) : (
              <p>Swipe or tap quadrants to turn</p>
            )}
          </div>
        </div>
      )}

      {screen === 'playing' && (
        <div className={`game-layout ${viewMode}`}>
          <div className="game-header">
            <button className="hdr-back-btn" onClick={onBack}>←</button>
            <div className="hdr-stats">
              <span className="hdr-score">{score}</span>
              <span className="hdr-label">SCORE</span>
            </div>
            <div className="hdr-stats">
              <span className="hdr-score">{highScore}</span>
              <span className="hdr-label">BEST</span>
            </div>
            <button className="hdr-mode-btn" onClick={toggleViewMode}>
              {viewMode === 'dpad' ? '🎮' : '👆'}
            </button>
          </div>

          <div className="game-area">
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              className="game-canvas"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              style={{ touchAction: 'none' }}
            />
          </div>

          {viewMode === 'dpad' && (
            <div className="dpad-container">
              <div className="dpad">
                <button className="dpad-btn up" onTouchStart={() => handleDpadPress('UP')} onClick={() => handleDpadPress('UP')}>
                  <span className="dpad-arrow">▲</span>
                </button>
                <div className="dpad-middle-row">
                  <button className="dpad-btn left" onTouchStart={() => handleDpadPress('LEFT')} onClick={() => handleDpadPress('LEFT')}>
                    <span className="dpad-arrow">◀</span>
                  </button>
                  <div className="dpad-center"></div>
                  <button className="dpad-btn right" onTouchStart={() => handleDpadPress('RIGHT')} onClick={() => handleDpadPress('RIGHT')}>
                    <span className="dpad-arrow">▶</span>
                  </button>
                </div>
                <button className="dpad-btn down" onTouchStart={() => handleDpadPress('DOWN')} onClick={() => handleDpadPress('DOWN')}>
                  <span className="dpad-arrow">▼</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {screen === 'gameover' && (
        <div className="gameover-screen">
          <div className="gameover-panel">
            <h2 className="gameover-title">GAME OVER</h2>
            <p className="final-score">Score: <span>{score}</span></p>

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
                  <button className="btn-green" onClick={handleDonate} disabled={isPending || isConfirming}>
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
        .snake-container {
          position: fixed;
          inset: 0;
          background: #1a1b26;
          display: flex;
          flex-direction: column;
          touch-action: none;
          overflow: hidden;
        }

        .settings-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }

        .settings-modal {
          background: rgba(26,27,38,0.95);
          border: 2px solid #7aa2f7;
          border-radius: 16px;
          padding: 24px;
          text-align: center;
          min-width: 260px;
        }

        .settings-modal h2 { color: #7aa2f7; margin-bottom: 20px; }

        .setting-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          color: #fff;
        }

        .toggle-btn {
          padding: 8px 20px;
          border-radius: 8px;
          border: 2px solid #666;
          background: transparent;
          color: #888;
          cursor: pointer;
        }

        .toggle-btn.on {
          border-color: #9ece6a;
          color: #9ece6a;
          background: rgba(158,206,106,0.1);
        }

        .start-screen {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
          gap: 12px;
        }

        .start-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          display: flex;
          justify-content: space-between;
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

        .settings-btn {
          background: rgba(255,255,255,0.1);
          border: none;
          font-size: 20px;
          padding: 8px;
          border-radius: 8px;
          cursor: pointer;
        }

        .game-title {
          font-size: 32px;
          font-weight: bold;
          color: #9ece6a;
          text-shadow: 0 0 20px #9ece6a;
          letter-spacing: 4px;
        }

        .control-mode-section {
          margin: 8px 0;
        }

        .section-label {
          color: #666;
          font-size: 12px;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .mode-buttons {
          display: flex;
          gap: 12px;
        }

        .mode-btn {
          padding: 10px 16px;
          border-radius: 8px;
          border: 2px solid #444;
          background: transparent;
          color: #888;
          font-size: 12px;
          cursor: pointer;
        }

        .mode-btn.active {
          border-color: #7aa2f7;
          color: #7aa2f7;
          background: rgba(122,162,247,0.1);
        }

        .legend {
          display: flex;
          gap: 16px;
          margin: 8px 0;
        }

        .legend-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          font-size: 12px;
          color: #888;
        }

        .pts { font-weight: bold; margin-top: 4px; }
        .pts.apple { color: #f7768e; }
        .pts.gem { color: #7aa2f7; }
        .pts.coin { color: #ffd700; }

        .play-btn {
          background: linear-gradient(135deg, #9ece6a 0%, #73daca 100%);
          border: none;
          color: #1a1b26;
          padding: 16px 48px;
          border-radius: 12px;
          font-size: 20px;
          font-weight: bold;
          cursor: pointer;
          box-shadow: 0 0 20px rgba(158,206,106,0.5);
          margin-top: 8px;
        }

        .best-score {
          color: #666;
          font-size: 14px;
          margin-top: 4px;
        }

        .controls-hint {
          color: #555;
          font-size: 12px;
          text-align: center;
          margin-top: 8px;
        }

        /* Game Layout */
        .game-layout {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
        }

        .game-layout.dpad .game-area {
          height: 65vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .game-layout.fullscreen .game-area {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .game-header {
          height: ${HEADER_HEIGHT}px;
          min-height: ${HEADER_HEIGHT}px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 8px;
          padding-top: env(safe-area-inset-top);
          background: rgba(0,0,0,0.6);
          border-bottom: 1px solid rgba(122,162,247,0.2);
        }

        .hdr-back-btn, .hdr-mode-btn {
          background: rgba(0,0,0,0.5);
          border: 1px solid rgba(122,162,247,0.3);
          color: #7aa2f7;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .hdr-stats {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .hdr-score {
          font-size: 16px;
          font-weight: bold;
          color: #fff;
          text-shadow: 0 0 8px #9ece6a;
        }

        .hdr-label {
          font-size: 8px;
          color: rgba(158,206,106,0.7);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .game-canvas {
          display: block;
          touch-action: none;
        }

        /* D-Pad Controls */
        .dpad-container {
          height: 35vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.3);
          padding-bottom: env(safe-area-inset-bottom);
        }

        .dpad {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .dpad-middle-row {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .dpad-btn {
          width: 70px;
          height: 70px;
          border-radius: 12px;
          border: 2px solid rgba(122,162,247,0.5);
          background: rgba(122,162,247,0.1);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.1s ease;
          -webkit-tap-highlight-color: transparent;
        }

        .dpad-btn:active {
          background: rgba(122,162,247,0.4);
          border-color: #7aa2f7;
          transform: scale(0.95);
          box-shadow: 0 0 20px rgba(122,162,247,0.5);
        }

        .dpad-arrow {
          font-size: 28px;
          color: #7aa2f7;
          text-shadow: 0 0 10px #7aa2f7;
        }

        .dpad-center {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(26,27,38,0.8);
          border: 2px solid rgba(122,162,247,0.3);
        }

        .gameover-screen {
          position: fixed;
          inset: 0;
          background: rgba(26,27,38,0.95);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 16px;
        }

        .gameover-panel {
          background: rgba(15,15,30,0.9);
          border: 2px solid #9ece6a;
          border-radius: 16px;
          padding: 24px;
          text-align: center;
          width: 100%;
          max-width: 340px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 0 40px rgba(158,206,106,0.2);
        }

        .gameover-title {
          color: #9ece6a;
          font-size: 24px;
          margin-bottom: 12px;
          text-shadow: 0 0 15px #9ece6a;
        }

        .final-score {
          color: #888;
          font-size: 16px;
          margin-bottom: 16px;
        }

        .final-score span { color: #fff; font-weight: bold; font-size: 24px; }

        .user-stats {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin-bottom: 16px;
        }

        .stat-box { text-align: center; }
        .stat-num { font-size: 18px; font-weight: bold; color: #9ece6a; }
        .stat-num.gold { color: #ffd700; }
        .stat-txt { font-size: 10px; color: #888; text-transform: uppercase; }
        .stat-txt.gold { color: #ffd700; }

        .connect-section { margin-bottom: 16px; }
        .connect-section p { color: #888; font-size: 13px; margin-bottom: 12px; }

        .btn-green {
          background: linear-gradient(135deg, #9ece6a 0%, #73daca 100%);
          border: none;
          color: #1a1b26;
          padding: 12px 24px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: bold;
          cursor: pointer;
          width: 100%;
          margin-bottom: 12px;
        }

        .btn-green:disabled { opacity: 0.6; cursor: not-allowed; }

        .donate-section { margin-bottom: 12px; }
        .donate-section label { display: block; color: #888; font-size: 12px; margin-bottom: 6px; text-align: left; }
        .donate-section select {
          width: 100%;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid #333;
          background: #1a1b26;
          color: #fff;
          font-size: 14px;
          margin-bottom: 12px;
        }

        .donate-header { display: flex; justify-content: space-between; margin-bottom: 6px; color: #fff; font-size: 14px; }
        .usd-val { color: #9ece6a; font-weight: bold; }

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

        .eth-val { color: #7aa2f7; font-size: 12px; margin-bottom: 6px; }
        .acc-warn { color: #fbbf24; font-size: 11px; }

        .gameover-actions { display: flex; gap: 12px; margin-top: 12px; }

        .btn-outline {
          flex: 1;
          background: transparent;
          border: 2px solid #9ece6a;
          color: #9ece6a;
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
      `}</style>
    </div>
  );
}
