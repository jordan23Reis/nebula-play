import express from 'express'
import { execFile } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = 3001

const YTDLP_PATH = join(__dirname, 'bin', 'yt-dlp.exe')

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

function getStreamUrl(videoId) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP_PATH, [
      '--no-playlist',
      '--no-warnings',
      '-f', 'bestaudio',
      '-g',
      `https://www.youtube.com/watch?v=${videoId}`
    ], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('yt-dlp error:', stderr || err.message)
        return reject(new Error(stderr || err.message))
      }
      resolve(stdout.trim())
    })
  })
}

app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q
    if (!query) return res.json({ items: [] })

    console.log('Searching:', query)
    const data = await innertubeSearch(query)
    const items = parseSearchResults(data)
    console.log('Found:', items.length, 'items')
    res.json({ items })
  } catch (err) {
    console.error('Search error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/stream', async (req, res) => {
  try {
    const videoId = req.query.videoId
    if (!videoId) return res.status(400).json({ error: 'videoId required' })

    console.log('Getting stream for:', videoId)
    const url = await getStreamUrl(videoId)

    if (!url) {
      return res.status(404).json({ error: 'No stream found' })
    }

    res.json({ url })
  } catch (err) {
    console.error('Stream error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/proxy', async (req, res) => {
  try {
    const url = req.query.url
    if (!url) return res.status(400).json({ error: 'url required' })

    const range = req.headers.range
    const headers = { 'User-Agent': 'Mozilla/5.0' }
    if (range) headers.Range = range

    const upstream = await fetch(url, { headers })

    res.status(upstream.status)
    upstream.headers.forEach((v, k) => {
      if (k !== 'content-security-policy') res.setHeader(k, v)
    })

    const reader = upstream.body.getReader()
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) { res.end(); return }
        res.write(value)
      }
    }
    await pump()
  } catch (err) {
    console.error('Proxy error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`Nebula API server running on http://localhost:${PORT}`)
})
