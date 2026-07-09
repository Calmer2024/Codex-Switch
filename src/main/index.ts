import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import type { WebContents } from "electron";
import { spawn } from "node:child_process";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import type {
  AppState,
  CodexRestartResult,
  LocalUpdateInfo,
  OperationResult,
  ProviderDetection,
  ProfileUsageSummary,
  ProfileTag,
  PublicProfile,
  SaveProfileInput,
  TestProfileInput
} from "../shared/types";

type SecretStorage = "safeStorage" | "base64";

interface StoredEncryptedSecret {
  cipher: string;
  storage: SecretStorage;
}

interface StoredDashboardAuth {
  provider: "yundu" | "generic";
  origin: string;
  accessToken?: StoredEncryptedSecret;
  refreshToken?: StoredEncryptedSecret;
  connectedAt: string;
  updatedAt: string;
  lastMessage?: string;
  lastBalanceEndpoint?: string;
}

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
  apiKeyStorage: SecretStorage;
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
  usage?: ProfileUsageSummary;
  dashboardAuth?: StoredDashboardAuth;
}

interface StoreFile {
  schemaVersion: number;
  profiles: StoredProfile[];
  tags: ProfileTag[];
  preferences: {
    authKeyName: string;
    providerName: string;
    officialUsage?: ProfileUsageSummary;
    localUpdate?: LocalUpdatePreference;
  };
}

interface LocalUpdatePreference {
  installedSha512?: string;
  installedVersion?: string;
  pendingSha512?: string;
  pendingVersion?: string;
  lastCheckedAt?: string;
  lastInstallStartedAt?: string;
}

interface DevUpdateConfig {
  enabled?: boolean;
  releaseDir?: string;
  channelFile?: string;
}

interface LocalReleaseInfo {
  version: string;
  releaseDate?: string;
  sha512?: string;
  installerPath: string;
}

interface DashboardTokenSnapshot {
  accessToken: string;
  refreshToken?: string;
}

interface DashboardBalanceProbe {
  ok: boolean;
  authFailed?: boolean;
  balance?: number;
  usage?: ProfileUsageSummary;
  endpoint: string;
  message?: string;
  accessToken?: string;
  refreshToken?: string;
}

interface BackupSubject {
  id: string;
  name: string;
  baseUrl?: string;
}

interface CodexAuthFile {
  auth_mode?: string;
  OPENAI_API_KEY?: string | null;
  tokens?: unknown;
  last_refresh?: string;
  [key: string]: unknown;
}

interface ChatGptTokens {
  access_token?: string;
  account_id?: string;
}

interface CodexProcessSummary {
  processCount?: number;
  restarted?: boolean;
  message?: string;
}

const STORE_VERSION = 1;
const AUTH_API_KEY_FIELD = "OPENAI_API_KEY";
const API_KEY_AUTH_MODE = "apikey";
const CHATGPT_AUTH_MODE = "chatgpt";
const DEFAULT_PROVIDER_NAME = "OpenAI";
const APP_USER_MODEL_ID = "dev.codex-switch.app";
const OFFICIAL_PROFILE_ID = "official-codex-chatgpt";
const FORCE_EXIT_DELAY_MS = 500;
const RELAY_BALANCE_TIMEOUT_MS = 2200;
const OFFICIAL_USAGE_TIMEOUT_MS = 12000;
const DASHBOARD_AUTH_TIMEOUT_MS = 6500;
const BALANCE_RETRY_COUNT = 2;
const BALANCE_RETRY_DELAY_MS = 420;
const LOCAL_UPDATE_INITIAL_CHECK_MS = 8000;
const LOCAL_UPDATE_CHECK_INTERVAL_MS = 60000;
const USAGE_SYNC_INTERVAL_FRIENDLY_NAME = "额度同步";
const OFFICIAL_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";
const YUNDU_PROFILE_PATH = "/api/v1/user/profile";
const YUNDU_REFRESH_PATH = "/api/v1/auth/refresh";

const activeTestControllers = new Set<AbortController>();
const activeTestTimeouts = new Set<ReturnType<typeof setTimeout>>();
let forceExitTimer: ReturnType<typeof setTimeout> | undefined;
let localUpdateTimer: ReturnType<typeof setInterval> | undefined;
let localUpdateInstallInProgress = false;

function abortActiveTestRequests(): void {
  for (const timeout of activeTestTimeouts) {
    clearTimeout(timeout);
  }
  activeTestTimeouts.clear();

  for (const controller of activeTestControllers) {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  }
  activeTestControllers.clear();
}

function scheduleForceExit(): void {
  if (forceExitTimer) {
    return;
  }

  forceExitTimer = setTimeout(() => {
    app.exit(0);
  }, FORCE_EXIT_DELAY_MS);
}

function quitApp(): void {
  abortActiveTestRequests();
  app.quit();
  scheduleForceExit();
}

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
    width: 1400,
    height: 860,
    minWidth: 1280,
    minHeight: 780,
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
    authPath: join(codexHome, "auth.json"),
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function encryptSecretValue(value: string): StoredEncryptedSecret {
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

function encryptSecret(value: string): StoredEncryptedSecret {
  return encryptSecretValue(value);
}

function decryptSecretValue(secret: StoredEncryptedSecret): string {
  if (secret.storage === "safeStorage") {
    return safeStorage.decryptString(Buffer.from(secret.cipher, "base64"));
  }
  return Buffer.from(secret.cipher, "base64").toString("utf8");
}

function decryptSecret(profile: StoredProfile): string {
  return decryptSecretValue({
    cipher: profile.apiKeyCipher,
    storage: profile.apiKeyStorage
  });
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
        authKeyName: AUTH_API_KEY_FIELD,
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
      authKeyName: parsed.preferences?.authKeyName || AUTH_API_KEY_FIELD,
      providerName: parsed.preferences?.providerName || DEFAULT_PROVIDER_NAME,
      officialUsage: parsed.preferences?.officialUsage,
      localUpdate: parsed.preferences?.localUpdate
    }
  };
}

async function writeStore(store: StoreFile): Promise<void> {
  const { storagePath } = paths();
  await writeTextAtomic(storagePath, `${JSON.stringify(store, null, 2)}\n`);
}

function isYunduProfile(profile: Pick<StoredProfile, "baseUrl" | "host" | "origin">): boolean {
  const haystack = `${profile.baseUrl} ${profile.host} ${profile.origin}`.toLowerCase();
  return haystack.includes("yundu.lat");
}

function dashboardAuthStatus(profile: StoredProfile): PublicProfile["dashboardAuth"] {
  const provider = isYunduProfile(profile) ? "yundu" : "generic";
  const connected = Boolean(profile.dashboardAuth);
  return {
    supported: true,
    provider,
    connected,
    connectedAt: profile.dashboardAuth?.connectedAt,
    updatedAt: profile.dashboardAuth?.updatedAt,
    message: connected ? "已连接网页登录态" : "可连接网页登录态读取余额"
  };
}

function toPublicProfile(profile: StoredProfile, currentBaseUrl?: string, currentApiHash?: string): PublicProfile {
  const isActive = Boolean(
    currentBaseUrl &&
      currentApiHash &&
      normalizeComparableUrl(profile.baseUrl) === normalizeComparableUrl(currentBaseUrl) &&
      profile.apiKeyHash === currentApiHash
  );

  return {
    id: profile.id,
    kind: "custom",
    builtin: false,
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
    lastTestMessage: profile.lastTestMessage,
    usage: profile.usage,
    dashboardAuth: dashboardAuthStatus(profile)
  };
}

function createOfficialProfile(current: { baseUrl?: string; hasApiKey: boolean }, usage?: ProfileUsageSummary): PublicProfile {
  const now = nowIso();
  const isActive = !current.baseUrl && !current.hasApiKey;

  return {
    id: OFFICIAL_PROFILE_ID,
    kind: "official",
    builtin: true,
    name: "官方 Codex",
    normalizedBaseUrl: "codex login",
    baseUrl: "codex login",
    host: "chatgpt.com",
    origin: "https://chatgpt.com",
    iconUrl: "",
    iconCandidates: [],
    color: "#2563eb",
    known: true,
    apiKeyPreview: "ChatGPT 登录",
    apiKeyHash: "",
    createdAt: now,
    updatedAt: now,
    tagIds: [],
    isActive,
    testStatus: isActive ? "ok" : "idle",
    lastTestMessage: isActive ? "正在使用官方登录配置" : "清除中转配置后使用 ChatGPT 登录",
    usage
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCodexAuthFile(content: string): CodexAuthFile {
  if (!content.trim()) {
    return {};
  }
  const parsed = JSON.parse(content) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("auth.json 格式无效");
  }
  return parsed as CodexAuthFile;
}

function parseCodexAuthFileOrEmpty(content: string): CodexAuthFile {
  try {
    return parseCodexAuthFile(content);
  } catch {
    return {};
  }
}

function readApiKeyAuth(auth: CodexAuthFile): { authMode?: string; keyName: string; value?: string } {
  const authMode = typeof auth.auth_mode === "string" ? auth.auth_mode : undefined;
  const rawValue = auth[AUTH_API_KEY_FIELD];
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  return {
    authMode,
    keyName: AUTH_API_KEY_FIELD,
    value: authMode === API_KEY_AUTH_MODE && value ? value : undefined
  };
}

function stringifyAuthFile(auth: CodexAuthFile): string {
  return `${JSON.stringify(auth, null, 2)}\n`;
}

function upsertApiKeyAuth(content: string, apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("API Key 不能为空");
  }
  if (/[\r\n]/.test(trimmed)) {
    throw new Error("API Key 不能包含换行");
  }

  const auth = parseCodexAuthFile(content);
  return stringifyAuthFile({
    ...auth,
    auth_mode: API_KEY_AUTH_MODE,
    [AUTH_API_KEY_FIELD]: trimmed
  });
}

function switchToChatGptAuth(content: string): string {
  const auth = parseCodexAuthFileOrEmpty(content);
  return stringifyAuthFile({
    ...auth,
    auth_mode: CHATGPT_AUTH_MODE,
    [AUTH_API_KEY_FIELD]: null
  });
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function findTomlSection(content: string, header: string): { headerStart: number; headerEnd: number; bodyEnd: number; body: string } | null {
  const headerRegex = new RegExp(`^\\s*\\[${escapeRegExp(header)}\\]\\s*(?:#.*)?$`, "m");
  const match = headerRegex.exec(content);
  if (!match) {
    return null;
  }
  const headerStart = match.index;
  const headerEnd = match.index + match[0].length;
  const rest = content.slice(headerEnd);
  const nextHeader = /^\s*\[[^\]]+\]\s*(?:#.*)?$/m.exec(rest);
  const bodyEnd = nextHeader ? headerEnd + nextHeader.index : content.length;
  return {
    headerStart,
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
  next = removeTomlNamespace(next, `model_providers.${DEFAULT_PROVIDER_NAME}.auth`);

  if (/^model_provider\s*=.*$/m.test(next)) {
    next = next.replace(/^model_provider\s*=.*$/m, `model_provider = "${DEFAULT_PROVIDER_NAME}"`);
  } else {
    next = `model_provider = "${DEFAULT_PROVIDER_NAME}"${newline}${next}`;
  }

  const section = findTomlSection(next, `model_providers.${DEFAULT_PROVIDER_NAME}`);
  if (!section) {
    const suffix = next.endsWith(newline) || !next ? "" : newline;
    return `${next}${suffix}${newline}[model_providers.${DEFAULT_PROVIDER_NAME}]${newline}name = "${DEFAULT_PROVIDER_NAME}"${newline}base_url = "${escapedBaseUrl}"${newline}wire_api = "responses"${newline}requires_openai_auth = true${newline}`;
  }

  let body = section.body;
  if (/^\s*base_url\s*=.*$/m.test(body)) {
    body = body.replace(/^\s*base_url\s*=.*$/m, `base_url = "${escapedBaseUrl}"`);
  } else if (/^\s*name\s*=.*$/m.test(body)) {
    body = body.replace(/^(\s*name\s*=.*(?:\r?\n)?)/m, `$1base_url = "${escapedBaseUrl}"${newline}`);
  } else {
    body = `${newline}name = "${DEFAULT_PROVIDER_NAME}"${newline}base_url = "${escapedBaseUrl}"${body}`;
  }

  body = body.replace(/^\s*env_key\s*=.*(?:\r?\n)?/gm, "");

  if (!/^\s*wire_api\s*=.*$/m.test(body)) {
    body = body.replace(/^(\s*base_url\s*=.*(?:\r?\n)?)/m, `$1wire_api = "responses"${newline}`);
  }

  if (/^\s*requires_openai_auth\s*=.*$/m.test(body)) {
    body = body.replace(/^\s*requires_openai_auth\s*=.*$/m, "requires_openai_auth = true");
  } else {
    body = body.replace(/^(\s*wire_api\s*=.*(?:\r?\n)?)/m, `$1requires_openai_auth = true${newline}`);
  }

  return `${next.slice(0, section.headerEnd)}${body}${next.slice(section.bodyEnd)}`;
}

function removeTomlSection(content: string, header: string): string {
  const section = findTomlSection(content, header);
  if (!section) {
    return content;
  }
  return `${content.slice(0, section.headerStart)}${content.slice(section.bodyEnd)}`;
}

function removeTomlNamespace(content: string, namespace: string): string {
  const escapedNamespace = escapeRegExp(namespace);
  const sectionRegex = new RegExp(`^\\s*\\[${escapedNamespace}(?:\\.[^\\]]+)?\\]\\s*(?:#.*)?$`, "gm");
  const sections = Array.from(content.matchAll(sectionRegex));
  if (!sections.length) {
    return content;
  }

  let next = "";
  let cursor = 0;
  for (let index = 0; index < sections.length; index += 1) {
    const sectionStart = sections[index].index ?? 0;
    const headerEnd = sectionStart + sections[index][0].length;
    const nextHeader = /^\s*\[[^\]]+\]\s*(?:#.*)?$/m.exec(content.slice(headerEnd));
    const sectionEnd = nextHeader ? headerEnd + nextHeader.index : content.length;
    next += content.slice(cursor, sectionStart);
    cursor = sectionEnd;
  }

  return `${next}${content.slice(cursor)}`;
}

function removeEmptyTomlSection(content: string, header: string): string {
  const section = findTomlSection(content, header);
  if (!section || section.body.trim()) {
    return content;
  }
  return `${content.slice(0, section.headerStart)}${content.slice(section.bodyEnd)}`;
}

function compactConfigWhitespace(content: string, newline: string): string {
  const trimmed = content.replace(/(?:\r?\n){3,}/g, `${newline}${newline}`).trim();
  return trimmed ? `${trimmed}${newline}` : "";
}

function switchToOfficialCodexConfig(content: string): string {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  let next = content.replace(/^\s*model_provider\s*=.*(?:\r?\n)?/m, "");
  next = removeTomlNamespace(next, `model_providers.${DEFAULT_PROVIDER_NAME}`);
  next = removeEmptyTomlSection(next, "model_providers");
  return compactConfigWhitespace(next, newline);
}

function launchCodexLogin(): void {
  if (process.platform === "win32") {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Start-Process -FilePath 'cmd.exe' -ArgumentList '/k','codex login' -WindowStyle Normal"
      ],
      { detached: true, stdio: "ignore", windowsHide: false }
    );
    child.on("error", () => undefined);
    child.unref();
    return;
  }

  const child = spawn("codex", ["login"], { detached: true, stdio: "ignore" });
  child.on("error", () => undefined);
  child.unref();
}

async function createBackup(profile: BackupSubject): Promise<string> {
  const { authPath, configPath, backupRoot } = paths();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(backupRoot, stamp);
  await ensureDir(backupDir);

  await copyIfExists(authPath, join(backupDir, "auth.json"));
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
  authMode?: string;
  authKeyName?: string;
  apiKey?: string;
  apiKeyHash?: string;
  hasApiKey: boolean;
  apiKeyPreview?: string;
}> {
  const { authPath, configPath } = paths();
  const [authContent, configContent] = await Promise.all([readTextIfExists(authPath), readTextIfExists(configPath)]);
  const auth = parseCodexAuthFileOrEmpty(authContent);
  const api = readApiKeyAuth(auth);
  const providerName = readModelProvider(configContent) || DEFAULT_PROVIDER_NAME;
  const baseUrl = readBaseUrlFromConfig(configContent, providerName) || readBaseUrlFromConfig(configContent);
  const apiKeyHash = api.value ? hashSecret(api.value) : undefined;

  return {
    providerName,
    baseUrl,
    authMode: api.authMode,
    authKeyName: api.keyName,
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
  const customProfiles = store.profiles.map((profile) => toPublicProfile(profile, current.baseUrl, current.apiKeyHash));
  const profiles = [createOfficialProfile(current, store.preferences.officialUsage), ...customProfiles];
  const matched = profiles.find((profile) => profile.isActive);

  return {
    profiles,
    tags: store.tags,
    current: {
      codexHome: location.codexHome,
      authPath: location.authPath,
      configPath: location.configPath,
      providerName: current.providerName,
      baseUrl: current.baseUrl,
      authMode: current.authMode,
      authKeyName: current.authKeyName,
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
    lastTestMessage: existing?.lastTestMessage,
    usage: existing?.usage,
    dashboardAuth: existing?.dashboardAuth
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
    if (profileId === OFFICIAL_PROFILE_ID) {
      return await applyOfficialProfile();
    }

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
    const { codexHome, authPath, configPath } = paths();
    await ensureDir(codexHome);

    const [authContent, configContent] = await Promise.all([readTextIfExists(authPath), readTextIfExists(configPath)]);
    const beforeSignature = configSignature(authContent, configContent);
    const nextAuthContent = upsertApiKeyAuth(authContent, apiKey);
    const nextConfigContent = upsertCodexConfig(configContent, profile.baseUrl);
    await writeTextAtomic(authPath, nextAuthContent);
    await writeTextAtomic(configPath, nextConfigContent);
    const restart = await restartCodexForConfigChange(beforeSignature, configSignature(nextAuthContent, nextConfigContent));

    const timestamp = nowIso();
    store.profiles = store.profiles.map((item) =>
      item.id === profileId ? { ...item, lastAppliedAt: timestamp, updatedAt: timestamp } : item
    );
    await writeStore(store);

    return {
      ok: true,
      message: `已切换到 ${profile.name}`,
      backupDir,
      restart,
      state: await getState()
    };
  } catch (error) {
    return { ok: false, message: normalizeError(error) };
  }
}

async function applyOfficialProfile(): Promise<OperationResult> {
  try {
    const backupDir = await createBackup({
      id: OFFICIAL_PROFILE_ID,
      name: "官方 Codex",
      baseUrl: "ChatGPT 登录"
    });
    const { codexHome, authPath, configPath } = paths();
    await ensureDir(codexHome);

    const [authContent, configContent] = await Promise.all([readTextIfExists(authPath), readTextIfExists(configPath)]);
    const beforeSignature = configSignature(authContent, configContent);
    const nextAuthContent = switchToChatGptAuth(authContent);
    const nextConfigContent = switchToOfficialCodexConfig(configContent);

    await writeTextAtomic(authPath, nextAuthContent);
    if (configContent || nextConfigContent) {
      await writeTextAtomic(configPath, nextConfigContent);
    }
    const restart = await restartCodexForConfigChange(beforeSignature, configSignature(nextAuthContent, nextConfigContent));

    launchCodexLogin();

    return {
      ok: true,
      message: "已切换到官方 Codex，并打开登录窗口",
      backupDir,
      loginStarted: true,
      restart,
      profile: createOfficialProfile({ baseUrl: undefined, hasApiKey: false }),
      state: await getState()
    };
  } catch (error) {
    return { ok: false, message: normalizeError(error) };
  }
}

async function deleteProfile(profileId: string): Promise<OperationResult> {
  try {
    if (profileId === OFFICIAL_PROFILE_ID) {
      throw new Error("官方 Codex 是内置配置，不能删除");
    }

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
    if (profileId === OFFICIAL_PROFILE_ID) {
      throw new Error("官方 Codex 是内置配置，不能修改标签");
    }

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberFromUnknown(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(/[,￥¥$]/g, "").trim();
    if (!normalized) {
      return undefined;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function findValueByKeys(
  value: unknown,
  keys: string[],
  maxDepth = 4,
  seen = new Set<unknown>()
): { key: string; value: unknown } | undefined {
  if (!isRecord(value) || maxDepth < 0 || seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const [key, raw] of Object.entries(value)) {
    if (wanted.has(key.toLowerCase())) {
      return { key, value: raw };
    }
  }

  for (const raw of Object.values(value)) {
    if (isRecord(raw) || Array.isArray(raw)) {
      const found = findValueByKeys(raw, keys, maxDepth - 1, seen);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function findNumberByKeys(value: unknown, keys: string[]): { key: string; value: number } | undefined {
  const found = findValueByKeys(value, keys);
  const numberValue = numberFromUnknown(found?.value);
  return found && numberValue !== undefined ? { key: found.key, value: numberValue } : undefined;
}

function findStringByKeys(value: unknown, keys: string[]): { key: string; value: string } | undefined {
  const found = findValueByKeys(value, keys);
  const stringValue = stringFromUnknown(found?.value);
  return found && stringValue ? { key: found.key, value: stringValue } : undefined;
}

function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 10_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(value < 100 ? 2 : 1);
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: value < 100 ? 2 : 0 })}`;
}

function formatPercent(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function dashboardEndpoint(origin: string, pathName: string): string {
  return new URL(pathName, origin).toString();
}

function dashboardOrigin(profile: Pick<StoredProfile, "host" | "origin" | "baseUrl">): string {
  if (isYunduProfile(profile)) {
    try {
      const origin = new URL(profile.origin);
      if (origin.hostname.toLowerCase().startsWith("api.")) {
        origin.hostname = origin.hostname.replace(/^api\./i, "");
        return origin.origin;
      }
    } catch {
      return "https://yundu.lat";
    }
  }
  return profile.origin;
}

function unwrapYunduPayload(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }
  if ("data" in payload && (numberFromUnknown(payload.code) === 0 || isRecord(payload.data))) {
    return payload.data;
  }
  return payload;
}

function responseMessageFromPayload(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  return (
    stringFromUnknown(payload.message) ||
    stringFromUnknown(payload.msg) ||
    stringFromUnknown(payload.error) ||
    stringFromUnknown(payload.detail)
  );
}

async function fetchJsonWithTimeout(
  endpoint: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ response: Response; payload?: unknown; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      ...init,
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text().catch(() => "");
    const trimmed = text.trim();
    const looksJson = contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[");
    let payload: unknown;
    if (looksJson && trimmed) {
      try {
        payload = JSON.parse(trimmed);
      } catch {
        payload = undefined;
      }
    }
    return { response, payload, text };
  } finally {
    clearTimeout(timeout);
  }
}

function parseDashboardUsagePayload(payload: unknown, endpoint: string): ProfileUsageSummary | undefined {
  return parseRelayUsagePayload(unwrapYunduPayload(payload), endpoint) || parseRelayUsagePayload(payload, endpoint);
}

async function readYunduProfileBalance(origin: string, accessToken: string): Promise<DashboardBalanceProbe> {
  const endpoint = dashboardEndpoint(origin, YUNDU_PROFILE_PATH);
  try {
    const { response, payload, text } = await fetchJsonWithTimeout(
      endpoint,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`
        }
      },
      DASHBOARD_AUTH_TIMEOUT_MS
    );

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        authFailed: true,
        endpoint,
        message: "云渡网页登录态已过期"
      };
    }

    if (!response.ok) {
      const suffix = compactResponseText(responseMessageFromPayload(payload) || text);
      return {
        ok: false,
        endpoint,
        message: `云渡余额接口返回 HTTP ${response.status}${suffix ? `：${suffix}` : ""}`
      };
    }

    const code = isRecord(payload) ? numberFromUnknown(payload.code) : undefined;
    if (code !== undefined && code !== 0) {
      return {
        ok: false,
        authFailed: code === 401 || code === 403,
        endpoint,
        message: responseMessageFromPayload(payload) || `云渡接口返回 code ${code}`
      };
    }

    const data = unwrapYunduPayload(payload);
    const balance = findNumberByKeys(data, ["balance", "current_balance", "available_balance", "remaining_balance", "credit"]);
    if (!balance) {
      return {
        ok: false,
        endpoint,
        message: "云渡用户接口没有返回可识别的余额字段"
      };
    }

    return {
      ok: true,
      balance: balance.value,
      endpoint
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      endpoint,
      message: timedOut ? "云渡余额接口请求超时" : normalizeError(error)
    };
  }
}

async function readYunduProfileBalanceWithRetry(origin: string, accessToken: string): Promise<DashboardBalanceProbe> {
  let lastProbe: DashboardBalanceProbe | undefined;
  for (let attempt = 0; attempt < BALANCE_RETRY_COUNT; attempt += 1) {
    const probe = await readYunduProfileBalance(origin, accessToken);
    if (probe.ok || probe.authFailed) {
      return probe;
    }
    lastProbe = probe;
    await delay(BALANCE_RETRY_DELAY_MS * (attempt + 1));
  }
  return lastProbe || {
    ok: false,
    endpoint: dashboardEndpoint(origin, YUNDU_PROFILE_PATH),
    message: "云渡余额接口没有响应"
  };
}

async function refreshYunduAccessToken(origin: string, refreshToken: string): Promise<DashboardTokenSnapshot | undefined> {
  const endpoint = dashboardEndpoint(origin, YUNDU_REFRESH_PATH);
  const { response, payload, text } = await fetchJsonWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    },
    DASHBOARD_AUTH_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`云渡刷新登录态失败：HTTP ${response.status}${text ? ` ${compactResponseText(text)}` : ""}`);
  }

  const data = unwrapYunduPayload(payload);
  if (!isRecord(data)) {
    return undefined;
  }
  const accessToken = stringFromUnknown(data.access_token);
  if (!accessToken) {
    return undefined;
  }
  return {
    accessToken,
    refreshToken: stringFromUnknown(data.refresh_token) || refreshToken
  };
}

function dashboardAuthProvider(profile: StoredProfile): StoredDashboardAuth["provider"] {
  return isYunduProfile(profile) ? "yundu" : "generic";
}

function storeDashboardAuth(
  profile: StoredProfile,
  tokens: Partial<DashboardTokenSnapshot>,
  message?: string,
  lastBalanceEndpoint?: string
): void {
  const timestamp = nowIso();
  profile.dashboardAuth = {
    provider: dashboardAuthProvider(profile),
    origin: dashboardOrigin(profile),
    accessToken: tokens.accessToken
      ? encryptSecretValue(tokens.accessToken)
      : profile.dashboardAuth?.accessToken,
    refreshToken: tokens.refreshToken
      ? encryptSecretValue(tokens.refreshToken)
      : profile.dashboardAuth?.refreshToken,
    connectedAt: profile.dashboardAuth?.connectedAt || timestamp,
    updatedAt: timestamp,
    lastMessage: message,
    lastBalanceEndpoint: lastBalanceEndpoint || profile.dashboardAuth?.lastBalanceEndpoint
  };
}

async function fetchTokenDashboardUsage(profile: StoredProfile): Promise<ProfileUsageSummary | undefined> {
  if (!profile.dashboardAuth?.accessToken) {
    return undefined;
  }

  let accessToken = "";
  try {
    accessToken = decryptSecretValue(profile.dashboardAuth.accessToken);
  } catch (error) {
    return createUsageSummary("relay", "failed", "余额", "读取失败", normalizeError(error));
  }

  if (!isYunduProfile(profile)) {
    return undefined;
  }

  let probe = await readYunduProfileBalanceWithRetry(profile.dashboardAuth.origin || profile.origin, accessToken);
  if (!probe.ok && probe.authFailed && profile.dashboardAuth.refreshToken) {
    try {
      const refreshToken = decryptSecretValue(profile.dashboardAuth.refreshToken);
      const refreshed = await refreshYunduAccessToken(profile.dashboardAuth.origin || profile.origin, refreshToken);
      if (refreshed) {
        storeDashboardAuth(profile, refreshed, "网页登录态已自动刷新");
        probe = await readYunduProfileBalanceWithRetry(profile.dashboardAuth.origin || profile.origin, refreshed.accessToken);
      }
    } catch (error) {
      probe = {
        ...probe,
        message: normalizeError(error)
      };
    }
  }

  if (probe.ok && probe.balance !== undefined) {
    profile.dashboardAuth.updatedAt = nowIso();
    profile.dashboardAuth.lastMessage = `余额 ${formatMoney(probe.balance)}`;
    profile.dashboardAuth.lastBalanceEndpoint = probe.endpoint;
    return createUsageSummary("relay", "ok", "余额", formatMoney(probe.balance), "来自云渡网页登录态", probe.endpoint);
  }

  if (probe.authFailed) {
    return createUsageSummary(
      "relay",
      "unsupported",
      "余额",
      "登录过期",
      "云渡网页登录态已过期，点击“重连余额”重新登录",
      probe.endpoint
    );
  }

  return createUsageSummary("relay", "failed", "余额", "读取失败", probe.message || "云渡余额接口没有返回可识别数据", probe.endpoint);
}

function dashboardPartition(profile: StoredProfile): string {
  return isYunduProfile(profile) ? `persist:codex-switch-yundu-${profile.id}` : `persist:codex-switch-dashboard-${profile.id}`;
}

function dashboardBalanceEndpoints(profile: StoredProfile): string[] {
  const normalized = normalizeBaseUrl(profile.baseUrl);
  const serviceRoot = stripTrailingSlash(normalized.replace(/\/v1$/i, ""));
  const apiRoot = normalized.match(/\/v1$/i) ? normalized : `${serviceRoot}/v1`;
  const origin = profile.dashboardAuth?.origin || dashboardOrigin(profile);
  const originPaths = [
    YUNDU_PROFILE_PATH,
    "/api/user/self",
    "/api/token/self",
    "/api/user/token",
    "/api/user/balance",
    "/api/v1/user/balance",
    "/api/balance",
    "/api/dashboard/billing/credit_grants",
    "/user/balance",
    "/balance",
    "/dashboard/billing/credit_grants"
  ].map((pathName) => dashboardEndpoint(origin, pathName));

  return Array.from(
    new Set([
      ...(isYunduProfile(profile) ? [dashboardEndpoint(origin, YUNDU_PROFILE_PATH)] : []),
      profile.dashboardAuth?.lastBalanceEndpoint || "",
      ...originPaths,
      `${apiRoot}/dashboard/billing/credit_grants`,
      `${serviceRoot}/dashboard/billing/credit_grants`,
      `${serviceRoot}/api/token/self`,
      `${serviceRoot}/api/user/self`,
      `${serviceRoot}/api/user/token`,
      `${apiRoot}/user/balance`,
      `${serviceRoot}/api/v1/user/balance`,
      `${serviceRoot}/user/balance`,
      `${serviceRoot}/api/balance`,
      `${serviceRoot}/balance`
    ].filter(Boolean)
  ));
}

function dashboardTokenScript(): string {
  return `(() => {
    const names = [
      "auth_token",
      "access_token",
      "token",
      "jwt",
      "bearer_token",
      "refresh_token"
    ];
    const out = { accessToken: "", refreshToken: "" };
    const readString = (value) => typeof value === "string" && value.trim() ? value.trim() : "";
    const assignToken = (key, value) => {
      const clean = readString(value);
      if (!clean) return;
      if (/refresh/i.test(key)) {
        out.refreshToken ||= clean;
        return;
      }
      if (/access|auth|token|jwt|bearer/i.test(key)) {
        out.accessToken ||= clean.replace(/^Bearer\\s+/i, "");
      }
    };
    const walk = (value, depth = 0) => {
      if (!value || depth > 3 || typeof value !== "object") return;
      for (const [key, raw] of Object.entries(value)) {
        if (typeof raw === "string") {
          assignToken(key, raw);
        } else if (raw && typeof raw === "object") {
          walk(raw, depth + 1);
        }
      }
    };
    try {
      for (const name of names) {
        assignToken(name, localStorage.getItem(name));
      }
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index) || "";
        const raw = localStorage.getItem(key) || "";
        assignToken(key, raw);
        if (/token|auth|user|session/i.test(key) && /^\\s*[\\[{]/.test(raw)) {
          try {
            walk(JSON.parse(raw));
          } catch {}
        }
      }
    } catch {}
    return out;
  })()`;
}

function normalizeDashboardTokenSnapshot(value: unknown): Partial<DashboardTokenSnapshot> {
  if (!isRecord(value)) {
    return {};
  }
  const accessToken = stringFromUnknown(value.accessToken);
  const refreshToken = stringFromUnknown(value.refreshToken);
  return {
    accessToken,
    refreshToken
  };
}

function dashboardProbeScript(endpoints: string[]): string {
  return `async () => {
    const tokenInfo = (${dashboardTokenScript()});
    const endpoints = ${JSON.stringify(endpoints)};
    const probes = [];
    for (const endpoint of endpoints) {
      const headers = { Accept: "application/json" };
      if (tokenInfo.accessToken) {
        headers.Authorization = "Bearer " + tokenInfo.accessToken;
      }
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          credentials: "include",
          headers
        });
        const text = await response.text().catch(() => "");
        let payload = null;
        const trimmed = text.trim();
        if (trimmed && (/json/i.test(response.headers.get("content-type") || "") || /^[\\[{]/.test(trimmed))) {
          try {
            payload = JSON.parse(trimmed);
          } catch {}
        }
        probes.push({
          endpoint,
          status: response.status,
          ok: response.ok,
          payload,
          text: trimmed.slice(0, 240)
        });
      } catch (error) {
        probes.push({
          endpoint,
          status: 0,
          ok: false,
          payload: null,
          text: error && error.message ? error.message : String(error)
        });
      }
    }
    return { tokenInfo, probes };
  }`;
}

function parseDashboardProbeResult(raw: unknown): DashboardBalanceProbe {
  if (!isRecord(raw) || !Array.isArray(raw.probes)) {
    return {
      ok: false,
      endpoint: "",
      message: "网页登录态余额探针没有返回结果"
    };
  }

  const tokenInfo = normalizeDashboardTokenSnapshot(raw.tokenInfo);
  let authFailed = false;
  let responded = false;
  let lastMessage = "";
  let lastEndpoint = "";

  for (const item of raw.probes) {
    if (!isRecord(item)) {
      continue;
    }
    const endpoint = stringFromUnknown(item.endpoint) || "";
    const status = numberFromUnknown(item.status) || 0;
    const payload = item.payload;
    const text = stringFromUnknown(item.text);
    lastEndpoint = endpoint || lastEndpoint;
    responded = responded || status > 0;
    authFailed = authFailed || status === 401 || status === 403;
    lastMessage = status ? `HTTP ${status}${text ? `：${compactResponseText(text)}` : ""}` : text || lastMessage;

    if (!payload) {
      continue;
    }

    const usage = parseDashboardUsagePayload(payload, endpoint);
    if (usage) {
      const balance = numberFromUnknown(usage.value);
      return {
        ok: true,
        balance,
        usage,
        endpoint,
        message: usage.value,
        accessToken: tokenInfo.accessToken,
        refreshToken: tokenInfo.refreshToken
      };
    }

    const balance = findNumberByKeys(unwrapYunduPayload(payload), [
      "balance",
      "current_balance",
      "available_balance",
      "remaining_balance",
      "credit",
      "credits",
      "quota"
    ]);
    if (balance) {
      return {
        ok: true,
        balance: balance.value,
        endpoint,
        accessToken: tokenInfo.accessToken,
        refreshToken: tokenInfo.refreshToken
      };
    }
  }

  return {
    ok: false,
    authFailed,
    endpoint: lastEndpoint,
    message: responded ? lastMessage || "网页登录态未返回可识别余额" : "网页登录态余额接口无响应"
  };
}

async function probeDashboardBalanceInWebContents(webContents: WebContents, profile: StoredProfile): Promise<DashboardBalanceProbe> {
  const endpoints = dashboardBalanceEndpoints(profile);
  let lastProbe: DashboardBalanceProbe | undefined;
  for (let attempt = 0; attempt < BALANCE_RETRY_COUNT; attempt += 1) {
    const raw = await webContents.executeJavaScript(`(${dashboardProbeScript(endpoints)})()`, true);
    const probe = parseDashboardProbeResult(raw);
    if (probe.ok || probe.authFailed) {
      return probe;
    }
    lastProbe = probe;
    await delay(BALANCE_RETRY_DELAY_MS * (attempt + 1));
  }
  return lastProbe || {
    ok: false,
    endpoint: endpoints[0] || profile.origin,
    message: "网页登录态余额探针没有响应"
  };
}

async function probeDashboardBalanceWithSession(profile: StoredProfile): Promise<DashboardBalanceProbe> {
  const probeWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 700,
    autoHideMenuBar: true,
    webPreferences: {
      partition: dashboardPartition(profile),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  try {
    await probeWindow.loadURL(profile.dashboardAuth?.origin || dashboardOrigin(profile));
    return await probeDashboardBalanceInWebContents(probeWindow.webContents, profile);
  } catch (error) {
    return {
      ok: false,
      endpoint: profile.origin,
      message: normalizeError(error)
    };
  } finally {
    if (!probeWindow.isDestroyed()) {
      probeWindow.close();
    }
  }
}

async function fetchDashboardUsage(profile: StoredProfile): Promise<ProfileUsageSummary | undefined> {
  if (!profile.dashboardAuth) {
    return createUsageSummary("relay", "unsupported", "余额", "待连接", "点击“连接余额”绑定网页登录态读取余额");
  }

  const tokenUsage = await fetchTokenDashboardUsage(profile);
  if (tokenUsage?.status === "ok" || tokenUsage?.status === "unsupported") {
    return tokenUsage;
  }

  const probe = await probeDashboardBalanceWithSession(profile);
  if (probe.ok && (probe.balance !== undefined || probe.usage)) {
    const usage =
      probe.usage ||
      createUsageSummary("relay", "ok", "余额", formatMoney(probe.balance || 0), "来自网页登录态", probe.endpoint);
    storeDashboardAuth(
      profile,
      {
        accessToken: probe.accessToken,
        refreshToken: probe.refreshToken
      },
      `${usage.label} ${usage.value}`,
      probe.endpoint
    );
    return {
      ...usage,
      message: usage.message || "来自网页登录态",
      source: usage.source || probe.endpoint,
      updatedAt: nowIso()
    };
  }

  if (probe.authFailed) {
    return createUsageSummary("relay", "unsupported", "余额", "登录过期", "网页登录态已过期，点击“重连余额”重新登录", probe.endpoint);
  }

  return tokenUsage || createUsageSummary("relay", "failed", "余额", "读取失败", probe.message || "网页登录态未返回可识别余额", probe.endpoint);
}

function staleUsageFallback(previous: ProfileUsageSummary | undefined, message: string): ProfileUsageSummary | undefined {
  if (!previous || previous.status !== "ok") {
    return undefined;
  }
  return {
    ...previous,
    updatedAt: nowIso(),
    message: `${message}，已保留上次成功结果`
  };
}

function relayBalanceEndpoints(baseUrl: string): string[] {
  const normalized = normalizeBaseUrl(baseUrl);
  const serviceRoot = stripTrailingSlash(normalized.replace(/\/v1$/i, ""));
  const apiRoot = normalized.match(/\/v1$/i) ? normalized : `${serviceRoot}/v1`;
  return Array.from(
    new Set([
      `${apiRoot}/dashboard/billing/credit_grants`,
      `${serviceRoot}/dashboard/billing/credit_grants`,
      `${serviceRoot}/api/token/self`,
      `${serviceRoot}/api/user/self`,
      `${serviceRoot}/api/user/token`,
      `${apiRoot}/user/balance`,
      `${serviceRoot}/user/balance`,
      `${serviceRoot}/balance`
    ])
  );
}

function parseRelayUsagePayload(payload: unknown, source: string): ProfileUsageSummary | undefined {
  const balanceKeys = [
    "total_available",
    "total_remaining",
    "available_balance",
    "remaining_balance",
    "balance",
    "credit",
    "credits",
    "amount",
    "money"
  ];
  const quotaKeys = ["remaining_quota", "left_quota", "quota_remaining", "quota"];
  const usedKeys = ["total_used", "used_quota", "used"];
  const totalKeys = ["total_granted", "total_quota", "total"];
  const timestamp = nowIso();

  const directString = findStringByKeys(payload, balanceKeys);
  if (directString && /[$￥¥]?\d/.test(directString.value) && numberFromUnknown(directString.value) !== undefined) {
    return {
      kind: "relay",
      status: "ok",
      label: "余额",
      value: directString.value,
      updatedAt: timestamp,
      source
    };
  }

  const balance = findNumberByKeys(payload, balanceKeys);
  if (balance) {
    const key = balance.key.toLowerCase();
    const looksLikeMoney = source.includes("billing") || /balance|credit|amount|money/.test(key);
    return {
      kind: "relay",
      status: "ok",
      label: looksLikeMoney ? "余额" : "剩余额度",
      value: looksLikeMoney ? formatMoney(balance.value) : formatCompactNumber(balance.value),
      updatedAt: timestamp,
      source
    };
  }

  const quota = findNumberByKeys(payload, quotaKeys);
  const used = findNumberByKeys(payload, usedKeys);
  if (quota && used) {
    return {
      kind: "relay",
      status: "ok",
      label: "剩余额度",
      value: formatCompactNumber(Math.max(0, quota.value - used.value)),
      updatedAt: timestamp,
      source,
      message: `总量 ${formatCompactNumber(quota.value)}，已用 ${formatCompactNumber(used.value)}`
    };
  }
  if (quota) {
    return {
      kind: "relay",
      status: "ok",
      label: "剩余额度",
      value: formatCompactNumber(quota.value),
      updatedAt: timestamp,
      source
    };
  }

  const total = findNumberByKeys(payload, totalKeys);
  if (total && used) {
    return {
      kind: "relay",
      status: "ok",
      label: "剩余额度",
      value: formatCompactNumber(Math.max(0, total.value - used.value)),
      updatedAt: timestamp,
      source,
      message: `总量 ${formatCompactNumber(total.value)}，已用 ${formatCompactNumber(used.value)}`
    };
  }

  return undefined;
}

function createUsageSummary(
  kind: ProfileUsageSummary["kind"],
  status: ProfileUsageSummary["status"],
  label: string,
  value: string,
  message?: string,
  source?: string
): ProfileUsageSummary {
  return {
    kind,
    status,
    label,
    value,
    message,
    source,
    updatedAt: nowIso()
  };
}

async function fetchRelayEndpoint(
  endpoint: string,
  apiKey: string
): Promise<{ endpoint: string; responded: boolean; timedOut: boolean; payload?: unknown; message?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RELAY_BALANCE_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text().catch(() => "");
    const trimmed = text.trim();
    const looksJson = contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[");
    let payload: unknown;
    if (looksJson && trimmed) {
      try {
        payload = JSON.parse(trimmed);
      } catch {
        payload = undefined;
      }
    }

    return {
      endpoint,
      responded: true,
      timedOut: false,
      payload,
      message: response.ok ? undefined : `HTTP ${response.status}`
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      endpoint,
      responded: false,
      timedOut,
      message: timedOut ? "请求超时" : normalizeError(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRelayEndpointWithRetry(
  endpoint: string,
  apiKey: string
): Promise<{ endpoint: string; responded: boolean; timedOut: boolean; payload?: unknown; message?: string }> {
  let lastProbe: Awaited<ReturnType<typeof fetchRelayEndpoint>> | undefined;
  for (let attempt = 0; attempt < BALANCE_RETRY_COUNT; attempt += 1) {
    const probe = await fetchRelayEndpoint(endpoint, apiKey);
    if (probe.payload || (probe.responded && !probe.timedOut && probe.message?.startsWith("HTTP 4"))) {
      return probe;
    }
    lastProbe = probe;
    await delay(BALANCE_RETRY_DELAY_MS * (attempt + 1));
  }
  return lastProbe || fetchRelayEndpoint(endpoint, apiKey);
}

async function fetchRelayUsage(profile: StoredProfile): Promise<ProfileUsageSummary> {
  const dashboardUsage = await fetchDashboardUsage(profile);
  if (dashboardUsage?.status === "ok") {
    return dashboardUsage;
  }

  let apiKey = "";
  try {
    apiKey = decryptSecret(profile);
  } catch (error) {
    return createUsageSummary("relay", "failed", "余额", "读取失败", normalizeError(error));
  }
  if (!apiKey) {
    return dashboardUsage || createUsageSummary("relay", "unsupported", "余额", "无 API Key", "这个配置没有可用 API Key");
  }

  let responded = false;
  let timeoutCount = 0;
  let lastMessage = "";
  for (const endpoint of relayBalanceEndpoints(profile.baseUrl)) {
    const probe = await fetchRelayEndpointWithRetry(endpoint, apiKey);
    responded = responded || probe.responded;
    timeoutCount += probe.timedOut ? 1 : 0;
    lastMessage = probe.message || lastMessage;

    if (!probe.payload) {
      continue;
    }

    const usage = parseRelayUsagePayload(probe.payload, endpoint);
    if (usage) {
      return usage;
    }
  }

  const message = responded
    ? "中转站未提供可识别的余额接口"
    : timeoutCount
      ? "余额接口无响应，模型接口仍可单独测试"
      : lastMessage || "中转站未开放余额接口";
  if (dashboardUsage?.status === "unsupported" && profile.dashboardAuth) {
    return staleUsageFallback(profile.usage, dashboardUsage.message || message) || {
      ...dashboardUsage,
      message: `${dashboardUsage.message || "网页登录态暂不可用"}；${message}`
    };
  }
  if (dashboardUsage?.status === "failed") {
    return staleUsageFallback(profile.usage, dashboardUsage.message || message) || dashboardUsage;
  }
  return staleUsageFallback(profile.usage, message) || createUsageSummary("relay", "unsupported", "余额", "未提供接口", message);
}

function readChatGptTokens(auth: CodexAuthFile): ChatGptTokens {
  if (!isRecord(auth.tokens)) {
    return {};
  }
  return {
    access_token: stringFromUnknown(auth.tokens.access_token),
    account_id: stringFromUnknown(auth.tokens.account_id)
  };
}

function readWindowMinutes(raw: Record<string, unknown>): number | undefined {
  const seconds = numberFromUnknown(raw.limit_window_seconds ?? raw.limitWindowSeconds);
  if (seconds !== undefined) {
    return Math.round(seconds / 60);
  }
  const minutes = numberFromUnknown(raw.window_minutes ?? raw.windowMinutes ?? raw.windowDurationMins);
  return minutes !== undefined ? Math.round(minutes) : undefined;
}

function readResetAt(raw: Record<string, unknown>): string | undefined {
  const resetAt = raw.reset_at ?? raw.resetAt ?? raw.resets_at ?? raw.resetsAt;
  if (typeof resetAt === "string" && resetAt.trim()) {
    const asNumber = Number(resetAt);
    if (Number.isFinite(asNumber)) {
      return new Date(asNumber > 10_000_000_000 ? asNumber : asNumber * 1000).toISOString();
    }
    const parsed = new Date(resetAt);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  const numeric = numberFromUnknown(resetAt);
  if (numeric !== undefined) {
    return new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000).toISOString();
  }
  const resetAfterSeconds = numberFromUnknown(raw.reset_after_seconds ?? raw.resetAfterSeconds);
  return resetAfterSeconds !== undefined ? new Date(Date.now() + resetAfterSeconds * 1000).toISOString() : undefined;
}

function normalizeOfficialWindow(raw: unknown, fallbackLabel: string, fallbackId: "five-hour" | "weekly") {
  if (!isRecord(raw)) {
    return undefined;
  }

  const usedPercent = numberFromUnknown(raw.used_percent ?? raw.usedPercent);
  const remainingPercent = numberFromUnknown(raw.remaining_percent ?? raw.remainingPercent);
  const windowMinutes = readWindowMinutes(raw);
  const label =
    windowMinutes !== undefined && windowMinutes <= 360
      ? "5小时"
      : windowMinutes !== undefined && windowMinutes >= 7 * 24 * 60 - 60
        ? "1周"
        : fallbackLabel;

  return {
    id: label === "5小时" ? "five-hour" : label === "1周" ? "weekly" : fallbackId,
    label,
    usedPercent,
    remainingPercent: remainingPercent ?? (usedPercent !== undefined ? 100 - usedPercent : undefined),
    resetAt: readResetAt(raw),
    windowMinutes
  };
}

function parseOfficialUsagePayload(payload: unknown): ProfileUsageSummary | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const rateLimit = isRecord(payload.rate_limit)
    ? payload.rate_limit
    : isRecord(payload.rateLimit)
      ? payload.rateLimit
      : isRecord(payload.rate_limits)
        ? payload.rate_limits
        : undefined;
  const primary = normalizeOfficialWindow(rateLimit?.primary_window ?? rateLimit?.primaryWindow, "5小时", "five-hour");
  const secondary = normalizeOfficialWindow(rateLimit?.secondary_window ?? rateLimit?.secondaryWindow, "1周", "weekly");
  const windows = [primary, secondary].filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (windows.length) {
    return {
      kind: "official",
      status: "ok",
      label: "官方余量",
      value: windows
        .map((window) =>
          window.remainingPercent !== undefined ? `${window.label} ${formatPercent(window.remainingPercent)}` : `${window.label} 已同步`
        )
        .join(" / "),
      windows,
      updatedAt: nowIso(),
      source: OFFICIAL_USAGE_ENDPOINT
    };
  }

  const credits = isRecord(payload.credits) ? payload.credits : undefined;
  const balance = numberFromUnknown(credits?.balance);
  if (balance !== undefined) {
    return {
      kind: "official",
      status: "ok",
      label: "官方 Credits",
      value: formatCompactNumber(balance),
      updatedAt: nowIso(),
      source: OFFICIAL_USAGE_ENDPOINT
    };
  }

  return undefined;
}

async function fetchOfficialUsage(): Promise<ProfileUsageSummary> {
  const { authPath } = paths();
  const auth = parseCodexAuthFileOrEmpty(await readTextIfExists(authPath));
  const tokens = readChatGptTokens(auth);
  if (!tokens.access_token) {
    return createUsageSummary("official", "unsupported", "官方余量", "未登录", "未检测到 ChatGPT 登录 token");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${tokens.access_token}`,
    "OAI-Product-Sku": "codex"
  };
  if (tokens.account_id) {
    headers["ChatGPT-Account-Id"] = tokens.account_id;
  }

  let lastMessage = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OFFICIAL_USAGE_TIMEOUT_MS);
    try {
      const response = await fetch(OFFICIAL_USAGE_ENDPOINT, {
        method: "GET",
        headers,
        signal: controller.signal
      });
      if (!response.ok) {
        lastMessage = `官方额度接口返回 ${response.status} ${response.statusText || ""}`.trim();
        continue;
      }
      const payload = await response.json();
      return (
        parseOfficialUsagePayload(payload) ||
        createUsageSummary("official", "unsupported", "官方余量", "未返回", "官方接口未返回可识别的额度窗口", OFFICIAL_USAGE_ENDPOINT)
      );
    } catch (error) {
      lastMessage = error instanceof Error && error.name === "AbortError" ? "官方额度接口暂时无响应" : normalizeError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  return createUsageSummary("official", "unsupported", "官方余量", "暂不可用", lastMessage, OFFICIAL_USAGE_ENDPOINT);
}

async function refreshUsage(): Promise<OperationResult> {
  try {
    const store = await readStore();
    const [officialUsage, relayUsages] = await Promise.all([
      fetchOfficialUsage(),
      Promise.all(store.profiles.map((profile) => fetchRelayUsage(profile)))
    ]);

    store.preferences.officialUsage = officialUsage;
    store.profiles = store.profiles.map((profile, index) => ({
      ...profile,
      usage: relayUsages[index],
      updatedAt: profile.updatedAt
    }));
    await writeStore(store);

    const failedCount = [officialUsage, ...relayUsages].filter((usage) => usage.status === "failed").length;
    const unsupportedCount = [officialUsage, ...relayUsages].filter((usage) => usage.status === "unsupported").length;
    const details = [
      failedCount ? `${failedCount} 个失败` : "",
      unsupportedCount ? `${unsupportedCount} 个未开放余额接口` : ""
    ].filter(Boolean);
    const detail = details.length ? `，${details.join("，")}` : "";
    return {
      ok: true,
      message: `额度已同步${detail}`,
      state: await getState()
    };
  } catch (error) {
    return { ok: false, message: normalizeError(error), state: await getState().catch(() => undefined) };
  }
}

function captureDashboardAuth(profile: StoredProfile): Promise<DashboardBalanceProbe> {
  const origin = dashboardOrigin(profile);
  const loginUrl = dashboardEndpoint(origin, "/dashboard");
  const endpoint = dashboardBalanceEndpoints(profile)[0] || dashboardEndpoint(origin, YUNDU_PROFILE_PATH);

  return new Promise((resolveProbe) => {
    const loginWindow = new BrowserWindow({
      width: 1120,
      height: 760,
      minWidth: 920,
      minHeight: 640,
      title: `登录 ${profile.name} 获取余额`,
      icon: getAppIconPath(),
      autoHideMenuBar: true,
      backgroundColor: "#ffffff",
      webPreferences: {
        partition: dashboardPartition(profile),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    let finished = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const finish = (probe: DashboardBalanceProbe): void => {
      if (finished) {
        return;
      }
      finished = true;
      if (timer) {
        clearInterval(timer);
      }
      if (!loginWindow.isDestroyed()) {
        loginWindow.close();
      }
      resolveProbe(probe);
    };

    const checkForToken = async (): Promise<void> => {
      if (finished || loginWindow.isDestroyed() || loginWindow.webContents.isLoading()) {
        return;
      }

      try {
        const probe = await probeDashboardBalanceInWebContents(loginWindow.webContents, profile);
        if (probe.ok) {
          finish(probe);
          return;
        }

        if (probe.authFailed) {
          if (!loginWindow.isDestroyed()) {
            loginWindow.setTitle(`登录态已失效，请在 ${profile.name} 页面重新登录`);
          }
          return;
        }
      } catch {
        // Some login flows briefly navigate cross-origin. The next same-origin page will be polled again.
      }
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const target = new URL(url);
        if (target.origin === profile.origin) {
          void loginWindow.loadURL(url);
        } else {
          void shell.openExternal(url);
        }
      } catch {
        void shell.openExternal(url);
      }
      return { action: "deny" };
    });

    loginWindow.webContents.on("did-finish-load", () => {
      void checkForToken();
    });

    loginWindow.on("closed", () => {
      if (!finished) {
        finished = true;
        if (timer) {
          clearInterval(timer);
        }
        resolveProbe({
          ok: false,
          endpoint,
          message: "登录窗口已关闭，未绑定网页登录态"
        });
      }
    });

    timer = setInterval(() => {
      void checkForToken();
    }, 1500);

    void loginWindow.loadURL(loginUrl).catch(() => {
      void loginWindow.loadURL(origin).catch((error) => {
        finish({
          ok: false,
          endpoint,
          message: normalizeError(error)
        });
      });
    });
  });
}

async function connectDashboardAuth(profileId: string): Promise<OperationResult> {
  try {
    const store = await readStore();
    const profile = store.profiles.find((item) => item.id === profileId);
    if (!profile) {
      throw new Error("找不到这个配置");
    }
    const probe = await captureDashboardAuth(profile);
    if (!probe.ok || (probe.balance === undefined && !probe.usage)) {
      return {
        ok: false,
        message: probe.message || "未能从网页登录态读取余额",
        state: await getState()
      };
    }

    const usage =
      probe.usage ||
      createUsageSummary("relay", "ok", "余额", formatMoney(probe.balance || 0), "来自网页登录态", probe.endpoint);
    storeDashboardAuth(
      profile,
      {
        accessToken: probe.accessToken,
        refreshToken: probe.refreshToken
      },
      `${usage.label} ${usage.value}`,
      probe.endpoint
    );
    profile.usage = usage;
    await writeStore(store);

    return {
      ok: true,
      message: `已连接网页登录态，当前余额 ${usage.value}`,
      profile: toPublicProfile(profile),
      state: await getState()
    };
  } catch (error) {
    return { ok: false, message: normalizeError(error), state: await getState().catch(() => undefined) };
  }
}

function configSignature(authContent: string, configContent: string): string {
  return crypto.createHash("sha256").update(authContent).update("\0").update(configContent).digest("hex");
}

function runProcess(command: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ code: 1, stdout, stderr: normalizeError(error) });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

async function restartCodexForConfigChange(beforeSignature: string, afterSignature: string): Promise<CodexRestartResult> {
  if (beforeSignature === afterSignature) {
    return {
      needed: false,
      attempted: false,
      restarted: false,
      processCount: 0,
      message: "配置没有变化，无需重启 Codex"
    };
  }

  if (process.platform !== "win32") {
    return {
      needed: true,
      attempted: false,
      restarted: false,
      processCount: 0,
      message: "配置已变化；当前平台暂未自动重启 Codex"
    };
  }

  const script = `
$ErrorActionPreference = 'Stop'
$main = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -ieq 'Codex.exe' -and
  $_.CommandLine -notmatch '--type=' -and
  $_.ExecutablePath -match '\\\\OpenAI\\.Codex_.*\\\\app\\\\Codex\\.exe$'
})
$appServers = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -ieq 'codex.exe' -and
  $_.CommandLine -match '\\bapp-server\\b' -and
  $_.ExecutablePath -match '\\\\OpenAI\\.Codex_.*\\\\app\\\\resources\\\\codex\\.exe$'
})
if ($main.Count -eq 0) {
  @{ processCount = 0; restarted = $false; message = '未检测到运行中的 Codex 桌面端，下次启动生效' } | ConvertTo-Json -Compress
  exit 0
}
$exe = $main[0].ExecutablePath
$ids = @($main + $appServers | ForEach-Object { $_.ProcessId } | Select-Object -Unique)
foreach ($id in $ids) {
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 900
Start-Process -FilePath $exe
@{ processCount = $ids.Count; restarted = $true; message = '已自动重启 Codex 桌面端' } | ConvertTo-Json -Compress
`;

  const result = await runProcess("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], 12000);
  if (result.code !== 0) {
    return {
      needed: true,
      attempted: true,
      restarted: false,
      processCount: 0,
      message: result.stderr.trim() || "自动重启 Codex 失败"
    };
  }

  try {
    const parsed = JSON.parse(result.stdout.trim()) as CodexProcessSummary;
    return {
      needed: true,
      attempted: true,
      restarted: Boolean(parsed.restarted),
      processCount: parsed.processCount || 0,
      message: parsed.message || (parsed.restarted ? "已自动重启 Codex" : "未检测到运行中的 Codex")
    };
  } catch {
    return {
      needed: true,
      attempted: true,
      restarted: false,
      processCount: 0,
      message: "自动重启 Codex 的结果无法解析"
    };
  }
}

async function testProfile(input: TestProfileInput): Promise<OperationResult> {
  const store = await readStore();
  let baseUrl = input.baseUrl;
  let apiKey = input.apiKey;
  let profile: StoredProfile | undefined;
  let endpoint = "";
  let controller: AbortController | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  if (input.profileId) {
    if (input.profileId === OFFICIAL_PROFILE_ID) {
      return { ok: false, message: "官方 Codex 使用 ChatGPT 登录，不支持 /v1/models 接口测试" };
    }

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
    controller = new AbortController();
    activeTestControllers.add(controller);
    const startedAt = Date.now();
    timeout = setTimeout(() => controller?.abort(), 9000);
    activeTestTimeouts.add(timeout);
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal
    });
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
  } finally {
    if (timeout) {
      clearTimeout(timeout);
      activeTestTimeouts.delete(timeout);
    }
    if (controller) {
      activeTestControllers.delete(controller);
    }
  }
}

function unquoteYamlValue(value: string): string {
  const trimmed = value.replace(/\s+#.*$/, "").trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readYamlValue(content: string, key: string): string | undefined {
  const match = new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, "im").exec(content);
  return match ? unquoteYamlValue(match[1]) : undefined;
}

function parseLatestYml(content: string): Omit<LocalReleaseInfo, "installerPath"> | undefined {
  const version = readYamlValue(content, "version");
  const pathName = readYamlValue(content, "path") || readYamlValue(content, "url");
  if (!version || !pathName) {
    return undefined;
  }

  return {
    version,
    releaseDate: readYamlValue(content, "releaseDate"),
    sha512: readYamlValue(content, "sha512")
  };
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const count = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < count; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }
  return 0;
}

function devUpdateConfigCandidates(): string[] {
  return app.isPackaged
    ? [join(process.resourcesPath, "dev-update.json")]
    : [join(__dirname, "../../build/dev-update.json")];
}

async function readDevUpdateConfig(): Promise<DevUpdateConfig | undefined> {
  for (const candidate of devUpdateConfigCandidates()) {
    const raw = await readTextIfExists(candidate);
    if (!raw.trim()) {
      continue;
    }
    const parsed = JSON.parse(raw) as DevUpdateConfig;
    if (parsed.enabled === false || !parsed.releaseDir) {
      return undefined;
    }
    return {
      enabled: parsed.enabled,
      releaseDir: isAbsolute(parsed.releaseDir) ? parsed.releaseDir : resolve(dirname(candidate), parsed.releaseDir),
      channelFile: parsed.channelFile || "latest.yml"
    };
  }
  return undefined;
}

async function findLocalInstallerPath(releaseDir: string, pathName: string, version: string): Promise<string | undefined> {
  const normalizedPathName = pathName.replace(/\//g, "\\");
  const directCandidate = join(releaseDir, normalizedPathName);
  try {
    await fs.access(directCandidate);
    return directCandidate;
  } catch {
    // Fall through to compatibility names.
  }

  const spacedCandidate = join(releaseDir, normalizedPathName.replace(/-/g, " "));
  try {
    await fs.access(spacedCandidate);
    return spacedCandidate;
  } catch {
    // Fall through to scanning the release directory.
  }

  const entries = await fs.readdir(releaseDir, { withFileTypes: true }).catch(() => []);
  const candidates = await Promise.all(
    entries
      .filter((entry) => {
        const name = entry.name.toLowerCase();
        return entry.isFile() && name.endsWith(".exe") && name.includes("setup") && (!version || name.includes(version));
      })
      .map(async (entry) => {
        const candidatePath = join(releaseDir, entry.name);
        const stat = await fs.stat(candidatePath);
        return { path: candidatePath, mtimeMs: stat.mtimeMs };
      })
  );

  return candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.path;
}

async function readLatestLocalRelease(config: DevUpdateConfig): Promise<LocalReleaseInfo | undefined> {
  if (!config.releaseDir) {
    return undefined;
  }
  const channelPath = join(config.releaseDir, config.channelFile || "latest.yml");
  const raw = await readTextIfExists(channelPath);
  if (!raw.trim()) {
    return undefined;
  }

  const parsed = parseLatestYml(raw);
  const pathName = readYamlValue(raw, "path") || readYamlValue(raw, "url");
  if (!parsed || !pathName) {
    return undefined;
  }

  const installerPath = await findLocalInstallerPath(config.releaseDir, pathName, parsed.version);
  if (!installerPath) {
    return undefined;
  }

  return {
    ...parsed,
    installerPath
  };
}

async function currentExecutableMtimeMs(): Promise<number> {
  try {
    const stat = await fs.stat(process.execPath);
    return stat.mtimeMs;
  } catch {
    return 0;
  }
}

async function checkLocalUpdate(): Promise<LocalUpdateInfo> {
  const currentVersion = app.getVersion();
  if (!app.isPackaged) {
    return {
      available: false,
      currentVersion,
      message: "开发模式只生成更新配置，不自动安装更新"
    };
  }

  const config = await readDevUpdateConfig();
  if (!config?.releaseDir) {
    return {
      available: false,
      currentVersion,
      message: "未找到本地 release 更新通道"
    };
  }

  const release = await readLatestLocalRelease(config);
  if (!release) {
    return {
      available: false,
      currentVersion,
      message: "本地 release 目录没有可安装的新版本"
    };
  }

  const store = await readStore();
  const preference = store.preferences.localUpdate || {};
  const versionDelta = compareVersions(release.version, currentVersion);
  const releaseTime = release.releaseDate ? Date.parse(release.releaseDate) : Number.NaN;
  const exeMtime = await currentExecutableMtimeMs();
  const sameVersionChanged =
    versionDelta === 0 &&
    Boolean(release.sha512) &&
    (preference.installedSha512
      ? preference.installedSha512 !== release.sha512
      : Number.isFinite(releaseTime) && releaseTime > exeMtime + 60000);
  const available = versionDelta > 0 || sameVersionChanged;

  const nextPreference: LocalUpdatePreference = {
    ...preference,
    lastCheckedAt: nowIso()
  };
  if (!available && release.sha512) {
    nextPreference.installedSha512 = release.sha512;
    nextPreference.installedVersion = release.version;
  }
  store.preferences.localUpdate = nextPreference;
  await writeStore(store);

  return {
    available,
    currentVersion,
    version: release.version,
    releaseDate: release.releaseDate,
    installerPath: release.installerPath,
    message: available ? "发现本地 release 更新，准备自动安装" : "当前已是本地 release 最新安装包"
  };
}

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function launchLocalUpdateInstaller(installerPath: string): void {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Start-Sleep -Milliseconds 900",
    `Start-Process -FilePath ${quotePowerShellString(installerPath)} -ArgumentList '/S'`
  ].join("\n");
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
}

async function installLocalUpdate(): Promise<OperationResult> {
  if (localUpdateInstallInProgress) {
    return {
      ok: true,
      message: "自动更新安装器已经启动"
    };
  }

  const update = await checkLocalUpdate();
  if (!update.available || !update.installerPath) {
    return {
      ok: false,
      message: update.message,
      localUpdate: update
    };
  }

  await fs.access(update.installerPath);
  localUpdateInstallInProgress = true;

  const config = await readDevUpdateConfig();
  const release = config ? await readLatestLocalRelease(config) : undefined;
  const store = await readStore();
  store.preferences.localUpdate = {
    ...(store.preferences.localUpdate || {}),
    pendingSha512: release?.sha512,
    pendingVersion: update.version,
    lastInstallStartedAt: nowIso()
  };
  await writeStore(store);

  launchLocalUpdateInstaller(update.installerPath);
  setTimeout(() => quitApp(), 250);

  return {
    ok: true,
    message: "已启动自动更新安装器，Codex Switch 将自动退出并安装新版",
    localUpdate: update
  };
}

async function markPendingLocalUpdateInstalled(): Promise<void> {
  if (!app.isPackaged) {
    return;
  }
  const store = await readStore();
  const preference = store.preferences.localUpdate;
  if (!preference?.pendingSha512 && !preference?.pendingVersion) {
    return;
  }

  const nextPreference: LocalUpdatePreference = {
    ...preference,
    installedSha512: preference.pendingSha512 || preference.installedSha512,
    installedVersion: preference.pendingVersion || app.getVersion()
  };
  delete nextPreference.pendingSha512;
  delete nextPreference.pendingVersion;
  store.preferences.localUpdate = nextPreference;
  await writeStore(store);
}

async function checkAndInstallLocalUpdate(): Promise<void> {
  if (!app.isPackaged || localUpdateInstallInProgress || process.env.CODEX_SWITCH_DISABLE_AUTO_UPDATE === "1") {
    return;
  }
  const update = await checkLocalUpdate();
  if (update.available) {
    await installLocalUpdate();
  }
}

function scheduleLocalUpdateChecks(): void {
  if (!app.isPackaged || localUpdateTimer) {
    return;
  }
  setTimeout(() => {
    void checkAndInstallLocalUpdate();
  }, LOCAL_UPDATE_INITIAL_CHECK_MS);
  localUpdateTimer = setInterval(() => {
    void checkAndInstallLocalUpdate();
  }, LOCAL_UPDATE_CHECK_INTERVAL_MS);
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
  ipcMain.handle("codex-switch:refresh-usage", () => refreshUsage());
  ipcMain.handle("codex-switch:connect-dashboard-auth", (_event, profileId: string) => connectDashboardAuth(profileId));
  ipcMain.handle("codex-switch:check-local-update", () => checkLocalUpdate());
  ipcMain.handle("codex-switch:install-local-update", () => installLocalUpdate());
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
  ipcMain.handle("codex-switch:open-external", async (_event, url: string) => {
    const target = url.trim();
    if (!/^https?:\/\//i.test(target)) {
      throw new Error("只能打开 http(s) 链接");
    }
    await shell.openExternal(target);
  });
}

if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  void markPendingLocalUpdateInstalled()
    .catch(() => undefined)
    .finally(() => scheduleLocalUpdateChecks());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  if (localUpdateTimer) {
    clearInterval(localUpdateTimer);
    localUpdateTimer = undefined;
  }
  abortActiveTestRequests();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    quitApp();
  }
});
