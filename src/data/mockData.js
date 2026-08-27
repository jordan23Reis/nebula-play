export const recommendedPlaylists = [
  { deezerId: 3155776842, name: 'Top 50 Brasil', color: '#1DB954' },
  { deezerId: 1111978851, name: 'Rock Classics', color: '#e74c3c' },
  { deezerId: 1230563811, name: 'Pop Rising', color: '#9b59b6' },
  { deezerId: 7092347645, name: 'Hip Hop Hits', color: '#f39c12' },
  { deezerId: 5370572282, name: 'Chill Vibes', color: '#3498db' },
  { deezerId: 0, name: 'Eletrônica', color: '#00d4aa' }
]

const STORAGE_KEY = 'nebula_favorites'

export const FavoritesManager = {
  getAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  },

  add(track) {
    const favs = this.getAll()
    if (favs.some(f => f.videoId === track.videoId)) return
    favs.push({
      id: track.id,
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      duration: track.duration,
      thumbnail: track.thumbnail,
      source: 'youtube'
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs))
  },

  remove(videoId) {
    const favs = this.getAll().filter(f => f.videoId !== videoId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs))
  },

  isFavorite(videoId) {
    return this.getAll().some(f => f.videoId === videoId)
  }
}
