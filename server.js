const http = require("http");
const fs = require("fs");
const https = require("https");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@Young_Olek";

const pageRoutes = new Map([
  ["/", path.join(ROOT, "public", "Index.html")],
  ["/o-nas", path.join(ROOT, "public", "o-nas", "index.html")],
  ["/o-nas/", path.join(ROOT, "public", "o-nas", "index.html")],
  ["/artysci", path.join(ROOT, "public", "artysci", "index.html")],
  ["/artysci/", path.join(ROOT, "public", "artysci", "index.html")],
  ["/utwory", path.join(ROOT, "public", "utwory", "index.html")],
  ["/utwory/", path.join(ROOT, "public", "utwory", "index.html")],
  ["/premiery", path.join(ROOT, "public", "premiery", "index.html")],
  ["/premiery/", path.join(ROOT, "public", "premiery", "index.html")],
  ["/kontakt", path.join(ROOT, "public", "kontakt", "index.html")],
  ["/kontakt/", path.join(ROOT, "public", "kontakt", "index.html")]
]);

const assetRoutes = new Map([
  ["/assets/logo.png", path.join(ROOT, "private", "logo.png")],
  ["/assets/artists/young_olek.png", path.join(ROOT, "private", "artists", "young_olek.png")],
  ["/assets/styles.css", path.join(ROOT, "private", "styles.css")],
  ["/assets/scripts.js", path.join(ROOT, "private", "scripts.js")]
]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal Server Error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(content);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache"
  });
  res.end(JSON.stringify(payload));
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8"
        }
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          resolve(fetchText(new URL(response.headers.location, url).toString()));
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Unexpected status code: ${response.statusCode}`));
          return;
        }

        let data = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => resolve(data));
      }
    );

    request.on("error", reject);
  });
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function extractChannelId(html) {
  const match = html.match(/"channelId":"(UC[^"]+)"/);
  return match ? match[1] : null;
}

function formatPublishedDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function extractTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`));
  return match ? decodeXml(match[1].trim()) : "";
}

function extractLinkHref(block) {
  const match = block.match(/<link[^>]*href="([^"]+)"/);
  return match ? decodeXml(match[1].trim()) : "";
}

function extractLatestVideosFromRss(xml) {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

  return entries.map((entry) => {
    const videoId = extractTag(entry, "yt:videoId");
    const title = extractTag(entry, "title");
    const url = extractLinkHref(entry) || `https://www.youtube.com/watch?v=${videoId}`;
    const publishedRaw = extractTag(entry, "published");

    return {
      id: videoId,
      title,
      published: formatPublishedDate(publishedRaw),
      url,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    };
  }).filter((item) => item.id && item.title);
}

async function handleLatestTracks(res) {
  try {
    const channelHtml = await fetchText(YOUTUBE_CHANNEL_URL);
    const channelId = extractChannelId(channelHtml);

    if (!channelId) {
      sendJson(res, 502, {
        items: [],
        error: "Could not resolve YouTube channel ID"
      });
      return;
    }

    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const rss = await fetchText(rssUrl);
    const items = extractLatestVideosFromRss(rss);

    if (!items.length) {
      sendJson(res, 502, {
        items: [],
        error: "Could not parse YouTube feed"
      });
      return;
    }

    sendJson(res, 200, { items });
  } catch (error) {
    sendJson(res, 502, {
      items: [],
      error: "Could not load YouTube videos"
    });
  }
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname.startsWith("/private")) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  if (pathname === "/api/latest-tracks") {
    handleLatestTracks(res);
    return;
  }

  if (assetRoutes.has(pathname)) {
    sendFile(res, assetRoutes.get(pathname));
    return;
  }

  if (pageRoutes.has(pathname)) {
    sendFile(res, pageRoutes.get(pathname));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`OYL server running on http://localhost:${PORT}`);
});
