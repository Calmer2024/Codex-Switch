import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import { dirname, join } from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import type {
  AppState,
  OperationResult,
  ProviderDetection,
  ProfileTag,
  PublicProfile,
  SaveProfileInput,
  TestProfileInput
} from "../shared/types";

interface StoredProfile {
  id: string;
  name: string;
  baseUrl: string;
  host: string;
  origin: string;
  iconUrl: string;
  iconCandidates: string[];
  color: string;
  known: boolean;
  apiKeyCipher: string;
  apiKeyStorage: "safeStorage" | "base64";
  apiKeyHash: string;
  apiKeyPreview: string;
  createdAt: string;
  updatedAt: string;
  lastAppliedAt?: string;
  notes?: string;
  tagIds?: string[];
  testStatus?: PublicProfile["testStatus"];
  lastTestedAt?: string;
  lastTestMessage?: string;
}

interface StoreFile {
  schemaVersion: number;
  profiles: StoredProfile[];
  tags: ProfileTag[];
  preferences: {
    envKeyName: string;
    providerName: string;
  };
}

const STORE_VERSION = 1;
const DEFAULT_ENV_KEY = "CODEX_API_KEY";
const DEFAULT_PROVIDER_NAME = "OpenAI";
const APP_USER_MODEL_ID = "dev.codex-switch.app";

function getAppIconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, "icon.ico") : join(__dirname, "../../build/icon.ico");
}

const DEFAULT_TAGS: ProfileTag[] = [
  { id: "stability-high", name: "稳定程度高", metric: "stability", level: "high", color: "#2aa84a" },
  { id: "stability-medium", name: "稳定程度中", metric: "stability", level: "medium", color: "#d99a20" },
  { id: "stability-low", name: "稳定程度低", metric: "stability", level: "low", color: "#c4362a" },
  { id: "price-high", name: "价格高", metric: "price", level: "high", color: "#c4362a" },
  { id: "price-medium", name: "价格中", metric: "price", level: "medium", color: "#d99a20" },
  { id: "price-low", name: "价格低", metric: "price", level: "low", color: "#2aa84a" },
  { id: "dilution-high", name: "掺水率高", metric: "dilution", level: "high", color: "#c4362a" },
  { id: "dilution-medium", name: "掺水率中", metric: "dilution", level: "medium", color: "#d99a20" },
  { id: "dilution-low", name: "掺水率低", metric: "dilution", level: "low", color: "#2aa84a" },
  { id: "speed-high", name: "速度高", metric: "speed", level: "high", color: "#2aa84a" },
  { id: "speed-medium", name: "速度中", metric: "speed", level: "medium", color: "#d99a20" },
  { id: "speed-low", name: "速度低", metric: "speed", level: "low", color: "#c4362a" }
];

const TAG_METRIC_ORDER: ProfileTag["metric"][] = ["stability", "price", "dilution", "speed"];

const knownProviders: Array<{
  tests: string[];
  name: string;
  color: string;
  iconDomain?: string;
}> = [
  { tests: ["api.openai.com", "openai.com"], name: "OpenAI", color: "#111827", iconDomain: "openai.com" },
  { tests: ["yundu.lat"], name: "YunDu", color: "#0f766e" },
  { tests: ["openrouter.ai"], name: "OpenRouter", color: "#5b5bd6", iconDomain: "openrouter.ai" },
  { tests: ["siliconflow.cn", "siliconflow.com"], name: "SiliconFlow", color: "#0f8a6a", iconDomain: "siliconflow.cn" },
  { tests: ["deepseek.com"], name: "DeepSeek", color: "#2563eb", iconDomain: "deepseek.com" },
  { tests: ["moonshot.cn", "kimi.moonshot.cn"], name: "Moonshot AI", color: "#7c3aed", iconDomain: "moonshot.cn" },
  { tests: ["bigmodel.cn", "zhipuai.cn"], name: "Zhipu AI", color: "#0f7490", iconDomain: "bigmodel.cn" },
  { tests: ["dashscope.aliyuncs.com", "aliyuncs.com"], name: "DashScope", color: "#c2410c", iconDomain: "aliyun.com" },
  { tests: ["volces.com", "volcengine"], name: "Volcengine", color: "#dc2626", iconDomain: "volcengine.com" },
  { tests: ["qwen", "tongyi"], name: "Tongyi Qianwen", color: "#155e75", iconDomain: "tongyi.aliyun.com" },
  { tests: ["azure.com", "openai.azure.com"], name: "Azure OpenAI", color: "#0078d4", iconDomain: "azure.microsoft.com" },
  { tests: ["openai-hk.com"], name: "OpenAI HK", color: "#166534" },
  { tests: ["one-api", "oneapi", "new-api", "newapi"], name: "One API", color: "#334155" },
  { tests: ["groq.com"], name: "Groq", color: "#d9480f", iconDomain: "groq.com" },
  { tests: ["together.ai"], name: "Together AI", color: "#7c2d12", iconDomain: "together.ai" },
  { tests: ["perplexity.ai"], name: "Perplexity", color: "#0891b2", iconDomain: "perplexity.ai" }
];

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    title: "Codex Switch",
    icon: getAppIconPath(),
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function paths() {
  const codexHome = process.env.CODEX_HOME || join(os.homedir(), ".codex");
  const userData = app.getPath("userData");
  return {
    codexHome,
    envPath: join(codexHome, ".env"),
    configPath: join(codexHome, "config.toml"),
    storagePath: join(userData, "profiles.json"),
    backupRoot: join(userData, "backups")
  };
}

async function ensureDir(pathName: string): Promise<void> {
  await fs.mkdir(pathName, { recursive: true });
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function writeTextAtomic(filePath: string, content: string): Promise<void> {
  await ensureDir(dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(): string {
  return crypto.randomUUID();
}

function hashSecret(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function previewSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "未设置";
  }
  if (trimmed.length <= 8) {
    return "••••";
  }
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

function encryptSecret(value: string): { cipher: string; storage: StoredProfile["apiKeyStorage"] } {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      cipher: safeStorage.encryptString(value).toString("base64"),
      storage: "safeStorage"
    };
  }
  return {
    cipher: Buffer.from(value, "utf8").toString("base64"),
    storage: "base64"
  };
}

function decryptSecret(profile: StoredProfile): string {
  if (profile.apiKeyStorage === "safeStorage") {
    return safeStorage.decryptString(Buffer.from(profile.apiKeyCipher, "base64"));
  }
  return Buffer.from(profile.apiKeyCipher, "base64").toString("utf8");
}

function normalizeBaseUrl(input: string): string {
  let raw = input.trim();
  if (!raw) {
    throw new Error("请输入 base_url");
  }
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  const parsed = new URL(raw);
  parsed.hash = "";
  parsed.search = "";
  const normalized = parsed.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function inferNameFromHost(host: string): string {
  const labels = host.toLowerCase().split(".").filter(Boolean);
  const ignored = new Set(["www", "api", "gateway", "proxy", "relay", "openai", "ai", "llm"]);
  const usable = labels.filter((label) => !ignored.has(label));
  const core = usable.length >= 2 ? usable[usable.length - 2] : usable[0] || labels[0] || "Custom";
  return titleCase(core || "Custom");
}

function detectProvider(baseUrl: string): ProviderDetection {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const parsed = new URL(normalizedBaseUrl);
  const host = parsed.host.toLowerCase();
  const haystack = `${host} ${normalizedBaseUrl.toLowerCase()}`;
  const known = knownProviders.find((provider) => provider.tests.some((test) => haystack.includes(test)));
  const name = known?.name ?? inferNameFromHost(host);
  const color = known?.color ?? colorFromHost(host);
  const iconDomain = known?.iconDomain || host;
  const originFavicon = `${parsed.origin}/favicon.ico`;
  const iconCandidates = Array.from(
    new Set([
      `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(`https://${iconDomain}`)}`,
      `https://icons.duckduckgo.com/ip3/${iconDomain}.ico`,
      `https://${iconDomain}/favicon.ico`,
      originFavicon,
      `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(parsed.origin)}`,
      `https://icons.duckduckgo.com/ip3/${host}.ico`
    ])
  );

  return {
    normalizedBaseUrl,
    host,
    origin: parsed.origin,
    name,
    iconUrl: iconCandidates[0],
    iconCandidates,
    color,
    known: Boolean(known)
  };
}

function colorFromHost(host: string): string {
  const digest = crypto.createHash("sha1").update(host).digest();
  const hue = digest[0] % 360;
  return `hsl(${hue} 58% 38%)`;
}

function normalizeTagIds(tagIds: unknown, allowedIds?: Set<string>): string[] {
  if (!Array.isArray(tagIds)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tagIds) {
    if (typeof raw !== "string") {
      continue;
    }
    const id = raw.trim();
    if (!id || seen.has(id) || (allowedIds && !allowedIds.has(id))) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  const byMetric = new Map<ProfileTag["metric"], string>();
  const tagById = new Map(DEFAULT_TAGS.map((tag) => [tag.id, tag]));
  for (const id of result) {
    const tag = tagById.get(id);
    if (tag) {
      byMetric.set(tag.metric, id);
    }
  }
  return TAG_METRIC_ORDER.map((metric) => byMetric.get(metric)).filter((id): id is string => Boolean(id));
}

function builtInTags(): ProfileTag[] {
  return DEFAULT_TAGS.map((tag) => ({ ...tag }));
}

async function readStore(): Promise<StoreFile> {
  const { storagePath } = paths();
  await ensureDir(dirname(storagePath));
  const raw = await readTextIfExists(storagePath);
  if (!raw.trim()) {
    return {
      schemaVersion: STORE_VERSION,
      profiles: [],
      tags: builtInTags(),
      preferences: {
        envKeyName: DEFAULT_ENV_KEY,
        providerName: DEFAULT_PROVIDER_NAME
      }
    };
  }

  const parsed = JSON.parse(raw) as Partial<StoreFile>;
  const tags = builtInTags();
  const tagIds = new Set(tags.map((tag) => tag.id));
  return {
    schemaVersion: STORE_VERSION,
    profiles: Array.isArray(parsed.profiles)
      ? parsed.profiles.map((profile) => ({
          ...profile,
          tagIds: normalizeTagIds((profile as Partial<StoredProfile>).tagIds, tagIds)
        }))
      : [],
    tags,
    preferences: {
      envKeyName: parsed.preferences?.envKeyName || DEFAULT_ENV_KEY,
      providerName: parsed.preferences?.providerName || DEFAULT_PROVIDER_NAME
    }
  };
}

async function writeStore(store: StoreFile): Promise<void> {
  const { storagePath } = paths();
  await writeTextAtomic(storagePath, `${JSON.stringify(store, null, 2)}\n`);
}

function toPublicProfile(profile: StoredProfile, currentBaseUrl?: string, currentApiHash?: string): PublicProfile {
  const isActive = Boolean(
    currentBaseUrl &&
      normalizeComparableUrl(profile.baseUrl) === normalizeComparableUrl(currentBaseUrl) &&
      (!currentApiHash || profile.apiKeyHash === currentApiHash)
  );

  return {
    id: profile.id,
    name: profile.name,
    normalizedBaseUrl: profile.baseUrl,
    baseUrl: profile.baseUrl,
    host: profile.host,
    origin: profile.origin,
    iconUrl: profile.iconUrl,
    iconCandidates: profile.iconCandidates,
    color: profile.color,
    known: profile.known,
    apiKeyPreview: profile.apiKeyPreview,
    apiKeyHash: profile.apiKeyHash,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    lastAppliedAt: profile.lastAppliedAt,
    notes: profile.notes,
    tagIds: normalizeTagIds(profile.tagIds),
    isActive,
    testStatus: profile.testStatus,
    lastTestedAt: profile.lastTestedAt,
    lastTestMessage: profile.lastTestMessage
  };
}

function normalizeComparableUrl(value?: string): string {
  if (!value) {
    return "";
  }
  try {
    return normalizeBaseUrl(value).toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, "").toLowerCase();
  }
}

function parseDotenv(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) {
      continue;
    }
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map.set(match[1], value);
  }
  return map;
}

function readPreferredApiKey(entries: Map<string, string>): { keyName?: string; value?: string } {
  for (const keyName of [DEFAULT_ENV_KEY, "OPENAI_API_KEY"]) {
    const value = entries.get(keyName);
    if (value) {
      return { keyName, value };
    }
  }
  return {};
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function upsertDotenvValue(content: string, keyName: string, value: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error("API Key 不能包含换行");
  }

  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const line = `${keyName}=${value}`;
  const lineRegex = new RegExp(`^\\s*(?:export\\s+)?${escapeRegExp(keyName)}\\s*=.*$`, "m");
  let next = lineRegex.test(content) ? content.replace(lineRegex, line) : appendLine(content, line, newline);

  if (keyName !== "OPENAI_API_KEY") {
    const openAiRegex = /^(\s*(?:export\s+)?OPENAI_API_KEY\s*=).*$/m;
    if (openAiRegex.test(next)) {
      next = next.replace(openAiRegex, `$1${value}`);
    }
  }

  return next.endsWith(newline) ? next : `${next}${newline}`;
}

function appendLine(content: string, line: string, newline: string): string {
  if (!content.trim()) {
    return `${line}${newline}`;
  }
  return content.endsWith("\n") || content.endsWith("\r\n")
    ? `${content}${line}${newline}`
    : `${content}${newline}${line}${newline}`;
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function findTomlSection(content: string, header: string): { headerEnd: number; bodyEnd: number; body: string } | null {
  const headerRegex = new RegExp(`^\\s*\\[${escapeRegExp(header)}\\]\\s*(?:#.*)?$`, "m");
  const match = headerRegex.exec(content);
  if (!match) {
    return null;
  }
  const headerEnd = match.index + match[0].length;
  const rest = content.slice(headerEnd);
  const nextHeader = /^\s*\[[^\]]+\]\s*(?:#.*)?$/m.exec(rest);
  const bodyEnd = nextHeader ? headerEnd + nextHeader.index : content.length;
  return {
    headerEnd,
    bodyEnd,
    body: content.slice(headerEnd, bodyEnd)
  };
}

function readModelProvider(content: string): string | undefined {
  const match = /^model_provider\s*=\s*["']([^"']+)["']/m.exec(content);
  return match?.[1];
}

function readBaseUrlFromConfig(content: string, providerName = DEFAULT_PROVIDER_NAME): string | undefined {
  const section = findTomlSection(content, `model_providers.${providerName}`);
  if (!section) {
    return undefined;
  }
  const match = /^\s*base_url\s*=\s*["']([^"']+)["']/m.exec(section.body);
  return match?.[1];
}

function upsertCodexConfig(content: string, baseUrl: string): string {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const escapedBaseUrl = escapeTomlString(baseUrl);
  let next = content.trim() ? content : "";

  if (/^model_provider\s*=.*$/m.test(next)) {
    next = next.replace(/^model_provider\s*=.*$/m, `model_provider = "${DEFAULT_PROVIDER_NAME}"`);
  } else {
    next = `model_provider = "${DEFAULT_PROVIDER_NAME}"${newline}${next}`;
  }

  const section = findTomlSection(next, `model_providers.${DEFAULT_PROVIDER_NAME}`);
  if (!section) {
    const suffix = next.endsWith(newline) || !next ? "" : newline;
    return `${next}${suffix}${newline}[model_providers.${DEFAULT_PROVIDER_NAME}]${newline}name = "${DEFAULT_PROVIDER_NAME}"${newline}base_url = "${escapedBaseUrl}"${newline}wire_api = "responses"${newline}`;
  }

  let body = section.body;
  if (/^\s*base_url\s*=.*$/m.test(body)) {
    body = body.replace(/^\s*base_url\s*=.*$/m, `base_url = "${escapedBaseUrl}"`);
  } else if (/^\s*name\s*=.*$/m.test(body)) {
    body = body.replace(/^(\s*name\s*=.*(?:\r?\n)?)/m, `$1base_url = "${escapedBaseUrl}"${newline}`);
  } else {
    body = `${newline}name = "${DEFAULT_PROVIDER_NAME}"${newline}base_url = "${escapedBaseUrl}"${body}`;
  }

  if (!/^\s*wire_api\s*=.*$/m.test(body)) {
    body = body.replace(/^(\s*base_url\s*=.*(?:\r?\n)?)/m, `$1wire_api = "responses"${newline}`);
  }

  return `${next.slice(0, section.headerEnd)}${body}${next.slice(section.bodyEnd)}`;
}

async function createBackup(profile: StoredProfile): Promise<string> {
  const { envPath, configPath, backupRoot } = paths();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(backupRoot, stamp);
  await ensureDir(backupDir);

  await copyIfExists(envPath, join(backupDir, ".env"));
  await copyIfExists(configPath, join(backupDir, "config.toml"));
  await fs.writeFile(
    join(backupDir, "meta.json"),
    `${JSON.stringify(
      {
        createdAt: nowIso(),
        profileId: profile.id,
        profileName: profile.name,
        baseUrl: profile.baseUrl
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return backupDir;
}

async function copyIfExists(source: string, target: string): Promise<void> {
  try {
    await fs.copyFile(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function readCurrentConfig(): Promise<{
  providerName?: string;
  baseUrl?: string;
  envKeyName?: string;
  apiKey?: string;
  apiKeyHash?: string;
  hasApiKey: boolean;
  apiKeyPreview?: string;
}> {
  const { envPath, configPath } = paths();
  const [envContent, configContent] = await Promise.all([readTextIfExists(envPath), readTextIfExists(configPath)]);
  const envEntries = parseDotenv(envContent);
  const api = readPreferredApiKey(envEntries);
  const providerName = readModelProvider(configContent) || DEFAULT_PROVIDER_NAME;
  const baseUrl = readBaseUrlFromConfig(configContent, providerName) || readBaseUrlFromConfig(configContent);
  const apiKeyHash = api.value ? hashSecret(api.value) : undefined;

  return {
    providerName,
    baseUrl,
    envKeyName: api.keyName,
    apiKey: api.value,
    apiKeyHash,
    hasApiKey: Boolean(api.value),
    apiKeyPreview: api.value ? previewSecret(api.value) : undefined
  };
}

async function getState(): Promise<AppState> {
  const store = await readStore();
  const current = await readCurrentConfig();
  const location = paths();
  const profiles = store.profiles.map((profile) => toPublicProfile(profile, current.baseUrl, current.apiKeyHash));
  const matched = profiles.find((profile) => profile.isActive);

  return {
    profiles,
    tags: store.tags,
    current: {
      codexHome: location.codexHome,
      envPath: location.envPath,
      configPath: location.configPath,
      providerName: current.providerName,
      baseUrl: current.baseUrl,
      envKeyName: current.envKeyName,
      hasApiKey: current.hasApiKey,
      apiKeyPreview: current.apiKeyPreview,
      matchedProfileId: matched?.id
    },
    storagePath: location.storagePath,
    backupRoot: location.backupRoot
  };
}

function createOrUpdateStoredProfile(input: SaveProfileInput, existing?: StoredProfile): StoredProfile {
  const detection = detectProvider(input.baseUrl);
  const timestamp = nowIso();
  const apiKey = input.apiKey?.trim();
  if (!existing && !apiKey) {
    throw new Error("请输入 API Key");
  }

  const encrypted = apiKey ? encryptSecret(apiKey) : undefined;
  const hash = apiKey ? hashSecret(apiKey) : existing?.apiKeyHash;
  const preview = apiKey ? previewSecret(apiKey) : existing?.apiKeyPreview;
  if (!hash || !preview) {
    throw new Error("API Key 无法保存");
  }

  return {
    id: existing?.id || input.id || randomId(),
    name: input.name?.trim() || existing?.name || detection.name,
    baseUrl: detection.normalizedBaseUrl,
    host: detection.host,
    origin: detection.origin,
    iconUrl: input.iconUrl?.trim() || existing?.iconUrl || detection.iconUrl,
    iconCandidates: detection.iconCandidates,
    color: input.color || existing?.color || detection.color,
    known: detection.known,
    apiKeyCipher: encrypted?.cipher || existing?.apiKeyCipher || "",
    apiKeyStorage: encrypted?.storage || existing?.apiKeyStorage || "base64",
    apiKeyHash: hash,
    apiKeyPreview: preview,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    lastAppliedAt: existing?.lastAppliedAt,
    notes: input.notes ?? existing?.notes,
    tagIds: normalizeTagIds(input.tagIds ?? existing?.tagIds),
    testStatus: existing?.testStatus || "idle",
    lastTestedAt: existing?.lastTestedAt,
    lastTestMessage: existing?.lastTestMessage
  };
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function saveProfile(input: SaveProfileInput): Promise<OperationResult> {
  try {
    const store = await readStore();
    const normalized = normalizeBaseUrl(input.baseUrl);
    const existing = input.id
      ? store.profiles.find((profile) => profile.id === input.id)
      : store.profiles.find((profile) => normalizeComparableUrl(profile.baseUrl) === normalizeComparableUrl(normalized));
    const nextProfile = createOrUpdateStoredProfile({ ...input, baseUrl: normalized }, existing);

    if (existing) {
      store.profiles = store.profiles.map((profile) => (profile.id === existing.id ? nextProfile : profile));
    } else {
      store.profiles.unshift(nextProfile);
    }

    await writeStore(store);
    return {
      ok: true,
      message: existing ? "配置已更新" : "配置已保存",
      profile: toPublicProfile(nextProfile),
      state: await getState()
    };
  } catch (error) {
    return { ok: false, message: normalizeError(error) };
  }
}

async function applyProfile(profileId: string): Promise<OperationResult> {
  try {
    const store = await readStore();
    const profile = store.profiles.find((item) => item.id === profileId);
    if (!profile) {
      throw new Error("找不到这个配置");
    }

    const apiKey = decryptSecret(profile);
    if (!apiKey) {
      throw new Error("这个配置没有可用 API Key");
    }

    const backupDir = await createBackup(profile);
    const { codexHome, envPath, configPath } = paths();
    await ensureDir(codexHome);

    const [envContent, configContent] = await Promise.all([readTextIfExists(envPath), readTextIfExists(configPath)]);
    await writeTextAtomic(envPath, upsertDotenvValue(envContent, DEFAULT_ENV_KEY, apiKey));
    await writeTextAtomic(configPath, upsertCodexConfig(configContent, profile.baseUrl));

    const timestamp = nowIso();
    store.profiles = store.profiles.map((item) =>
      item.id === profileId ? { ...item, lastAppliedAt: timestamp, updatedAt: timestamp } : item
    );
    await writeStore(store);

    return {
      ok: true,
      message: `已切换到 ${profile.name}`,
      backupDir,
      state: await getState()
    };
  } catch (error) {
    return { ok: false, message: normalizeError(error) };
  }
}

async function deleteProfile(profileId: string): Promise<OperationResult> {
  try {
    const store = await readStore();
    const before = store.profiles.length;
    store.profiles = store.profiles.filter((profile) => profile.id !== profileId);
    if (store.profiles.length === before) {
      throw new Error("找不到这个配置");
    }
    await writeStore(store);
    return {
      ok: true,
      message: "配置已删除",
      state: await getState()
    };
  } catch (error) {
    return { ok: false, message: normalizeError(error) };
  }
}

async function updateProfileTags(profileId: string, tagIds: string[]): Promise<OperationResult> {
  try {
    const store = await readStore();
    const allowedIds = new Set(store.tags.map((tag) => tag.id));
    let found = false;
    store.profiles = store.profiles.map((profile) => {
      if (profile.id !== profileId) {
        return profile;
      }
      found = true;
      return {
        ...profile,
        tagIds: normalizeTagIds(tagIds, allowedIds),
        updatedAt: nowIso()
      };
    });
    if (!found) {
      throw new Error("找不到这个配置");
    }
    await writeStore(store);
    return {
      ok: true,
      message: "配置标签已更新",
      state: await getState()
    };
  } catch (error) {
    return { ok: false, message: normalizeError(error) };
  }
}

async function importCurrentConfig(): Promise<OperationResult> {
  try {
    const current = await readCurrentConfig();
    if (!current.baseUrl || !current.apiKey) {
      throw new Error("当前 Codex 配置缺少 base_url 或 API Key");
    }
    return await saveProfile({
      baseUrl: current.baseUrl,
      apiKey: current.apiKey,
      name: detectProvider(current.baseUrl).name
    });
  } catch (error) {
    return { ok: false, message: normalizeError(error) };
  }
}

function compactEndpoint(value: string): string {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname}`;
  } catch {
    return value;
  }
}

function compactResponseText(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 140 ? `${clean.slice(0, 140)}...` : clean;
}

async function testProfile(input: TestProfileInput): Promise<OperationResult> {
  const store = await readStore();
  let baseUrl = input.baseUrl;
  let apiKey = input.apiKey;
  let profile: StoredProfile | undefined;
  let endpoint = "";

  if (input.profileId) {
    profile = store.profiles.find((item) => item.id === input.profileId);
    if (!profile) {
      return { ok: false, message: "找不到这个配置" };
    }
    baseUrl = profile.baseUrl;
    apiKey = decryptSecret(profile);
  }

  try {
    if (!baseUrl || !apiKey) {
      throw new Error("测试需要 base_url 和 API Key");
    }
    const normalized = normalizeBaseUrl(baseUrl);
    endpoint = normalized.replace(/\/$/, "").endsWith("/v1") ? `${normalized}/models` : `${normalized}/v1/models`;
    const controller = new AbortController();
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const duration = Date.now() - startedAt;

    if (!response.ok) {
      const body = compactResponseText(await response.text().catch(() => ""));
      const suffix = body ? `，响应：${body}` : "";
      throw new Error(`GET ${compactEndpoint(endpoint)} 返回 ${response.status} ${response.statusText || ""}${suffix}`.trim());
    }
    const successMessage = `GET ${compactEndpoint(endpoint)} 返回 ${response.status}，耗时 ${duration}ms`;

    if (profile) {
      profile.testStatus = "ok";
      profile.lastTestedAt = nowIso();
      profile.lastTestMessage = successMessage;
      await writeStore(store);
    }

    return {
      ok: true,
      message: successMessage,
      state: await getState()
    };
  } catch (error) {
    const rawMessage = normalizeError(error);
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `GET ${compactEndpoint(endpoint || baseUrl || "")} 超时（9 秒）`
        : rawMessage;
    if (profile) {
      profile.testStatus = "failed";
      profile.lastTestedAt = nowIso();
      profile.lastTestMessage = message;
      await writeStore(store);
    }
    return {
      ok: false,
      message,
      state: await getState()
    };
  }
}

function registerIpc(): void {
  ipcMain.handle("codex-switch:get-state", () => getState());
  ipcMain.handle("codex-switch:detect-provider", (_event, baseUrl: string) => detectProvider(baseUrl));
  ipcMain.handle("codex-switch:save-profile", (_event, input: SaveProfileInput) => saveProfile(input));
  ipcMain.handle("codex-switch:apply-profile", (_event, profileId: string) => applyProfile(profileId));
  ipcMain.handle("codex-switch:delete-profile", (_event, profileId: string) => deleteProfile(profileId));
  ipcMain.handle("codex-switch:update-profile-tags", (_event, input: { profileId: string; tagIds: string[] }) =>
    updateProfileTags(input.profileId, input.tagIds)
  );
  ipcMain.handle("codex-switch:import-current", () => importCurrentConfig());
  ipcMain.handle("codex-switch:test-profile", (_event, input: TestProfileInput) => testProfile(input));
  ipcMain.handle("codex-switch:reveal-path", async (_event, kind: "codexHome" | "storage" | "backupRoot") => {
    const location = paths();
    if (kind === "codexHome") {
      await shell.openPath(location.codexHome);
    } else if (kind === "storage") {
      shell.showItemInFolder(location.storagePath);
    } else {
      await ensureDir(location.backupRoot);
      await shell.openPath(location.backupRoot);
    }
  });
}

if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
