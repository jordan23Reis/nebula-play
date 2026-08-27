export const TIERS = { HIGH: 0, MEDIUM: 1, LOW: 2 }

export const TIER_NAMES = ['HIGH', 'MEDIUM', 'LOW']

export const QUALITY = {
  [TIERS.HIGH]: { pixelRatio: 2, stars: 1500, particles: 2000, frames: 50, shapes: 40, postFX: true },
  [TIERS.MEDIUM]: { pixelRatio: 1.25, stars: 800, particles: 1000, frames: 36, shapes: 30, postFX: true },
  [TIERS.LOW]: { pixelRatio: 0.75, stars: 400, particles: 400, frames: 26, shapes: 22, postFX: false }
}

export class PerfMonitor {
  constructor() {
    this.tier = TIERS.HIGH
    this.fpsEMA = 60
    this.elapsed = 0
    this.tierTimer = 0
    this.onTierChange = null
    this.hysteresisTime = 3
  }

  tick(delta) {
    if (delta <= 0) return this.tier

    this.elapsed += delta
    const instFps = 1 / delta
    this.fpsEMA += (instFps - this.fpsEMA) * 0.05

    if (this.elapsed < 3) return this.tier

    let target = this.tier

    if (this.tier === TIERS.HIGH) {
      if (this.fpsEMA < 42) target = TIERS.MEDIUM
    } else if (this.tier === TIERS.MEDIUM) {
      if (this.fpsEMA > 55) target = TIERS.HIGH
      else if (this.fpsEMA < 28) target = TIERS.LOW
    } else {
      if (this.fpsEMA > 45) target = TIERS.MEDIUM
    }

    if (target !== this.tier) {
      this.tierTimer += delta
      if (this.tierTimer >= this.hysteresisTime) {
        const prev = this.tier
        this.tier = target
        this.tierTimer = 0
        console.log(`[Perf] FPS ${this.fpsEMA.toFixed(1)} -> nivel ${TIER_NAMES[prev]} -> ${TIER_NAMES[this.tier]}`)
        if (this.onTierChange) this.onTierChange(prev, this.tier)
      }
    } else {
      this.tierTimer = 0
    }

    return this.tier
  }
}