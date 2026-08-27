import * as THREE from 'three'
import { SceneManager } from './scene/SceneManager.js'
import { Lights } from './scene/lights.js'
import { InfiniteTunnel } from './visuals/InfiniteTunnel.js'
import { Starfield } from './visuals/Starfield.js'
import { Particles } from './visuals/Particles.js'
import { AudioEngine } from './audio/AudioEngine.js'
import { searchYouTube } from './api/youtube.js'
import { FavoritesManager } from './data/mockData.js'
import { PerfMonitor, QUALITY } from './performance/PerfMonitor.js'

const canvas = document.getElementById('nebula-canvas')

const sceneManager = new SceneManager(canvas)
const { scene, camera } = sceneManager

const lights = new Lights(scene)
const tunnel = new InfiniteTunnel(scene)
const starfield = new Starfield(scene)
const particles = new Particles(scene)
const audioEngine = new AudioEngine()

const perfMonitor = new PerfMonitor()
perfMonitor.onTierChange = (prev, tier) => {
  const q = QUALITY[tier]
  sceneManager.setQuality(tier)
  tunnel.setDensity(q.frames, q.shapes)
  starfield.setDensity(q.stars)
  particles.setDensity(q.particles)
  particles.setPixelRatio(sceneManager.pixelRatio)
}

const clock = new THREE.Timer()
let audioData = { bass: 0, mid: 0, treble: 0, waveform: new Uint8Array(128), frequency: new Uint8Array(128) }
let tunnelOffset = 0
let tunnelSpeed = 0.75

camera.position.set(0, 0, 0)
camera.lookAt(0, 0, -10)

let camAngle = 0
let camBob = 0

const progressFill = document.getElementById('progress-fill')
const timeCurrent = document.getElementById('time-current')
const timeTotal = document.getElementById('time-total')

let seeking = false
let screenOff = false

// Ambient UI auto-hide (mobile): after idle, fade every visible interface element, leaving the 3D scene alone
let uiHidden = false
let uiHideTimer = null
const uiAutoHideMedia = window.matchMedia('(max-width: 768px)')

function uiScheduleHide() {
  clearTimeout(uiHideTimer)
  if (uiHidden || !uiAutoHideMedia.matches) return
  uiHideTimer = setTimeout(() => {
    if (uiAutoHideMedia.matches) {
      uiHidden = true
      document.body.classList.add('ui-hidden')
    }
  }, 20000)
}

function uiShow() {
  if (!uiHidden) return
  uiHidden = false
  document.body.classList.remove('ui-hidden')
  uiScheduleHide()
}

;['pointerdown', 'pointerup', 'keydown'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (uiHidden) uiShow()
    else uiScheduleHide()
  }, { passive: true })
})

function formatTime(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return m + ':' + (s < 10 ? '0' : '') + s
}

function animate() {
  requestAnimationFrame(animate)
  clock.update()
  const delta = clock.getDelta()
  const elapsed = clock.getElapsed()

  if (audioEngine.isPlaying) {
    audioData = audioEngine.getAnalysis()
  }

  const targetSpeed = audioEngine.isPlaying ? 5.0 + audioData.bass * 3 : 0.75
  tunnelSpeed += (targetSpeed - tunnelSpeed) * 0.02
  tunnelOffset += tunnelSpeed * delta

  const baseSpeed = audioEngine.isPlaying ? 1.0 : 0.2
  const moveSpeed = baseSpeed + audioData.bass * 2.0

  camAngle += delta * 0.1 * moveSpeed
  camBob += delta * 0.15 * moveSpeed

  camera.position.x = Math.sin(camAngle) * 0.5
  camera.position.y = Math.cos(camBob) * 0.3
  camera.position.z = 0

  camera.lookAt(
    Math.sin(camAngle + 0.1) * 0.3,
    Math.cos(camBob + 0.1) * 0.2,
    -10
  )

  if (screenOff) {
    if (!audioEngine.isPlaying && !screenOffUnlocking) exitScreenOff()
    drawScreenOff(delta)
    if (screenOffUnlocking) {
      perfMonitor.tick(delta)
      lights.update(audioData)
      sceneManager.update(delta, audioData)
      tunnel.update(delta, tunnelOffset, audioData, audioEngine.isPlaying)
      starfield.update(delta)
      particles.update(delta, elapsed, audioData)
      sceneManager.render()
    }
  } else {
    perfMonitor.tick(delta)
    lights.update(audioData)
    sceneManager.update(delta, audioData)
    tunnel.update(delta, tunnelOffset, audioData, audioEngine.isPlaying)
    starfield.update(delta)
    particles.update(delta, elapsed, audioData)
    sceneManager.render()
  }

  if (audioEngine.isPlaying && !seeking) {
    const current = audioEngine.getCurrentTime()
    const duration = audioEngine.getDuration()
    if (duration > 0) {
      const progress = Math.min(current / duration, 1)
      progressFill.style.width = (progress * 100) + '%'
      timeCurrent.textContent = formatTime(current)
      timeTotal.textContent = formatTime(duration)
    }
  }
}

animate()

audioEngine.onTrackEnd = () => {
  audioEngine.next()
}

// Progress bar
const progressBar = document.getElementById('progress-bar')

function updateSeek(e) {
  const rect = progressBar.getBoundingClientRect()
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
  const fraction = x / rect.width
  progressFill.style.transition = 'none'
  audioEngine.seek(fraction)
  progressFill.style.width = (fraction * 100) + '%'
}

function endSeek() {
  seeking = false
  progressFill.style.transition = ''
}

progressBar.addEventListener('mousedown', (e) => {
  e.preventDefault()
  seeking = true
  updateSeek(e)
  const onMove = (e) => { e.preventDefault(); updateSeek(e) }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    endSeek()
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
})

progressBar.addEventListener('touchstart', (e) => {
  e.preventDefault()
  seeking = true
  updateSeek(e.touches[0])
  const onMove = (e) => { e.preventDefault(); updateSeek(e.touches[0]) }
  const onEnd = () => {
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onEnd)
    document.removeEventListener('touchcancel', onEnd)
    endSeek()
  }
  document.addEventListener('touchmove', onMove, { passive: false })
  document.addEventListener('touchend', onEnd)
  document.addEventListener('touchcancel', onEnd)
})

// Nav overlay
const navToggle = document.getElementById('nav-toggle')
const navOverlay = document.getElementById('nav-overlay')

navToggle.addEventListener('click', () => {
  navToggle.classList.toggle('active')
  navOverlay.classList.toggle('open')
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && navOverlay.classList.contains('open')) {
    navToggle.classList.remove('active')
    navOverlay.classList.remove('open')
  }
})

// Tabs
const navLinks = document.querySelectorAll('.nav-link[data-tab]')
const tabs = document.querySelectorAll('.nav-tab')

function switchTab(id) {
  navLinks.forEach(l => l.classList.toggle('active', l.dataset.tab === id))
  tabs.forEach(t => t.classList.toggle('active', t.id === 'tab-' + id))
}

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault()
    switchTab(link.dataset.tab)
  })
})

if (audioEngine.queue.length === 0) {
  navToggle.classList.add('active')
  navOverlay.classList.add('open')
}

// Favorites section
const navFavorites = document.getElementById('nav-favorites')

function renderFavorites() {
  navFavorites.innerHTML = ''
  const favs = FavoritesManager.getAll()

  if (favs.length === 0) {
    navFavorites.innerHTML = '<div class="search-empty">Nenhuma música curtida ainda</div>'
    return
  }

  const header = document.createElement('div')
  header.className = 'fav-header'
  header.innerHTML = `
    <div class="fav-header-info">
      <div class="fav-header-title">Músicas Curtidas</div>
      <div class="fav-header-count">${favs.length} música${favs.length !== 1 ? 's' : ''}</div>
    </div>
    <button class="fav-play-btn" title="Tocar do início">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    </button>
  `
  header.querySelector('.fav-play-btn').addEventListener('click', () => {
    audioEngine.playTrack(favs[0], favs)
    navToggle.classList.remove('active')
    navOverlay.classList.remove('open')
  })
  navFavorites.appendChild(header)

  const list = document.createElement('div')
  list.className = 'search-results'
  favs.forEach((track, i) => {
    const min = Math.floor(track.duration / 60)
    const sec = track.duration % 60
    const el = document.createElement('div')
    el.className = 'search-track'
    const isFav = FavoritesManager.isFavorite(track.videoId)
    el.innerHTML = `
      <img class="search-track-cover" src="${track.thumbnail || track.albumCover || ''}" alt="" />
      <div class="search-track-info">
        <div class="search-track-title">${track.title}</div>
        <div class="search-track-artist">${track.artist}</div>
      </div>
      <span class="search-track-dur">${min}:${sec < 10 ? '0' : ''}${sec}</span>
      <button class="search-track-fav${isFav ? ' active' : ''}" data-vid="${track.videoId}">${isFav ? '&#9829;' : '&#9825;'}</button>
    `
    el.addEventListener('click', () => {
      audioEngine.playTrack(track, favs)
      navToggle.classList.remove('active')
      navOverlay.classList.remove('open')
    })

    const favBtn = el.querySelector('.search-track-fav')
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const vid = favBtn.dataset.vid
      if (FavoritesManager.isFavorite(vid)) {
        FavoritesManager.remove(vid)
        favBtn.classList.remove('active')
        favBtn.innerHTML = '&#9825;'
      } else {
        FavoritesManager.add(track)
        favBtn.classList.add('active')
        favBtn.innerHTML = '&#9829;'
      }
      renderFavorites()
    })

    list.appendChild(el)
  })
  navFavorites.appendChild(list)
}

renderFavorites()

// Search
const searchInput = document.getElementById('search-input')
const searchResults = document.getElementById('search-results')
let searchTimeout = null

const searchToggle = document.getElementById('search-toggle')
searchToggle.addEventListener('click', () => {
  if (!navOverlay.classList.contains('open')) {
    navToggle.classList.add('active')
    navOverlay.classList.add('open')
  }
  switchTab('search')
  searchInput.focus()
})

// Screen-off simulation
const screenOffOverlay = document.getElementById('screen-off')
const screenOffHandle = document.getElementById('screen-off-handle')
const screenOffCanvas = document.getElementById('screen-off-canvas')
const screenOffTargetEl = document.querySelector('.screen-off-target')
const screenOffToggle = document.getElementById('screen-off-toggle')
const sctx = screenOffCanvas.getContext('2d')

let sparks = []
let rings = []
let screenOffDragging = false
let screenOffStartY = 0
let screenOffTravel = 0
let screenOffProgress = 0
let screenOffUnlocking = false

function screenOffResize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
  screenOffCanvas.width = Math.floor(window.innerWidth * dpr)
  screenOffCanvas.height = Math.floor(window.innerHeight * dpr)
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
window.addEventListener('resize', screenOffResize)
screenOffResize()

function getScreenOffTarget() {
  const r = screenOffTargetEl.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function spawnSpark(x, y, vx, vy, g, max, size) {
  if (sparks.length > 220) return
  const cols = ['255,214,102', '255,178,74', '255,240,190', '255,150,50']
  sparks.push({
    x, y, vx, vy, g, life: 0, max,
    size, seed: Math.random() * 100,
    color: cols[(Math.random() * cols.length) | 0]
  })
}

function spawnAmbientSparks() {
  const w = window.innerWidth
  const h = window.innerHeight
  const x = w / 2 + (Math.random() - 0.5) * w * 0.34
  const y = h * 0.94 - Math.random() * 30
  spawnSpark(x, y, (Math.random() - 0.5) * 26, -(70 + Math.random() * 120), 24, 1 + Math.random() * 1.2, 1 + Math.random() * 1.2)
}

function spawnDragSparks() {
  const r = screenOffHandle.getBoundingClientRect()
  const hx = r.left + r.width / 2
  const hy = r.top + r.height / 2
  for (let i = 0; i < 3; i++) {
    spawnSpark(
      hx + (Math.random() - 0.5) * 34,
      hy + (Math.random() - 0.5) * 22,
      (Math.random() - 0.5) * 100,
      -(70 + Math.random() * 230),
      46,
      0.45 + Math.random() * 0.7,
      1.4 + Math.random() * 1.6
    )
  }
}

function spawnBurst(x, y) {
  for (let i = 0; i < 90; i++) {
    const ang = Math.random() * Math.PI * 2
    const sp = 70 + Math.random() * 300
    spawnSpark(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, 280, 0.6 + Math.random() * 0.9, 1.2 + Math.random() * 1.8)
  }
  rings.push({ x, y, r0: 12, maxR: Math.min(window.innerWidth, window.innerHeight) * 0.55, life: 0, max: 0.6 })
}

function drawScreenOff(delta) {
  if (!screenOffUnlocking) {
    if (sparks.length < 60 && Math.random() < 0.5) spawnAmbientSparks()
    if (screenOffDragging) spawnDragSparks()
  }

  const w = window.innerWidth
  const h = window.innerHeight
  sctx.clearRect(0, 0, w, h)
  sctx.globalCompositeOperation = 'lighter'
  sctx.lineCap = 'round'

  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]
    s.life += delta
    if (s.life >= s.max) { sparks.splice(i, 1); continue }
    s.x += s.vx * delta
    s.y += s.vy * delta
    s.vy += s.g * delta
    const fade = 1 - s.life / s.max
    const flick = 0.55 + 0.45 * Math.sin(s.life * 46 + s.seed)
    const a = fade * flick
    if (a <= 0.02) { sparks.splice(i, 1); continue }
    const sx = s.x - s.vx * 0.03
    const sy = s.y - s.vy * 0.03
    sctx.strokeStyle = 'rgba(' + s.color + ',' + (a * 0.55).toFixed(3) + ')'
    sctx.lineWidth = s.size * 2.4
    sctx.beginPath(); sctx.moveTo(sx, sy); sctx.lineTo(s.x, s.y); sctx.stroke()
    sctx.strokeStyle = 'rgba(255,250,235,' + a.toFixed(3) + ')'
    sctx.lineWidth = s.size
    sctx.beginPath(); sctx.moveTo(sx, sy); sctx.lineTo(s.x, s.y); sctx.stroke()
  }

  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]
    r.life += delta
    if (r.life >= r.max) { rings.splice(i, 1); continue }
    const p = r.life / r.max
    const rad = r.r0 + p * p * r.maxR
    const a = (1 - p) * 0.85
    sctx.strokeStyle = 'rgba(255,214,102,' + a.toFixed(3) + ')'
    sctx.lineWidth = 2.5 * (1 - p) + 0.5
    sctx.beginPath(); sctx.arc(r.x, r.y, rad, 0, Math.PI * 2); sctx.stroke()
  }

  sctx.globalCompositeOperation = 'source-over'
}

function setScreenOffProgress(progress) {
  screenOffProgress = Math.max(0, Math.min(1, progress))
  screenOffHandle.style.transform = 'translateY(' + (-(screenOffProgress * screenOffTravel)).toFixed(1) + 'px)'
  screenOffHandle.style.filter = 'brightness(' + (1 + screenOffProgress * 1.25).toFixed(2) + ')'
  screenOffOverlay.style.opacity = (1 - screenOffProgress).toFixed(3)
}

function exitScreenOff() {
  if (!screenOff || screenOffUnlocking) return
  screenOffUnlocking = true
  screenOffDragging = false
  uiShow()
  screenOffOverlay.classList.remove('revealing')
  screenOffOverlay.style.transition = 'opacity 0.35s ease'
  screenOffOverlay.style.opacity = '0'
  screenOffOverlay.classList.add('unlocking')
  screenOffToggle.classList.remove('pressed')
  screenOffHandle.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.15), filter 0.3s ease'
  setScreenOffProgress(1)
  const t = getScreenOffTarget()
  spawnBurst(t.x, t.y)
  setTimeout(() => {
    screenOff = false
    screenOffOverlay.classList.remove('open')
  }, 380)
  setTimeout(() => {
    screenOffUnlocking = false
    screenOffOverlay.classList.remove('unlocking')
    screenOffOverlay.classList.remove('revealing')
    screenOffOverlay.style.opacity = ''
    screenOffOverlay.style.transition = ''
    screenOffHandle.style.transition = ''
    screenOffHandle.style.filter = ''
    setScreenOffProgress(0)
    sparks = []
    rings = []
  }, 800)
}

function resetScreenOffPosition() {
  screenOffHandle.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), filter 0.35s ease'
  setScreenOffProgress(0)
  setTimeout(() => {
    screenOffHandle.style.transition = ''
    screenOffOverlay.classList.remove('revealing')
    screenOffOverlay.style.opacity = ''
  }, 400)
}

screenOffToggle.addEventListener('click', () => {
  sparks = []
  rings = []
  screenOff = true
  screenOffUnlocking = false
  screenOffOverlay.classList.remove('revealing', 'unlocking')
  screenOffOverlay.style.opacity = ''
  screenOffOverlay.style.transition = ''
  screenOffHandle.style.transition = 'none'
  screenOffHandle.style.filter = ''
  setScreenOffProgress(0)
  screenOffToggle.classList.add('pressed')
  screenOffOverlay.classList.add('open')
})

screenOffHandle.addEventListener('pointerdown', (e) => {
  if (!screenOff) return
  e.preventDefault()
  screenOffDragging = true
  screenOffStartY = e.clientY
  const handleRect = screenOffHandle.getBoundingClientRect()
  const targetRect = screenOffTargetEl.getBoundingClientRect()
  const handleCenter = handleRect.top + handleRect.height / 2
  const targetCenter = targetRect.top + targetRect.height / 2
  screenOffTravel = Math.max(50, handleCenter - targetCenter)
  screenOffHandle.style.transition = 'none'
  screenOffOverlay.classList.add('revealing')
})

window.addEventListener('pointermove', (e) => {
  if (!screenOffDragging || !screenOff) return
  const dy = e.clientY - screenOffStartY
  setScreenOffProgress(-dy / screenOffTravel)
})

window.addEventListener('pointerup', () => {
  if (!screenOffDragging) return
  screenOffDragging = false
  if (screenOffProgress >= 0.9) {
    exitScreenOff()
  } else {
    resetScreenOffPosition()
  }
})

window.addEventListener('pointercancel', () => {
  if (!screenOffDragging) return
  screenOffDragging = false
  resetScreenOffPosition()
})

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout)
  const query = searchInput.value.trim()
  if (query.length < 2) {
    searchResults.innerHTML = '<div class="search-empty">Digite pelo menos 2 caracteres</div>'
    return
  }
  searchResults.innerHTML = '<div class="search-loading">Buscando...</div>'
  searchTimeout = setTimeout(() => doSearch(query), 400)
})

async function doSearch(query) {
  try {
    const ytTracks = await searchYouTube(query, 20)
    if (ytTracks.length === 0) {
      searchResults.innerHTML = '<div class="search-empty">Nenhum resultado encontrado</div>'
      return
    }

    renderSearchResults(ytTracks)
  } catch (err) {
    console.error('Search error:', err)
    searchResults.innerHTML = '<div class="search-empty">Erro ao buscar</div>'
  }
}

function renderSearchResults(tracks) {
  searchResults.innerHTML = ''
  tracks.forEach(track => {
    const el = document.createElement('div')
    el.className = 'search-track'
    const min = Math.floor(track.duration / 60)
    const sec = track.duration % 60
    const isFav = track.videoId ? FavoritesManager.isFavorite(track.videoId) : false
    el.innerHTML = `
      <img class="search-track-cover" src="${track.thumbnail || track.albumCover || ''}" alt="" />
      <div class="search-track-info">
        <div class="search-track-title">${track.title}</div>
        <div class="search-track-artist">${track.artist}</div>
      </div>
      <span class="search-track-dur">${min}:${sec < 10 ? '0' : ''}${sec}</span>
      ${track.videoId ? `<button class="search-track-fav${isFav ? ' active' : ''}" data-vid="${track.videoId}">${isFav ? '&#9829;' : '&#9825;'}</button>` : ''}
    `
    el.addEventListener('click', () => {
      audioEngine.playTrack(track, tracks)
      navToggle.classList.remove('active')
      navOverlay.classList.remove('open')
    })

    const favBtn = el.querySelector('.search-track-fav')
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        const vid = favBtn.dataset.vid
        if (FavoritesManager.isFavorite(vid)) {
          FavoritesManager.remove(vid)
          favBtn.classList.remove('active')
          favBtn.innerHTML = '&#9825;'
        } else {
          FavoritesManager.add(track)
          favBtn.classList.add('active')
          favBtn.innerHTML = '&#9829;'
        }
        renderFavorites()
      })
    }

    searchResults.appendChild(el)
  })
}

// Player controls
const btnPlay = document.getElementById('btn-play')

btnPlay.addEventListener('click', () => {
  audioEngine.togglePlay()
})

document.getElementById('btn-next').addEventListener('click', () => {
  audioEngine.next()
})

document.getElementById('btn-prev').addEventListener('click', () => {
  audioEngine.prev()
})

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault()
    audioEngine.togglePlay()
  }
})

// Volume
const volumeBar = document.getElementById('volume-bar')
const volumeFill = document.getElementById('volume-fill')

function updateVolume(e) {
  const rect = volumeBar.getBoundingClientRect()
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
  const percent = x / rect.width
  audioEngine.setVolume(percent)
  volumeFill.style.width = (percent * 100) + '%'
}

volumeBar.addEventListener('mousedown', (e) => {
  e.preventDefault()
  updateVolume(e)
  const onMove = (e) => { e.preventDefault(); updateVolume(e) }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
})

volumeBar.addEventListener('touchstart', (e) => {
  e.preventDefault()
  updateVolume(e.touches[0])
  const onMove = (e) => { e.preventDefault(); updateVolume(e.touches[0]) }
  const onEnd = () => {
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onEnd)
  }
  document.addEventListener('touchmove', onMove, { passive: false })
  document.addEventListener('touchend', onEnd)
})

// Queue menu
const playerInfo = document.getElementById('player-info')
const queueMenu = document.getElementById('queue-menu')
const queueSections = document.getElementById('queue-sections')
const queueClose = document.getElementById('queue-close')

const equalizerSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="14" width="3" height="8" rx="1"><animate attributeName="height" values="8;4;8" dur="0.8s" repeatCount="indefinite"/><animate attributeName="y" values="14;16;14" dur="0.8s" repeatCount="indefinite"/></rect><rect x="10.5" y="8" width="3" height="14" rx="1"><animate attributeName="height" values="14;6;14" dur="0.6s" repeatCount="indefinite"/><animate attributeName="y" values="8;12;8" dur="0.6s" repeatCount="indefinite"/></rect><rect x="17" y="12" width="3" height="10" rx="1"><animate attributeName="height" values="10;5;10" dur="0.7s" repeatCount="indefinite"/><animate attributeName="y" values="12;15;12" dur="0.7s" repeatCount="indefinite"/></rect></svg>`

function renderQueue() {
  const queue = audioEngine.queue
  const currentIdx = audioEngine.currentTrack
  if (queue.length === 0) {
    queueSections.innerHTML = '<div class="search-empty">Nenhuma música na fila</div>'
    return
  }

  let html = ''
  queue.forEach((track, i) => {
    const isActive = i === currentIdx
    const min = Math.floor(track.duration / 60)
    const sec = track.duration % 60
    const isFav = track.videoId ? FavoritesManager.isFavorite(track.videoId) : false
    html += `
      <div class="queue-item${isActive ? ' active' : ''}">
        <img class="queue-item-thumb" src="${track.albumCover || track.thumbnail || ''}" alt="" />
        <div class="queue-item-info">
          <span class="queue-item-title">${track.title}</span>
          <span class="queue-item-artist">${track.artist}</span>
        </div>
        <span class="queue-item-dur">${min}:${sec < 10 ? '0' : ''}${sec}</span>
        ${track.videoId ? `<button class="queue-item-fav${isFav ? ' active' : ''}" data-vid="${track.videoId}">${isFav ? '&#9829;' : '&#9825;'}</button>` : ''}
      </div>`
  })

  queueSections.innerHTML = html

  queueSections.querySelectorAll('.queue-item').forEach((el, i) => {
    el.style.cursor = 'pointer'
    el.addEventListener('click', () => {
      audioEngine.playFromQueue(i)
      queueOpen = false
      queueMenu.classList.remove('open')
    })

    const favBtn = el.querySelector('.queue-item-fav')
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        const vid = favBtn.dataset.vid
        if (FavoritesManager.isFavorite(vid)) {
          FavoritesManager.remove(vid)
          favBtn.classList.remove('active')
          favBtn.innerHTML = '&#9825;'
        } else {
          FavoritesManager.add(audioEngine.queue[i])
          favBtn.classList.add('active')
          favBtn.innerHTML = '&#9829;'
        }
        renderFavorites()
      })
    }
  })
}

let queueOpen = false

function openQueue() {
  if (!queueOpen) {
    queueOpen = true
    renderQueue()
    queueMenu.classList.add('open')
  }
}

function toggleQueue() {
  if (queueOpen) {
    queueOpen = false
    queueMenu.classList.remove('open')
  } else {
    openQueue()
  }
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 768px)').matches
}

function handlePlayerInfoTap() {
  const hasTrack = audioEngine.getCurrentTrack() !== null

  if (hasTrack || !isMobileViewport()) {
    openQueue()
    return
  }

  if (!navOverlay.classList.contains('open')) {
    navToggle.classList.add('active')
    navOverlay.classList.add('open')
  }
  if (FavoritesManager.getAll().length === 0) {
    switchTab('search')
    setTimeout(() => searchInput.focus(), 150)
  } else {
    switchTab('home')
  }
}

let gesturePointerId = null
let gestureStartX = 0
let gestureStartY = 0
let gestureActive = false
let gestureDragged = false

playerInfo.addEventListener('pointerdown', (e) => {
  gesturePointerId = e.pointerId
  gestureStartX = e.clientX
  gestureStartY = e.clientY
  gestureActive = true
  gestureDragged = false
})

playerInfo.addEventListener('pointermove', (e) => {
  if (!gestureActive || e.pointerId !== gesturePointerId) return
  const dx = e.clientX - gestureStartX
  const dy = e.clientY - gestureStartY
  if (Math.abs(dx) > 14 || Math.abs(dy) > 14) gestureDragged = true
})

playerInfo.addEventListener('pointerup', (e) => {
  if (e.pointerId !== gesturePointerId || !gestureActive) return
  gestureActive = false
  const dx = e.clientX - gestureStartX
  const dy = e.clientY - gestureStartY

  if (gestureDragged && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
    if (dx < 0) audioEngine.next()
    else audioEngine.prev()
    return
  }

  handlePlayerInfoTap()
})

playerInfo.addEventListener('pointercancel', () => {
  gestureActive = false
})

queueClose.addEventListener('click', (e) => {
  e.stopPropagation()
  queueOpen = false
  queueMenu.classList.remove('open')
})

document.addEventListener('click', (e) => {
  if (queueOpen && !queueMenu.contains(e.target) && !playerInfo.contains(e.target)) {
    queueOpen = false
    queueMenu.classList.remove('open')
  }
})
