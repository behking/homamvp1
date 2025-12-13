import { useRef, useEffect, useState, useCallback } from 'react';
import { useAccount, useConnect, useConnectors, useReadContract, useReadContracts, useSwitchChain } from 'wagmi';
import { useHomaCore } from '../../hooks/useHomaCore';
import { useEthPrice } from '../../hooks/useEthPrice';
import { RUNNER_ADAPTER_ADDRESS, RUNNER_ADAPTER_ABI, HOMA_CORE_ADDRESS, HOMA_CORE_ABI } from '../../contracts/abi';

const SONEIUM_MINATO_CHAIN_ID = 1946;

interface ProjectData {
  id: number;
  name: string;
  isOpen: boolean;
}

interface HomaRunnerProps {
  onBack: () => void;
}

interface Obstacle {
  x: number;
  type: 'obstacle' | 'pit' | 'enemy';
  height: number;
  bottom: number;
  imageIndex?: number;
  passed?: boolean;
}

interface Collectible {
  x: number;
  y: number;
  collected: boolean;
}

interface MysteryBox {
  x: number;
  y: number;
  opened: boolean;
  forceFire: boolean;
}

interface Fireball {
  x: number;
  y: number;
}

interface Boss {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  type: 'red' | 'flying' | 'stone';
}

interface Cage {
  x: number;
  y: number;
  rescued: boolean;
}

interface GameState {
  isRunning: boolean;
  score: number;
  level: number;
  playerY: number;
  playerX: number;
  jumpSpeed: number;
  jumpCount: number;
  obstacles: Obstacle[];
  collectibles: Collectible[];
  mysteryBoxes: MysteryBox[];
  fireballs: Fireball[];
  cages: Cage[];
  gameSpeed: number;
  hasShield: boolean;
  hasFire: boolean;
  hasStar: boolean;
  isFrenzy: boolean;
  starsCollected: number;
  bossMode: boolean;
  bossEncountered: boolean;
  boss: Boss | null;
  combo: number;
  comboTimer: number | null;
  groundOffset: number;
  frameCount: number;
  bricksCollected: number;
  bossesDefeated: number;
  nextBossScore: number;
}

const GRAVITY = 0.9;
const JUMP_FORCE = 17;
const DOUBLE_JUMP_FORCE = 14;
const GROUND_Y = 80;
const PLAYER_SIZE = 50;
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;

export function HomaRunner({ onBack }: HomaRunnerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<{[key: string]: HTMLImageElement}>({});
  const imagesLoadedRef = useRef(false);
  const spawnerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const starTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTimeRef = useRef<number>(0);
  
  const TARGET_FRAME_TIME = 16.67;
  const MAX_LEVEL = 20;
  const MAX_SPEED = 15;
  
  const gameStateRef = useRef<GameState>({
    isRunning: false,
    score: 0,
    level: 1,
    playerY: GROUND_Y,
    playerX: 50,
    jumpSpeed: 0,
    jumpCount: 0,
    obstacles: [],
    collectibles: [],
    mysteryBoxes: [],
    fireballs: [],
    cages: [],
    gameSpeed: 6,
    hasShield: false,
    hasFire: false,
    hasStar: false,
    isFrenzy: false,
    starsCollected: 0,
    bossMode: false,
    bossEncountered: false,
    boss: null,
    combo: 0,
    comboTimer: null,
    groundOffset: 0,
    frameCount: 0,
    bricksCollected: 0,
    bossesDefeated: 0,
    nextBossScore: 50
  });
  const animationFrameRef = useRef<number>();

  const [screen, setScreen] = useState<'start' | 'playing' | 'gameover' | 'settings'>('start');
  const [displayScore, setDisplayScore] = useState(0);
  const [displayLevel, setDisplayLevel] = useState(1);
  const [showReviveModal, setShowReviveModal] = useState(false);
  const [multiplier, setMultiplier] = useState(1);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrateEnabled, setVibrateEnabled] = useState(true);
  const [showBossWarning, setShowBossWarning] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [comboText, setComboText] = useState('');
  const [powerupStatus, setPowerupStatus] = useState({ shield: false, fire: false, star: false });

  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { connect } = useConnect();
  const connectors = useConnectors();
  const { lotteryStatus, donate, isPending, isConfirming, isSuccess, userAccumulation, txHash, projectCount } = useHomaCore(address);
  const { ethToUsd } = useEthPrice();
  
  const isCorrectNetwork = chainId === SONEIUM_MINATO_CHAIN_ID;
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bgmGainRef = useRef<GainNode | null>(null);
  const bgmOscRef = useRef<OscillatorNode | null>(null);
  
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
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }, [soundEnabled]);
  
  const playSFX = useCallback((effect: string) => {
    if (effect === 'jump') {
      playTone(400, 'sine', 0.15);
      setTimeout(() => playTone(600, 'sine', 0.1), 80);
    }
    if (effect === 'slide') {
      playTone(200, 'square', 0.1);
    }
    if (effect === 'collect') {
      playTone(800, 'sine', 0.1);
      setTimeout(() => playTone(1000, 'sine', 0.1), 50);
    }
    if (effect === 'hit') {
      playTone(150, 'sawtooth', 0.3);
    }
    if (effect === 'powerup') {
      playTone(600, 'square', 0.1);
      setTimeout(() => playTone(800, 'square', 0.1), 100);
      setTimeout(() => playTone(1000, 'square', 0.15), 200);
    }
  }, [playTone]);
  
  const startBGM = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      
      if (bgmOscRef.current) {
        bgmOscRef.current.stop();
        bgmOscRef.current = null;
      }
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110, ctx.currentTime);
      
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.5, ctx.currentTime);
      lfoGain.gain.setValueAtTime(20, ctx.currentTime);
      
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      lfo.start();
      osc.start();
      
      bgmOscRef.current = osc;
      bgmGainRef.current = gain;
    } catch (e) {}
  }, [soundEnabled]);
  
  const stopBGM = useCallback(() => {
    if (bgmOscRef.current) {
      try {
        bgmOscRef.current.stop();
      } catch (e) {}
      bgmOscRef.current = null;
    }
  }, []);
  
  useEffect(() => {
    if (!soundEnabled) {
      stopBGM();
    }
  }, [soundEnabled, stopBGM]);
  const [pendingConnect, setPendingConnect] = useState(false);
  const handledTxRef = useRef<string | null>(null);
  const [selectedProject, setSelectedProject] = useState(0);
  const [projects, setProjects] = useState<ProjectData[]>([]);

  const { data: playerStats } = useReadContract({
    address: RUNNER_ADAPTER_ADDRESS as `0x${string}`,
    abi: RUNNER_ADAPTER_ABI,
    functionName: 'getPlayerStats',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  });

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

  const savedScore = playerStats ? Number((playerStats as [bigint, bigint])[0]) : 0;
  const savedLevel = playerStats ? Number((playerStats as [bigint, bigint])[1]) : 1;

  const BASE_PRICE = 0.0001;
  const reviveCost = BASE_PRICE * multiplier;
  const lotteryPool = lotteryStatus ? parseFloat((Number(lotteryStatus[0]) / 1e18).toFixed(4)) : 0;
  const userTickets = userAccumulation ? Number(userAccumulation[1]) : 0;
  const userCents = userAccumulation ? Number(userAccumulation[0]) : 0;

  useEffect(() => {
    const imageList = [
      { key: 'background', src: '/Background.png' },
      { key: 'foreground', src: '/Foreground.png' },
      { key: 'player', src: '/Teddy_Bear.png' },
      { key: 'obstacle1', src: '/Obstacle_1.png' },
      { key: 'obstacle2', src: '/Obstacle_2.png' },
      { key: 'obstacle3', src: '/Obstacle_3.png' }
    ];

    let loaded = 0;
    imageList.forEach(({ key, src }) => {
      const img = new Image();
      img.onload = () => {
        loaded++;
        if (loaded === imageList.length) {
          imagesLoadedRef.current = true;
        }
      };
      img.src = src;
      imagesRef.current[key] = img;
    });
  }, []);

  const vibrate = useCallback((pattern: number | number[]) => {
    if (vibrateEnabled && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }, [vibrateEnabled]);

  const addCombo = useCallback(() => {
    const state = gameStateRef.current;
    state.combo++;
    
    if (comboTimerRef.current) {
      clearTimeout(comboTimerRef.current);
    }
    comboTimerRef.current = setTimeout(() => {
      gameStateRef.current.combo = 0;
    }, 1500);
    
    if (state.combo > 1) {
      setComboText(`COMBO x${state.combo}!`);
      setTimeout(() => setComboText(''), 600);
      return state.combo;
    }
    return 1;
  }, []);

  const activateShield = useCallback(() => {
    gameStateRef.current.hasShield = true;
    setPowerupStatus(prev => ({ ...prev, shield: true }));
    vibrate(50);
  }, [vibrate]);

  const deactivateShield = useCallback(() => {
    gameStateRef.current.hasShield = false;
    setPowerupStatus(prev => ({ ...prev, shield: false }));
  }, []);

  const activateFire = useCallback(() => {
    gameStateRef.current.hasFire = true;
    setPowerupStatus(prev => ({ ...prev, fire: true }));
    vibrate(50);
  }, [vibrate]);

  const deactivateFire = useCallback(() => {
    gameStateRef.current.hasFire = false;
    setPowerupStatus(prev => ({ ...prev, fire: false }));
  }, []);

  const deactivateStar = useCallback(() => {
    const state = gameStateRef.current;
    if (state.hasStar && !state.isFrenzy) {
      state.gameSpeed -= 2;
    }
    state.hasStar = false;
    setPowerupStatus(prev => ({ ...prev, star: false }));
  }, []);

  const deactivateFrenzy = useCallback(() => {
    const state = gameStateRef.current;
    state.isFrenzy = false;
    state.hasStar = false;
    state.gameSpeed -= 5;
    setPowerupStatus(prev => ({ ...prev, star: false }));
  }, []);

  const activateFrenzy = useCallback(() => {
    const state = gameStateRef.current;
    
    if (state.hasStar && !state.isFrenzy) {
      state.gameSpeed -= 2;
    }
    if (starTimerRef.current) clearTimeout(starTimerRef.current);
    
    state.isFrenzy = true;
    state.starsCollected = 0;
    state.hasStar = true;
    state.gameSpeed = Math.min(state.gameSpeed + 5, MAX_SPEED + 5);
    setPowerupStatus(prev => ({ ...prev, star: true }));
    vibrate([50, 50, 50]);
    
    starTimerRef.current = setTimeout(() => deactivateFrenzy(), 10000);
  }, [vibrate, deactivateFrenzy]);

  const activateStar = useCallback(() => {
    const state = gameStateRef.current;
    if (state.hasStar && !state.isFrenzy) {
      if (starTimerRef.current) clearTimeout(starTimerRef.current);
    } else if (!state.isFrenzy) {
      state.gameSpeed = Math.min(state.gameSpeed + 2, MAX_SPEED + 2);
    }
    state.hasStar = true;
    setPowerupStatus(prev => ({ ...prev, star: true }));
    vibrate(50);
    
    starTimerRef.current = setTimeout(() => deactivateStar(), 5000);
  }, [vibrate, deactivateStar]);

  const collectStar = useCallback(() => {
    const state = gameStateRef.current;
    state.starsCollected++;
    if (state.starsCollected >= 3) {
      activateFrenzy();
    } else {
      activateStar();
    }
  }, [activateFrenzy, activateStar]);

  const initGame = useCallback((useSavedProgress = false) => {
    if (spawnerRef.current) clearTimeout(spawnerRef.current);
    if (starTimerRef.current) clearTimeout(starTimerRef.current);
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    
    const safeLevel = Math.min(savedLevel > 0 ? savedLevel : 1, MAX_LEVEL);
    const startLevel = useSavedProgress && savedLevel > 0 ? safeLevel : 1;
    const startScore = useSavedProgress && savedScore > 0 ? savedScore : 0;
    const calculatedSpeed = 6 + (startLevel - 1) * 0.5;
    const startSpeed = Math.min(calculatedSpeed, MAX_SPEED);
    
    gameStateRef.current = {
      isRunning: true,
      score: startScore,
      level: startLevel,
      playerY: GROUND_Y,
      playerX: 50,
      jumpSpeed: 0,
      jumpCount: 0,
      obstacles: [],
      collectibles: [],
      mysteryBoxes: [],
      fireballs: [],
      cages: [],
      gameSpeed: startSpeed,
      hasShield: false,
      hasFire: false,
      hasStar: false,
      isFrenzy: false,
      starsCollected: 0,
      bossMode: false,
      bossEncountered: false,
      boss: null,
      combo: 0,
      comboTimer: null,
      groundOffset: 0,
      frameCount: 0,
      bricksCollected: 0,
      bossesDefeated: 0,
      nextBossScore: startScore + 50
    };
    setDisplayScore(startScore);
    setDisplayLevel(startLevel);
    setPowerupStatus({ shield: false, fire: false, star: false });
    setShowBossWarning(false);
  }, [savedLevel, savedScore]);

  const createEnemy = useCallback((startPos: number) => {
    const state = gameStateRef.current;
    state.obstacles.push({
      x: startPos,
      type: 'enemy',
      height: 40,
      bottom: GROUND_Y
    });
  }, []);

  const createObstacle = useCallback(() => {
    const state = gameStateRef.current;
    const bottom = Math.random() > 0.85 ? 160 : 85;
    state.obstacles.push({
      x: 450,
      type: 'obstacle',
      height: 60,
      bottom: bottom,
      imageIndex: Math.floor(Math.random() * 3),
      passed: false
    });
  }, []);

  const createPit = useCallback(() => {
    const state = gameStateRef.current;
    state.obstacles.push({
      x: 450,
      type: 'pit',
      height: 90,
      bottom: 0
    });
  }, []);

  const createCollectible = useCallback(() => {
    const state = gameStateRef.current;
    const y = Math.random() > 0.5 ? 120 : 180;
    state.collectibles.push({
      x: 450,
      y: y,
      collected: false
    });
  }, []);

  const createMysteryBox = useCallback((forceFire: boolean) => {
    const state = gameStateRef.current;
    state.mysteryBoxes.push({
      x: 450,
      y: 160,
      opened: false,
      forceFire: forceFire
    });
  }, []);

  const createCage = useCallback(() => {
    const state = gameStateRef.current;
    state.cages.push({
      x: 450,
      y: 85,
      rescued: false
    });
  }, []);

  const createBoss = useCallback(() => {
    const state = gameStateRef.current;
    let hp = 10;
    let type: 'red' | 'flying' | 'stone' = 'red';
    let y = GROUND_Y;
    
    if (state.level < 5) {
      type = 'red';
      hp = 10;
    } else if (state.level < 10) {
      type = 'flying';
      hp = 15;
      y = 150;
    } else {
      type = 'stone';
      hp = 20;
    }
    
    state.boss = {
      x: 350,
      y: y,
      hp: hp,
      maxHp: hp,
      type: type
    };
  }, []);

  const startBossFight = useCallback(() => {
    const state = gameStateRef.current;
    state.bossMode = true;
    state.bossEncountered = true;
    
    if (spawnerRef.current) clearTimeout(spawnerRef.current);
    
    state.obstacles = state.obstacles.filter(o => o.type === 'pit');
    
    if (!state.hasFire) {
      createMysteryBox(true);
    }
    
    setShowBossWarning(true);
    vibrate([100, 50, 100]);
    
    setTimeout(() => {
      setShowBossWarning(false);
      createBoss();
    }, 2000);
  }, [createMysteryBox, createBoss, vibrate]);

  const spawnEnemyGroup = useCallback(() => {
    const state = gameStateRef.current;
    createEnemy(450);
    setTimeout(() => {
      if (state.isRunning) createEnemy(450);
    }, 500);
    setTimeout(() => {
      if (state.isRunning) createEnemy(450);
    }, 1000);
  }, [createEnemy]);

  const spawnManager = useCallback(() => {
    const state = gameStateRef.current;
    if (!state.isRunning || state.bossMode) return;
    
    if (state.score >= state.nextBossScore && !state.bossMode && !state.bossEncountered) {
      startBossFight();
      return;
    }
    
    const rand = Math.random();
    
    if (state.score > 30 && !state.hasFire && rand < 0.4) {
      createMysteryBox(true);
    } else if (rand < 0.05) {
      spawnEnemyGroup();
    } else if (rand < 0.20) {
      createMysteryBox(false);
    } else if (rand < 0.30) {
      createPit();
    } else if (rand < 0.35 && !state.hasStar) {
      createCage();
    } else if (rand < 0.65) {
      createEnemy(450);
    } else if (rand < 0.95) {
      createObstacle();
    } else {
      createCollectible();
    }
    
    const rate = state.isFrenzy ? 600 : 1300;
    spawnerRef.current = setTimeout(() => spawnManager(), rate);
  }, [startBossFight, createMysteryBox, spawnEnemyGroup, createPit, createCage, createEnemy, createObstacle, createCollectible]);

  const gameOver = useCallback(() => {
    const state = gameStateRef.current;
    state.isRunning = false;
    if (spawnerRef.current) clearTimeout(spawnerRef.current);
    if (starTimerRef.current) clearTimeout(starTimerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    
    if (state.isFrenzy) {
      state.isFrenzy = false;
      state.gameSpeed -= 5;
    }
    
    stopBGM();
    playSFX('hit');
    vibrate([100, 50, 100]);
    setShowReviveModal(true);
    setScreen('gameover');
  }, [vibrate, stopBGM, playSFX]);

  const levelUp = useCallback(() => {
    const state = gameStateRef.current;
    state.level = Math.min(state.level + 1, MAX_LEVEL);
    state.gameSpeed = Math.min(state.gameSpeed + 0.5, MAX_SPEED);
    setDisplayLevel(state.level);
    setShowLevelUp(true);
    playSFX('powerup');
    vibrate([50, 50, 50]);
    setTimeout(() => setShowLevelUp(false), 1500);
  }, [vibrate, playSFX]);

  const drawPlayer = useCallback((ctx: CanvasRenderingContext2D, state: GameState) => {
    const img = imagesRef.current.player;
    const playerBottom = state.playerY;
    const playerScreenY = CANVAS_HEIGHT - playerBottom - PLAYER_SIZE;
    
    ctx.save();
    
    if (state.isFrenzy) {
      ctx.filter = `hue-rotate(${state.frameCount * 10 % 360}deg)`;
    } else if (state.hasStar) {
      ctx.filter = `hue-rotate(${state.frameCount * 5 % 360}deg)`;
    } else if (state.hasShield) {
      ctx.shadowColor = '#00cec9';
      ctx.shadowBlur = 15;
    } else if (state.hasFire) {
      ctx.filter = 'sepia(1) saturate(3)';
      ctx.shadowColor = '#e74c3c';
      ctx.shadowBlur = 10;
    }

    const bobY = Math.sin(state.frameCount * 0.3) * 3;
    
    if (img && img.complete) {
      ctx.drawImage(img, state.playerX, playerScreenY + bobY, PLAYER_SIZE, PLAYER_SIZE);
    } else {
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(state.playerX, playerScreenY + bobY, PLAYER_SIZE, PLAYER_SIZE);
      ctx.fillStyle = '#000';
      ctx.fillRect(state.playerX + 10, playerScreenY + bobY + 10, 8, 8);
      ctx.fillRect(state.playerX + 32, playerScreenY + bobY + 10, 8, 8);
    }
    
    ctx.restore();
  }, []);

  const drawObstacle = useCallback((ctx: CanvasRenderingContext2D, obs: Obstacle) => {
    const obsScreenY = CANVAS_HEIGHT - obs.bottom - obs.height;
    
    if (obs.type === 'obstacle') {
      const imgKey = `obstacle${(obs.imageIndex || 0) + 1}`;
      const img = imagesRef.current[imgKey];
      if (img && img.complete) {
        ctx.drawImage(img, obs.x, obsScreenY, 40, obs.height);
      } else {
        ctx.fillStyle = '#2C3E50';
        ctx.fillRect(obs.x, obsScreenY, 40, obs.height);
      }
    } else if (obs.type === 'pit') {
      const gradient = ctx.createLinearGradient(obs.x, CANVAS_HEIGHT - 90, obs.x, CANVAS_HEIGHT);
      gradient.addColorStop(0, '#cf1020');
      gradient.addColorStop(1, '#ff4500');
      ctx.fillStyle = gradient;
      ctx.fillRect(obs.x, CANVAS_HEIGHT - 90, 80, 90);
      ctx.fillStyle = '#2d3436';
      ctx.fillRect(obs.x - 5, CANVAS_HEIGHT - 90, 5, 90);
      ctx.fillRect(obs.x + 80, CANVAS_HEIGHT - 90, 5, 90);
    } else if (obs.type === 'enemy') {
      const wobble = Math.sin(gameStateRef.current.frameCount * 0.2) * 5;
      ctx.save();
      ctx.translate(obs.x + 20, obsScreenY + 20);
      ctx.rotate(wobble * Math.PI / 180);
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.arc(0, 0, 18, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#ecf0f1';
      ctx.beginPath();
      ctx.arc(-8, -5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(8, -5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(-8, 5, 16, 15);
      ctx.restore();
    }
  }, []);

  const drawCollectible = useCallback((ctx: CanvasRenderingContext2D, col: Collectible, frameCount: number) => {
    if (col.collected) return;
    
    const floatY = Math.sin(frameCount * 0.1) * 8;
    const screenY = CANVAS_HEIGHT - col.y - 32;
    
    ctx.save();
    ctx.shadowColor = 'gold';
    ctx.shadowBlur = 10;
    
    ctx.fillStyle = '#d63031';
    ctx.beginPath();
    const x = col.x + 16;
    const y = screenY + floatY + 16;
    ctx.moveTo(x, y + 8);
    ctx.bezierCurveTo(x - 10, y - 5, x - 10, y - 15, x, y - 10);
    ctx.bezierCurveTo(x + 10, y - 15, x + 10, y - 5, x, y + 8);
    ctx.fill();
    
    ctx.restore();
  }, []);

  const drawMysteryBox = useCallback((ctx: CanvasRenderingContext2D, box: MysteryBox, frameCount: number) => {
    const scale = 1 + Math.sin(frameCount * 0.1) * 0.05;
    const screenY = CANVAS_HEIGHT - box.y - 40;
    
    ctx.save();
    ctx.translate(box.x + 20, screenY + 20);
    ctx.scale(scale, scale);
    
    if (box.opened) {
      ctx.filter = 'grayscale(100%) brightness(0.5)';
    }
    
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(-20, -20, 40, 40);
    ctx.fillStyle = '#d35400';
    ctx.fillRect(-18, -18, 36, 36);
    ctx.fillStyle = '#f39c12';
    ctx.fillRect(-15, -15, 30, 30);
    
    if (!box.opened) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('?', -8, 8);
    }
    
    ctx.restore();
  }, []);

  const drawBoss = useCallback((ctx: CanvasRenderingContext2D, boss: Boss) => {
    const screenY = CANVAS_HEIGHT - boss.y - 140;
    
    ctx.save();
    
    ctx.fillStyle = boss.type === 'red' ? '#c0392b' : 
                    boss.type === 'flying' ? '#3498db' : '#7f8c8d';
    
    ctx.beginPath();
    ctx.arc(boss.x + 70, screenY + 70, 60, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(boss.x + 40, screenY + 60, 60, 20);
    
    ctx.fillStyle = '#333';
    ctx.fillRect(boss.x, screenY - 10, 140, 15);
    ctx.fillStyle = '#e74c3c';
    const healthWidth = (boss.hp / boss.maxHp) * 136;
    ctx.fillRect(boss.x + 2, screenY - 8, healthWidth, 11);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(boss.x, screenY - 10, 140, 15);
    
    ctx.restore();
  }, []);

  const drawFireball = useCallback((ctx: CanvasRenderingContext2D, fb: Fireball, frameCount: number) => {
    const screenY = CANVAS_HEIGHT - fb.y - 25;
    
    ctx.save();
    ctx.translate(fb.x + 12, screenY + 12);
    ctx.rotate(frameCount * 0.3);
    
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(0.5, '#ff9f43');
    gradient.addColorStop(1, '#e67e22');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowColor = '#e67e22';
    ctx.shadowBlur = 15;
    
    ctx.restore();
  }, []);

  const drawCage = useCallback((ctx: CanvasRenderingContext2D, cage: Cage) => {
    if (cage.rescued) return;
    
    const screenY = CANVAS_HEIGHT - cage.y - 50;
    
    ctx.save();
    
    ctx.fillStyle = '#bdc3c7';
    ctx.fillRect(cage.x, screenY, 50, 50);
    
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.arc(cage.x + 25, screenY + 30, 10, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#333';
    ctx.fillRect(cage.x + 5, screenY, 5, 50);
    ctx.fillRect(cage.x + 20, screenY, 5, 50);
    ctx.fillRect(cage.x + 35, screenY, 5, 50);
    
    ctx.restore();
  }, []);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = gameStateRef.current;
    if (!state.isRunning) return;

    const now = performance.now();
    const dt = now - lastTimeRef.current;
    lastTimeRef.current = now;
    const delta = Math.min(dt / TARGET_FRAME_TIME, 3);

    state.frameCount++;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const bgImg = imagesRef.current.background;
    if (bgImg && bgImg.complete) {
      ctx.drawImage(bgImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
      const skyGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT - 100);
      skyGradient.addColorStop(0, '#1a1a2e');
      skyGradient.addColorStop(1, '#16213e');
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT - 100);
    }

    if (state.bossMode && state.boss) {
      state.boss.x -= 1.5 * delta;
      if (state.boss.x < 60) {
        gameOver();
        return;
      }
    }

    if (state.playerY > GROUND_Y || state.jumpSpeed > 0) {
      state.playerY += state.jumpSpeed * delta;
      state.jumpSpeed -= GRAVITY * delta;
    } else {
      let inPit = false;
      const PIT_WIDTH = 80;
      state.obstacles.forEach(p => {
        if (p.type === 'pit') {
          const pitLeft = p.x;
          const pitRight = p.x + PIT_WIDTH;
          const playerLeft = state.playerX;
          const playerRight = state.playerX + PLAYER_SIZE;
          if (pitRight > playerLeft && pitLeft < playerRight) {
            inPit = true;
          }
        }
      });
      
      if (!inPit) {
        state.jumpSpeed = 0;
        state.playerY = GROUND_Y;
        state.jumpCount = 0;
      } else {
        state.playerY -= 8 * delta;
        if (state.playerY < -50) {
          gameOver();
          return;
        }
      }
    }

    state.groundOffset -= state.gameSpeed * delta;
    if (state.groundOffset <= -CANVAS_WIDTH) {
      state.groundOffset = 0;
    }
    
    const fgImg = imagesRef.current.foreground;
    if (fgImg && fgImg.complete) {
      ctx.drawImage(fgImg, state.groundOffset, CANVAS_HEIGHT - 100, CANVAS_WIDTH, 100);
      ctx.drawImage(fgImg, state.groundOffset + CANVAS_WIDTH, CANVAS_HEIGHT - 100, CANVAS_WIDTH, 100);
    } else {
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(0, CANVAS_HEIGHT - 100, CANVAS_WIDTH, 100);
    }

    state.fireballs = state.fireballs.filter(fb => {
      fb.x += 10 * delta;
      drawFireball(ctx, fb, state.frameCount);
      
      let hit = false;
      
      if (state.bossMode && state.boss && !hit) {
        if (fb.x > state.boss.x && fb.x < state.boss.x + 120) {
          hit = true;
          state.boss.hp--;
          state.boss.x += 30;
          if (state.boss.x > 350) state.boss.x = 350;
          
          if (state.boss.hp <= 0) {
            state.boss = null;
            state.bossMode = false;
            state.bossEncountered = false;
            state.score += 50;
            state.bossesDefeated++;
            state.nextBossScore = state.score + 50;
            setDisplayScore(state.score);
            levelUp();
            deactivateFire();
            setTimeout(() => spawnManager(), 500);
          }
          vibrate(50);
        }
      }
      
      if (!hit) {
        state.obstacles = state.obstacles.filter((obs) => {
          if (!hit && obs.type === 'enemy' && fb.x > obs.x && fb.x < obs.x + 40) {
            hit = true;
            vibrate(30);
            return false;
          }
          if (!hit && obs.type === 'obstacle' && fb.x > obs.x && fb.x < obs.x + 40) {
            hit = true;
            vibrate(30);
            return false;
          }
          return true;
        });
      }
      
      return !hit && fb.x < 400;
    });

    state.cages = state.cages.filter(cage => {
      cage.x -= state.gameSpeed * delta;
      drawCage(ctx, cage);
      
      if (cage.x < -50) return false;
      
      if (!cage.rescued && cage.x > 10 && cage.x < 70 && 
          state.playerY >= 85 && state.jumpSpeed <= 0) {
        cage.rescued = true;
        state.score += 20;
        state.jumpSpeed = 10;
        setDisplayScore(state.score);
        vibrate(50);
        return false;
      }
      
      return true;
    });

    state.mysteryBoxes = state.mysteryBoxes.filter(box => {
      box.x -= state.gameSpeed * delta;
      drawMysteryBox(ctx, box, state.frameCount);
      
      if (box.x < -50) return false;
      
      if (!box.opened && box.x > 10 && box.x < 70 &&
          state.playerY + PLAYER_SIZE >= box.y && state.playerY < box.y &&
          state.jumpSpeed > 0) {
        box.opened = true;
        state.jumpSpeed = -5;
        vibrate(30);
        
        if (box.forceFire || !state.hasFire) {
          activateFire();
        } else {
          const r = Math.random();
          if (r < 0.3) {
            activateShield();
          } else if (r < 0.6) {
            activateFire();
          } else {
            collectStar();
          }
        }
      }
      
      return true;
    });

    state.obstacles = state.obstacles.filter(obs => {
      obs.x -= state.gameSpeed * delta;
      drawObstacle(ctx, obs);
      
      if (obs.x < -100) return false;
      
      if (obs.type === 'obstacle' && obs.x < 50 && !obs.passed) {
        state.score++;
        state.bricksCollected++;
        obs.passed = true;
        setDisplayScore(state.score);
      }
      
      if (obs.type === 'enemy' && obs.x > 10 && obs.x < 60) {
        const enemyTop = obs.bottom + 40;
        
        if (state.playerY >= enemyTop - 10 && state.jumpSpeed <= 0) {
          state.jumpSpeed = 12;
          const mult = addCombo();
          state.score += 5 * mult;
          setDisplayScore(state.score);
          vibrate(30);
          return false;
        } else if (state.playerY < enemyTop - 10) {
          if (state.hasStar || state.hasShield) {
            if (state.hasShield) deactivateShield();
            vibrate(50);
            return false;
          } else if (state.hasFire) {
            deactivateFire();
            vibrate(50);
            return false;
          } else {
            gameOver();
            return false;
          }
        }
      }
      
      if (obs.type === 'obstacle' && obs.x > 10 && obs.x < 60) {
        const obsTop = obs.bottom + obs.height;
        
        if ((obs.bottom < 100 && state.playerY < obsTop - 10) ||
            (obs.bottom >= 100 && state.playerY > 100 && state.playerY < obsTop)) {
          if (state.hasStar || state.hasShield) {
            if (state.hasShield) deactivateShield();
            if (state.hasStar) {
              state.score += 5;
              setDisplayScore(state.score);
            }
            vibrate(50);
            return false;
          } else if (state.hasFire) {
            deactivateFire();
            vibrate(50);
            return false;
          } else {
            gameOver();
            return false;
          }
        }
      }
      
      return true;
    });

    state.collectibles = state.collectibles.filter(col => {
      if (state.hasStar && col.x < 400 && col.x > -50) {
        const dx = 50 - col.x;
        const dy = state.playerY - col.y;
        col.x += dx * 0.15 * delta;
        col.y += dy * 0.15 * delta;
      } else {
        col.x -= state.gameSpeed * delta;
      }
      
      drawCollectible(ctx, col, state.frameCount);
      
      if (col.x < -50) return false;
      
      if (!col.collected && col.x > 10 && col.x < 70 &&
          state.playerY + 40 >= col.y && state.playerY <= col.y + 40) {
        col.collected = true;
        const mult = addCombo();
        state.score += 5 * mult;
        setDisplayScore(state.score);
        vibrate(20);
        return false;
      }
      
      return true;
    });

    if (state.boss) {
      drawBoss(ctx, state.boss);
    }

    drawPlayer(ctx, state);

    ctx.fillStyle = 'rgba(108, 92, 231, 0.95)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 35);
    ctx.fillStyle = '#fab1a0';
    ctx.fillRect(0, 35, CANVAS_WIDTH, 3);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px VT323, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`💎 ${state.score}`, 20, 60);
    ctx.fillText(`LVL ${state.level}`, 20, 85);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`🏆 POT: ${lotteryPool.toFixed(2)}`, CANVAS_WIDTH - 10, 60);

    ctx.textAlign = 'left';

    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [gameOver, levelUp, deactivateFire, deactivateShield, activateFire, activateShield, collectStar, addCombo, vibrate, lotteryPool, drawPlayer, drawObstacle, drawCollectible, drawMysteryBox, drawCage, drawBoss, drawFireball, spawnManager]);

  const handleJump = useCallback(() => {
    const state = gameStateRef.current;
    if (state.playerY <= GROUND_Y + 5) {
      state.jumpSpeed = JUMP_FORCE;
      state.jumpCount = 1;
      vibrate(10);
      playSFX('jump');
    } else if (state.jumpCount < 2) {
      state.jumpSpeed = DOUBLE_JUMP_FORCE;
      state.jumpCount = 2;
      vibrate(10);
      playSFX('jump');
    }
  }, [vibrate, playSFX]);

  const handleShoot = useCallback(() => {
    const state = gameStateRef.current;
    if (state.hasFire) {
      state.fireballs.push({
        x: state.playerX + PLAYER_SIZE,
        y: state.playerY + PLAYER_SIZE / 2
      });
      vibrate(20);
    }
  }, [vibrate]);

  const startGame = useCallback((useSavedProgress = false) => {
    setShowReviveModal(false);
    initGame(useSavedProgress);
    setScreen('playing');
    startBGM();
    lastTimeRef.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(gameLoop);
    spawnerRef.current = setTimeout(() => spawnManager(), 1000);
  }, [initGame, gameLoop, spawnManager, startBGM]);

  const handleRevive = useCallback(async () => {
    if (!isConnected) return;
    
    const usdCents = Math.floor(ethToUsd(reviveCost) * 100);
    await donate(
      selectedProject,
      reviveCost.toFixed(8),
      true,
      usdCents,
      RUNNER_ADAPTER_ADDRESS,
      { level: displayLevel, score: displayScore }
    );
  }, [isConnected, reviveCost, donate, ethToUsd, displayLevel, displayScore, selectedProject]);

  useEffect(() => {
    if (isSuccess && showReviveModal && txHash && handledTxRef.current !== txHash) {
      handledTxRef.current = txHash;
      setShowReviveModal(false);
      setMultiplier(prev => Math.min(prev * 2, 100));
      
      const state = gameStateRef.current;
      state.isRunning = true;
      state.hasShield = true;
      state.playerY = GROUND_Y;
      state.jumpSpeed = 0;
      
      state.obstacles = state.obstacles.filter(o => o.x > 300 || o.x < -50);
      
      if (state.boss) {
        state.boss.x += 200;
        if (state.boss.x > 350) state.boss.x = 350;
      }
      
      setPowerupStatus(prev => ({ ...prev, shield: true }));
      setScreen('playing');
      lastTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(gameLoop);
      spawnerRef.current = setTimeout(() => spawnManager(), 500);
    }
  }, [isSuccess, showReviveModal, txHash, gameLoop, spawnManager]);

  useEffect(() => {
    if (isConnected && pendingConnect) {
      setPendingConnect(false);
    }
  }, [isConnected, pendingConnect]);

  const handleConnectWallet = useCallback(() => {
    if (connectors.length > 0) {
      setPendingConnect(true);
      connect({ connector: connectors[0] });
    }
  }, [connect, connectors]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (screen === 'playing') {
          handleJump();
        }
      }
      if (e.code === 'KeyX' || e.code === 'KeyF') {
        if (screen === 'playing') {
          handleShoot();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, handleJump, handleShoot]);

  useEffect(() => {
    return () => {
      stopBGM();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (spawnerRef.current) {
        clearTimeout(spawnerRef.current);
      }
      if (starTimerRef.current) {
        clearTimeout(starTimerRef.current);
      }
      if (comboTimerRef.current) {
        clearTimeout(comboTimerRef.current);
      }
    };
  }, [stopBGM]);

  return (
    <div className="runner-container">
      <div className="game-wrapper">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className={`game-canvas ${gameStateRef.current.isFrenzy ? 'frenzy-mode' : ''}`}
          onClick={() => screen === 'playing' && handleJump()}
          onTouchStart={(e) => {
            e.preventDefault();
            if (screen === 'playing') handleJump();
          }}
        />

        {showBossWarning && (
          <div className="boss-warning">
            ⚠️ BOSS BATTLE ⚠️
            <br />
            <span>{gameStateRef.current.hasFire ? 'SHOOT TO KILL!' : 'FIRE SPAWNED! GRAB IT!'}</span>
          </div>
        )}

        {showLevelUp && (
          <div className="level-up-msg">LEVEL {displayLevel}!</div>
        )}

        {comboText && (
          <div className="combo-text">{comboText}</div>
        )}

        {screen === 'playing' && (
          <div className="powerup-status">
            {powerupStatus.shield && <div className="status-item shield-active">🛡️ SHIELD</div>}
            {powerupStatus.fire && <div className="status-item fire-active">🔥 FIRE LOADED!</div>}
            {powerupStatus.star && <div className="status-item star-active">{gameStateRef.current.isFrenzy ? '🔥 FRENZY!' : '⭐ STAR'}</div>}
          </div>
        )}

        {screen === 'playing' && powerupStatus.fire && (
          <button className="shoot-btn" onClick={handleShoot} onTouchStart={(e) => { e.preventDefault(); handleShoot(); }}>
            🔥
          </button>
        )}

        {screen === 'start' && (
          <div className="game-overlay start-screen">
            <div className="panel">
              <h1>HOMA RUNNER</h1>
              
              {isConnected && savedLevel > 0 && (
                <div className="saved-progress-box">
                  <div className="saved-header">💾 SAVED PROGRESS</div>
                  <div className="saved-stats">
                    <span>Level: {savedLevel}</span>
                    <span>Score: {savedScore}</span>
                  </div>
                </div>
              )}
              
              <div className="start-buttons">
                {isConnected && savedLevel > 0 && (
                  <button className="action-btn continue-btn" onClick={() => startGame(true)}>
                    ▶ CONTINUE (Lvl {savedLevel})
                  </button>
                )}
                <button className="action-btn start-btn" onClick={() => startGame(false)}>
                  🔄 NEW GAME
                </button>
                <button className="action-btn secondary-btn" onClick={onBack}>
                  ← BACK TO MENU
                </button>
              </div>
              
              <p className="controls-hint">
                TAP or SPACE to jump (double jump!) | X to shoot
              </p>
            </div>
          </div>
        )}

        {screen === 'gameover' && showReviveModal && (
          <div className="snake-gameover-screen">
            <div className="snake-gameover-panel">
              <h2 className="snake-gameover-title">GAME OVER</h2>
              
              <div className="runner-score-section">
                <div className="runner-score-item">
                  <span className="runner-score-label">LEVEL</span>
                  <span className="runner-score-value">{displayLevel}</span>
                </div>
                <div className="runner-score-item">
                  <span className="runner-score-label">SCORE</span>
                  <span className="runner-score-value">{displayScore}</span>
                </div>
              </div>
              
              {isConnected && (
                <div className="snake-user-status">
                  <div className="snake-stat-item">
                    <div className="snake-stat-val">{userTickets}</div>
                    <div className="snake-stat-lbl">Tickets</div>
                  </div>
                  <div className="snake-stat-item">
                    <div className="snake-stat-val">{userCents}¢</div>
                    <div className="snake-stat-lbl">Accumulated</div>
                  </div>
                  <div className="snake-stat-item">
                    <div className="snake-stat-val" style={{ color: '#ffd700' }}>{100 - (userCents % 100)}¢</div>
                    <div className="snake-stat-lbl" style={{ color: '#ffd700' }}>Next Ticket</div>
                  </div>
                </div>
              )}
              
              {!isConnected ? (
                <div className="snake-connect-section">
                  <p className="snake-connect-note">Connect your wallet to save score and donate!</p>
                  <button 
                    className="snake-btn-green"
                    onClick={handleConnectWallet}
                  >
                    CONNECT WALLET
                  </button>
                </div>
              ) : (
                <>
                  <div className="snake-donation-section">
                    <label className="snake-project-label">Select Project:</label>
                    <select 
                      className="snake-project-select"
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(parseInt(e.target.value))}
                    >
                      {projects.filter(p => p.isOpen).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                      {projects.filter(p => p.isOpen).length === 0 && (
                        <option>Loading Projects...</option>
                      )}
                    </select>
                    
                    <div className="snake-donation-header">
                      <span>Donate:</span>
                      <span className="snake-usd-amount">${ethToUsd(reviveCost).toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={multiplier}
                      onChange={(e) => setMultiplier(Number(e.target.value))}
                      className="snake-donation-slider"
                    />
                    <div className="snake-eth-cost">
                      {reviveCost.toFixed(6)} ETH
                    </div>
                    {ethToUsd(reviveCost) < 1 && (
                      <div className="snake-acc-warning">Accumulates until $1</div>
                    )}
                  </div>
                  
                  {!isCorrectNetwork ? (
                    <button 
                      className="snake-btn-green snake-btn-switch" 
                      onClick={() => switchChain({ chainId: SONEIUM_MINATO_CHAIN_ID })}
                    >
                      Switch to Soneium
                    </button>
                  ) : (
                    <button 
                      className="snake-btn-green" 
                      onClick={handleRevive}
                      disabled={isPending || isConfirming}
                    >
                      {isPending || isConfirming ? 'Processing...' : 'SAVE SCORE & DONATE'}
                    </button>
                  )}
                </>
              )}
              
              <div className="snake-gameover-actions">
                <button className="snake-btn-outline" onClick={() => startGame(false)}>
                  REPLAY
                </button>
                <button className="snake-btn-exit" onClick={onBack}>
                  EXIT
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === 'settings' && (
          <div className="game-overlay settings-screen">
            <div className="settings-panel">
              <h2>SETTINGS</h2>
              
              <div className="setting-row">
                <span>Sound:</span>
                <button 
                  className="action-btn toggle-btn"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                >
                  {soundEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              
              <div className="setting-row">
                <span>Vibrate:</span>
                <button 
                  className="action-btn toggle-btn"
                  onClick={() => setVibrateEnabled(!vibrateEnabled)}
                >
                  {vibrateEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              
              <button 
                className="action-btn secondary-btn close-btn"
                onClick={() => setScreen('start')}
              >
                CLOSE
              </button>
            </div>
          </div>
        )}

        <button className="settings-btn" onClick={() => setScreen(screen === 'settings' ? 'start' : 'settings')}>
          ⚙️
        </button>
      </div>
    </div>
  );
}
