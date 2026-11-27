import { fetchLatestRelease, formatBytes, PLATFORM_ASSETS, recommendAsset } from "./downloads.mjs";

async function detectPlatform() {
  const ua = navigator.userAgentData;
  const fallback = navigator.platform || "";
  let platform = "";
  if (ua?.platform) {
    const value = ua.platform.toLowerCase();
    if (value.includes("win")) platform = "windows";
    else if (value.includes("mac")) platform = "macos";
    else if (value.includes("linux")) platform = "linux";
  } else if (/win/i.test(fallback)) platform = "windows";
  else if (/mac/i.test(fallback)) platform = "macos";
  else if (/linux/i.test(fallback)) platform = "linux";
  let architecture = "";
  let reportedArchitecture = ua?.architecture || "";
  if (ua?.getHighEntropyValues) {
    try {
      const hints = await ua.getHighEntropyValues(["architecture", "bitness"]);
      reportedArchitecture = hints.architecture || reportedArchitecture;
    } catch { /* Browser denied high-entropy hints; keep the recommendation manual. */ }
  }
  if (reportedArchitecture) {
    const value = reportedArchitecture.toLowerCase();
    if (value === "arm" || value === "arm64") architecture = "arm64";
    else if (value === "x86" || value === "x64") architecture = "x64";
  } else {
    const agent = navigator.userAgent;
    if (/arm64|aarch64/i.test(agent)) architecture = "arm64";
    else if (/x86_64|x64|win64|wow64/i.test(agent) || (/mac/i.test(fallback) && /Intel/i.test(agent))) architecture = "x64";
  }
  return { platform, architecture };
}

function create(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

async function renderRelease(release) {
  const state = document.querySelector("[data-download-state]");
  const grid = document.querySelector("[data-platform-assets]");
  if (!state || !grid) return;
  const { platform, architecture } = await detectPlatform();
  const recommendation = recommendAsset(release.assets, platform, architecture);
  state.replaceChildren();
  const title = create("h2", "", `HKD ${release.version}`);
  state.append(title);
  const date = Number.isFinite(Date.parse(release.publishedAt))
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeZone: "UTC" }).format(new Date(release.publishedAt))
    : "Publication date unavailable";
  state.append(create("p", "", `Published ${date} · Latest stable release from GitHub`));
  if (platform && architecture) {
    state.append(create("p", recommendation ? `Recommended for this browser: ${platform} ${architecture}.` : `No published package is available for ${platform} ${architecture}.`));
  } else {
    state.append(create("p", "Select your operating system and architecture below. This browser did not expose both reliably."));
  }
  if (release.version === "1.1.1") {
    const warning = create("div", "note-callout");
    warning.append(create("strong", "", "Known v1.1.1 tooling limitation"));
    warning.append(create("p", "", "The published v1.1.1 executable has a startup defect in its LSP/DAP commands and Doctor path detection. Fixes are on the current source branch but are not yet in a published package."));
    state.append(warning);
  }
  const releaseLink = document.querySelector("[data-release-link]");
  if (releaseLink) releaseLink.href = release.url;
  for (const [selector, url] of [["[data-checksums-link]", release.checksumsUrl], ["[data-manifest-link]", release.manifestUrl]]) {
    const link = document.querySelector(selector);
    if (link && url) { link.href = url; link.hidden = false; }
  }
  for (const target of PLATFORM_ASSETS) {
    const card = create("article", "platform-card");
    const asset = release.assets.get(target.id);
    if (asset && recommendation?.name === asset.name) card.classList.add("recommended");
    card.append(create("h3", "", `${target.platform} · ${target.architecture}`));
    if (!asset) {
      card.append(create("p", "asset-unavailable", "This release has no matching downloadable package."));
    } else {
      card.append(create("p", "", `${asset.name} · ${formatBytes(asset.sizeBytes)}`));
      const download = create("a", "button secondary", card.classList.contains("recommended") ? "Recommended download ↗" : "Download package ↗");
      download.href = asset.url;
      download.setAttribute("download", asset.name);
      card.append(download);
    }
    grid.append(card);
  }
}

async function loadRelease() {
  try {
    const release = await fetchLatestRelease();
    const version = document.querySelectorAll("[data-release-version]");
    version.forEach((node) => { node.textContent = `v${release.version}`; });
    const date = document.querySelector("[data-release-date]");
    if (date && Number.isFinite(Date.parse(release.publishedAt))) {
      date.textContent = `Published ${new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeZone: "UTC" }).format(new Date(release.publishedAt))}`;
    }
    await renderRelease(release);
  } catch (error) {
    const state = document.querySelector("[data-download-state]");
    if (state) {
      state.replaceChildren(create("p", "error-state", `Could not load release data: ${error instanceof Error ? error.message : "unexpected API response"}`));
      state.append(create("a", "text-link", "Open GitHub Releases ↗"));
      state.lastElementChild.href = "https://github.com/HassanDev-git/HKD/releases";
    }
  }
}

if (document.querySelector("[data-download-state]") || document.querySelector("[data-release-version]")) {
  void loadRelease();
}
