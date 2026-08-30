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
let uiLastTap = 0
let uiFullscreenHintTimer = null
const uiAutoHideMedia = window.matchMedia('(max-width: 768px)')
const uiFullscreenHintEl = document.getElementById('ui-fullscreen-hint')

function showUiFullscreenHint() {
  uiFullscreenHintEl.classList.add('show')
  clearTimeout(uiFullscreenHintTimer)
  uiFullscreenHintTimer = setTimeout(() => {
    uiFullscreenHintEl.classList.remove('show')
  }, 4500)
}

function uiScheduleHide() {
  clearTimeout(uiHideTimer)
  if (uiHidden || !uiAutoHideMedia.matches) return
  uiHideTimer = setTimeout(() => {
    if (uiAutoHideMedia.matches && !screenOff) {
      uiHidden = true
      document.body.classList.add('ui-hidden')
    }
  }, 20000)
}

function uiShow() {
  if (!uiHidden) return
  uiHidden = false
  document.body.classList.remove('ui-hidden')
  document.body.classList.remove('ui-fullscreen')
  uiFullscreenHintEl.classList.remove('show')
  clearTimeout(uiFullscreenHintTimer)
  exitFullscreen()
  uiScheduleHide()
}

;['pointerdown', 'pointerup', 'keydown'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (uiHidden) {
      if (evt === 'keydown') uiShow()
      return
    }
    uiScheduleHide()
  }, { passive: true })
})

document.addEventListener('pointerup', () => {
  if (!uiHidden) return
  const now = Date.now()
  if (now - uiLastTap < 350) {
    uiLastTap = 0
    uiShow()
  } else {
    uiLastTap = now
  }
})

document.getElementById('ui-fullscreen-btn').addEventListener('click', () => {
  enterFullscreen()
  document.body.classList.add('ui-fullscreen')
  showUiFullscreenHint()
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
  audioEngine.handleTrackEnd()
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
const screenOffBg = document.getElementById('screen-off-bg')
const screenOffToggle = document.getElementById('screen-off-toggle')
const screenOffButton = document.getElementById('screen-off-copy')
const screenOffPowerIcon = screenOffButton.querySelector('.icon-power')
const screenOffLightIcon = screenOffButton.querySelector('.icon-light')
const screenOffTrail = document.getElementById('screen-off-trail')
const screenOffTrailFill = document.getElementById('screen-off-trail-fill')

let screenOffDragging = false
let screenOffGrabbedY = 0
let screenOffGrabProgress = 0
let screenOffBtnBase = 0
let screenOffTrailTop = 0
let screenOffTrailLen = 1
let screenOffProgress = 1
let screenOffUnlocking = false
let screenOffDescending = false

const SCREEN_OFF_TWEEN = 'transform 0.95s cubic-bezier(0.33, 1, 0.68, 1)'
const SCREEN_OFF_BG_TWEEN = 'opacity 1.05s ease'
const SCREEN_OFF_ICON_TWEEN = 'opacity 0.9s ease'

function setScreenOffTweens(on) {
  screenOffButton.style.transition = on ? SCREEN_OFF_TWEEN : 'none'
  screenOffBg.style.transition = on ? SCREEN_OFF_BG_TWEEN : 'none'
  screenOffPowerIcon.style.transition = on ? SCREEN_OFF_ICON_TWEEN : 'none'
  screenOffLightIcon.style.transition = on ? SCREEN_OFF_ICON_TWEEN : 'none'
}

function setScreenOffState(p) {
  screenOffProgress = Math.max(0, Math.min(1, p))
  const y = screenOffTrailTop + (screenOffProgress * screenOffTrailLen) - screenOffBtnBase
  screenOffButton.style.transform = 'translateY(' + y.toFixed(1) + 'px)'
  screenOffBg.style.opacity = screenOffProgress.toFixed(3)
  screenOffPowerIcon.style.opacity = (1 - screenOffProgress).toFixed(3)
  screenOffLightIcon.style.opacity = screenOffProgress.toFixed(3)
  screenOffTrailFill.style.height = (screenOffProgress * 100).toFixed(1) + '%'
}

function screenOffInitAnchors() {
  screenOffButton.style.transform = ''
  const tr = screenOffTrail.getBoundingClientRect()
  const br = screenOffButton.getBoundingClientRect()
  screenOffTrailTop = tr.top
  screenOffTrailLen = Math.max(1, tr.bottom - tr.top)
  screenOffBtnBase = br.bottom
}

function screenOffRefreshTrail() {
  const tr = screenOffTrail.getBoundingClientRect()
  screenOffTrailTop = tr.top
  screenOffTrailLen = Math.max(1, tr.bottom - tr.top)
}

function enterFullscreen() {
  const el = document.documentElement
  const req = el.requestFullscreen || el.webkitRequestFullscreen
  if (!req) return
  try {
    const p = req.call(el)
    if (p && p.catch) p.catch(() => {})
  } catch (e) {}
}

function exitFullscreen() {
  if (!(document.fullscreenElement || document.webkitFullscreenElement)) return
  const ext = document.exitFullscreen || document.webkitExitFullscreen
  if (!ext) return
  try {
    const p = ext.call(document)
    if (p && p.catch) p.catch(() => {})
  } catch (e) {}
}

document.addEventListener('fullscreenchange', () => {
  const active = !!(document.fullscreenElement || document.webkitFullscreenElement)
  if (active && screenOff) {
    screenOffRefreshTrail()
    if (screenOffDescending) {
      screenOffDescending = false
      setScreenOffTweens(false)
      setScreenOffState(0)
      void screenOffButton.offsetWidth
      setScreenOffTweens(true)
      setScreenOffState(1)
      setTimeout(() => { screenOffDescending = false }, 1000)
    } else {
      const br = screenOffButton.getBoundingClientRect()
      const p = Math.max(0, Math.min(1, (br.bottom - screenOffTrailTop) / screenOffTrailLen))
      setScreenOffTweens(false)
      setScreenOffState(p)
      setScreenOffTweens(true)
    }
  }
  if (!active && screenOff && !screenOffUnlocking) {
    finishScreenOff()
  }
  if (!active && uiHidden && !screenOff) {
    uiShow()
  }
})

function startScreenOff() {
  if (screenOff || screenOffUnlocking) return
  screenOffToggle.style.display = 'none'
  screenOffButton.style.display = 'flex'
  uiShow()
  enterFullscreen()
  screenOff = true
  screenOffUnlocking = false
  document.body.classList.add('screen-off')
  screenOffOverlay.classList.remove('unlocking')
  screenOffOverlay.classList.add('open')
  screenOffButton.style.opacity = '1'
  screenOffInitAnchors()

  screenOffDescending = true
  setScreenOffTweens(false)
  setScreenOffState(0)
  void screenOffButton.offsetWidth
  setScreenOffTweens(true)
  setScreenOffState(1)
  setTimeout(() => { screenOffDescending = false }, 1000)
}

function finishScreenOff() {
  if (screenOffUnlocking) return
  screenOff = false
  screenOffUnlocking = true
  uiShow()
  screenOffOverlay.classList.add('unlocking')
  screenOffButton.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.12)'
  screenOffBg.style.transition = 'opacity 0.4s ease'
  screenOffPowerIcon.style.transition = 'opacity 0.35s ease'
  screenOffLightIcon.style.transition = 'opacity 0.35s ease'
  setScreenOffState(0)
  setTimeout(() => {
    document.body.classList.remove('screen-off')
    screenOffOverlay.classList.remove('open')
    screenOffButton.style.display = 'none'
    screenOffToggle.style.display = ''
    exitFullscreen()
  }, 460)
  setTimeout(() => {
    screenOffUnlocking = false
    screenOffOverlay.classList.remove('unlocking')
    setScreenOffTweens(false)
    screenOffBg.style.opacity = ''
    screenOffBg.style.transition = ''
    screenOffButton.style.transform = ''
    screenOffButton.style.opacity = ''
    screenOffButton.style.transition = ''
    screenOffPowerIcon.style.transition = ''
    screenOffLightIcon.style.transition = ''
    screenOffTrailFill.style.height = ''
    screenOffProgress = 1
  }, 700)
}

function springScreenOffBack() {
  setScreenOffTweens(true)
  setScreenOffState(1)
  setTimeout(() => setScreenOffTweens(false), 1200)
}

screenOffToggle.addEventListener('click', () => {
  if (screenOff || screenOffUnlocking) return
  startScreenOff()
})

screenOffButton.addEventListener('pointerdown', (e) => {
  if (!screenOff || screenOffUnlocking) return
  e.preventDefault()
  const tr = screenOffTrail.getBoundingClientRect()
  const br = screenOffButton.getBoundingClientRect()
  screenOffTrailTop = tr.top
  screenOffTrailLen = Math.max(1, tr.bottom - tr.top)
  screenOffGrabbedY = e.clientY
  screenOffGrabProgress = Math.max(0, Math.min(1, (br.bottom - screenOffTrailTop) / screenOffTrailLen))
  screenOffDescending = false
  screenOffDragging = true
  screenOffOverlay.classList.add('screen-off-dragging')
  setScreenOffTweens(false)
  setScreenOffState(screenOffGrabProgress)
})

window.addEventListener('pointermove', (e) => {
  if (!screenOffDragging || !screenOff) return
  const p = screenOffGrabProgress + (e.clientY - screenOffGrabbedY) / screenOffTrailLen
  setScreenOffState(Math.max(0, Math.min(1, p)))
})

window.addEventListener('pointerup', (e) => {
  if (!screenOffDragging) return
  screenOffDragging = false
  screenOffOverlay.classList.remove('screen-off-dragging')
  if (!screenOff) return
  const br = screenOffButton.getBoundingClientRect()
  const p = (br.bottom - screenOffTrailTop) / screenOffTrailLen
  if (p <= 0.1) {
    finishScreenOff()
  } else {
    springScreenOffBack()
  }
})

window.addEventListener('pointercancel', () => {
  if (!screenOffDragging) return
  screenOffDragging = false
  screenOffOverlay.classList.remove('screen-off-dragging')
  springScreenOffBack()
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

document.getElementById('btn-repeat').addEventListener('click', () => {
  audioEngine.cycleRepeat()
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
