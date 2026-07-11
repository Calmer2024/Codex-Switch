import type {
  AppState,
  CodexSwitchApi,
  DynamicEnduranceStrategy,
  OperationResult,
  ProfileTag,
  PublicProfile,
  SaveProfileInput,
  TestProfileInput,
  UpdateDynamicEnduranceInput,
  UpdateProfileTagsInput
} from "../shared/types";

const mockTags: ProfileTag[] = [
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

const names = ["YunDu Relay", "OpenRouter", "SiliconFlow", "DeepSeek", "Moonshot AI", "Zhipu AI", "Groq Edge", "Team Relay"];
const hosts = ["api.yundu.lat", "openrouter.ai", "siliconflow.cn", "deepseek.com", "moonshot.cn", "bigmodel.cn", "groq.com", "relay.team.local"];
const colors = ["#5d61d8", "#5577f2", "#33bc88", "#ff7b4a", "#8158e8", "#7f5af0", "#f07352", "#36a3a1"];
const OFFICIAL_PROFILE_ID = "official-codex-chatgpt";

const officialProfile: PublicProfile = {
  id: OFFICIAL_PROFILE_ID,
  kind: "official",
  builtin: true,
  name: "官方 Codex",
  baseUrl: "codex login",
  normalizedBaseUrl: "codex login",
  host: "chatgpt.com",
  origin: "https://chatgpt.com",
  iconUrl: "",
  iconCandidates: [],
  color: "#2563eb",
  known: true,
  apiKeyPreview: "ChatGPT 登录",
  apiKeyHash: "",
  createdAt: new Date(2026, 5, 20).toISOString(),
  updatedAt: new Date(2026, 5, 20).toISOString(),
  tagIds: [],
  isActive: false,
  testStatus: "idle",
  usage: {
    kind: "official",
    status: "ok",
    label: "官方余量",
    value: "5小时 68% / 1周 84%",
    updatedAt: new Date(2026, 5, 26, 16, 30).toISOString(),
    source: "https://chatgpt.com/backend-api/wham/usage",
    windows: [
      {
        id: "five-hour",
        label: "5小时",
        usedPercent: 32,
        remainingPercent: 68,
        resetAt: new Date(2026, 5, 26, 20, 0).toISOString(),
        windowMinutes: 300
      },
      {
        id: "weekly",
        label: "1周",
        usedPercent: 16,
        remainingPercent: 84,
        resetAt: new Date(2026, 6, 1, 8, 0).toISOString(),
        windowMinutes: 10080
      }
    ]
  }
};

function makeProfile(index: number): PublicProfile {
  const host = hosts[index];
  const tagIds = [
    index % 3 === 2 ? "stability-medium" : "stability-high",
    index % 4 === 0 ? "price-high" : index % 2 === 0 ? "price-low" : "price-medium",
    index % 3 === 0 ? "dilution-low" : "dilution-medium",
    index % 2 === 0 ? "speed-high" : "speed-medium"
  ];

  return {
    id: `mock-${index + 1}`,
    kind: "custom",
    builtin: false,
    name: names[index],
    baseUrl: `https://${host}/v1`,
    normalizedBaseUrl: `https://${host}/v1`,
    host,
    origin: `https://${host}`,
    iconUrl: "",
    iconCandidates: [],
    color: colors[index],
    known: index < 7,
    apiKeyPreview: `sk-${String(index + 1).padStart(2, "0")}...demo`,
    apiKeyHash: `hash-${index + 1}`,
    createdAt: new Date(2026, 5, 20 + index).toISOString(),
    updatedAt: new Date(2026, 5, 21 + index).toISOString(),
    lastAppliedAt: index === 1 ? new Date(2026, 5, 26, 16, 32).toISOString() : undefined,
    tagIds,
    isActive: index === 1,
    testStatus: index % 5 === 4 ? "failed" : index % 3 === 1 ? "idle" : "ok",
    lastTestedAt: new Date(2026, 5, 26, 15, 18 + index).toISOString(),
    lastTestMessage: index % 5 === 4 ? "连接超时" : undefined,
    dashboardAuth: {
      supported: true,
      provider: host.includes("yundu.lat") ? "yundu" : "generic",
      connected: host.includes("yundu.lat"),
      connectedAt: host.includes("yundu.lat") ? new Date(2026, 5, 26, 16, 10).toISOString() : undefined,
      updatedAt: host.includes("yundu.lat") ? new Date(2026, 5, 26, 16, 18).toISOString() : undefined,
      message: host.includes("yundu.lat") ? "已连接网页登录态" : "可连接网页登录态读取余额"
    },
    usage: {
      kind: "relay",
      status: "ok",
      label: index % 2 === 0 ? "余额" : "剩余额度",
      value: index % 2 === 0 ? `$${(18.5 + index * 3.2).toFixed(2)}` : `${(820000 - index * 32000).toLocaleString("zh-CN")}`,
      updatedAt: new Date(2026, 5, 26, 16, 18 + index).toISOString(),
      source: `https://${host}/v1/dashboard/billing/credit_grants`
    }
  };
}

let mockState: AppState = {
  profiles: [officialProfile, ...names.map((_, index) => makeProfile(index))],
  tags: mockTags,
  current: {
    codexHome: "C:\\Users\\demo\\.codex",
    authPath: "C:\\Users\\demo\\.codex\\auth.json",
    configPath: "C:\\Users\\demo\\.codex\\config.toml",
    providerName: "OpenRouter",
    baseUrl: "https://openrouter.ai/v1",
    authMode: "apikey",
    authKeyName: "OPENAI_API_KEY",
    hasApiKey: true,
    apiKeyPreview: "sk-02...demo",
    matchedProfileId: "mock-2"
  },
  dynamicEndurance: {
    enabled: true,
    strategy: "economy",
    lastRunAt: new Date(2026, 5, 26, 16, 35).toISOString(),
    lastProfileId: "mock-2",
    lastMessage: "动态续航保持 OpenRouter（经济模式）"
  },
  storagePath: "C:\\Users\\demo\\AppData\\Roaming\\Codex Switch\\profiles.json",
  backupRoot: "C:\\Users\\demo\\AppData\\Roaming\\Codex Switch\\backups",
  backups: [
    {
      id: "2026-06-26T08-32-00-000Z",
      createdAt: new Date(2026, 5, 26, 16, 32).toISOString(),
      profileId: "mock-2",
      profileName: "OpenRouter",
      baseUrl: "https://openrouter.ai/v1",
      hasAuth: true,
      hasConfig: true
    },
    {
      id: "2026-06-25T03-18-00-000Z",
      createdAt: new Date(2026, 5, 25, 11, 18).toISOString(),
      profileId: "mock-1",
      profileName: "YunDu Relay",
      baseUrl: "https://api.yundu.lat/v1",
      hasAuth: true,
      hasConfig: true
    }
  ]
};

function detect(input: string) {
  const normalizedBaseUrl = input.startsWith("http") ? input : `https://${input}`;
  const url = new URL(normalizedBaseUrl);
  const host = url.host.toLowerCase();
  const name = host.split(".").filter(Boolean)[0] || "Custom Relay";
  return {
    normalizedBaseUrl,
    host,
    origin: url.origin,
    name: name.slice(0, 1).toUpperCase() + name.slice(1),
    iconUrl: "",
    iconCandidates: [],
    color: "#5d61d8",
    known: false
  };
}

function result(message: string, profile?: PublicProfile): OperationResult {
  return {
    ok: true,
    message,
    state: mockState,
    profile
  };
}

function dynamicStrategyLabel(strategy: DynamicEnduranceStrategy): string {
  return strategy === "quality" ? "质量模式" : "经济模式";
}

export function createMockCodexSwitchApi(): CodexSwitchApi {
  return {
    getState: async () => mockState,
    detectProvider: async (baseUrl: string) => detect(baseUrl),
    saveProfile: async (input: SaveProfileInput) => {
      const detection = detect(input.baseUrl);
      const existing = input.id ? mockState.profiles.find((profile) => profile.id === input.id) : undefined;
      const profile: PublicProfile = {
        ...(existing || makeProfile(7)),
        ...detection,
        id: existing?.id || crypto.randomUUID(),
        baseUrl: detection.normalizedBaseUrl,
        name: input.name?.trim() || detection.name,
        apiKeyPreview: input.apiKey ? `${input.apiKey.slice(0, 5)}...${input.apiKey.slice(-4)}` : existing?.apiKeyPreview || "sk-new...demo",
        tagIds: input.tagIds || existing?.tagIds || [],
        updatedAt: new Date().toISOString()
      };
      mockState = {
        ...mockState,
        profiles: existing
          ? mockState.profiles.map((item) => (item.id === existing.id ? profile : item))
          : [profile, ...mockState.profiles]
      };
      return result(existing ? "配置已更新" : "配置已创建", profile);
    },
    applyProfile: async (profileId: string) => {
      const nextProfiles = mockState.profiles.map((profile) => ({
        ...profile,
        isActive: profile.id === profileId,
        lastAppliedAt: profile.id === profileId ? new Date().toISOString() : profile.lastAppliedAt
      }));
      const active = nextProfiles.find((profile) => profile.id === profileId);
      mockState = {
        ...mockState,
        profiles: nextProfiles,
        current: {
          ...mockState.current,
          baseUrl: active?.builtin ? undefined : active?.baseUrl,
          hasApiKey: !active?.builtin,
          apiKeyPreview: active?.builtin ? undefined : active?.apiKeyPreview,
          matchedProfileId: active?.id
        }
      };
      return {
        ...result(active?.builtin ? "已切换到官方 Codex，并打开登录窗口" : "已切换配置", active),
        loginStarted: Boolean(active?.builtin),
        restart: {
          needed: true,
          attempted: false,
          restarted: false,
          processCount: 0,
          message: "开发预览不会重启 Codex"
        }
      };
    },
    deleteProfile: async (profileId: string) => {
      mockState = {
        ...mockState,
        profiles: mockState.profiles.filter((profile) => profile.id !== profileId || profile.builtin)
      };
      return result("配置已删除");
    },
    updateProfileTags: async (input: UpdateProfileTagsInput) => {
      mockState = {
        ...mockState,
        profiles: mockState.profiles.map((profile) =>
          profile.id === input.profileId ? { ...profile, tagIds: input.tagIds } : profile
        )
      };
      return result("标签已更新");
    },
    importCurrentConfig: async () => result("已导入当前配置", mockState.profiles[0]),
    testProfile: async (input: TestProfileInput) => {
      const profileId = input.profileId;
      const message = input.profileId ? "GET mock.relay/v1/models 返回 200，耗时 128ms" : "GET preview.relay/v1/models 返回 200，耗时 128ms";
      mockState = {
        ...mockState,
        profiles: mockState.profiles.map((profile) =>
          profile.id === profileId
            ? { ...profile, testStatus: "ok", lastTestedAt: new Date().toISOString(), lastTestMessage: message }
            : profile
        )
      };
      return result(message);
    },
    refreshUsage: async () => {
      mockState = {
        ...mockState,
        profiles: mockState.profiles.map((profile) => ({
          ...profile,
          usage: profile.usage ? { ...profile.usage, updatedAt: new Date().toISOString() } : profile.usage
        }))
      };
      return result("额度已同步");
    },
    updateDynamicEndurance: async (input: UpdateDynamicEnduranceInput) => {
      mockState = {
        ...mockState,
        dynamicEndurance: {
          ...mockState.dynamicEndurance,
          enabled: input.enabled,
          strategy: input.strategy
        }
      };
      return result(input.enabled ? `动态续航已启用：${dynamicStrategyLabel(input.strategy)}` : "动态续航已关闭");
    },
    runDynamicEndurance: async () => {
      const candidates = mockState.profiles.filter((profile) => !profile.builtin && profile.usage?.status === "ok");
      const selected = candidates.find((profile) => profile.tagIds.includes("price-low")) || candidates[0];
      if (!selected) {
        return {
          ok: false,
          message: "没有找到有余额的可用中转站",
          state: mockState
        };
      }
      mockState = {
        ...mockState,
        profiles: mockState.profiles.map((profile) => ({
          ...profile,
          isActive: profile.id === selected.id,
          lastAppliedAt: profile.id === selected.id ? new Date().toISOString() : profile.lastAppliedAt
        })),
        current: {
          ...mockState.current,
          baseUrl: selected.baseUrl,
          hasApiKey: true,
          apiKeyPreview: selected.apiKeyPreview,
          matchedProfileId: selected.id
        },
        dynamicEndurance: {
          ...mockState.dynamicEndurance,
          lastRunAt: new Date().toISOString(),
          lastProfileId: selected.id,
          lastMessage: `动态续航已切换到 ${selected.name}（${dynamicStrategyLabel(mockState.dynamicEndurance.strategy)}）`
        }
      };
      return {
        ...result(mockState.dynamicEndurance.lastMessage || "动态续航已完成", selected),
        dynamicEndurance: mockState.dynamicEndurance,
        restart: {
          needed: true,
          attempted: false,
          restarted: false,
          processCount: 0,
          message: "开发预览不会重启 Codex"
        }
      };
    },
    connectDashboardAuth: async (profileId: string) => {
      mockState = {
        ...mockState,
        profiles: mockState.profiles.map((profile) =>
          profile.id === profileId
            ? {
                ...profile,
                dashboardAuth: {
                  supported: true,
                  provider: profile.host.includes("yundu.lat") ? "yundu" : "generic",
                  connected: true,
                  connectedAt: profile.dashboardAuth?.connectedAt || new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  message: "已连接网页登录态"
                },
                usage: {
                  kind: "relay",
                  status: "ok",
                  label: "余额",
                  value: "$6.17",
                  updatedAt: new Date().toISOString(),
                  source: "https://yundu.lat/api/v1/user/profile",
                  message: "来自云渡网页登录态"
                }
              }
            : profile
        )
      };
      return result("已连接网页登录态，当前余额 $6.17");
    },
    checkLocalUpdate: async () => ({
      available: false,
      currentVersion: "0.1.0",
      message: "开发预览不安装更新"
    }),
    installLocalUpdate: async () => ({
      ok: false,
      message: "开发预览不安装更新"
    }),
    restoreBackup: async (backupId: string) => {
      const backup = mockState.backups.find((item) => item.id === backupId);
      return backup ? result(`已恢复 ${backup.profileName} 的备份`) : { ok: false, message: "备份记录不存在" };
    },
    revealPath: async () => undefined,
    openExternal: async () => undefined
  };
}
