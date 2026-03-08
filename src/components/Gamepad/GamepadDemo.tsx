"use client"

import { useEffect, useRef } from "react"
import type { GamepadState } from "./GamepadUI"

interface GamepadDemoProps {
	visible: boolean
	gamepadState: GamepadState
}

interface Vec2 {
	x: number
	y: number
}

interface Star {
	x: number
	y: number
	speed: number
	size: number
	brightness: number
}

interface Bullet {
	x: number
	y: number
	vy: number
	active: boolean
}

interface Enemy {
	x: number
	y: number
	vx: number
	vy: number
	rot: number
	rotSpeed: number
	hp: number
	maxHp: number
	size: number
	color: string
	active: boolean
	flash: number
}

interface Particle {
	x: number
	y: number
	vx: number
	vy: number
	life: number
	maxLife: number
	size: number
	color: string
}

interface ScoreFloater {
	x: number
	y: number
	vy: number
	text: string
	life: number
	color: string
}

interface GameState {
	score: number
	lives: number
	wave: number
	lastWaveThreshold: number
	shieldActive: boolean
	shieldTimer: number
	shieldCooldown: number
	dashTimer: number
	bombTimer: number
	shootCooldown: number
	enemySpawnTimer: number
	enemySpawnInterval: number
	gameOver: boolean
	waveMessage: string
	waveMessageTimer: number
}

// ─── helpers ────────────────────────────────────────────────────────────────

function hexAlpha(hex: string, alpha: number): string {
	const a = Math.floor(Math.max(0, Math.min(1, alpha)) * 255)
		.toString(16)
		.padStart(2, "0")
	return `${hex}${a}`
}

function drawGlowCircle(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	r: number,
	color: string,
	glowColor: string,
	glowBlur: number,
) {
	ctx.save()
	ctx.shadowBlur = glowBlur
	ctx.shadowColor = glowColor
	ctx.beginPath()
	ctx.arc(x, y, r, 0, Math.PI * 2)
	ctx.fillStyle = color
	ctx.fill()
	ctx.restore()
}

function spawnParticles(
	particles: Particle[],
	x: number,
	y: number,
	count: number,
	color: string,
	speed = 3,
	life = 1,
) {
	for (let i = 0; i < count; i++) {
		const angle = Math.random() * Math.PI * 2
		const spd = speed * (0.4 + Math.random() * 0.6)
		particles.push({
			x,
			y,
			vx: Math.cos(angle) * spd,
			vy: Math.sin(angle) * spd,
			life,
			maxLife: life,
			size: 2 + Math.random() * 3,
			color,
		})
	}
}

// ─── main component ──────────────────────────────────────────────────────────

export const GamepadDemo = ({ visible, gamepadState }: GamepadDemoProps) => {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	// Always-fresh reference to the latest gamepadState — no stale closure
	const gpRef = useRef<GamepadState>(gamepadState)
	const animRef = useRef<number>(0)

	// Keep gpRef in sync with prop every render (no re-running the game loop)
	gpRef.current = gamepadState

	useEffect(() => {
		if (!visible) return
		const canvas = canvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext("2d") as CanvasRenderingContext2D
		if (!ctx) return

		const W = 360
		const H = 540
		canvas.width = W
		canvas.height = H

		// ── initial state ────────────────────────────────────────────────────

		const player: Vec2 & { size: number; speed: number } = {
			x: W / 2,
			y: H - 80,
			size: 18,
			speed: 5,
		}

		const bullets: Bullet[] = []
		const enemies: Enemy[] = []
		const particles: Particle[] = []
		const floaters: ScoreFloater[] = []

		const stars: Star[] = Array.from({ length: 80 }, () => ({
			x: Math.random() * W,
			y: Math.random() * H,
			speed: 0.3 + Math.random() * 1.2,
			size: 0.5 + Math.random() * 1.5,
			brightness: 0.4 + Math.random() * 0.6,
		}))

		const gs: GameState = {
			score: 0,
			lives: 3,
			wave: 1,
			lastWaveThreshold: 300,
			shieldActive: false,
			shieldTimer: 0,
			shieldCooldown: 0,
			dashTimer: 0,
			bombTimer: 0,
			shootCooldown: 0,
			enemySpawnTimer: 0,
			enemySpawnInterval: 90,
			gameOver: false,
			waveMessage: "WAVE 1",
			waveMessageTimer: 120,
		}

		// Track which buttons were down last frame to detect fresh presses
		const prevButtons = { a: false, b: false, x: false, y: false }

		// ── enemy spawner ────────────────────────────────────────────────────

		function spawnEnemy() {
			const colors = ["#f87171", "#fb923c", "#facc15", "#a78bfa"]
			const hps = [1, 1, 2, 3]
			const tier = Math.min(Math.floor(Math.random() * gs.wave), 3)
			enemies.push({
				x: 20 + Math.random() * (W - 40),
				y: -20,
				vx: (Math.random() - 0.5) * 1.5,
				vy: 0.8 + Math.random() * 1.0 + gs.wave * 0.1,
				rot: Math.random() * Math.PI * 2,
				rotSpeed: (Math.random() - 0.5) * 0.06,
				hp: hps[tier],
				maxHp: hps[tier],
				size: 14 + tier * 4,
				color: colors[tier],
				active: true,
				flash: 0,
			})
		}

		// ── draw ship ────────────────────────────────────────────────────────

		function drawShip(
			cx: number,
			cy: number,
			shielded: boolean,
			dashing: boolean,
		) {
			ctx.save()
			if (dashing) {
				ctx.shadowBlur = 20
				ctx.shadowColor = "#38bdf8"
			}
			ctx.beginPath()
			ctx.moveTo(cx, cy - 20)
			ctx.lineTo(cx - 14, cy + 12)
			ctx.lineTo(cx - 6, cy + 6)
			ctx.lineTo(cx, cy + 10)
			ctx.lineTo(cx + 6, cy + 6)
			ctx.lineTo(cx + 14, cy + 12)
			ctx.closePath()
			const bodyGrad = ctx.createLinearGradient(cx, cy - 20, cx, cy + 12)
			bodyGrad.addColorStop(0, dashing ? "#7dd3fc" : "#60a5fa")
			bodyGrad.addColorStop(1, dashing ? "#0ea5e9" : "#1d4ed8")
			ctx.fillStyle = bodyGrad
			ctx.fill()
			ctx.strokeStyle = "#bfdbfe"
			ctx.lineWidth = 1.5
			ctx.stroke()
			ctx.beginPath()
			ctx.ellipse(cx, cy - 4, 5, 8, 0, 0, Math.PI * 2)
			ctx.fillStyle = hexAlpha("#a5f3fc", 0.7)
			ctx.fill()
			ctx.shadowBlur = 12
			ctx.shadowColor = "#f97316"
			ctx.beginPath()
			ctx.moveTo(cx - 6, cy + 6)
			ctx.lineTo(cx, cy + 18 + (dashing ? 12 : 0))
			ctx.lineTo(cx + 6, cy + 6)
			ctx.closePath()
			const flameGrad = ctx.createLinearGradient(cx, cy + 6, cx, cy + 18)
			flameGrad.addColorStop(0, "#fbbf24")
			flameGrad.addColorStop(1, hexAlpha("#ef4444", 0))
			ctx.fillStyle = flameGrad
			ctx.fill()
			if (shielded) {
				ctx.shadowBlur = 24
				ctx.shadowColor = "#22d3ee"
				ctx.beginPath()
				ctx.arc(cx, cy, 28, 0, Math.PI * 2)
				ctx.strokeStyle = hexAlpha("#22d3ee", 0.9)
				ctx.lineWidth = 3
				ctx.stroke()
				ctx.beginPath()
				ctx.arc(cx, cy, 28, 0, Math.PI * 2)
				ctx.fillStyle = hexAlpha("#22d3ee", 0.08)
				ctx.fill()
			}
			ctx.restore()
		}

		// ── draw enemy ───────────────────────────────────────────────────────

		function drawEnemy(e: Enemy) {
			ctx.save()
			ctx.shadowBlur = 14
			ctx.shadowColor = e.color
			ctx.translate(e.x, e.y)
			ctx.rotate(e.rot)
			ctx.beginPath()
			for (let i = 0; i < 6; i++) {
				const angle = (Math.PI / 3) * i - Math.PI / 6
				const px = Math.cos(angle) * e.size
				const py = Math.sin(angle) * e.size
				if (i === 0) ctx.moveTo(px, py)
				else ctx.lineTo(px, py)
			}
			ctx.closePath()
			ctx.fillStyle = e.flash > 0 ? "#ffffff" : hexAlpha(e.color, 0.85)
			ctx.fill()
			ctx.strokeStyle = e.flash > 0 ? "#ffffff" : e.color
			ctx.lineWidth = 2
			ctx.stroke()
			ctx.restore()
			if (e.maxHp > 1) {
				const bw = e.size * 2
				const bx = e.x - e.size
				const by = e.y + e.size + 4
				ctx.fillStyle = hexAlpha("#ef4444", 0.6)
				ctx.fillRect(bx, by, bw, 4)
				ctx.fillStyle = "#4ade80"
				ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), 4)
			}
		}

		// ── HUD ──────────────────────────────────────────────────────────────

		function drawHUD() {
			ctx.fillStyle = hexAlpha("#0f172a", 0.75)
			ctx.fillRect(0, 0, W, 40)
			ctx.fillStyle = "#f1f5f9"
			ctx.font = "bold 13px monospace"
			ctx.textAlign = "left"
			ctx.fillText(`SCORE  ${gs.score}`, 10, 26)
			ctx.textAlign = "center"
			ctx.fillText(`WAVE  ${gs.wave}`, W / 2, 26)
			for (let i = 0; i < gs.lives; i++) {
				const lx = W - 12 - i * 18
				ctx.save()
				ctx.shadowBlur = 8
				ctx.shadowColor = "#60a5fa"
				ctx.fillStyle = "#60a5fa"
				ctx.beginPath()
				ctx.moveTo(lx, 14)
				ctx.lineTo(lx - 6, 28)
				ctx.lineTo(lx + 6, 28)
				ctx.closePath()
				ctx.fill()
				ctx.restore()
			}
			// Shield cooldown bar above the button legend
			if (gs.shieldCooldown > 0) {
				const pct = gs.shieldCooldown / 240
				ctx.fillStyle = hexAlpha("#22d3ee", 0.25)
				ctx.fillRect(0, H - 40, W, 4)
				ctx.fillStyle = hexAlpha("#22d3ee", 0.85)
				ctx.fillRect(0, H - 40, W * (1 - pct), 4)
			} else if (gs.shieldActive) {
				const pct = gs.shieldTimer / 180
				ctx.fillStyle = hexAlpha("#22d3ee", 0.85)
				ctx.fillRect(0, H - 40, W * pct, 4)
			}
			const shieldReady = !gs.shieldActive && gs.shieldCooldown === 0
			const btns = [
				{
					label: "A",
					desc: "SHOOT",
					color: "#22c55e",
					pressed: gpRef.current.buttons.a,
					ready: true,
				},
				{
					label: "B",
					desc: "DASH",
					color: "#ef4444",
					pressed: gpRef.current.buttons.b,
					ready: gs.dashTimer === 0,
				},
				{
					label: "X",
					desc: shieldReady ? "SHIELD" : gs.shieldActive ? "ACTIVE" : "WAIT",
					color: "#3b82f6",
					pressed: gpRef.current.buttons.x,
					ready: shieldReady,
				},
				{
					label: "Y",
					desc: "BOMB",
					color: "#eab308",
					pressed: gpRef.current.buttons.y,
					ready: gs.bombTimer === 0,
				},
			]
			ctx.fillStyle = hexAlpha("#0f172a", 0.75)
			ctx.fillRect(0, H - 36, W, 36)
			const slotW = W / 4
			for (let i = 0; i < btns.length; i++) {
				const b = btns[i]
				const cx = slotW * i + slotW / 2
				const cy = H - 18
				ctx.save()
				if (b.pressed) {
					ctx.shadowBlur = 16
					ctx.shadowColor = b.color
				}
				ctx.beginPath()
				ctx.arc(cx - 22, cy, 10, 0, Math.PI * 2)
				ctx.fillStyle = b.pressed
					? b.color
					: b.ready
						? hexAlpha(b.color, 0.35)
						: hexAlpha("#475569", 0.5)
				ctx.fill()
				ctx.strokeStyle = b.ready ? b.color : hexAlpha("#475569", 0.6)
				ctx.lineWidth = 1.5
				ctx.stroke()
				ctx.fillStyle = b.pressed
					? "#fff"
					: b.ready
						? hexAlpha("#fff", 0.6)
						: hexAlpha("#fff", 0.3)
				ctx.font = "bold 10px monospace"
				ctx.textAlign = "center"
				ctx.fillText(b.label, cx - 22, cy + 4)
				ctx.fillStyle = b.pressed
					? "#fff"
					: b.ready
						? hexAlpha("#94a3b8", 0.9)
						: hexAlpha("#475569", 0.8)
				ctx.font = b.pressed ? "bold 9px monospace" : "9px monospace"
				ctx.textAlign = "left"
				ctx.fillText(b.desc, cx - 10, cy + 4)
				ctx.restore()
			}
		}

		// ── wave message overlay ─────────────────────────────────────────────

		function drawWaveMessage() {
			if (gs.waveMessageTimer <= 0) return
			const alpha = Math.min(1, gs.waveMessageTimer / 30)
			ctx.save()
			ctx.globalAlpha = alpha
			ctx.font = "bold 28px monospace"
			ctx.textAlign = "center"
			ctx.shadowBlur = 20
			ctx.shadowColor = "#38bdf8"
			ctx.fillStyle = "#e0f2fe"
			ctx.fillText(gs.waveMessage, W / 2, H / 2)
			ctx.restore()
		}

		// ── game over overlay ────────────────────────────────────────────────

		function drawGameOver() {
			ctx.save()
			ctx.fillStyle = hexAlpha("#020617", 0.7)
			ctx.fillRect(0, 0, W, H)
			ctx.font = "bold 32px monospace"
			ctx.textAlign = "center"
			ctx.shadowBlur = 24
			ctx.shadowColor = "#ef4444"
			ctx.fillStyle = "#fca5a5"
			ctx.fillText("GAME OVER", W / 2, H / 2 - 20)
			ctx.font = "16px monospace"
			ctx.shadowColor = "#94a3b8"
			ctx.fillStyle = "#cbd5e1"
			ctx.fillText(`Final score: ${gs.score}`, W / 2, H / 2 + 16)
			ctx.font = "12px monospace"
			ctx.fillStyle = hexAlpha("#94a3b8", 0.8)
			ctx.fillText("Press A to restart", W / 2, H / 2 + 42)
			ctx.restore()
		}

		// ── reset ────────────────────────────────────────────────────────────

		function resetGame() {
			player.x = W / 2
			player.y = H - 80
			bullets.length = 0
			enemies.length = 0
			particles.length = 0
			floaters.length = 0
			gs.score = 0
			gs.lives = 3
			gs.wave = 1
			gs.lastWaveThreshold = 300
			gs.shieldActive = false
			gs.shieldTimer = 0
			gs.shieldCooldown = 0
			gs.dashTimer = 0
			gs.bombTimer = 0
			gs.shootCooldown = 0
			gs.enemySpawnTimer = 0
			gs.enemySpawnInterval = 90
			gs.gameOver = false
			gs.waveMessage = "WAVE 1"
			gs.waveMessageTimer = 120
		}

		// ── game loop ────────────────────────────────────────────────────────

		function loop() {
			const gp = gpRef.current
			const btn = gp.buttons
			const ls = gp.leftStick

			const justA = btn.a && !prevButtons.a
			const justB = btn.b && !prevButtons.b
			const justX = btn.x && !prevButtons.x
			const justY = btn.y && !prevButtons.y

			prevButtons.a = btn.a
			prevButtons.b = btn.b
			prevButtons.x = btn.x
			prevButtons.y = btn.y

			if (gs.gameOver) {
				if (justA) resetGame()
				ctx.fillStyle = "#020617"
				ctx.fillRect(0, 0, W, H)
				for (const s of stars) {
					ctx.beginPath()
					ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
					ctx.fillStyle = hexAlpha("#ffffff", s.brightness * 0.5)
					ctx.fill()
				}
				drawGameOver()
				drawHUD()
				animRef.current = requestAnimationFrame(loop)
				return
			}

			// background
			ctx.fillStyle = "#020617"
			ctx.fillRect(0, 0, W, H)
			ctx.save()
			ctx.globalAlpha = 0.06
			ctx.fillStyle = "#6366f1"
			ctx.beginPath()
			ctx.ellipse(60, 180, 100, 60, 0.4, 0, Math.PI * 2)
			ctx.fill()
			ctx.fillStyle = "#0ea5e9"
			ctx.beginPath()
			ctx.ellipse(300, 320, 80, 50, -0.3, 0, Math.PI * 2)
			ctx.fill()
			ctx.restore()

			for (const s of stars) {
				s.y += s.speed
				if (s.y > H) {
					s.y = 0
					s.x = Math.random() * W
				}
				ctx.beginPath()
				ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
				ctx.fillStyle = hexAlpha("#ffffff", s.brightness)
				ctx.fill()
			}

			const DZ = 0.12
			const applyDZ = (v: number) => {
				if (Math.abs(v) < DZ) return 0
				return Math.sign(v) * ((Math.abs(v) - DZ) / (1 - DZ))
			}

			// player movement
			const speed = player.speed * (gs.dashTimer > 0 ? 2.2 : 1)
			player.x += applyDZ(ls.x) * speed
			player.y += applyDZ(ls.y) * speed
			player.x = Math.max(player.size, Math.min(W - player.size, player.x))
			player.y = Math.max(
				50 + player.size,
				Math.min(H - 40 - player.size, player.y),
			)

			// A — shoot
			if (gs.shootCooldown > 0) gs.shootCooldown--
			if (btn.a && gs.shootCooldown === 0) {
				bullets.push({
					x: player.x,
					y: player.y - player.size,
					vy: -12,
					active: true,
				})
				// Twin bullets at wave 3+
				if (gs.wave >= 3) {
					bullets.push({
						x: player.x - 8,
						y: player.y - player.size + 4,
						vy: -12,
						active: true,
					})
					bullets.push({
						x: player.x + 8,
						y: player.y - player.size + 4,
						vy: -12,
						active: true,
					})
				}
				gs.shootCooldown = 10
				if (justA)
					spawnParticles(particles, player.x, player.y, 4, "#86efac", 2, 0.4)
			}

			// B — dash
			if (justB && gs.dashTimer === 0) {
				gs.dashTimer = 18
				spawnParticles(
					particles,
					player.x,
					player.y + 10,
					12,
					"#38bdf8",
					4,
					0.6,
				)
			}
			if (gs.dashTimer > 0) gs.dashTimer--

			// X — shield
			if (justX && !gs.shieldActive && gs.shieldCooldown === 0) {
				gs.shieldActive = true
				gs.shieldTimer = 180
				spawnParticles(particles, player.x, player.y, 16, "#22d3ee", 3, 0.8)
			}
			if (gs.shieldActive) {
				gs.shieldTimer--
				if (gs.shieldTimer <= 0) {
					gs.shieldActive = false
					gs.shieldCooldown = 240 // 4s cooldown after shield expires
				}
			}
			if (gs.shieldCooldown > 0) gs.shieldCooldown--

			// Y — bomb
			if (justY && gs.bombTimer === 0) {
				gs.bombTimer = 45
				for (const e of enemies) {
					if (e.active) {
						e.active = false
						spawnParticles(particles, e.x, e.y, 20, e.color, 5, 1.2)
						gs.score += e.maxHp * 10
					}
				}
				spawnParticles(particles, player.x, player.y, 40, "#fde047", 8, 1.5)
			}
			if (gs.bombTimer > 0) gs.bombTimer--

			if (gs.bombTimer > 30) {
				ctx.save()
				ctx.globalAlpha = ((gs.bombTimer - 30) / 15) * 0.4
				ctx.fillStyle = "#fde047"
				ctx.fillRect(0, 0, W, H)
				ctx.restore()
			}

			// enemy spawn
			gs.enemySpawnTimer++
			if (gs.enemySpawnTimer >= gs.enemySpawnInterval) {
				gs.enemySpawnTimer = 0
				spawnEnemy()
			}

			// wave progression
			if (gs.score >= gs.lastWaveThreshold) {
				gs.wave++
				gs.lastWaveThreshold += gs.wave * 300
				gs.enemySpawnInterval = Math.max(30, 90 - gs.wave * 8)
				gs.waveMessage = `WAVE ${gs.wave}`
				gs.waveMessageTimer = 120
			}
			if (gs.waveMessageTimer > 0) gs.waveMessageTimer--

			// update bullets
			for (const b of bullets) {
				if (!b.active) continue
				b.y += b.vy
				if (b.y < 40) {
					b.active = false
					continue
				}
				for (const e of enemies) {
					if (!e.active) continue
					const dx = b.x - e.x
					const dy = b.y - e.y
					if (Math.sqrt(dx * dx + dy * dy) < e.size + 4) {
						b.active = false
						e.hp--
						e.flash = 6
						if (e.hp <= 0) {
							e.active = false
							const pts = e.maxHp * 10
							gs.score += pts
							floaters.push({
								x: e.x,
								y: e.y,
								vy: -1.2,
								text: `+${pts}`,
								life: 1.2,
								color: e.color,
							})
							spawnParticles(particles, e.x, e.y, 14, e.color, 4, 1)
						} else {
							spawnParticles(particles, e.x, e.y, 4, "#fff", 2, 0.3)
						}
						break
					}
				}
			}

			// update enemies
			for (const e of enemies) {
				if (!e.active) continue
				e.x += e.vx
				e.y += e.vy
				e.rot += e.rotSpeed
				if (e.flash > 0) e.flash--
				if (e.x < e.size || e.x > W - e.size) e.vx *= -1
				if (e.y > H + 20) {
					e.active = false
					continue
				}
				const dx = e.x - player.x
				const dy = e.y - player.y
				if (Math.sqrt(dx * dx + dy * dy) < e.size + player.size) {
					e.active = false
					spawnParticles(particles, e.x, e.y, 18, e.color, 5, 1.2)
					if (!gs.shieldActive) {
						gs.lives--
						spawnParticles(particles, player.x, player.y, 20, "#f87171", 4, 1)
						if (gs.lives <= 0) gs.gameOver = true
					}
				}
			}

			// cull dead objects
			for (let i = enemies.length - 1; i >= 0; i--) {
				if (!enemies[i].active) enemies.splice(i, 1)
			}
			for (let i = bullets.length - 1; i >= 0; i--) {
				if (!bullets[i].active) bullets.splice(i, 1)
			}

			// update particles
			for (const p of particles) {
				p.x += p.vx
				p.y += p.vy
				p.vx *= 0.94
				p.vy *= 0.94
				p.life -= 1 / 60
			}
			for (let i = particles.length - 1; i >= 0; i--) {
				if (particles[i].life <= 0) particles.splice(i, 1)
			}

			// draw bullets
			ctx.save()
			ctx.shadowBlur = 10
			ctx.shadowColor = "#86efac"
			for (const b of bullets) {
				ctx.beginPath()
				ctx.rect(b.x - 2, b.y - 8, 4, 14)
				const bGrad = ctx.createLinearGradient(b.x, b.y - 8, b.x, b.y + 6)
				bGrad.addColorStop(0, "#86efac")
				bGrad.addColorStop(1, hexAlpha("#22c55e", 0))
				ctx.fillStyle = bGrad
				ctx.fill()
			}
			ctx.restore()

			// draw enemies
			for (const e of enemies) drawEnemy(e)

			// draw particles
			for (const p of particles) {
				const alpha = p.life / p.maxLife
				drawGlowCircle(
					ctx,
					p.x,
					p.y,
					p.size * alpha,
					hexAlpha(p.color, alpha),
					p.color,
					6,
				)
			}

			// draw player
			drawShip(player.x, player.y, gs.shieldActive, gs.dashTimer > 0)

			// update & draw floaters
			for (const f of floaters) {
				f.y += f.vy
				f.life -= 1 / 60
			}
			for (let i = floaters.length - 1; i >= 0; i--) {
				if (floaters[i].life <= 0) floaters.splice(i, 1)
			}
			for (const f of floaters) {
				const alpha = Math.min(1, f.life / 0.4)
				ctx.save()
				ctx.globalAlpha = alpha
				ctx.font = "bold 13px monospace"
				ctx.textAlign = "center"
				ctx.shadowBlur = 8
				ctx.shadowColor = f.color
				ctx.fillStyle = "#ffffff"
				ctx.fillText(f.text, f.x, f.y)
				ctx.restore()
			}

			drawWaveMessage()
			drawHUD()

			animRef.current = requestAnimationFrame(loop)
		}

		animRef.current = requestAnimationFrame(loop)

		return () => {
			cancelAnimationFrame(animRef.current)
		}
	}, [visible]) // only re-runs when visibility changes; gamepadState is read via gpRef

	if (!visible) return null

	return (
		<div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30">
			<div className="flex flex-col items-center pointer-events-none select-none">
				<canvas
					ref={canvasRef}
					className="rounded-xl border border-white/10 shadow-2xl"
					style={{ width: "270px", height: "405px" }}
				/>
			</div>
		</div>
	)
}
