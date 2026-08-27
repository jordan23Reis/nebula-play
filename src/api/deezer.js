const BASE = 'https://api.deezer.com'

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cbName = '_dz_' + Math.random().toString(36).slice(2)
    const script = document.createElement('script')
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('JSONP timeout'))
    }, 10000)

    function cleanup() {
      clearTimeout(timeout)
      delete window[cbName]
      if (script.parentNode) script.parentNode.removeChild(script)
    }

    window[cbName] = (data) => {
      cleanup()
      resolve(data)
    }

    script.src = url + (url.includes('?') ? '&' : '?') + 'output=jsonp&callback=' + cbName
    script.onerror = () => {
      cleanup()
      reject(new Error('JSONP error'))
    }
    document.head.appendChild(script)
  })
}

function normalizeTrack(item) {
  return {
    id: item.id,
    title: item.title,
    artist: item.artist?.name || 'Unknown',
    album: item.album?.title || 'Unknown',
    albumCover: item.album?.cover_big || item.album?.cover_medium || item.album?.cover || '',
    duration: item.duration,
    preview: item.preview,
    link: item.link
  }
}

function normalizePlaylist(item) {
  return {
    id: item.id,
    title: item.title,
    picture: item.picture_big || item.picture_medium || item.picture || '',
    trackCount: item.nb_tracks || 0,
    user: item.user?.name || 'Deezer'
  }
}

export async function searchTracks(query, limit = 20) {
  const data = await jsonp(`${BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`)
  return (data.data || []).map(normalizeTrack)
}

export async function getCharts() {
  const data = await jsonp(`${BASE}/chart/0/tracks?limit=30`)
  return (data.data || []).map(normalizeTrack)
}

export async function getPlaylistTracks(playlistId) {
  const data = await jsonp(`${BASE}/playlist/${playlistId}`)
  const tracks = (data.tracks?.data || []).map(normalizeTrack)
  return {
    title: data.title,
    picture: data.picture_big || data.picture_medium || '',
    tracks
  }
}

export async function getArtistTopTracks(artistId, limit = 10) {
  const data = await jsonp(`${BASE}/artist/${artistId}/top?limit=${limit}`)
  return (data.data || []).map(normalizeTrack)
}

export async function getEditorialPlaylists() {
  const data = await jsonp(`${BASE}/chart/0/playlists?limit=10`)
  return (data.data || []).map(normalizePlaylist)
}
