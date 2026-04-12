import { app, shell } from "electron";
import { execFileSync, spawn } from "child_process";
import path from "path";

const fs = require("fs");

type SupportedBrowserKind = "chrome" | "edge" | "brave";

type BrowserCandidate = {
  kind: SupportedBrowserKind;
  name: string;
  executablePath: string;
  extensionsUrl: string;
  source: "default" | "installed";
};

type MediaExtensionInstallerOptions = {
  projectRoot: string;
  bridgePort: number;
  bridgeToken: string;
};

type PreparedExtensionInfo = {
  extensionDir: string;
  bridgeUrl: string;
  autoConfigured: boolean;
};

type BrowserLaunchInfo = {
  opened: boolean;
  browserName: string | null;
  extensionsUrl: string | null;
  usedFallbackBrowser: boolean;
  warning: string | null;
};

function resolveExtensionTemplateDir(projectRoot: string) {
  const candidates = [
    path.join(projectRoot, "extensions", "hermes-media-bridge"),
    path.join(app.getAppPath(), "extensions", "hermes-media-bridge"),
    path.join(
      process.resourcesPath || "",
      "app.asar.unpacked",
      "extensions",
      "hermes-media-bridge"
    ),
    path.join(process.resourcesPath || "", "extensions", "hermes-media-bridge"),
  ];

  const match = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "manifest.json"))
  );

  if (!match) {
    throw new Error("Hermes Media Bridge extension files were not found.");
  }

  return match;
}

function prepareConfiguredExtension({
  projectRoot,
  bridgePort,
  bridgeToken,
}: MediaExtensionInstallerOptions): PreparedExtensionInfo {
  const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
  const templateDir = resolveExtensionTemplateDir(projectRoot);
  const targetDir = path.join(
    app.getPath("userData"),
    "prepared-extensions",
    "hermes-media-bridge"
  );

  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(templateDir, targetDir, { recursive: true, force: true });

  fs.writeFileSync(
    path.join(targetDir, "hermes-bootstrap.json"),
    JSON.stringify(
      {
        bridgeUrl,
        authToken: bridgeToken,
        generatedAt: new Date().toISOString(),
        generatedBy: "Prometeo Hermes",
      },
      null,
      2
    ),
    "utf8"
  );

  fs.writeFileSync(
    path.join(targetDir, "README-HERMES.txt"),
    [
      "Hermes Media Bridge",
      "",
      "Esta carpeta ya esta preparada por Hermes.",
      "Solo tienes que cargarla como extension descomprimida en Chrome, Edge o Brave.",
      "",
      "Pasos:",
      "1. Abre la pagina de extensiones del navegador.",
      "2. Activa Developer mode.",
      "3. Pulsa Load unpacked.",
      `4. Selecciona esta carpeta: ${targetDir}`,
      "",
      "No hace falta pegar URL ni token manualmente.",
    ].join("\n"),
    "utf8"
  );

  return {
    extensionDir: targetDir,
    bridgeUrl,
    autoConfigured: true,
  };
}

function queryRegistry(key: string, valueName?: string) {
  const args = ["query", key];
  if (valueName) {
    args.push("/v", valueName);
  } else {
    args.push("/ve");
  }

  return execFileSync("reg", args, {
    encoding: "utf8",
    windowsHide: true,
  });
}

function parseRegistryValue(output: string, valueName?: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const candidateLine = lines.find((line) =>
    valueName ? line.toLowerCase().startsWith(valueName.toLowerCase()) : /\(default\)/i.test(line)
  );

  if (!candidateLine) {
    return "";
  }

  const match = candidateLine.match(/\sREG_\w+\s+(.*)$/i);
  return match ? match[1].trim() : "";
}

function parseExecutablePath(command: string) {
  if (!command) return "";

  const quoted = command.match(/^"([^"]+\.exe)"/i);
  if (quoted?.[1]) {
    return quoted[1];
  }

  const plain = command.match(/^([A-Za-z]:\\[^"]+?\.exe)/i);
  return plain?.[1] || "";
}

function extensionsUrlFor(kind: SupportedBrowserKind) {
  if (kind === "edge") return "edge://extensions/";
  if (kind === "brave") return "brave://extensions/";
  return "chrome://extensions/";
}

function browserDisplayName(kind: SupportedBrowserKind) {
  if (kind === "edge") return "Microsoft Edge";
  if (kind === "brave") return "Brave";
  return "Google Chrome";
}

function detectBrowserKindFromProgId(progId: string): SupportedBrowserKind | null {
  const normalized = String(progId || "").toLowerCase();
  if (normalized.includes("msedge")) return "edge";
  if (normalized.includes("chrome")) return "chrome";
  if (normalized.includes("brave")) return "brave";
  return null;
}

function defaultBrowserCandidate(): BrowserCandidate | null {
  if (process.platform !== "win32") {
    return null;
  }

  try {
    const userChoice = queryRegistry(
      "HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice",
      "ProgId"
    );
    const progId = parseRegistryValue(userChoice, "ProgId");
    const kind = detectBrowserKindFromProgId(progId);
    if (!kind) {
      return null;
    }

    const commandOutput = queryRegistry(`HKCR\\${progId}\\shell\\open\\command`);
    const executablePath = parseExecutablePath(parseRegistryValue(commandOutput));
    if (!executablePath || !fs.existsSync(executablePath)) {
      return null;
    }

    return {
      kind,
      name: browserDisplayName(kind),
      executablePath,
      extensionsUrl: extensionsUrlFor(kind),
      source: "default",
    };
  } catch (_error) {
    return null;
  }
}

function installedBrowserCandidates() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
  const programFilesX86 =
    process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";

  const candidates: Array<Omit<BrowserCandidate, "source">> = [
    {
      kind: "chrome",
      name: browserDisplayName("chrome"),
      executablePath: path.join(
        localAppData,
        "Google",
        "Chrome",
        "Application",
        "chrome.exe"
      ),
      extensionsUrl: extensionsUrlFor("chrome"),
    },
    {
      kind: "chrome",
      name: browserDisplayName("chrome"),
      executablePath: path.join(
        programFiles,
        "Google",
        "Chrome",
        "Application",
        "chrome.exe"
      ),
      extensionsUrl: extensionsUrlFor("chrome"),
    },
    {
      kind: "chrome",
      name: browserDisplayName("chrome"),
      executablePath: path.join(
        programFilesX86,
        "Google",
        "Chrome",
        "Application",
        "chrome.exe"
      ),
      extensionsUrl: extensionsUrlFor("chrome"),
    },
    {
      kind: "edge",
      name: browserDisplayName("edge"),
      executablePath: path.join(
        programFiles,
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe"
      ),
      extensionsUrl: extensionsUrlFor("edge"),
    },
    {
      kind: "edge",
      name: browserDisplayName("edge"),
      executablePath: path.join(
        programFilesX86,
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe"
      ),
      extensionsUrl: extensionsUrlFor("edge"),
    },
    {
      kind: "brave",
      name: browserDisplayName("brave"),
      executablePath: path.join(
        localAppData,
        "BraveSoftware",
        "Brave-Browser",
        "Application",
        "brave.exe"
      ),
      extensionsUrl: extensionsUrlFor("brave"),
    },
  ];

  const unique = new Map<string, BrowserCandidate>();
  for (const candidate of candidates) {
    if (!candidate.executablePath || !fs.existsSync(candidate.executablePath)) {
      continue;
    }

    unique.set(candidate.executablePath.toLowerCase(), {
      ...candidate,
      source: "installed",
    });
  }

  return Array.from(unique.values());
}

function resolvePreferredBrowser() {
  const preferred = defaultBrowserCandidate();
  if (preferred) {
    return {
      browser: preferred,
      usedFallbackBrowser: false,
    };
  }

  const fallback = installedBrowserCandidates()[0] || null;
  return {
    browser: fallback,
    usedFallbackBrowser: Boolean(fallback),
  };
}

function openBrowserExtensionsPage(): BrowserLaunchInfo {
  const resolved = resolvePreferredBrowser();
  const browser = resolved.browser;

  if (!browser) {
    return {
      opened: false,
      browserName: null,
      extensionsUrl: null,
      usedFallbackBrowser: false,
      warning:
        "Hermes could not find Chrome, Edge, or Brave on this machine. Install one of them to use Hermes Media Bridge.",
    };
  }

  try {
    const child = spawn(browser.executablePath, ["--new-window", browser.extensionsUrl], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    return {
      opened: true,
      browserName: browser.name,
      extensionsUrl: browser.extensionsUrl,
      usedFallbackBrowser: resolved.usedFallbackBrowser,
      warning:
        browser.source === "default"
          ? null
          : `${browser.name} was opened because the default browser is not a supported Chromium browser.`,
    };
  } catch (error) {
    return {
      opened: false,
      browserName: browser.name,
      extensionsUrl: browser.extensionsUrl,
      usedFallbackBrowser: resolved.usedFallbackBrowser,
      warning: `Hermes could not open ${browser.name} automatically: ${String(error)}`,
    };
  }
}

export async function installMediaExtension(
  options: MediaExtensionInstallerOptions
) {
  const prepared = prepareConfiguredExtension(options);
  const browser = openBrowserExtensionsPage();

  return {
    ...prepared,
    browserOpened: browser.opened,
    browserName: browser.browserName,
    extensionsUrl: browser.extensionsUrl,
    usedFallbackBrowser: browser.usedFallbackBrowser,
    warning: browser.warning,
  };
}

export async function openPreparedMediaExtensionFolder(extensionDir: string) {
  const error = await shell.openPath(extensionDir);
  if (error) {
    throw new Error(`Could not open the prepared extension folder: ${error}`);
  }

  return { ok: true };
}

export async function reopenMediaExtensionBrowserPage() {
  return openBrowserExtensionsPage();
}
