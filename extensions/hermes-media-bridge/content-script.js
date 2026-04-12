(function () {
  const PROVIDER = detectProvider(location.hostname);
  let lastSerializedState = "";
  let mediaListenerTarget = null;

  function detectProvider(hostname) {
    const value = String(hostname || "").toLowerCase();
    if (value.includes("youtube.com") || value === "youtu.be") return "youtube";
    if (value.includes("twitch.tv")) return "twitch";
    if (value.includes("soundcloud.com")) return "soundcloud";
    return "browser";
  }

  function textFromSelectors(selectors) {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const text = node?.textContent?.trim();
      if (text) return text;
    }
    return "";
  }

  function attrFromSelector(selector, attribute) {
    const node = document.querySelector(selector);
    const value = node?.getAttribute?.(attribute)?.trim();
    return value || "";
  }

  function findPrimaryMediaElement() {
    const mediaNodes = Array.from(document.querySelectorAll("video, audio"));
    return (
      mediaNodes.find((node) => !node.paused && node.readyState > 0) ||
      mediaNodes.find((node) => node.readyState > 0) ||
      mediaNodes[0] ||
      null
    );
  }

  function getProviderMetadata() {
    if (PROVIDER === "youtube") {
      return {
        sourceAppName: "YouTube",
        title: textFromSelectors([
          "ytd-watch-metadata h1 yt-formatted-string",
          "h1.title yt-formatted-string",
          "meta[property='og:title']",
        ]) || attrFromSelector("meta[property='og:title']", "content"),
        artist:
          textFromSelectors([
            "ytd-channel-name a",
            "#owner-name a",
          ]) || attrFromSelector("meta[name='author']", "content"),
        artworkUrl: attrFromSelector("meta[property='og:image']", "content"),
      };
    }

    if (PROVIDER === "twitch") {
      return {
        sourceAppName: "Twitch",
        title: attrFromSelector("meta[property='og:title']", "content") || document.title,
        artist:
          attrFromSelector("meta[name='twitter:creator']", "content") ||
          location.pathname.split("/").filter(Boolean)[0] ||
          "",
        artworkUrl: attrFromSelector("meta[property='og:image']", "content"),
      };
    }

    if (PROVIDER === "soundcloud") {
      const title = attrFromSelector("meta[property='og:title']", "content") || document.title;
      const parts = title.split(" by ");
      return {
        sourceAppName: "SoundCloud",
        title: parts[0] || title,
        artist: parts[1] || "",
        artworkUrl: attrFromSelector("meta[property='og:image']", "content"),
      };
    }

    return {
      sourceAppName: "Browser media",
      title: document.title,
      artist: "",
      artworkUrl: "",
    };
  }

  function buildState() {
    const media = findPrimaryMediaElement();
    const metadata = getProviderMetadata();
    const positionMs = media ? Math.max(0, Math.floor((media.currentTime || 0) * 1000)) : 0;
    const durationMs =
      media && Number.isFinite(media.duration) && media.duration > 0
        ? Math.floor(media.duration * 1000)
        : 0;

    return {
      available: Boolean(media || metadata.title),
      provider: PROVIDER,
      sourceAppId: location.hostname,
      sourceAppName: metadata.sourceAppName,
      canonicalUrl: location.href,
      title: metadata.title,
      artist: metadata.artist,
      album: "",
      artworkUrl: metadata.artworkUrl,
      playbackStatus: media ? (media.paused ? "paused" : "playing") : "unknown",
      positionMs,
      durationMs,
      canPlay: Boolean(media),
      canPause: Boolean(media),
      canNext: hasNextButton(),
      canPrevious: hasPreviousButton(),
      detectedVia: "browser-extension",
    };
  }

  function hasNextButton() {
    if (PROVIDER === "youtube") {
      return Boolean(document.querySelector(".ytp-next-button"));
    }
    if (PROVIDER === "soundcloud") {
      return Boolean(document.querySelector(".skipControl__next"));
    }
    return false;
  }

  function hasPreviousButton() {
    if (PROVIDER === "youtube") {
      return Boolean(document.querySelector(".ytp-prev-button"));
    }
    if (PROVIDER === "soundcloud") {
      return Boolean(document.querySelector(".skipControl__previous"));
    }
    return false;
  }

  function clickFirst(selectors) {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node instanceof HTMLElement) {
        node.click();
        return true;
      }
    }
    return false;
  }

  function executeCommand(command) {
    const media = findPrimaryMediaElement();
    const type = command?.command || "";

    if (type === "media_toggle_playback") {
      if (!media) return false;
      if (media.paused) {
        void media.play();
      } else {
        media.pause();
      }
      return true;
    }

    if (type === "media_play") {
      if (!media) return false;
      void media.play();
      return true;
    }

    if (type === "media_pause") {
      if (!media) return false;
      media.pause();
      return true;
    }

    if (type === "media_next") {
      if (PROVIDER === "youtube") {
        return clickFirst([".ytp-next-button"]);
      }
      if (PROVIDER === "soundcloud") {
        return clickFirst([".skipControl__next"]);
      }
      return false;
    }

    if (type === "media_previous") {
      if (PROVIDER === "youtube") {
        return clickFirst([".ytp-prev-button"]);
      }
      if (PROVIDER === "soundcloud") {
        return clickFirst([".skipControl__previous"]);
      }
      return false;
    }

    if (type === "media_refresh") {
      scheduleSend(0, true);
      return true;
    }

    return false;
  }

  function postState(force = false) {
    const state = buildState();
    const serialized = JSON.stringify(state);
    if (!force && serialized === lastSerializedState) {
      return;
    }

    lastSerializedState = serialized;
    chrome.runtime.sendMessage({ type: "media-state", state }, () => void 0);
  }

  function scheduleSend(delay = 150, force = false) {
    window.setTimeout(() => postState(force), delay);
  }

  function bindMediaListeners() {
    const media = findPrimaryMediaElement();
    if (!media || media === mediaListenerTarget) {
      return;
    }

    if (mediaListenerTarget) {
      for (const eventName of [
        "play",
        "pause",
        "timeupdate",
        "seeking",
        "seeked",
        "loadedmetadata",
        "durationchange",
        "ended",
      ]) {
        mediaListenerTarget.removeEventListener(eventName, scheduleSend);
      }
    }

    mediaListenerTarget = media;
    for (const eventName of [
      "play",
      "pause",
      "timeupdate",
      "seeking",
      "seeked",
      "loadedmetadata",
      "durationchange",
      "ended",
    ]) {
      media.addEventListener(eventName, scheduleSend, { passive: true });
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "hermes-command") {
      return false;
    }

    const success = executeCommand(message.command);
    scheduleSend(0, true);
    sendResponse({ ack: success });
    return true;
  });

  const observer = new MutationObserver(() => {
    bindMediaListeners();
    scheduleSend(0, true);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  bindMediaListeners();
  scheduleSend(0, true);
  window.setInterval(() => {
    bindMediaListeners();
    postState(true);
  }, 2500);
})();
