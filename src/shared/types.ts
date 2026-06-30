export type TestStatus = "idle" | "testing" | "ok" | "failed";
export type TagMetric = "stability" | "price" | "dilution" | "speed";
export type TagLevel = "high" | "medium" | "low";

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
}

export interface CurrentCodexConfig {
  codexHome: string;
  envPath: string;
  configPath: string;
  providerName?: string;
  baseUrl?: string;
  envKeyName?: string;
  hasApiKey: boolean;
  apiKeyPreview?: string;
  matchedProfileId?: string;
}

export interface AppState {
  profiles: PublicProfile[];
  tags: ProfileTag[];
  current: CurrentCodexConfig;
  storagePath: string;
  backupRoot: string;
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

export interface OperationResult {
  ok: boolean;
  message: string;
  state?: AppState;
  profile?: PublicProfile;
  backupDir?: string;
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
  revealPath: (kind: "codexHome" | "storage" | "backupRoot") => Promise<void>;
}
