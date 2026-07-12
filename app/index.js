import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
  Modal,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

const HIT_DISTANCE = 25;
const STAR_BASE_SPEED = 4;
const BULLET_SPEED = 10;
const MAX_STARS = 15;
const HIGH_SCORE_KEY = 'shootingStars_highScore';

const MIN_STAR_Y = 140;
const MAX_STAR_Y = SCREEN_HEIGHT - 280;

function createInitialStars() {
  return [
    { id: Date.now() + 1, x: -40, y: 160 },
    { id: Date.now() + 2, x: -150, y: 240 },
    { id: Date.now() + 3, x: -260, y: 320 },
  ];
}

function createNewStar(id) {
  return {
    id,
    x: -40 - Math.random() * 100,
    y: MIN_STAR_Y + Math.random() * (MAX_STAR_Y - MIN_STAR_Y),
  };
}

// Creates a small burst of particles at a given position, each flying off in a random direction
function createParticleBurst(x, y) {
  const particles = [];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 2 + Math.random() * 2;
    particles.push({
      id: Date.now() + Math.random(),
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 15,
    });
  }
  return particles;
}

// A small reusable button that gently scales down when pressed, for a "modern app" feel
function AnimatedButton({ style, onPress, children, disabled }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 40 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={style}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        activeOpacity={0.85}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function Index() {
  const [screen, setScreen] = useState('home'); // 'home' | 'playing'
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [gunAngle, setGunAngle] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [isNewHighScore, setIsNewHighScore] = useState(false);

  const [gameObjects, setGameObjects] = useState({
    stars: createInitialStars(),
    bullets: [],
    particles: [],
    starsSpawned: 3,
    starsResolved: 0,
  });

  const shootPlayer = useAudioPlayer(require('../assets/sounds/shoot.wav'));
  const hitPlayer = useAudioPlayer(require('../assets/sounds/hit.wav'));

  // A value the Animated API drives smoothly for the pulsing aim guide line
  const pulseAnim = useRef(new Animated.Value(0.25)).current;

  // Load the saved high score once when the app starts
  useEffect(() => {
    async function loadHighScore() {
      const saved = await AsyncStorage.getItem(HIGH_SCORE_KEY);
      if (saved !== null) {
        setHighScore(parseInt(saved, 10));
      }
    }
    loadHighScore();
  }, []);

  // Start the pulsing animation for the aim guide line, once, on mount
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.7, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.25, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const playShootSound = () => {
    shootPlayer.seekTo(0);
    shootPlayer.play();
  };

  const playHitSound = () => {
    hitPlayer.seekTo(0);
    hitPlayer.play();
  };

  // The main game loop - only runs meaningfully once screen is 'playing', but the interval
  // itself can stay mounted; we just guard state updates so nothing moves on the home screen
  useEffect(() => {
    const gameLoop = setInterval(() => {
      if (screen !== 'playing' || gameOver) return;

      setGameObjects((prev) => {
        const currentStarSpeed = STAR_BASE_SPEED + Math.floor(prev.starsResolved / 5);

        const stillMovingStars = [];
        let escapedCount = 0;

        prev.stars.forEach((star) => {
          const nextX = star.x + currentStarSpeed;
          if (nextX > SCREEN_WIDTH) {
            escapedCount += 1;
          } else {
            stillMovingStars.push({ ...star, x: nextX });
          }
        });

        const movedBullets = prev.bullets.map((bullet) => ({
          ...bullet,
          x: bullet.x + bullet.speedX,
          y: bullet.y + bullet.speedY,
        }));

        const movedParticles = prev.particles
          .map((p) => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 1 }))
          .filter((p) => p.life > 0);

        const hitStarIds = new Set();
        const hitBulletIds = new Set();
        const newParticleBursts = [];

        stillMovingStars.forEach((star) => {
          movedBullets.forEach((bullet) => {
            if (hitStarIds.has(star.id) || hitBulletIds.has(bullet.id)) return;

            const dx = star.x - bullet.x;
            const dy = star.y - bullet.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < HIT_DISTANCE) {
              hitStarIds.add(star.id);
              hitBulletIds.add(bullet.id);
              newParticleBursts.push(...createParticleBurst(star.x, star.y));
            }
          });
        });

        if (hitStarIds.size > 0) {
          playHitSound();
        }

        const missedBulletIds = new Set();
        movedBullets.forEach((bullet) => {
          const wentOffScreen = bullet.y <= -20;
          if (wentOffScreen && !hitBulletIds.has(bullet.id)) {
            missedBulletIds.add(bullet.id);
          }
        });

        if (hitStarIds.size > 0) {
          setScore((prevScore) => prevScore + hitStarIds.size);
        }
        // Only escaped STARS count as misses - missed bullets are simply discarded silently
        if (escapedCount > 0) {
          setMisses((prevMisses) => prevMisses + escapedCount);
        }

        const survivingStars = stillMovingStars.filter((star) => !hitStarIds.has(star.id));
        const survivingBullets = movedBullets.filter(
          (bullet) => !hitBulletIds.has(bullet.id) && !missedBulletIds.has(bullet.id)
        );

        const removedThisTick = hitStarIds.size + escapedCount;
        let newStarsSpawned = prev.starsSpawned;
        const newlySpawnedStars = [];

        for (let i = 0; i < removedThisTick; i++) {
          if (newStarsSpawned < MAX_STARS) {
            newStarsSpawned += 1;
            newlySpawnedStars.push(createNewStar(Date.now() + Math.random()));
          }
        }

        const finalStars = [...survivingStars, ...newlySpawnedStars];
        const newStarsResolved = prev.starsResolved + removedThisTick;
        const finalParticles = [...movedParticles, ...newParticleBursts];

        if (newStarsResolved >= MAX_STARS && finalStars.length === 0) {
          setGameOver(true);
        }

        return {
          stars: finalStars,
          bullets: survivingBullets,
          particles: finalParticles,
          starsSpawned: newStarsSpawned,
          starsResolved: newStarsResolved,
        };
      });
    }, 30);

    return () => clearInterval(gameLoop);
  }, [screen, gameOver]);

  // When the game ends, check and save a new high score if needed
  useEffect(() => {
    if (gameOver) {
      if (score > highScore) {
        setHighScore(score);
        setIsNewHighScore(true);
        AsyncStorage.setItem(HIGH_SCORE_KEY, score.toString());
      } else {
        setIsNewHighScore(false);
      }
    }
  }, [gameOver]);

  const rotateLeft = () => {
    setGunAngle((prevAngle) => Math.max(prevAngle - 10, -80));
  };

  const rotateRight = () => {
    setGunAngle((prevAngle) => Math.min(prevAngle + 10, 80));
  };

  const handleShoot = () => {
    if (gameOver) return;

    playShootSound();

    const angleInRadians = (gunAngle * Math.PI) / 180;

    const newBullet = {
      id: Date.now(),
      x: SCREEN_WIDTH / 2,
      y: SCREEN_HEIGHT - 170,
      speedX: Math.sin(angleInRadians) * BULLET_SPEED,
      speedY: -Math.cos(angleInRadians) * BULLET_SPEED,
    };

    setGameObjects((prev) => ({ ...prev, bullets: [...prev.bullets, newBullet] }));
  };

  const resetGameState = () => {
    setScore(0);
    setMisses(0);
    setGunAngle(0);
    setGameOver(false);
    setIsNewHighScore(false);
    setGameObjects({
      stars: createInitialStars(),
      bullets: [],
      particles: [],
      starsSpawned: 3,
      starsResolved: 0,
    });
  };

  const handleStart = () => {
    resetGameState();
    setScreen('playing');
  };

  const handlePlayAgain = () => {
    resetGameState();
  };

  const handleGoHome = () => {
    resetGameState();
    setScreen('home');
  };

  // ---------- HOME SCREEN ----------
  if (screen === 'home') {
    return (
      <LinearGradient colors={['#0a1628', '#131f3d', '#1b1440']} style={styles.container}>
        <View style={styles.homeContent}>
          <Text style={styles.homeStarDecor}>⭐</Text>
          <Text style={styles.title}>Shooting Stars</Text>
          <Text style={styles.homeSubtitle}>Aim, fire, and clear the sky</Text>

          <View style={styles.homeHighScoreCard}>
            <Text style={styles.statLabel}>HIGH SCORE</Text>
            <Text style={[styles.statValue, { color: '#facc15', fontSize: 32 }]}>
              {highScore}
            </Text>
          </View>

          <AnimatedButton style={styles.startButton} onPress={handleStart}>
            <Text style={styles.startButtonText}>▶  START GAME</Text>
          </AnimatedButton>
        </View>
      </LinearGradient>
    );
  }

  // ---------- GAME SCREEN ----------
  return (
    <LinearGradient colors={['#0a1628', '#131f3d', '#1b1440']} style={styles.container}>
      <Text style={styles.title}>Shooting Stars</Text>

      <View style={styles.statsCard}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>SCORE</Text>
          <Text style={[styles.statValue, { color: '#4ade80' }]}>{score}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>MISSES</Text>
          <Text style={[styles.statValue, { color: '#f87171' }]}>{misses}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>BEST</Text>
          <Text style={[styles.statValue, { color: '#facc15' }]}>{highScore}</Text>
        </View>
      </View>

      {gameObjects.stars.map((star) => (
        <Text key={star.id} style={[styles.star, { left: star.x, top: star.y }]}>
          ⭐
        </Text>
      ))}

      {gameObjects.bullets.map((bullet) => {
        const travelAngle = (Math.atan2(bullet.speedY, bullet.speedX) * 180) / Math.PI + 90;
        return (
          <LinearGradient
            key={bullet.id}
            colors={['#fff9c4', '#ffdd57', '#f59e0b']}
            style={[
              styles.bullet,
              { left: bullet.x, top: bullet.y, transform: [{ rotate: `${travelAngle}deg` }] },
            ]}
          />
        );
      })}

      {gameObjects.particles.map((p) => (
        <View
          key={p.id}
          style={[styles.particle, { left: p.x, top: p.y, opacity: p.life / 15 }]}
        />
      ))}

      <Animated.View
        style={[
          styles.aimGuide,
          { opacity: pulseAnim, transform: [{ rotate: `${gunAngle}deg` }] },
        ]}
      />

      <View style={styles.gunContainer}>
        <View style={[styles.gunShape, { transform: [{ rotate: `${gunAngle}deg` }] }]}>
          <View style={styles.gunSight} />
          <LinearGradient colors={['#4b5563', '#1f2937']} style={styles.gunBarrel} />
          <LinearGradient colors={['#6b7280', '#374151']} style={styles.gunSlide} />
          <LinearGradient
            colors={['#374151', '#111827']}
            style={styles.gunGrip}
          />
        </View>

        <View style={styles.controlsRow}>
          <AnimatedButton style={styles.controlButton} onPress={rotateLeft}>
            <Text style={styles.controlButtonText}>◀</Text>
          </AnimatedButton>

          <AnimatedButton style={styles.shootButton} onPress={handleShoot}>
            <Text style={styles.shootButtonText}>🔥 FIRE</Text>
          </AnimatedButton>

          <AnimatedButton style={styles.controlButton} onPress={rotateRight}>
            <Text style={styles.controlButtonText}>▶</Text>
          </AnimatedButton>
        </View>
      </View>

      <Modal visible={gameOver} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🎉 Congratulations!</Text>
            <Text style={styles.modalSubtitle}>
              {isNewHighScore ? '🏆 New High Score!' : 'You cleared all 15 stars'}
            </Text>

            <View style={styles.modalStatsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>FINAL SCORE</Text>
                <Text style={[styles.statValue, { color: '#4ade80' }]}>{score}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>MISSES</Text>
                <Text style={[styles.statValue, { color: '#f87171' }]}>{misses}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>BEST</Text>
                <Text style={[styles.statValue, { color: '#facc15' }]}>{highScore}</Text>
              </View>
            </View>

            <AnimatedButton style={styles.playAgainButton} onPress={handlePlayAgain}>
              <Text style={styles.playAgainButtonText}>🔄 Play Again</Text>
            </AnimatedButton>

            <TouchableOpacity onPress={handleGoHome} style={{ marginTop: 14 }}>
              <Text style={styles.homeLinkText}>⌂ Back to Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
  },
  homeContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  homeStarDecor: {
    fontSize: 48,
    marginBottom: 10,
  },
  homeSubtitle: {
    fontSize: 15,
    color: '#94a3b8',
    marginTop: 8,
    marginBottom: 30,
  },
  homeHighScoreCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 40,
  },
  startButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 18,
    paddingHorizontal: 50,
    borderRadius: 34,
    shadowColor: '#2563eb',
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: 'rgba(96, 165, 250, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 20,
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statBox: { alignItems: 'center' },
  statLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '700', letterSpacing: 1 },
  statValue: { fontSize: 24, fontWeight: 'bold', marginTop: 2 },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.15)' },
  star: { position: 'absolute', fontSize: 30 },
  bullet: {
    position: 'absolute',
    width: 8,
    height: 18,
    borderRadius: 4,
    shadowColor: '#ffdd57',
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  particle: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fde68a',
  },
  aimGuide: {
    position: 'absolute',
    bottom: 115,
    left: SCREEN_WIDTH / 2 - 1,
    width: 2,
    height: 220,
    backgroundColor: '#60a5fa',
  },
  gunContainer: {
    position: 'absolute',
    bottom: 45,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  gunShape: { alignItems: 'center', marginBottom: 10 },
  gunSight: {
    width: 4,
    height: 8,
    backgroundColor: '#fbbf24',
    borderRadius: 2,
    marginBottom: -2,
  },
  gunBarrel: { width: 10, height: 34, borderRadius: 3 },
  gunSlide: { width: 22, height: 16, borderRadius: 4, marginTop: -2 },
  gunGrip: {
    width: 14,
    height: 26,
    borderRadius: 4,
    marginTop: -2,
    transform: [{ skewX: '-12deg' }],
  },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  controlButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  controlButtonText: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  shootButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 16,
    paddingHorizontal: 26,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#f87171',
    shadowColor: '#dc2626',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  shootButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#132844',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    width: '88%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  modalTitle: { fontSize: 26, fontWeight: 'bold', color: '#ffffff' },
  modalSubtitle: { fontSize: 14, color: '#94a3b8', marginTop: 6, marginBottom: 20 },
  modalStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 16,
    borderRadius: 16,
  },
  playAgainButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 30,
    marginTop: 24,
  },
  playAgainButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  homeLinkText: { color: '#94a3b8', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});