/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Trophy, User } from 'lucide-react';

// --- Types & Constants ---

type GameState = 'HOME' | 'PLAYING' | 'GAME_OVER';

interface Character {
  id: string;
  color: string;
  name: string;
  shape: 'square' | 'circle' | 'triangle' | 'diamond';
}

const CHARACTERS: Character[] = [
  { id: '1', color: '#a3e635', name: 'Klassik', shape: 'square' },
  { id: '2', color: '#3b82f6', name: 'Neon-Blau', shape: 'square' },
  { id: '3', color: '#f43f5e', name: 'Cyber-Rot', shape: 'square' },
  { id: '4', color: '#e879f9', name: 'Vapor-Lila', shape: 'square' },
];

const GRAVITY = 0.65;
const JUMP_STRENGTH = -11.5;
const INITIAL_SPEED = 6.2;
const SPEED_INCREMENT = 0; // Speed stays constant as requested
const GROUND_HEIGHT = 120;
const PLAYER_SIZE = 42;

interface Obstacle {
  x: number;
  width: number;
  height: number;
  type: 'spike' | 'triple_spike' | 'block';
}

interface Particle {
  x: number;
  y: number;
  size: number;
  life: number;
}

// --- App Component ---

export default function App() {
  const [gameState, setGameState] = useState<GameState>('HOME');
  const [selectedChar, setSelectedChar] = useState<Character>(CHARACTERS[0]);
  const [score, setScore] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [highScore, setHighScore] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Game state refs (to avoid closure staleness in loop)
  const gameRef = useRef({
    playerY: 0,
    playerVelocityY: 0,
    isJumping: false,
    obstacles: [] as Obstacle[],
    particles: [] as Particle[],
    speed: INITIAL_SPEED,
    distance: 0,
    animationFrame: 0,
    lastObstacleX: 0,
    dimensions: { width: 0, height: 0 }
  });

  // Handle Resize
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0] && canvasRef.current) {
        const { width, height } = entries[0].contentRect;
        canvasRef.current.width = width;
        canvasRef.current.height = height;
        gameRef.current.dimensions = { width, height };
        gameRef.current.playerY = height - GROUND_HEIGHT - PLAYER_SIZE;
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const jump = useCallback(() => {
    if (!gameRef.current.isJumping && gameState === 'PLAYING') {
      gameRef.current.playerVelocityY = JUMP_STRENGTH;
      gameRef.current.isJumping = true;
    }
  }, [gameState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [jump]);

  const startGame = () => {
    gameRef.current.speed = INITIAL_SPEED;
    gameRef.current.distance = 0;
    gameRef.current.obstacles = [];
    gameRef.current.particles = [];
    gameRef.current.playerVelocityY = 0;
    gameRef.current.isJumping = false;
    gameRef.current.lastObstacleX = gameRef.current.dimensions.width + 1000; 
    setScore(0);
    setLastScore(null);
    setGameState('PLAYING');
  };

  const gameOver = () => {
    setLastScore(Math.floor(gameRef.current.distance / 10));
    setGameState('HOME');
    cancelAnimationFrame(gameRef.current.animationFrame);
  };

  // Game Loop
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    const loop = () => {
      const { width, height } = gameRef.current.dimensions;
      
      // Update Physics
      gameRef.current.speed += SPEED_INCREMENT;
      gameRef.current.distance += gameRef.current.speed;
      setScore(Math.floor(gameRef.current.distance / 10));

      // Player Movement
      gameRef.current.playerVelocityY += GRAVITY;
      gameRef.current.playerY += gameRef.current.playerVelocityY;

      const groundY = height - GROUND_HEIGHT - PLAYER_SIZE;
      if (gameRef.current.playerY > groundY) {
        gameRef.current.playerY = groundY;
        gameRef.current.playerVelocityY = 0;
        gameRef.current.isJumping = false;
      }

      // Particle Trail
      if (Math.random() > 0.6) {
        gameRef.current.particles.push({
          x: 100,
          y: gameRef.current.playerY + PLAYER_SIZE / 2 + (Math.random() * 20 - 10),
          size: Math.random() * 7 + 2,
          life: 1.0
        });
      }
      gameRef.current.particles.forEach((p, i) => {
        p.x -= gameRef.current.speed * 0.5;
        p.life -= 0.02;
        if (p.life <= 0) gameRef.current.particles.splice(i, 1);
      });

      // Obstacle Generation (Rhythmic Distribution)
      if (gameRef.current.distance > gameRef.current.lastObstacleX - width) {
        // Force a fair gap between obstacle "clusters"
        // 1200 - 1800 units is roughly 3-4 seconds of "clear" landing space
        const landingSpace = 1000 + Math.random() * 800; 
        
        const typeRand = Math.random();
        let type: Obstacle['type'] = 'spike';
        if (typeRand > 0.85) type = 'triple_spike';
        else if (typeRand > 0.7) type = 'block';

        gameRef.current.obstacles.push({
          x: width + landingSpace,
          width: type === 'triple_spike' ? 120 : 40,
          height: 40,
          type
        });
        
        // Update lastObstacleX to ensure the NEXT gap starts AFTER this one
        gameRef.current.lastObstacleX = gameRef.current.distance + width + landingSpace;
      }

      // Update Obstacles & Collision
      gameRef.current.obstacles = gameRef.current.obstacles.filter(obs => {
        obs.x -= gameRef.current.speed;
        
        const playerBox = {
          x: 100,
          y: gameRef.current.playerY,
          w: PLAYER_SIZE,
          h: PLAYER_SIZE
        };
        
        const obsBox = {
          x: obs.x,
          y: height - GROUND_HEIGHT - obs.height,
          w: obs.width,
          h: obs.height
        };

        const margin = 10;
        if (
          playerBox.x + margin < obsBox.x + obsBox.w - margin &&
          playerBox.x + playerBox.w - margin > obsBox.x + margin &&
          playerBox.y + margin < obsBox.y + obsBox.h - margin &&
          playerBox.y + playerBox.h - margin > obsBox.y + margin
        ) {
          gameOver();
        }

        return obs.x + obs.width > -200;
      });

      // --- Drawing ---
      // Background Gradient
      const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
      bgGradient.addColorStop(0, '#0066ff'); // Blue top
      bgGradient.addColorStop(1, '#001a4d'); // Dark blue bottom
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      // Background Panels (Large squares)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 4;
      const panelSize = 400;
      const panOffset = (gameRef.current.distance * 0.2) % panelSize;
      for (let x = -panOffset; x < width + panelSize; x += panelSize) {
        for (let y = 0; y < height; y += panelSize) {
          ctx.strokeRect(x, y, panelSize, panelSize);
        }
      }

      // Ground
      ctx.fillStyle = '#0a102e';
      ctx.fillRect(0, height - GROUND_HEIGHT, width, GROUND_HEIGHT);
      
      // Ground Detail (Vertical lines)
      const gPanelSize = 100;
      const gOffset = (gameRef.current.distance) % gPanelSize;
      ctx.strokeStyle = '#223366';
      ctx.lineWidth = 3;
      for (let x = -gOffset; x < width + gPanelSize; x += gPanelSize) {
        ctx.beginPath();
        ctx.moveTo(x, height - GROUND_HEIGHT);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Bright Ground line
      ctx.strokeStyle = 'white';
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'white';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, height - GROUND_HEIGHT);
      ctx.lineTo(width, height - GROUND_HEIGHT);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Particles
      gameRef.current.particles.forEach(p => {
        ctx.fillStyle = `rgba(255, 255, 255, ${p.life * 0.6})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      });

      // Obstacles
      gameRef.current.obstacles.forEach(obs => {
        const obsY = height - GROUND_HEIGHT - obs.height;
        if (obs.type === 'spike' || obs.type === 'triple_spike') {
          const count = obs.type === 'triple_spike' ? 3 : 1;
          for(let i=0; i<count; i++) {
            const startX = obs.x + (i * 40);
            
            // Outer glow spike
            ctx.shadowBlur = 20;
            ctx.shadowColor = 'white';
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.moveTo(startX, height - GROUND_HEIGHT);
            ctx.lineTo(startX + 20, obsY);
            ctx.lineTo(startX + 40, height - GROUND_HEIGHT);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Inner dark spike
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.moveTo(startX + 6, height - GROUND_HEIGHT);
            ctx.lineTo(startX + 20, obsY + 10);
            ctx.lineTo(startX + 34, height - GROUND_HEIGHT);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = '#112244';
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 3;
          ctx.fillRect(obs.x, obsY, obs.width, obs.height);
          ctx.strokeRect(obs.x, obsY, obs.width, obs.height);
        }
      });

      // Player
      ctx.save();
      ctx.translate(100 + PLAYER_SIZE / 2, gameRef.current.playerY + PLAYER_SIZE / 2);
      
      if (gameRef.current.isJumping) {
        ctx.rotate(((gameRef.current.distance / 12) % 360 * Math.PI) / 180);
      }
      
      const half = PLAYER_SIZE / 2;
      ctx.shadowBlur = 20;
      ctx.shadowColor = selectedChar.color;
      
      // Multi-layer Square
      ctx.fillStyle = selectedChar.color;
      ctx.fillRect(-half, -half, PLAYER_SIZE, PLAYER_SIZE);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeRect(-half, -half, PLAYER_SIZE, PLAYER_SIZE);

      // Inset pattern
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(-half + 8, -half + 8, PLAYER_SIZE - 16, PLAYER_SIZE - 16);

      // Core detail
      ctx.fillStyle = '#00ffff'; // Neon glow center
      if (selectedChar.id === '1') {
        ctx.fillRect(-4, -4, 8, 8);
        ctx.strokeRect(-4, -4, 8, 8);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-6, -6, 12, 12);
        ctx.strokeRect(-6, -6, 12, 12);
      }
      
      ctx.restore();

      gameRef.current.animationFrame = requestAnimationFrame(loop);
    };

    gameRef.current.animationFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(gameRef.current.animationFrame);
  }, [gameState, selectedChar]);

  useEffect(() => {
    if (score > highScore) setHighScore(score);
  }, [score, highScore]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen bg-slate-950 overflow-hidden font-sans text-white select-none"
      onClick={jump}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* --- Score Overlay --- */}
      {gameState === 'PLAYING' && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 text-5xl font-black italic tracking-tighter opacity-80 flex flex-col items-center">
          <span className="text-xs uppercase tracking-[0.4em] font-bold mb-1 opacity-50 not-italic">Score</span>
          {score}
        </div>
      )}

      {/* --- Home Screen --- */}
      <AnimatePresence>
        {gameState === 'HOME' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-[#001a4d]/90 backdrop-blur-md"
          >
            {lastScore !== null && (
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mb-8 text-center"
              >
                <h2 className="text-6xl font-black text-red-500 tracking-tighter mb-2 italic drop-shadow-xl">CRASHED!</h2>
                <p className="text-xl font-bold text-white/50 uppercase tracking-[0.3em]">Score: {lastScore}</p>
              </motion.div>
            )}

            <motion.h1 
              initial={{ y: -50 }}
              animate={{ y: 0 }}
              className="text-8xl font-black mb-16 tracking-tighter italic text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]"
            >
              GEOMETRY JUMPER
            </motion.h1>

            <div className="flex flex-col items-center gap-10">
              <div className="flex gap-6">
                {CHARACTERS.map((char) => (
                  <motion.button
                    key={char.id}
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedChar(char);
                    }}
                    className={`w-20 h-20 rounded-2xl border-4 transition-all flex items-center justify-center ${
                      selectedChar.id === char.id 
                        ? 'border-white shadow-[0_0_30px_rgba(255,255,255,0.4)] scale-110' 
                        : 'border-transparent bg-white/10 opacity-60'
                    }`}
                  >
                    <div 
                      className="w-12 h-12 border-2 border-black relative flex items-center justify-center"
                      style={{ backgroundColor: char.color }}
                    >
                      <div className="w-8 h-8 border-2 border-black/40 flex items-center justify-center">
                        <div className="w-4 h-4 bg-[#00ffff] border border-black" />
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
              <p className="text-white/30 font-black uppercase tracking-[0.4em] text-xs">CHOOSE YOUR JUMPER</p>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                startGame();
              }}
              className="mt-20 bg-white text-[#001a4d] px-16 py-6 rounded-3xl font-black text-4xl flex items-center gap-5 shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:shadow-white/60 transition-all uppercase italic"
            >
              <Play fill="currentColor" size={40} />
              PLAY
            </motion.button>

            <div className="mt-12 flex items-center gap-3 text-white/30">
              <Trophy className="w-5 h-5" />
              <span className="text-lg font-bold uppercase tracking-[0.2em]">High: {highScore}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instructions */}
      {gameState === 'PLAYING' && score < 10 && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.3, scale: 1 }}
          className="absolute bottom-40 left-1/2 -translate-x-1/2 text-lg font-black uppercase tracking-[0.8em]"
        >
          JUMP
        </motion.div>
      )}
    </div>
  );
}
