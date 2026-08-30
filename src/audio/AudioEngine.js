export class AudioEngine {
  constructor() {
    this.queue = []
    this.history = []
    this.currentTrack = -1
    this.blockedTracks = new Set()
    this._skipTimer = null
    this.volume = 0.7
    this.isPlaying = false
    this.onTrackEnd = null
    this.loading = false
    this.mode = 'idle'
    this.repeat = 'off'
    this.ytPlayer = null
    this.ytReady = false
    this.ytInitStarted = false
    this._ytReadyPromise = null

    this.audio = null
    this.ctx = null
    this.analyser = null
    this.source = null

    this.wasPlaying = false

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.wasPlaying && this.mode === 'youtube' && this.ytPlayer?.playVideo) {
        this.ytPlayer.playVideo()
      }
    })

    try {
      this.repeat = localStorage.getItem('nebula-repeat') || 'off'
    } catch (e) {}
    this.updateRepeatUI()
  }

  initYouTube() {
    if (this._ytReadyPromise) return this._ytReadyPromise
    this.ytInitStarted = true
    console.log('[Nebula] initYouTube start')

    this._ytReadyPromise = new Promise((resolve) => {
      this._ytResolve = resolve

      const tryCreate = () => {
        if (this.ytPlayer) return true
        if (window.YT && window.YT.Player && document.getElementById('yt-player')) {
          this.createYTPlayer()
          return true
        }
        return false
      }

      window.onYouTubeIframeAPIReady = () => {
        console.log('[Nebula] YT API ready callback')
        tryCreate()
      }

      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
      console.log('[Nebula] YT script appended')

      const poll = setInterval(() => {
        if (tryCreate()) clearInterval(poll)
      }, 200)

      setTimeout(() => {
        clearInterval(poll)
        if (!this.ytReady) {
          console.error('[Nebula] YT player init timeout')
          resolve()
        }
      }, 10000)
    })

    return this._ytReadyPromise
  }

  createYTPlayer() {
    if (this.ytPlayer) return
    console.log('[Nebula] Creating YT.Player')

    this.ytPlayer = new YT.Player('yt-player', {
      height: '112',
      width: '200',
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        rel: 0,
        showinfo: 0
      },
      events: {
        onReady: () => {
          this.ytReady = true
          this.ytPlayer.setVolume(this.volume * 100)
          console.log('[Nebula] YT Player READY')
          if (this._ytResolve) { this._ytResolve(); this._ytResolve = null }
        },
        onStateChange: (e) => {
          console.log('[Nebula] YT state:', e.data)
          if (e.data === YT.PlayerState.ENDED) {
            this.isPlaying = false
            this.wasPlaying = false
            this.history.push(this.currentTrack)
            this.updatePlayerUI()
            if (this.onTrackEnd) this.onTrackEnd()
          } else if (e.data === YT.PlayerState.PLAYING) {
            this.isPlaying = true
            this.wasPlaying = true
            this.loading = false
            this.updatePlayerUI()
          } else if (e.data === YT.PlayerState.PAUSED) {
            this.isPlaying = false
            this.updatePlayerUI()
          }
        },
        onError: (e) => {
          console.error('[Nebula] YT error:', e.data)
          this.loading = false
          this.isPlaying = false
          this.updatePlayerUI()
          const code = e.data
          if (code === 100 || code === 101 || code === 105 || code === 150) {
            const track = this.queue[this.currentTrack]
            if (track && track.videoId) this.blockedTracks.add(track.videoId)
            console.warn('[Nebula] Vídeo indisponível/sem embed, pulando para o próximo')
            this.cancelAutoSkip()
            this._skipTimer = setTimeout(() => this.next(), 800)
          }
        }
      }
    })
  }

  initAudioContext() {
    if (this.ctx) return
    this.ctx = new (window.AudioContext || window.webkitAudioContext)()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 256
    this.analyser.smoothingTimeConstant = 0.8
  }

  playTrack(track, queue = null) {
    console.log('[Nebula] playTrack:', track.title, 'videoId:', track.videoId)
    this.cancelAutoSkip()
    if (queue) {
      this.queue = queue
      this.history.length = 0
    }

    this.currentTrack = this.queue.findIndex(t => t.id === track.id)
    if (this.currentTrack === -1) {
      this.queue.unshift(track)
      this.currentTrack = 0
    }

    const t = this.queue[this.currentTrack]

    if (t.videoId) {
      this.playYouTube(t)
    } else if (t.preview) {
      this.playDeezer(t)
    } else {
      console.warn('[Nebula] No videoId or preview on track')
    }
  }

  async playYouTube(track) {
    console.log('[Nebula] playYouTube start:', track.videoId)
    this.loading = true
    this.mode = 'youtube'
    this.updatePlayerUI()

    await this.initYouTube()
    console.log('[Nebula] initYouTube resolved, ytReady:', this.ytReady)

    if (!this.ytPlayer || typeof this.ytPlayer.loadVideoById !== 'function') {
      console.error('[Nebula] YT player not usable')
      this.loading = false
      this.updatePlayerUI()
      return
    }

    console.log('[Nebula] Calling loadVideoById:', track.videoId)
    this.ytPlayer.loadVideoById(track.videoId)
    this.ytPlayer.setVolume(this.volume * 100)
  }

  playDeezer(track) {
    this.mode = 'deezer'
    this.initAudioContext()
    if (this.ctx.state === 'suspended') this.ctx.resume()

    if (!this.audio) {
      this.audio = new Audio()
      this.audio.crossOrigin = 'anonymous'
      this.source = this.ctx.createMediaElementSource(this.audio)
      this.source.connect(this.analyser)
      this.analyser.connect(this.ctx.destination)
      this.audio.addEventListener('ended', () => {
        this.isPlaying = false
        this.history.push(this.currentTrack)
        if (this.onTrackEnd) this.onTrackEnd()
      })
    }

    this.audio.src = track.preview
    this.audio.volume = this.volume
    this.audio.play()
    this.isPlaying = true
    this.wasPlaying = true
    this.loading = false
    this.updatePlayerUI()
  }

  playFromQueue(index) {
    if (index >= 0 && index < this.queue.length) {
      this.playTrack(this.queue[index])
    }
  }

  togglePlay() {
    if (this.mode === 'youtube') {
      if (!this.ytReady || !this.ytPlayer) return
      if (this.isPlaying) {
        this.wasPlaying = false
        this.ytPlayer.pauseVideo()
      } else {
        this.wasPlaying = true
        this.ytPlayer.playVideo()
      }
    } else if (this.mode === 'deezer') {
      if (!this.audio) return
      if (this.isPlaying) {
        this.wasPlaying = false
        this.audio.pause()
      } else {
        this.wasPlaying = true
        this.audio.play()
      }
    } else {
      if (this.queue.length > 0) {
        this.playTrack(this.queue[0])
        return
      }
    }
    this.isPlaying = !this.isPlaying
    this.updatePlayerUI()
  }

  cancelAutoSkip() {
    if (this._skipTimer) {
      clearTimeout(this._skipTimer)
      this._skipTimer = null
    }
  }

  findPlayableIndex(fromIdx, step) {
    const len = this.queue.length
    if (len === 0) return fromIdx
    let idx = fromIdx
    for (let guard = 0; guard < len; guard++) {
      const t = this.queue[idx]
      if (!t || !this.blockedTracks.has(t.videoId)) return idx
      idx = (idx + step + len) % len
    }
    return fromIdx
  }

  next() {
    if (this.queue.length === 0) return
    this.cancelAutoSkip()
    if (this.history[this.history.length - 1] !== this.currentTrack) {
      this.history.push(this.currentTrack)
    }
    this.currentTrack = this.findPlayableIndex((this.currentTrack + 1) % this.queue.length, 1)
    this.playTrack(this.queue[this.currentTrack])
  }

  handleTrackEnd() {
    if (this.repeat === 'one') {
      this.restartCurrent()
    } else {
      this.next()
    }
  }

  restartCurrent() {
    const track = this.getCurrentTrack()
    if (!track) return
    if (this.mode === 'youtube' && this.ytPlayer && typeof this.ytPlayer.seekTo === 'function') {
      this.ytPlayer.seekTo(0, true)
      this.ytPlayer.playVideo()
    } else if (this.mode === 'deezer' && this.audio) {
      this.audio.currentTime = 0
      this.audio.play()
    }
    this.isPlaying = true
    this.wasPlaying = true
    this.updatePlayerUI()
  }

  cycleRepeat() {
    this.repeat = this.repeat === 'one' ? 'all' : 'one'
    try { localStorage.setItem('nebula-repeat', this.repeat) } catch (e) {}
    this.updateRepeatUI()
    return this.repeat
  }

  updateRepeatUI() {
    const btn = document.getElementById('btn-repeat')
    if (!btn) return
    const on = this.repeat === 'one'
    btn.classList.remove('repeat-one')
    btn.classList.toggle('repeat-active', on)
    btn.setAttribute('aria-pressed', on ? 'true' : 'false')
    btn.setAttribute('aria-label', on ? 'Repetir música atual' : 'Repetir desativado')
  }

  prev() {
    if (this.queue.length === 0) return
    this.cancelAutoSkip()

    while (this.history.length > 0) {
      const last = this.history[this.history.length - 1]
      this.history.pop()
      if (last >= 0 && last < this.queue.length && last !== this.currentTrack) {
        const t = this.queue[last]
        if (!t || !this.blockedTracks.has(t.videoId)) {
          this.currentTrack = last
          this.playTrack(this.queue[this.currentTrack])
          return
        }
      }
    }

    this.currentTrack = this.findPlayableIndex((this.currentTrack - 1 + this.queue.length) % this.queue.length, -1)
    this.playTrack(this.queue[this.currentTrack])
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value))
    if (this.mode === 'youtube' && this.ytReady && this.ytPlayer) {
      this.ytPlayer.setVolume(this.volume * 100)
    } else if (this.audio) {
      this.audio.volume = this.volume
    }
  }

  getCurrentTime() {
    if (this.mode === 'youtube' && this.ytReady && this.ytPlayer) {
      return this.ytPlayer.getCurrentTime() || 0
    } else if (this.audio) {
      return this.audio.currentTime || 0
    }
    return 0
  }

  getDuration() {
    if (this.mode === 'youtube' && this.ytReady && this.ytPlayer) {
      return this.ytPlayer.getDuration() || 0
    } else if (this.audio) {
      return this.audio.duration || 0
    }
    return 0
  }

  seek(fraction) {
    const dur = this.getDuration()
    if (dur <= 0) return
    const time = fraction * dur
    if (this.mode === 'youtube' && this.ytReady && this.ytPlayer) {
      this.ytPlayer.seekTo(time, true)
    } else if (this.audio) {
      this.audio.currentTime = time
    }
  }

  getCurrentTrack() {
    if (this.currentTrack >= 0 && this.currentTrack < this.queue.length) {
      return this.queue[this.currentTrack]
    }
    return null
  }

  updatePlayerUI() {
    const track = this.getCurrentTrack()
    const titleEl = document.getElementById('player-title')
    const artistEl = document.getElementById('player-artist')
    const thumbEl = document.getElementById('player-thumb')
    const playBtn = document.getElementById('btn-play')

    if (track) {
      if (titleEl) titleEl.textContent = track.title
      if (artistEl) artistEl.textContent = track.artist
      if (thumbEl) {
        const cover = track.albumCover || track.thumbnail || ''
        if (cover) {
          thumbEl.style.background = `url(${cover}) center/cover`
        }
      }
    }

    if (playBtn) {
      if (this.loading) {
        playBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" opacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></path></svg>`
      } else {
        const playSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`
        const pauseSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
        playBtn.innerHTML = this.isPlaying ? pauseSVG : playSVG
      }
    }
  }

  getAnalysis() {
    if (this.mode === 'youtube' && this.isPlaying) {
      const t = performance.now() * 0.001
      const vol = this.volume
      const waveform = this._waveform || (this._waveform = new Uint8Array(128))
      const frequency = this._frequency || (this._frequency = new Uint8Array(128))
      for (let i = 0; i < 128; i++) {
        waveform[i] = 128 + Math.sin(t * 5 + i * 0.3) * 40 * vol
        frequency[i] = Math.max(0, Math.min(255, (0.5 + 0.5 * Math.sin(t * 3 + i * 0.2)) * 200 * vol * (1 - i / 128)))
      }
      return {
        bass: (0.3 + 0.3 * Math.sin(t * 2.1) + 0.2 * Math.sin(t * 3.7)) * vol,
        mid: (0.25 + 0.25 * Math.sin(t * 4.3) + 0.15 * Math.sin(t * 5.1)) * vol,
        treble: (0.2 + 0.2 * Math.sin(t * 6.7) + 0.1 * Math.sin(t * 8.3)) * vol,
        waveform,
        frequency
      }
    }

if (this.mode === 'deezer' && this.analyser && this.isPlaying) {
      const binCount = this.analyser.frequencyBinCount
      if (!this._freqBuf || this._freqBuf.length !== binCount) {
        this._freqBuf = new Uint8Array(binCount)
        this._waveBuf = new Uint8Array(binCount)
      }
      const frequency = this._freqBuf
      const waveform = this._waveBuf
      this.analyser.getByteFrequencyData(frequency)
      this.analyser.getByteTimeDomainData(waveform)

      const bassEnd = Math.floor(binCount * 0.15)
      const midEnd = Math.floor(binCount * 0.5)

      let bassSum = 0, midSum = 0, trebleSum = 0
      for (let i = 0; i < bassEnd; i++) bassSum += frequency[i]
      for (let i = bassEnd; i < midEnd; i++) midSum += frequency[i]
      for (let i = midEnd; i < binCount; i++) trebleSum += frequency[i]

      return {
        bass: bassSum / (bassEnd * 255),
        mid: midSum / ((midEnd - bassEnd) * 255),
        treble: trebleSum / ((binCount - midEnd) * 255),
        waveform,
        frequency
      }
    }

    return {
      bass: 0, mid: 0, treble: 0,
      waveform: this._waveform || (this._waveform = new Uint8Array(128)),
      frequency: this._frequency || (this._frequency = new Uint8Array(128))
    }
  }
}
