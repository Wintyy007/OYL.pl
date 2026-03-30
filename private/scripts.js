const yearNode = document.querySelector("#year");
const revealNodes = document.querySelectorAll(".reveal");
const navLinks = document.querySelectorAll(".site-nav a");
const latestTracksNodes = document.querySelectorAll("[data-latest-tracks]");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function renderTrackCards(container, items) {
  const parsedLimit = Number.parseInt(container.dataset.tracksLimit || "", 10);
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : items.length;

  container.innerHTML = items
    .slice(0, limit)
    .map(
      (item) => `
        <article class="track-card reveal is-visible">
          <a class="track-thumb" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer" aria-label="Otworz ${escapeHtml(item.title)} na YouTube">
            <img src="${escapeHtml(item.thumbnail)}" alt="Miniaturka utworu ${escapeHtml(item.title)}">
          </a>
          <div class="track-content">
            <span class="artist-tag">Young Olek</span>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.published)}</p>
            <a class="button button-secondary" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Otworz na YouTube</a>
          </div>
        </article>
      `
    )
    .join("");
}

function renderTrackFallback(container) {
  container.innerHTML = `
    <article class="track-card track-card-fallback reveal is-visible">
      <div class="track-content">
        <span class="artist-tag">Young Olek</span>
        <h3>Najnowsze utwory na YouTube</h3>
        <p>Nie udalo sie teraz pobrac listy automatycznie. Kanal i nowe premiery znajdziesz tutaj.</p>
        <a class="button button-secondary" href="https://www.youtube.com/@Young_Olek" target="_blank" rel="noreferrer">Przejdz do kanalu</a>
      </div>
    </article>
  `;
}

if (latestTracksNodes.length) {
  fetch("/api/latest-tracks")
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

      latestTracksNodes.forEach((container) => renderTrackCards(container, data.items));
    })
    .catch(() => {
      latestTracksNodes.forEach((container) => renderTrackFallback(container));
    });
}
