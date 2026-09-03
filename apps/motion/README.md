# @vx/motion

A standalone HTTP service that turns a coloring-page line-art image into a
**"self-drawing" animation MP4** (the drawing builds up stroke by stroke).

Fresh Node implementation of the Sketch2Motion idea — **no Manim, no Python, no
third-party code copied**. Pipeline:

```
image URL → potrace (vectorize) → SVG outline paths
          → sample each path into a polyline
          → render frames: progressively stroke each path (staggered by length)
          → pipe raw RGBA frames → ffmpeg → H.264 MP4
```

## Run

```bash
cp .env.example .env      # fill R2 vars if you want upload
yarn workspace @vx/motion dev      # listens on :7801
```

Requires `ffmpeg` (bundled via `ffmpeg-static`, or set `FFMPEG_PATH`).

## API

### `POST /animate`

```jsonc
{
  "imageUrl": "https://image.lagroups.org/assets/<book>/pages/page-001.png",
  "key": "assets/<book>/anim/<pageId>.mp4",   // optional: upload to R2 & return URL
  "format": "9:16",        // "9:16" | "1:1" | "16:9"   (default 9:16)
  "durationSec": 6,         // draw duration            (default 6)
  "fps": 30,                // default 30
  "holdSec": 1,             // freeze on finished art    (default 1)
  "strokeWidth": 6,
  "stroke": "#111111",
  "background": "#ffffff"
}
```

- **With `key`** → uploads the MP4 to R2 and returns `{ success, url, bytes }`.
- **Without `key`** → streams the raw `video/mp4` bytes back (handy for local tests).

### `GET /health` → `ok`

## How the admin calls it

The admin route `POST /api/books/:bookId/pages/:pageId/animate` proxies to this
service (`MOTION_SERVICE_URL`), stores the returned URL on the page as
`animationUrl`, and the book detail shows a "Tạo animation" button per page.

## Notes / tuning

- Best on clean B&W line art (the coloring pages) — potrace thresholds at 128.
- Long/complex pages produce many paths → longer render. Lower `fps` or
  `durationSec` for speed.
- Deploy as its own container/process; scale independently of the main worker.
