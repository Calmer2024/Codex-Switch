export type TestStatus = "idle" | "testing" | "ok" | "failed";
export type TagMetric = "stability" | "price" | "dilution" | "speed";
export type TagLevel = "high" | "medium" | "low";
export type ProfileKind = "official" | "custom";
export type UsageStatus = "unknown" | "ok" | "unsupported" | "failed";
export type DynamicEnduranceStrategy = "economy" | "quality";

export interface DynamicEnduranceSettings {
  enabled: boolean;
  strategy: DynamicEnduranceStrategy;
  lastRunAt?: string;
  lastProfileId?: string;
  lastMessage?: string;
}

export interface UsageWindowInfo {
  id: "five-hour" | "weekly" | string;
  label: string;
  usedPercent?: number;
  remainingPercent?: number;
  resetAt?: string;
  windowMinutes?: number;
}

export interface ProfileUsageSummary {
  kind: "relay" | "official";
  status: UsageStatus;
  label: string;
  value: string;
  updatedAt?: string;
  source?: string;
  message?: string;
  windows?: UsageWindowInfo[];
}

export interface DashboardAuthStatus {
  supported: boolean;
  provider?: "yundu" | "generic";
  connected: boolean;
  connectedAt?: string;
  updatedAt?: string;
  message: string;
}

export interface CodexRestartResult {
  needed: boolean;
  attempted: boolean;
  restarted: boolean;
  processCount: number;
  message: string;
}

export interface ProfileTag {
  id: string;
  name: string;
  metric: TagMetric;
  level: TagLevel;
  color: string;
}

export interface ProviderDetection {
  normalizedBaseUrl: string;
  host: string;
  origin: string;
  name: string;
  iconUrl: string;
  iconCandidates: string[];
  color: string;
  known: boolean;
}

export interface PublicProfile extends ProviderDetection {
  id: string;
  kind?: ProfileKind;
  builtin?: boolean;
  baseUrl: string;
  apiKeyPreview: string;
  apiKeyHash: string;
  createdAt: string;
  updatedAt: string;
  lastAppliedAt?: string;
  notes?: string;
  tagIds: string[];
  isActive: boolean;
  testStatus?: TestStatus;
  lastTestedAt?: string;
  lastTestMessage?: string;
  usage?: ProfileUsageSummary;
  dashboardAuth?: DashboardAuthStatus;
}

export interface CurrentCodexConfig {
  codexHome: string;
  authPath: string;
  configPath: string;
  providerName?: string;
  baseUrl?: string;
  authMode?: string;
  authKeyName?: string;
  hasApiKey: boolean;
  apiKeyPreview?: string;
  matchedProfileId?: string;
}

export interface BackupRecord {
  id: string;
  createdAt: string;
  profileId?: string;
  profileName: string;
  baseUrl?: string;
  hasAuth: boolean;
  hasConfig: boolean;
}

export interface AppState {
  profiles: PublicProfile[];
  tags: ProfileTag[];
  current: CurrentCodexConfig;
  dynamicEndurance: DynamicEnduranceSettings;
  storagePath: string;
  backupRoot: string;
  backups: BackupRecord[];
}

export interface SaveProfileInput {
  id?: string;
  baseUrl: string;
  apiKey?: string;
  name?: string;
  iconUrl?: string;
  color?: string;
  notes?: string;
  tagIds?: string[];
}

export interface UpdateProfileTagsInput {
  profileId: string;
  tagIds: string[];
}

export interface TestProfileInput {
  profileId?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface UpdateDynamicEnduranceInput {
  enabled: boolean;
  strategy: DynamicEnduranceStrategy;
}

export interface OperationResult {
  ok: boolean;
  message: string;
  state?: AppState;
  profile?: PublicProfile;
  backupDir?: string;
  loginStarted?: boolean;
  restart?: CodexRestartResult;
  localUpdate?: LocalUpdateInfo;
  dynamicEndurance?: DynamicEnduranceSettings;
}

export interface LocalUpdateInfo {
  available: boolean;
  currentVersion: string;
  version?: string;
  releaseDate?: string;
  installerPath?: string;
  message: string;
}

export interface CodexSwitchApi {
  getState: () => Promise<AppState>;
  detectProvider: (baseUrl: string) => Promise<ProviderDetection>;
  saveProfile: (input: SaveProfileInput) => Promise<OperationResult>;
  applyProfile: (profileId: string) => Promise<OperationResult>;
  deleteProfile: (profileId: string) => Promise<OperationResult>;
  updateProfileTags: (input: UpdateProfileTagsInput) => Promise<OperationResult>;
  importCurrentConfig: () => Promise<OperationResult>;
  testProfile: (input: TestProfileInput) => Promise<OperationResult>;
  refreshUsage: () => Promise<OperationResult>;
  connectDashboardAuth: (profileId: string) => Promise<OperationResult>;
  updateDynamicEndurance: (input: UpdateDynamicEnduranceInput) => Promise<OperationResult>;
  runDynamicEndurance: () => Promise<OperationResult>;
  checkLocalUpdate: () => Promise<LocalUpdateInfo>;
  installLocalUpdate: () => Promise<OperationResult>;
  restoreBackup: (backupId: string) => Promise<OperationResult>;
  revealPath: (kind: "codexHome" | "storage" | "backupRoot") => Promise<void>;
  openExternal: (url: string) => Promise<void>;
}
