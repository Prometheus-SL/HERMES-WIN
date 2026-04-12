const DEFAULT_SETTINGS = {
  bridgeUrl: "http://127.0.0.1:47653",
  authToken: "",
};

const form = document.getElementById("settings-form");
const bridgeUrlInput = document.getElementById("bridge-url");
const authTokenInput = document.getElementById("auth-token");
const statusNode = document.getElementById("status");

async function getBootstrapSettings() {
  try {
    const response = await fetch(chrome.runtime.getURL("hermes-bootstrap.json"), {
      cache: "no-store",
    });
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
  } catch (_error) {
    return DEFAULT_SETTINGS;
  }
}

async function loadSettings() {
  const bootstrapSettings = await getBootstrapSettings();
  const settings = await chrome.storage.sync.get(bootstrapSettings);
  bridgeUrlInput.value = settings.bridgeUrl || bootstrapSettings.bridgeUrl;
  authTokenInput.value = settings.authToken || "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const bootstrapSettings = await getBootstrapSettings();
  await chrome.storage.sync.set({
    bridgeUrl: bridgeUrlInput.value.trim() || bootstrapSettings.bridgeUrl,
    authToken: authTokenInput.value.trim(),
  });

  statusNode.textContent = "Settings saved.";
});

void loadSettings();
