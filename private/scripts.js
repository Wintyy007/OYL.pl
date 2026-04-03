const yearNode = document.querySelector("#year");
const revealNodes = document.querySelectorAll(".reveal");
const navLinks = document.querySelectorAll(".site-nav a");
const latestTracksNodes = document.querySelectorAll("[data-latest-tracks]");
const trackSwitchNodes = document.querySelectorAll("[data-track-switch]");
const tracksTitleNode = document.querySelector("[data-tracks-title]");
const tracksMoreNode = document.querySelector("[data-tracks-more]");
const relativeTimeFormatter = new Intl.RelativeTimeFormat("pl-PL", { numeric: "auto" });

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getChannelUrl(container) {
  return container.getAttribute("channel") || container.dataset.channel || "";
}

function getTracksMode(container) {
  const mode = container.getAttribute("data-tracks-mode") || container.dataset.tracksMode || "latest";
  return mode === "popular" ? "popular" : "latest";
}

function getTracksMoreLink(container, mode) {
  if (mode === "popular") {
    return container.dataset.popularLink || getChannelUrl(container);
  }

  return container.dataset.latestLink || getChannelUrl(container);
}

function getPlatformLabel(channelUrl) {
  try {
    const hostname = new URL(channelUrl).hostname.toLowerCase();

    if (hostname.includes("youtube")) {
      return "YouTube";
    }

    if (hostname.includes("soundcloud")) {
      return "SoundCloud";
    }

    if (hostname.includes("instagram")) {
      return "Instagram";
    }

    if (hostname.includes("tiktok")) {
      return "TikTok";
    }
  } catch (error) {
    return "Profil";
  }

  return "Profil";
}

function getFallbackCopy(channelUrl) {
  const platformLabel = getPlatformLabel(channelUrl);

  if (platformLabel === "SoundCloud") {
    return {
      title: `Najnowsze publikacje na ${platformLabel}`,
      description: "Nie udało się pobrać listy automatycznie. SoundCloud zwykle wymaga poprawnie wystawionego RSS feedu z publicznymi utworami.",
      action: `Przejdź do ${platformLabel}`
    };
  }

  if (platformLabel === "Instagram") {
    return {
      title: `Najnowsze publikacje na ${platformLabel}`,
      description: "Nie udało się pobrać listy automatycznie. Instagram mocno ogranicza publiczne pobieranie postów bez oficjalnego API.",
      action: `Przejdź do ${platformLabel}`
    };
  }

  if (platformLabel === "TikTok") {
    return {
      title: `Najnowsze publikacje na ${platformLabel}`,
      description: "Nie udało się pobrać listy automatycznie. TikTok często zmienia dane w publicznym HTML profilu i blokuje stabilny scraping.",
      action: `Przejdź do ${platformLabel}`
    };
  }

  return {
    title: `Najnowsze publikacje na ${platformLabel}`,
    description: "Nie udało się teraz pobrać listy automatycznie. Profil i nowe publikacje znajdziesz tutaj.",
    action: `Przejdź do ${platformLabel}`
  };
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

function formatRelativePublishedTime(value) {
  if (!value || !/\d{4}-\d{2}-\d{2}T/.test(String(value))) {
    return value || "";
  }

  const publishedDate = new Date(value);

  if (Number.isNaN(publishedDate.getTime())) {
    return "";
  }

  const diffMs = publishedDate.getTime() - Date.now();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (Math.abs(diffMs) < hour) {
    return relativeTimeFormatter.format(Math.round(diffMs / minute), "minute");
  }

  if (Math.abs(diffMs) < day) {
    return relativeTimeFormatter.format(Math.round(diffMs / hour), "hour");
  }

  if (Math.abs(diffMs) < month) {
    return relativeTimeFormatter.format(Math.round(diffMs / day), "day");
  }

  if (Math.abs(diffMs) < year) {
    return relativeTimeFormatter.format(Math.round(diffMs / month), "month");
  }

  return relativeTimeFormatter.format(Math.round(diffMs / year), "year");
}

function formatDisplayDate(item) {
  if (item && item.publishedAt && /\d{4}-\d{2}-\d{2}T/.test(String(item.publishedAt))) {
    const publishedDate = new Date(item.publishedAt);

    if (!Number.isNaN(publishedDate.getTime())) {
      return new Intl.DateTimeFormat("pl-PL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }).format(publishedDate);
    }
  }

  const published = item && item.published ? String(item.published) : "";
  const relative = item ? formatRelativePublishedTime(item.publishedAt) : "";

  if (published && published !== relative) {
    return published;
  }

  return "";
}

function renderTrackCards(container, items, context) {
  const parsedLimit = Number.parseInt(container.dataset.tracksLimit || "", 10);
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : items.length;
  const sourceLabel = context.channelLabel || "Profil";
  const platformLabel = context.platformLabel || "Profil";

  container.innerHTML = items
    .slice(0, limit)
    .map(
      (item) => {
        const displayDate = formatDisplayDate(item);
        const relativeTime = formatRelativePublishedTime(item.publishedAt);

        return `
        <article class="track-card reveal is-visible">
          <a class="track-thumb" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer" aria-label="Otworz ${escapeHtml(item.title)} na ${escapeHtml(platformLabel)}">
            <img src="${escapeHtml(item.thumbnail)}" alt="Miniaturka ${escapeHtml(item.title)}">
            ${item.duration ? `<span class="track-duration">${escapeHtml(item.duration)}</span>` : ""}
            <span class="track-hover-cta">Oglądaj</span>
          </a>
          <div class="track-content">
            <div class="track-meta">
              <span class="artist-tag">${escapeHtml(sourceLabel)}</span>
              <div class="track-date-meta">
                ${displayDate ? `<span class="release-date">${escapeHtml(displayDate)}</span>` : ""}
                ${relativeTime && relativeTime !== displayDate ? `<span class="track-relative-time">${escapeHtml(relativeTime)}</span>` : ""}
              </div>
            </div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>Najnowsza publikacja z ${escapeHtml(platformLabel)}.</p>
            <a class="button button-secondary" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Otworz na ${escapeHtml(platformLabel)}</a>
          </div>
        </article>
      `;
      }
    )
    .join("");
}

function renderTrackFallback(container) {
  const channelUrl = getChannelUrl(container) || "https://www.youtube.com";
  const platformLabel = getPlatformLabel(channelUrl);
  const sourceLabel = getChannelLabel(channelUrl);
  const copy = getFallbackCopy(channelUrl);

  container.innerHTML = `
    <article class="track-card track-card-fallback reveal is-visible">
      <div class="track-content">
        <span class="artist-tag">${escapeHtml(sourceLabel)}</span>
        <h3>${escapeHtml(copy.title)}</h3>
        <p>${escapeHtml(copy.description)}</p>
        <a class="button button-secondary" href="${escapeHtml(channelUrl)}" target="_blank" rel="noreferrer">${escapeHtml(copy.action)}</a>
      </div>
    </article>
  `;
}

function clearTrackFocus() {
  const activeElement = document.activeElement;

  if (activeElement instanceof HTMLElement) {
    activeElement.blur();
  }
}

function renderTracksLoading(container, mode) {
  container.innerHTML = `
    ${Array.from({ length: 3 }, () => `
      <article class="track-card track-card-skeleton reveal is-visible" aria-hidden="true">
        <div class="track-thumb track-thumb-skeleton">
          <span class="track-duration skeleton-bar skeleton-duration"></span>
        </div>
        <div class="track-content">
          <div class="track-meta">
            <span class="skeleton-bar skeleton-tag"></span>
            <div class="track-date-meta">
              <span class="skeleton-bar skeleton-date"></span>
              <span class="skeleton-bar skeleton-date small"></span>
            </div>
          </div>
          <span class="skeleton-bar skeleton-title"></span>
          <span class="skeleton-bar skeleton-title short"></span>
          <span class="skeleton-bar skeleton-copy"></span>
          <span class="skeleton-bar skeleton-button"></span>
        </div>
      </article>
    `).join("")}
  `;
}

function updateTracksUi(container, mode) {
  if (tracksTitleNode) {
    tracksTitleNode.textContent = mode === "popular" ? "Najpopularniejsze" : "Najnowsze";
  }

  if (tracksMoreNode) {
    tracksMoreNode.href = getTracksMoreLink(container, mode);
  }

  trackSwitchNodes.forEach((button) => {
    const isActive = button.dataset.trackSwitch === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function loadTracks(container) {
  const channelUrl = getChannelUrl(container);
  const mode = getTracksMode(container);

  if (!channelUrl) {
    renderTrackFallback(container);
    return;
  }

  updateTracksUi(container, mode);
  renderTracksLoading(container, mode);

  fetch(`/api/latest-tracks?channel=${encodeURIComponent(channelUrl)}&mode=${encodeURIComponent(mode)}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to load latest tracks");
      }

      return response.json();
    })
    .then((data) => {
      if (!Array.isArray(data.items) || !data.items.length) {
        throw new Error("No tracks found");
      }

      renderTrackCards(container, data.items, {
        platformLabel: data.platformLabel || getPlatformLabel(channelUrl),
        channelLabel: data.channelLabel || getChannelLabel(channelUrl)
      });
    })
    .catch(() => {
      renderTrackFallback(container);
    });
}

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.18,
    }
  );

  revealNodes.forEach((node) => revealObserver.observe(node));
} else {
  revealNodes.forEach((node) => node.classList.add("is-visible"));
}

const currentPage = document.body.dataset.page;

navLinks.forEach((link) => {
  const href = link.getAttribute("href");

  if (!href) {
    return;
  }

  const normalizedHref = href.replace(/^\/|\/$/g, "");

  if (currentPage === normalizedHref) {
    link.classList.add("is-active");
  }
});

if (latestTracksNodes.length) {
  latestTracksNodes.forEach((container) => loadTracks(container));
}

if (trackSwitchNodes.length && latestTracksNodes.length) {
  const primaryTracksContainer = latestTracksNodes[0];

  trackSwitchNodes.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.trackSwitch === "popular" ? "popular" : "latest";
      primaryTracksContainer.dataset.tracksMode = mode;
      loadTracks(primaryTracksContainer);
    });
  });
}

window.addEventListener("pageshow", (event) => {
  clearTrackFocus();

  if (!event.persisted) {
    return;
  }

  latestTracksNodes.forEach((container) => loadTracks(container));
});

document.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const thumb = target.closest(".track-thumb");

  if (thumb instanceof HTMLElement) {
    thumb.blur();
  }
});
