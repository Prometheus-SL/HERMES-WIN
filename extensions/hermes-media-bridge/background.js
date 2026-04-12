const DEFAULT_SETTINGS = {
  bridgeUrl: "http://127.0.0.1:47653",
  authToken: "",
};

const sessions = new Map();
let flushTimer = null;
let acknowledgedCommandIds = [];
let bootstrapSettingsPromise = null;

async function getBootstrapSettings() {
  if (!bootstrapSettingsPromise) {
    bootstrapSettingsPromise = fetch(chrome.runtime.getURL("hermes-bootstrap.json"), {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          return DEFAULT_SETTINGS;
        }

        const payload = await response.json();
        return {
          bridgeUrl:
            typeof payload?.bridgeUrl === "string" && payload.bridgeUrl.trim()
              ? payload.bridgeUrl.trim()
              : DEFAULT_SETTINGS.bridgeUrl,
          authToken:
            typeof payload?.authToken === "string" ? payload.authToken.trim() : "",
        };
      })
      .catch(() => DEFAULT_SETTINGS);
  }

  return bootstrapSettingsPromise;
}

async function getSettings() {
  const bootstrapSettings = await getBootstrapSettings();
  return chrome.storage.sync.get(bootstrapSettings);
}

function scheduleFlush(delay = 250) {
  if (flushTimer) {
    clearTimeout(flushTimer);
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPrimarySession();
  }, delay);
}

function sortSessions(left, right) {
  const leftPlaying = left.state.playbackStatus === "playing" ? 1 : 0;
  const rightPlaying = right.state.playbackStatus === "playing" ? 1 : 0;
  if (leftPlaying !== rightPlaying) {
    return rightPlaying - leftPlaying;
  }

  const leftActive = left.active ? 1 : 0;
  const rightActive = right.active ? 1 : 0;
  if (leftActive !== rightActive) {
    return rightActive - leftActive;
  }

  return right.updatedAt - left.updatedAt;
}

function pickPrimarySession() {
  const available = Array.from(sessions.values()).filter(
    (session) => session.state && session.state.available !== false
  );

  if (available.length === 0) {
    return null;
  }

  return [...available].sort(sortSessions)[0] || null;
}

async function dispatchCommands(tabId, commands) {
  if (!tabId || !Array.isArray(commands) || commands.length === 0) {
    return;
  }

  for (const command of commands) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "hermes-command",
        command,
      });

      if (response?.ack !== false && command?.id) {
        acknowledgedCommandIds.push(command.id);
      }
    } catch (_error) {
      // Ignore tabs that are no longer available.
    }
  }
}

async function flushPrimarySession() {
  const primary = pickPrimarySession();
  if (!primary) return;

  const settings = await getSettings();
  if (!settings.authToken || !settings.bridgeUrl) {
    return;
  }

  const ackBatch = [...acknowledgedCommandIds];
  try {
    acknowledgedCommandIds = [];
    const response = await fetch(`${settings.bridgeUrl}/v1/media/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.authToken}`,
      },
      body: JSON.stringify({
        ...primary.state,
        acknowledgedCommandIds: ackBatch,
      }),
    });

    if (!response.ok) {
      acknowledgedCommandIds = [...ackBatch, ...acknowledgedCommandIds];
      return;
    }

    const payload = await response.json();
    if (payload?.pendingCommands?.length) {
      await dispatchCommands(primary.tabId, payload.pendingCommands);
    }
  } catch (_error) {
    acknowledgedCommandIds = [...ackBatch, ...acknowledgedCommandIds];
    // Hermes bridge may not be reachable yet.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void getBootstrapSettings().then((defaults) => {
    chrome.storage.sync.set({
      bridgeUrl: defaults.bridgeUrl,
      authToken: defaults.authToken,
    });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "media-state" || !sender.tab?.id) {
    return;
  }

  sessions.set(sender.tab.id, {
    tabId: sender.tab.id,
    active: Boolean(sender.tab.active),
    updatedAt: Date.now(),
    state: message.state,
  });

  scheduleFlush();
  sendResponse({ ok: true });
  return true;
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  for (const [sessionTabId, session] of sessions.entries()) {
    sessions.set(sessionTabId, {
      ...session,
      active: sessionTabId === tabId,
    });
  }
  scheduleFlush(0);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  sessions.delete(tabId);
});
