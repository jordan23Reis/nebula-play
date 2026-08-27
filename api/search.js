const INNERTUBE_CLIENT = {
  clientName: 'ANDROID_VR',
  clientVersion: '1.57.29',
  androidSdkVersion: 34,
  hl: 'en',
  gl: 'US',
  userAgent: 'com.google.android.apps.youtube.vr.oculus/1.57.29 (Linux; U; Android 14; eureka-user Build/SQ3A.220605.009.A1) gzip'
}

const INNERTUBE_BODY = {
  context: {
    client: INNERTUBE_CLIENT
  },
  contentCheckOk: true,
  racyCheckOk: true
}

async function innertubeSearch(query) {
  const res = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': INNERTUBE_CLIENT.userAgent,
      'X-YouTube-Client-Name': '3',
      'X-YouTube-Client-Version': INNERTUBE_CLIENT.clientVersion
    },
    body: JSON.stringify({ ...INNERTUBE_BODY, query }),
    signal: AbortSignal.timeout(10000)
  })
  if (!res.ok) throw new Error(`InnerTube search: ${res.status}`)
  return res.json()
}

function parseSearchResults(data) {
  const items = []
  const contents = data.contents?.sectionListRenderer?.contents || []

  for (const section of contents) {
    const sectionItems = section.itemSectionRenderer?.contents || []
    for (const item of sectionItems) {
      const video = item.videoRenderer || item.compactVideoRenderer
      if (!video) continue

      const durationText = video.lengthText?.simpleText || video.lengthText?.runs?.[0]?.text || ''
      const parts = durationText.split(':').map(Number)
      const duration = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0)

      items.push({
        videoId: video.videoId,
        title: video.title?.runs?.[0]?.text || '',
        artist: video.longBylineText?.runs?.[0]?.text || video.ownerText?.runs?.[0]?.text || '',
        thumbnail: video.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`,
        duration,
        viewCount: video.viewCountText?.simpleText || video.viewCountText?.runs?.[0]?.text || ''
      })
    }
  }

  return items
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const query = req.query.q
  if (!query) return res.json({ items: [] })

  try {
    const data = await innertubeSearch(query)
    const items = parseSearchResults(data)
    res.json({ items })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
