export async function searchYouTube(query, limit = 20) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
  const data = await res.json()
  const items = (data.items || []).slice(0, limit)
  return items.map(item => ({
    id: item.videoId,
    videoId: item.videoId,
    title: item.title,
    artist: item.artist,
    thumbnail: item.thumbnail,
    duration: item.duration,
    viewCount: item.viewCount,
    source: 'youtube'
  }))
}

export async function getStreamUrl(videoId) {
  const res = await fetch(`/api/stream?videoId=${videoId}`)
  const data = await res.json()
  if (data.url) {
    return `/api/proxy?url=${encodeURIComponent(data.url)}`
  }
  return null
}
