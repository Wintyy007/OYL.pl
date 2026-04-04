const http = require("http");
const fs = require("fs");
const https = require("https");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const YOUTUBE_FEED_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=";
const SOUNDCLOUD_USER_FEED_URL = "https://feeds.soundcloud.com/users/soundcloud:users:";
const TRACKS_CACHE_TTL_MS = 5 * 60 * 1000;
const tracksCache = new Map();
const youtubeVideoMetadataCache = new Map();

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
  ["/assets/background.png", path.join(ROOT, "private", "background.png")],
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

function resolveWellKnownPath(pathname) {
  if (!pathname.startsWith("/.well-known/")) {
    return null;
  }

  const relativePath = pathname.replace(/^\/+/, "");
  const normalizedPath = path.normalize(relativePath);
  const wellKnownRoot = path.join(ROOT, ".well-known");
  const absolutePath = path.join(ROOT, normalizedPath);
  const relativeToRoot = path.relative(wellKnownRoot, absolutePath);

  if (
    relativeToRoot.startsWith("..") ||
    path.isAbsolute(relativeToRoot)
  ) {
    return null;
  }

  return absolutePath;
}

const platformConfigs = [
  {
    id: "youtube",
    label: "YouTube",
    hosts: new Set(["youtube.com", "www.youtube.com", "m.youtube.com"])
  },
  {
    id: "soundcloud",
    label: "SoundCloud",
    hosts: new Set(["soundcloud.com", "www.soundcloud.com"])
  },
  {
    id: "instagram",
    label: "Instagram",
    hosts: new Set(["instagram.com", "www.instagram.com"])
  },
  {
    id: "tiktok",
    label: "TikTok",
    hosts: new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"])
  }
];

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal Server Error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      mimeTypes[ext] ||
      (ext ? "application/octet-stream" : "text/plain; charset=utf-8");

    res.writeHead(200, {
      "Content-Type": contentType,
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

function getCacheKey(channelUrl, platformId, mode) {
  return `${platformId}:${mode}:${channelUrl}`;
}

function getCachedTracks(cacheKey) {
  const entry = tracksCache.get(cacheKey);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    tracksCache.delete(cacheKey);
    return null;
  }

  return entry;
}

function setCachedTracks(cacheKey, value) {
  tracksCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + TRACKS_CACHE_TTL_MS
  });
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

function decodeJsonString(value) {
  if (!value) {
    return "";
  }

  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch (error) {
    return value;
  }
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractJsonScriptById(html, scriptId) {
  const escapedId = scriptId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<script[^>]*id="${escapedId}"[^>]*>([\\s\\S]*?)<\\/script>`);
  const match = html.match(pattern);

  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return null;
  }
}

function extractAssignedJson(html, variableName) {
  const pattern = new RegExp(`(?:var|window\\s*\\.)\\s*${variableName}\\s*=\\s*`);
  const match = pattern.exec(html);

  if (!match || match.index === undefined) {
    return null;
  }

  let index = match.index + match[0].length;
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let escaped = false;
  let started = false;

  for (let i = index; i < html.length; i += 1) {
    const char = html[i];

    if (!started) {
      if (char === "{") {
        started = true;
        depth = 1;
        index = i;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === stringChar) {
        inString = false;
      }

      continue;
    }

    if (char === "\"" || char === "'") {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        try {
          return JSON.parse(html.slice(index, i + 1));
        } catch (error) {
          return null;
        }
      }
    }
  }

  return null;
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

function makeTrackItem(item) {
  return {
    id: item.id,
    title: item.title,
    published: item.published || formatPublishedDate(item.publishedAt),
    publishedAt: item.publishedAt,
    duration: item.duration || "",
    url: item.url,
    thumbnail: item.thumbnail || "/assets/logo.png"
  };
}

function getPlatformConfig(hostname) {
  return platformConfigs.find((platform) => platform.hosts.has(hostname)) || null;
}

function normalizeChannelUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const parsedUrl = new URL(value);
    const platform = getPlatformConfig(parsedUrl.hostname.toLowerCase());

    if (!platform || parsedUrl.protocol !== "https:") {
      return null;
    }

    parsedUrl.hash = "";
    return {
      url: parsedUrl.toString(),
      platform
    };
  } catch (error) {
    return null;
  }
}

function getChannelLabel(channelUrl) {
  try {
    const parsedUrl = new URL(channelUrl);
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1] || parsedUrl.hostname;
    return decodeURIComponent(lastSegment.replace(/^@/, "").replace(/[-_]+/g, " "));
  } catch (error) {
    return "Profil";
  }
}

function extractChannelId(html) {
  const patterns = [
    /"channelId":"(UC[^"]+)"/,
    /"externalId":"(UC[^"]+)"/,
    /https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=(UC[\w-]+)/,
    /"browseId":"(UC[\w-]+)"/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return null;
}

function extractTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`));
  return match ? decodeXml(match[1].trim()) : "";
}

function extractLinkHref(block) {
  const match = block.match(/<link[^>]*href="([^"]+)"/);
  return match ? decodeXml(match[1].trim()) : "";
}

function getYouTubeText(textData) {
  if (!textData) {
    return "";
  }

  if (typeof textData.simpleText === "string") {
    return textData.simpleText;
  }

  if (Array.isArray(textData.runs)) {
    return textData.runs.map((run) => run.text || "").join("").trim();
  }

  return "";
}

function getYouTubeThumbnail(thumbnailData) {
  const thumbnails = thumbnailData && Array.isArray(thumbnailData.thumbnails) ? thumbnailData.thumbnails : [];
  return thumbnails.length ? thumbnails[thumbnails.length - 1].url : "";
}

function getYouTubeDuration(lengthText) {
  return getYouTubeText(lengthText);
}

function collectYouTubeVideoRenderers(node, results = []) {
  if (!node || typeof node !== "object") {
    return results;
  }

  const candidates = [
    node.videoRenderer,
    node.gridVideoRenderer,
    node.richItemRenderer && node.richItemRenderer.content && node.richItemRenderer.content.videoRenderer,
    node.richGridRenderer && node.richGridRenderer.content && node.richGridRenderer.content.videoRenderer
  ];

  candidates.forEach((candidate) => {
    if (candidate && candidate.videoId) {
      results.push(candidate);
    }
  });

  Object.values(node).forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => collectYouTubeVideoRenderers(entry, results));
      return;
    }

    if (value && typeof value === "object") {
      collectYouTubeVideoRenderers(value, results);
    }
  });

  return results;
}

async function fetchYouTubeVideoMetadata(videoId) {
  const cached = youtubeVideoMetadataCache.get(videoId);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}`);
  const uploadDateMatch =
    html.match(/"uploadDate":"([^"]+)"/) ||
    html.match(/itemprop="uploadDate"\s+content="([^"]+)"/);
  const thumbnailMatch =
    html.match(/<meta property="og:image" content="([^"]+)"/) ||
    html.match(/"thumbnailUrl":\["([^"]+)"/);
  const lengthSecondsMatch = html.match(/"lengthSeconds":"(\d+)"/);
  const duration = lengthSecondsMatch
    ? Number(lengthSecondsMatch[1])
    : 0;
  const durationLabel = duration
    ? [
        Math.floor(duration / 3600),
        Math.floor((duration % 3600) / 60),
        duration % 60
      ]
        .filter((value, index) => value > 0 || index > 0)
        .map((value) => String(value).padStart(2, "0"))
        .join(":")
    : "";

  const value = {
    publishedAt: uploadDateMatch ? uploadDateMatch[1] : "",
    thumbnail: thumbnailMatch ? decodeXml(thumbnailMatch[1]) : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: durationLabel
  };

  youtubeVideoMetadataCache.set(videoId, {
    value,
    expiresAt: Date.now() + TRACKS_CACHE_TTL_MS
  });

  return value;
}

async function extractYouTubeVideosFromHtml(html) {
  const initialData = extractAssignedJson(html, "ytInitialData");
  const renderers = collectYouTubeVideoRenderers(initialData || {});
  const seen = new Set();
  const basicItems = renderers
    .map((renderer) => {
      const videoId = renderer.videoId;

      if (!videoId || seen.has(videoId)) {
        return null;
      }

      seen.add(videoId);

      return {
        id: videoId,
        title: getYouTubeText(renderer.title),
        published: getYouTubeText(renderer.publishedTimeText) || "Popularne na kanale",
        publishedAt: "",
        duration: getYouTubeDuration(renderer.lengthText),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: getYouTubeThumbnail(renderer.thumbnail) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      };
    })
    .filter((item) => item && item.id && item.title);

  const enrichedItems = await Promise.all(
    basicItems.map(async (item, index) => {
      if (index > 5) {
        return item;
      }

      try {
        const metadata = await fetchYouTubeVideoMetadata(item.id);
        return {
          ...item,
          publishedAt: metadata.publishedAt || item.publishedAt,
          published: metadata.publishedAt ? formatPublishedDate(metadata.publishedAt) : item.published,
          thumbnail: metadata.thumbnail || item.thumbnail,
          duration: metadata.duration || item.duration
        };
      } catch (error) {
        return item;
      }
    })
  );

  return enrichedItems;
}

async function fetchLatestYouTubeTracks(channelUrl, mode = "latest") {
  if (mode === "popular") {
    const popularUrl = channelUrl.endsWith("/")
      ? `${channelUrl}videos?view=0&sort=p&flow=grid`
      : `${channelUrl}/videos?view=0&sort=p&flow=grid`;
    const html = await fetchText(popularUrl);
    const items = await extractYouTubeVideosFromHtml(html);

    if (!items.length) {
      throw new Error("Could not parse YouTube popular videos");
    }

    return items;
  }

  const channelHtml = await fetchText(channelUrl);
  const channelId = extractChannelId(channelHtml);

  if (!channelId) {
    throw new Error("Could not resolve YouTube channel ID");
  }

  const rss = await fetchText(`${YOUTUBE_FEED_URL}${channelId}`);
  const entries = rss.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  const items = entries
    .map((entry) => {
      const videoId = extractTag(entry, "yt:videoId");
      const title = extractTag(entry, "title");
      const url = extractLinkHref(entry) || `https://www.youtube.com/watch?v=${videoId}`;
      const publishedAt = extractTag(entry, "published");

      return makeTrackItem({
        id: videoId,
        title,
        publishedAt,
        duration: "",
        url,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      });
    })
    .filter((item) => item.id && item.title);

  if (!items.length) {
    throw new Error("Could not parse YouTube feed");
  }

  const enrichedItems = await Promise.all(
    items.map(async (item, index) => {
      if (index > 5) {
        return item;
      }

      try {
        const metadata = await fetchYouTubeVideoMetadata(item.id);
        return {
          ...item,
          publishedAt: metadata.publishedAt || item.publishedAt,
          published: metadata.publishedAt ? formatPublishedDate(metadata.publishedAt) : item.published,
          thumbnail: metadata.thumbnail || item.thumbnail,
          duration: metadata.duration || item.duration
        };
      } catch (error) {
        return item;
      }
    })
  );

  return enrichedItems;
}

function extractSoundCloudHydration(html) {
  const marker = "window.__sc_hydration = ";
  const start = html.indexOf(marker);

  if (start === -1) {
    return [];
  }

  const jsonStart = start + marker.length;
  const jsonEnd = html.indexOf(";</script>", jsonStart);

  if (jsonEnd === -1) {
    return [];
  }

  try {
    return JSON.parse(html.slice(jsonStart, jsonEnd));
  } catch (error) {
    return [];
  }
}

function extractSoundCloudUserId(html) {
  const hydration = extractSoundCloudHydration(html);

  for (const entry of hydration) {
    const user = entry && entry.hydratable === "user" ? entry.data : null;

    if (user && user.id) {
      return String(user.id);
    }
  }

  const patterns = [
    /soundcloud:\/\/users:(\d+)/,
    /"urn":"soundcloud:users:(\d+)"/,
    /"id":(\d+),"kind":"user"/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return null;
}

function extractSoundCloudRssItems(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  return items
    .map((item) => {
      const guid = extractTag(item, "guid");
      const title = extractTag(item, "title");
      const link = extractTag(item, "link");
      const publishedAt = extractTag(item, "pubDate");
      const description = extractTag(item, "description");
      const thumbnailMatch = item.match(/<media:thumbnail[^>]*url="([^"]+)"/);
      const thumbnail = thumbnailMatch ? decodeXml(thumbnailMatch[1]) : "/assets/logo.png";

      return makeTrackItem({
        id: guid || link,
        title: stripHtml(title || description) || "SoundCloud track",
        publishedAt,
        url: link,
        thumbnail
      });
    })
    .filter((item) => item.id && item.title && item.url);
}

async function fetchLatestSoundCloudTracks(channelUrl) {
  const html = await fetchText(channelUrl);
  const userId = extractSoundCloudUserId(html);

  if (!userId) {
    throw new Error("Could not resolve SoundCloud user ID");
  }

  const rss = await fetchText(`${SOUNDCLOUD_USER_FEED_URL}${userId}/sounds.rss`);
  const items = extractSoundCloudRssItems(rss);

  if (!items.length) {
    throw new Error("Could not parse SoundCloud profile");
  }

  return items;
}

function extractInstagramItems(html, channelUrl) {
  const shortcodeMatches = [...html.matchAll(/"shortcode":"([^"]+)"/g)];
  const items = [];
  const seen = new Set();

  shortcodeMatches.forEach((match) => {
    const shortcode = match[1];

    if (seen.has(shortcode)) {
      return;
    }

    seen.add(shortcode);
    const snippet = html.slice(match.index, Math.min(html.length, match.index + 5000));
    const timestamp = snippet.match(/"taken_at_timestamp":(\d+)/);
    const displayUrl = snippet.match(/"display_url":"([^"]+)"/);
    const caption =
      snippet.match(/"accessibility_caption":"([^"]+)"/) ||
      snippet.match(/"text":"([^"]+)"/);
    const productType = snippet.match(/"product_type":"([^"]+)"/);
    const pathType = productType && productType[1] === "clips" ? "reel" : "p";
    const publishedAt = timestamp ? new Date(Number(timestamp[1]) * 1000).toISOString() : "";
    const title = stripHtml(decodeJsonString(caption ? caption[1] : "")) || `Instagram ${pathType === "reel" ? "reel" : "post"}`;

    items.push(makeTrackItem({
      id: shortcode,
      title,
      publishedAt,
      url: new URL(`/${pathType}/${shortcode}/`, channelUrl).toString(),
      thumbnail: displayUrl ? decodeJsonString(displayUrl[1].replace(/\\u0026/g, "&")) : "/assets/logo.png"
    }));
  });

  return items;
}

async function fetchLatestInstagramTracks(channelUrl) {
  const html = await fetchText(channelUrl);
  const items = extractInstagramItems(html, channelUrl);

  if (!items.length) {
    throw new Error("Could not parse Instagram profile");
  }

  return items;
}

function extractTikTokItemsFromUniversalData(data, channelUrl) {
  const scope = data && data.__DEFAULT_SCOPE__;
  const userDetail = scope && scope["webapp.user-detail"];
  const itemModule = scope && scope["webapp.video-detail"];
  const userModule = userDetail && userDetail.userInfo;
  const itemList = userDetail && Array.isArray(userDetail.itemList) ? userDetail.itemList : [];
  const user = userModule && userModule.user;
  const secUid = user && user.secUid;

  if (!itemList.length) {
    return [];
  }

  return itemList
    .map((item) => {
      const itemStruct = item.itemInfos || item;
      const id = String(itemStruct.id || item.id || "");
      const desc = itemStruct.text || itemStruct.desc || item.desc || "";
      const createTime = itemStruct.createTime || item.createTime;
      const cover =
        (item.video && (item.video.cover || item.video.originCover)) ||
        (itemStruct.video && (itemStruct.video.cover || itemStruct.video.originCover)) ||
        "";
      const authorUsername = (user && user.uniqueId) || "";
      const publishedAt = createTime ? new Date(Number(createTime) * 1000).toISOString() : "";
      const title = stripHtml(desc) || "TikTok video";
      const url =
        authorUsername && id
          ? `https://www.tiktok.com/@${authorUsername}/video/${id}`
          : channelUrl;

      return makeTrackItem({
        id,
        title,
        publishedAt,
        url,
        thumbnail: cover || "/assets/logo.png"
      });
    })
    .filter((item) => item.id && item.url);
}

async function fetchLatestTikTokTracks(channelUrl) {
  const html = await fetchText(channelUrl);
  const universalData = extractJsonScriptById(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__");
  const sigiData = extractJsonScriptById(html, "SIGI_STATE");
  let items = extractTikTokItemsFromUniversalData(universalData, channelUrl);

  if (!items.length && sigiData && sigiData.ItemModule) {
    const username =
      (sigiData.UserModule &&
        Object.values(sigiData.UserModule)[0] &&
        Object.values(sigiData.UserModule)[0].uniqueId) ||
      "";

    items = Object.entries(sigiData.ItemModule)
      .map(([id, item]) => {
        const title = stripHtml(item.desc || "") || "TikTok video";
        const publishedAt = item.createTime ? new Date(Number(item.createTime) * 1000).toISOString() : "";
        const url = username ? `https://www.tiktok.com/@${username}/video/${id}` : channelUrl;

        return makeTrackItem({
          id,
          title,
          publishedAt,
          url,
          thumbnail: (item.video && (item.video.cover || item.video.originCover)) || "/assets/logo.png"
        });
      })
      .filter((item) => item.id && item.url);
  }

  if (!items.length) {
    throw new Error("Could not parse TikTok profile");
  }

  return items;
}

async function fetchLatestTracks(channelUrl, platformId, mode = "latest") {
  const cacheKey = getCacheKey(channelUrl, platformId, mode);
  const cachedEntry = getCachedTracks(cacheKey);

  if (cachedEntry) {
    return cachedEntry.value;
  }

  let items;

  switch (platformId) {
    case "youtube":
      items = await fetchLatestYouTubeTracks(channelUrl, mode);
      break;
    case "soundcloud":
      items = await fetchLatestSoundCloudTracks(channelUrl);
      break;
    case "instagram":
      items = await fetchLatestInstagramTracks(channelUrl);
      break;
    case "tiktok":
      items = await fetchLatestTikTokTracks(channelUrl);
      break;
    default:
      throw new Error("Unsupported platform");
  }

  setCachedTracks(cacheKey, items);
  return items;
}

async function handleLatestTracks(res, channelInfo, mode = "latest") {
  try {
    const items = await fetchLatestTracks(channelInfo.url, channelInfo.platform.id, mode);

    sendJson(res, 200, {
      items,
      platformLabel: channelInfo.platform.label,
      channelLabel: getChannelLabel(channelInfo.url)
    });
  } catch (error) {
    sendJson(res, 502, {
      items: [],
      error: error instanceof Error ? error.message : "Could not load profile items"
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
    const channelInfo = normalizeChannelUrl(requestUrl.searchParams.get("channel"));
    const mode = requestUrl.searchParams.get("mode") === "popular" ? "popular" : "latest";

    if (!channelInfo) {
      sendJson(res, 400, {
        items: [],
        error: "Missing or invalid channel parameter"
      });
      return;
    }

    handleLatestTracks(res, channelInfo, mode);
    return;
  }

  if (assetRoutes.has(pathname)) {
    sendFile(res, assetRoutes.get(pathname));
    return;
  }

  const wellKnownPath = resolveWellKnownPath(pathname);

  if (wellKnownPath && fs.existsSync(wellKnownPath) && fs.statSync(wellKnownPath).isFile()) {
    sendFile(res, wellKnownPath);
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
