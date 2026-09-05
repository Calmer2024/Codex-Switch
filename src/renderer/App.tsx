import {
  ArrowClockwise,
  ArrowUpRight,
  Archive,
  BatteryCharging,
  CaretDown,
  ChartBar,
  Check,
  CheckCircle,
  CheckSquare,
  Checks,
  ClipboardText,
  ClockCounterClockwise,
  CloudCheck,
  CopySimple,
  CurrencyCircleDollar,
  Database,
  DownloadSimple,
  Eye,
  EyeSlash,
  FloppyDisk,
  FolderOpen,
  FunnelSimple,
  Gauge,
  Key,
  LinkSimple,
  Lightning,
  MagicWand,
  MagnifyingGlass,
  PencilSimple,
  Plug,
  PlusCircle,
  Pulse,
  ShieldCheck,
  SlidersHorizontal,
  Shuffle,
  Square,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash,
  WarningCircle,
  XCircle
} from "@phosphor-icons/react";
import {
  Check as LucideCheck,
  ChevronDown as LucideChevronDown,
  Eye as LucideEye,
  EyeOff as LucideEyeOff,
  Plus as LucidePlus,
  Trash2 as LucideTrash2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import type {
  AppState,
  CodexSwitchApi,
  DynamicEnduranceSettings,
  DynamicEnduranceStrategy,
  LocalUpdateInfo,
  OperationResult,
  BackupRecord,
  ProfileTag,
  ProfileFileSnapshot,
  ProviderDetection,
  PublicProfile,
  TagMetric
} from "../shared/types";
import { createMockCodexSwitchApi } from "./mockApi";
import codexSwitchLogoUrl from "./assets/codexswitch-logo.png";

type BusyAction =
  | "loading"
  | "saving"
  | "saving-switching"
  | "applying"
  | "deleting"
  | "saving-key"
  | "deleting-key"
  | "importing"
  | "testing"
  | "connecting-dashboard"
  | "saving-settings"
  | "dynamic-endurance"
  | "restoring-backup"
  | "deleting-backups"
  | "restarting-codex"
  | null;

type ActiveView = "profiles" | "profile-file" | "backups" | "settings";

interface FormState {
  baseUrl: string;
  apiKey: string;
  apiKeyNotes: string;
  name: string;
  tagIds: string[];
}

interface LogEntry {
  id: string;
  tone: "ok" | "warn" | "info";
  message: string;
  detail?: string;
}

interface ToastState {
  id: string;
  tone: "ok" | "warn" | "info";
  title: string;
  detail?: string;
}

const emptyForm: FormState = {
  baseUrl: "",
  apiKey: "",
  apiKeyNotes: "",
  name: "",
  tagIds: []
};

const DEFAULT_DYNAMIC_ENDURANCE: DynamicEnduranceSettings = {
  enabled: false,
  strategy: "economy" as DynamicEnduranceStrategy
};

const metricLabels: Record<TagMetric, string> = {
  stability: "稳定程度",
  price: "价格",
  dilution: "掺水率",
  speed: "速度"
};

const metricOrder: TagMetric[] = ["stability", "price", "dilution", "speed"];

const metricHints: Record<TagMetric, string> = {
  stability: "连接可用性",
  price: "调用成本",
  dilution: "响应质量",
  speed: "完成速度"
};

const levelLabels: Record<ProfileTag["level"], string> = {
  high: "高",
  medium: "中",
  low: "低"
};

type ProfileModalMode = "create" | "edit" | null;

function App(): ReactElement {
  const api: CodexSwitchApi = useMemo(() => window.codexSwitch ?? createMockCodexSwitchApi(), []);
  const [state, setState] = useState<AppState | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [detected, setDetected] = useState<ProviderDetection | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("profiles");
  const [profileFile, setProfileFile] = useState<ProfileFileSnapshot | null>(null);
  const [profileFileError, setProfileFileError] = useState("");
  const [profileFileRevision, setProfileFileRevision] = useState(0);
  const [restartPromptOpen, setRestartPromptOpen] = useState(false);
  const [profilePage, setProfilePage] = useState(0);
  const [activeTagFilter, setActiveTagFilter] = useState<string>("all");
  const [profileSearch, setProfileSearch] = useState("");
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileModalMode, setProfileModalMode] = useState<ProfileModalMode>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState<BusyAction>("loading");
  const [usageRefreshing, setUsageRefreshing] = useState(false);
  const [localUpdate, setLocalUpdate] = useState<LocalUpdateInfo | null>(null);
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null);
  const [connectingDashboardProfileId, setConnectingDashboardProfileId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [backupSelectionMode, setBackupSelectionMode] = useState(false);
  const [selectedBackupIds, setSelectedBackupIds] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "boot",
      tone: "info",
      message: "等待操作",
      detail: "配置会保存到应用数据目录，Codex 文件切换前会创建备份。"
    }
  ]);

  const selectedProfile = useMemo(
    () => state?.profiles.find((profile) => profile.id === selectedId) || state?.profiles[0],
    [selectedId, state?.profiles]
  );

  useEffect(() => {
    void bootstrapState();
  }, []);

  useEffect(() => {
    void api.getLocalUpdateState().then(setLocalUpdate).catch(() => undefined);
    return api.onLocalUpdateState(setLocalUpdate);
  }, [api]);

  useEffect(() => {
    if (activeView !== "profile-file") {
      return;
    }
    setProfileFileError("");
    void api.readProfileFile().then(setProfileFile).catch((error: unknown) => {
      setProfileFileError(error instanceof Error ? error.message : String(error));
    });
  }, [activeView, api, profileFileRevision]);

  useEffect(() => {
    if (activeView === "settings") {
      setActiveView("profiles");
    }
  }, [activeView]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshUsage(false);
    }, 120000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const value = form.baseUrl.trim();
    if (!value) {
      setDetected(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const next = await api.detectProvider(value);
        setDetected(next);
        if (!form.name) {
          setForm((current) => ({ ...current, name: next.name }));
        }
      } catch {
        setDetected(null);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [api, form.baseUrl, form.name]);

  async function refreshState(): Promise<void> {
    setBusy("loading");
    try {
      const next = await api.getState();
      setState(next);
      setSelectedId((current) => current || next.current.matchedProfileId || next.profiles[0]?.id || null);
    } finally {
      setBusy(null);
    }
  }

  async function bootstrapState(): Promise<void> {
    await refreshState();
    void refreshUsage(false);
  }

  async function refreshUsage(showFeedback = true): Promise<void> {
    setUsageRefreshing(true);
    try {
      const result = await api.refreshUsage();
      if (result.state) {
        setState(result.state);
      }
      if (showFeedback) {
        applyResult(result);
        showToast({
          tone: result.ok ? "ok" : "warn",
          title: result.ok ? "额度已同步" : "同步失败",
          detail: result.message
        });
      }
    } finally {
      setUsageRefreshing(false);
    }
  }

  async function handleInstallUpdate(): Promise<void> {
    if (!localUpdate?.available || localUpdate.status === "downloading") {
      return;
    }
    const result = await api.installLocalUpdate();
    if (result.localUpdate) {
      setLocalUpdate(result.localUpdate);
    }
    showToast({
      tone: result.ok ? "info" : "warn",
      title: result.ok ? "正在安装更新" : "更新失败",
      detail: result.message
    });
  }

  function addLog(entry: Omit<LogEntry, "id">): void {
    setLogs((current) => [{ ...entry, id: crypto.randomUUID() }, ...current].slice(0, 5));
  }

  function showToast(entry: Omit<ToastState, "id">): void {
    setToast({ ...entry, id: crypto.randomUUID() });
  }

  function applyResult(result: OperationResult, successDetail?: string): void {
    if (result.state) {
      setState(result.state);
    }
    const restartDetail = result.restart?.message;
    const detail = result.ok ? [successDetail || result.backupDir, restartDetail].filter(Boolean).join(" · ") : undefined;
    addLog({
      tone: result.ok ? "ok" : "warn",
      message: result.message,
      detail
    });
  }

  async function handleSave(event: { preventDefault: () => void }, switchAfterSave = false): Promise<void> {
    event.preventDefault();
    setBusy(switchAfterSave ? "saving-switching" : "saving");
    try {
      const saved = await api.saveProfile({
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        apiKeyNotes: form.apiKeyNotes,
        name: form.name || detected?.name,
        tagIds: form.tagIds
      });
      applyResult(saved);

      if (saved.ok && switchAfterSave && saved.profile) {
        const applied = await api.applyProfile(saved.profile.id);
        applyResult(applied, applied.backupDir ? `备份: ${applied.backupDir}` : undefined);
        if (applied.ok) {
          void refreshUsage(false);
        }
      }

      if (saved.ok) {
        setSelectedId(saved.profile?.id || null);
        setForm(emptyForm);
        setDetected(null);
        setProfileModalMode(null);
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleEditSave(event: { preventDefault: () => void }, profile: PublicProfile): Promise<void> {
    event.preventDefault();
    setBusy("saving");
    try {
      const result = await api.saveProfile({
        id: profile.id,
        baseUrl: editForm.baseUrl,
        apiKey: editForm.apiKey.trim() || undefined,
        apiKeyNotes: editForm.apiKeyNotes,
        name: editForm.name,
        tagIds: editForm.tagIds
      });
      applyResult(result);
      if (result.ok) {
        setSelectedId(result.profile?.id || profile.id);
        setEditingProfileId(null);
        setEditForm(emptyForm);
        setProfileModalMode(null);
      }
    } finally {
      setBusy(null);
    }
  }

  function startEditProfile(profile: PublicProfile): void {
    if (profile.builtin) {
      return;
    }
    setSelectedId(profile.id);
    setProfileModalMode("edit");
    setEditingProfileId(profile.id);
    setEditForm({
      baseUrl: profile.baseUrl,
      apiKey: "",
      apiKeyNotes: profile.apiKeys.find((key) => key.isActive)?.notes || "",
      name: profile.name,
      tagIds: profile.tagIds
    });
  }

  function openCreateProfileModal(): void {
    setForm(emptyForm);
    setDetected(null);
    setProfileModalMode("create");
    setShowKey(false);
  }

  function closeProfileModal(): void {
    if (profileModalMode === "edit") {
      cancelEditProfile();
      return;
    }
    setProfileModalMode(null);
    setForm(emptyForm);
    setDetected(null);
  }

  function updateProfileModalForm(patch: Partial<FormState>): void {
    if (profileModalMode === "edit") {
      setEditForm((currentForm) => ({ ...currentForm, ...patch }));
      return;
    }
    setForm((currentForm) => ({ ...currentForm, ...patch }));
  }

  function toggleProfileModalTag(tagId: string): void {
    if (profileModalMode === "edit") {
      setEditForm((currentForm) => ({
        ...currentForm,
        tagIds: toggleMetricTag(currentForm.tagIds, tagId, tags)
      }));
      return;
    }
    setForm((currentForm) => ({
      ...currentForm,
      tagIds: toggleMetricTag(currentForm.tagIds, tagId, tags)
    }));
  }

  function cancelEditProfile(): void {
    setEditingProfileId(null);
    setEditForm(emptyForm);
    setProfileModalMode(null);
  }

  async function handleApply(profileId: string, apiKeyId?: string): Promise<void> {
    setBusy("applying");
    try {
      const result = await api.applyProfile(profileId, apiKeyId);
      applyResult(result, result.backupDir ? `备份: ${result.backupDir}` : undefined);
      if (result.ok) {
        void refreshUsage(false);
      }
      if (result.ok && result.loginStarted) {
        showToast({
          tone: "info",
          title: "已打开官方登录",
          detail: "请在弹出的终端里完成 codex login。"
        });
      } else if (result.ok && result.restart) {
        showToast({
          tone: result.restart.status === "restarted" ? "ok" : "info",
          title: result.restart.status === "restarted" ? "配置已生效" : "配置已保存",
          detail: result.restart.message
        });
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveProfileApiKey(profileId: string, apiKey: string, notes: string): Promise<boolean> {
    setBusy("saving-key");
    try {
      const result = await api.saveProfileApiKey({ profileId, apiKey, notes });
      applyResult(result);
      showToast({ tone: result.ok ? "ok" : "warn", title: result.ok ? "API Key 已添加" : "添加失败", detail: result.message });
      return result.ok;
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteProfileApiKey(profileId: string, apiKeyId: string): Promise<void> {
    if (!window.confirm("删除这个 API Key？")) {
      return;
    }
    setBusy("deleting-key");
    try {
      const result = await api.deleteProfileApiKey(profileId, apiKeyId);
      applyResult(result);
      showToast({ tone: result.ok ? "ok" : "warn", title: result.ok ? "API Key 已删除" : "删除失败", detail: result.message });
    } finally {
      setBusy(null);
    }
  }

  async function handleSafeRestart(): Promise<void> {
    setRestartPromptOpen(false);
    setBusy("restarting-codex");
    try {
      const restarted = await api.restartCodex();
      const restartStatus = restarted.restart?.status;
      const restartTitle = restartStatus === "restarted"
        ? "Codex 已强制重启"
        : restartStatus === "not-running"
          ? "Codex 当前未运行"
          : restartStatus === "cancelled-active-task"
            ? "检测到活动任务，已取消重启"
            : restartStatus === "refused"
              ? "Codex 拒绝安全退出"
              : "强制重启失败";
      showToast({
        tone: restartStatus === "restarted" ? "ok" : restartStatus === "not-running" ? "info" : "warn",
        title: restartTitle,
        detail: restarted.message
      });
      addLog({ tone: restarted.ok ? "ok" : "warn", message: restarted.message });
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(profile: PublicProfile): Promise<void> {
    if (profile.builtin) {
      return;
    }

    const confirmed = window.confirm(`删除 ${profile.name} 配置？`);
    if (!confirmed) {
      return;
    }
    setBusy("deleting");
    try {
      const result = await api.deleteProfile(profile.id);
      applyResult(result);
      if (result.ok) {
        setSelectedId(result.state?.profiles[0]?.id || null);
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleImportCurrent(): Promise<void> {
    setBusy("importing");
    try {
      const result = await api.importCurrentConfig();
      applyResult(result);
      if (result.profile) {
        setSelectedId(result.profile.id);
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleTestCurrentForm(): Promise<void> {
    setBusy("testing");
    try {
      const result = await api.testProfile({
        baseUrl: form.baseUrl,
        apiKey: form.apiKey
      });
      applyResult(result);
      showToast({
        tone: result.ok ? "ok" : "warn",
        title: result.ok ? "测试通过" : "测试失败",
        detail: result.message
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleTestProfile(profileId: string): Promise<void> {
    const targetProfile = profiles.find((profile) => profile.id === profileId);
    if (targetProfile?.builtin) {
      return;
    }

    setBusy("testing");
    setTestingProfileId(profileId);
    try {
      const result = await api.testProfile({ profileId });
      applyResult(result);
      const targetName = profiles.find((profile) => profile.id === profileId)?.name || "中转站";
      showToast({
        tone: result.ok ? "ok" : "warn",
        title: result.ok ? `${targetName} 测试通过` : `${targetName} 测试失败`,
        detail: result.message
      });
    } finally {
      setTestingProfileId(null);
      setBusy(null);
    }
  }

  async function handleConnectDashboardAuth(profile: PublicProfile): Promise<void> {
    if (!profile.dashboardAuth?.supported) {
      return;
    }

    setBusy("connecting-dashboard");
    setConnectingDashboardProfileId(profile.id);
    showToast({
      tone: "info",
      title: "正在连接网页登录态",
      detail: `请在弹出的 ${profile.name} 窗口登录，登录后会自动读取余额。`
    });
    try {
      const result = await api.connectDashboardAuth(profile.id);
      applyResult(result);
      showToast({
        tone: result.ok ? "ok" : "warn",
        title: result.ok ? "余额登录已连接" : "余额登录未完成",
        detail: result.message
      });
      if (result.ok) {
        void refreshUsage(false);
      }
    } finally {
      setConnectingDashboardProfileId(null);
      setBusy(null);
    }
  }

  async function handleUpdateDynamicEndurance(patch: { enabled?: boolean; strategy?: DynamicEnduranceStrategy }): Promise<void> {
    const currentSettings = state?.dynamicEndurance || DEFAULT_DYNAMIC_ENDURANCE;
    setBusy("saving-settings");
    try {
      const result = await api.updateDynamicEndurance({
        enabled: patch.enabled ?? currentSettings.enabled,
        strategy: patch.strategy ?? currentSettings.strategy
      });
      applyResult(result);
      showToast({
        tone: result.ok ? "ok" : "warn",
        title: result.ok ? "设置已保存" : "设置保存失败",
        detail: result.message
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleRunDynamicEndurance(): Promise<void> {
    setBusy("dynamic-endurance");
    try {
      const result = await api.runDynamicEndurance();
      applyResult(result);
      showToast({
        tone: result.ok ? "ok" : "warn",
        title: result.ok ? "动态续航已完成" : "动态续航未完成",
        detail: result.restart?.message || result.message
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleProfileTag(profile: PublicProfile, tagId: string): Promise<void> {
    const nextIds = toggleMetricTag(profile.tagIds, tagId, tags);
    setBusy("saving");
    try {
      const result = await api.updateProfileTags({
        profileId: profile.id,
        tagIds: nextIds
      });
      applyResult(result);
    } finally {
      setBusy(null);
    }
  }

  async function handleOpenProfile(profile: PublicProfile): Promise<void> {
    const target = profile.builtin || profile.kind === "official" ? "https://chatgpt.com/codex" : profile.origin;
    await api.openExternal(target);
  }

  async function handleRestoreBackup(backup: BackupRecord): Promise<void> {
    const confirmed = window.confirm(
      `恢复 ${formatBackupDate(backup.createdAt)} 的备份？\n\n当前 Codex 配置会先自动创建一份安全备份。`
    );
    if (!confirmed) {
      return;
    }
    setBusy("restoring-backup");
    try {
      const result = await api.restoreBackup(backup.id);
      applyResult(result, result.backupDir ? `恢复前安全备份: ${result.backupDir}` : undefined);
      showToast({
        tone: result.ok ? "ok" : "warn",
        title: result.ok ? "备份已恢复" : "恢复失败",
        detail: result.restart?.message || result.message
      });
    } finally {
      setBusy(null);
    }
  }

  function toggleBackupSelection(backupId: string): void {
    setSelectedBackupIds((current) =>
      current.includes(backupId) ? current.filter((id) => id !== backupId) : [...current, backupId]
    );
  }

  function closeBackupSelection(): void {
    setBackupSelectionMode(false);
    setSelectedBackupIds([]);
  }

  async function handleDeleteBackups(backupIds: string[], scopeLabel: string): Promise<void> {
    if (!backupIds.length) {
      showToast({ tone: "warn", title: "尚未选择备份", detail: "请至少选择一条备份记录。" });
      return;
    }
    if (!window.confirm(`确定${scopeLabel}？\n\n此操作不可撤销。`)) {
      return;
    }
    setBusy("deleting-backups");
    try {
      const result = await api.deleteBackups(backupIds);
      applyResult(result);
      if (result.ok) {
        closeBackupSelection();
      }
      showToast({ tone: result.ok ? "ok" : "warn", title: result.ok ? "备份已清理" : "清理失败", detail: result.message });
    } finally {
      setBusy(null);
    }
  }

  const profiles = state?.profiles || [];
  const backups = state?.backups || [];
  const customProfiles = profiles.filter((profile) => !profile.builtin);
  const tags = state?.tags || [];
  const current = state?.current;
  const isWorking = busy !== null;
  const profilesPerPage = 8;
  const searchValue = profileSearch.trim().toLowerCase();
  const filteredProfiles = profiles.filter((profile) => {
    const isOfficial = profile.builtin || profile.kind === "official";
    const tagNames = profile.tagIds
      .map((id) => tags.find((tag) => tag.id === id)?.name)
      .filter(Boolean)
      .join(" ");
    const matchesTag = activeTagFilter === "all" || (!isOfficial && profile.tagIds.includes(activeTagFilter));
    const matchesSearch =
      !searchValue ||
      [
        profile.name,
        profile.host,
        profile.baseUrl,
        profile.normalizedBaseUrl,
        profile.apiKeyPreview,
        profile.usage?.value,
        profile.usage?.message,
        isOfficial ? "官方 ChatGPT 登录 codex login 官方余量 重置" : "",
        tagNames
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchValue);
    return matchesTag && matchesSearch;
  });
  const profilePageCount = Math.max(1, Math.ceil(filteredProfiles.length / profilesPerPage));
  const visibleProfiles = filteredProfiles.slice(profilePage * profilesPerPage, profilePage * profilesPerPage + profilesPerPage);
  const modalProfile = profileModalMode === "edit" ? profiles.find((profile) => profile.id === editingProfileId) : undefined;
  const modalForm = profileModalMode === "edit" ? editForm : form;
  const dynamicEndurance = state?.dynamicEndurance || DEFAULT_DYNAMIC_ENDURANCE;
  const balanceReadyProfiles = customProfiles.filter((profile) => profile.usage?.status === "ok" && usageHasBalance(profile.usage?.value));
  const connectedProfiles = customProfiles.filter((profile) => profile.testStatus === "ok");
  const dynamicReadyProfiles = balanceReadyProfiles.filter((profile) => profile.testStatus === "ok");
  const dynamicPreviewProfiles = [...balanceReadyProfiles]
    .sort(
      (left, right) =>
        dynamicPreviewScore(right, tags, dynamicEndurance.strategy) -
        dynamicPreviewScore(left, tags, dynamicEndurance.strategy)
    )
    .slice(0, 5);
  const lastDynamicProfile = profiles.find((profile) => profile.id === dynamicEndurance.lastProfileId);

  useEffect(() => {
    if (profilePage > profilePageCount - 1) {
      setProfilePage(Math.max(0, profilePageCount - 1));
    }
  }, [profilePage, profilePageCount]);

  useEffect(() => {
    setProfilePage(0);
  }, [activeTagFilter, profileSearch]);

  useEffect(() => {
    if (editingProfileId && selectedProfile?.id !== editingProfileId) {
      cancelEditProfile();
    }
  }, [editingProfileId, selectedProfile?.id]);

  return (
    <main className="app-shell">
      <aside className="nav-rail" aria-label="工具导航">
        <div className="brand-mark" title="Codex Switch" aria-label="Codex Switch">
          <img src={codexSwitchLogoUrl} alt="" />
        </div>
        <nav className="rail-nav">
          <button className={activeView === "profiles" ? "active" : ""} onClick={() => setActiveView("profiles")} title="配置库">
            <Database size={19} weight={activeView === "profiles" ? "fill" : "regular"} />
          </button>
          <button className={activeView === "backups" ? "active" : ""} onClick={() => setActiveView("backups")} title="备份恢复">
            <ClockCounterClockwise size={19} weight={activeView === "backups" ? "fill" : "regular"} />
          </button>
        </nav>
        <div className="rail-bottom">
          <button onClick={() => api.revealPath("codexHome")} title="打开 .codex">
            <FolderOpen size={18} />
          </button>
          <button
            className={activeView === "profile-file" ? "active" : ""}
            onClick={() => setActiveView("profile-file")}
            title="查看 profiles.json"
          >
            <ClipboardText size={18} weight={activeView === "profile-file" ? "fill" : "regular"} />
          </button>
        </div>
      </aside>

      <section className="workspace">
        {activeView === "profile-file" && (
          <section className="view-panel profile-file-view">
            <header className="profile-file-header">
              <div>
                <h1>profiles.json</h1>
                <p>{profileFile?.path || state?.storagePath || "正在读取配置文件"}</p>
              </div>
              <div className="profile-file-actions">
                <span>{profileFile?.updatedAt ? `更新于 ${formatDate(profileFile.updatedAt)}` : "本机配置数据"}</span>
                <button className="secondary-action" onClick={() => setProfileFileRevision((value) => value + 1)}>
                  <ArrowClockwise size={17} />
                  刷新
                </button>
              </div>
            </header>
            <div className="profile-file-content">
              {profileFileError ? (
                <div className="profile-file-error"><WarningCircle size={20} />{profileFileError}</div>
              ) : profileFile ? (
                <pre><code>{profileFile.content}</code></pre>
              ) : (
                <div className="profile-file-loading">正在读取 profiles.json</div>
              )}
            </div>
          </section>
        )}

        {activeView === "profiles" && (
          <section className="view-panel profiles-view subscriptions-view">
            <section className="subscriptions-panel">
              <div className="subscriptions-header">
                <div className="subscriptions-title-block">
                  <h1>配置库</h1>
                  <div className="subscription-tabs" aria-label="中转站分类">
                    <button className={activeTagFilter === "all" ? "active" : ""} onClick={() => setActiveTagFilter("all")}>
                      <span>{profiles.length > 99 ? "99+" : profiles.length}</span>
                      全部
                    </button>
                    {["stability-high", "price-low", "dilution-low", "speed-high"].map((tagId) => {
                      const tag = tags.find((item) => item.id === tagId);
                      if (!tag) {
                        return null;
                      }
                      return (
                        <button
                          key={tag.id}
                          className={activeTagFilter === tag.id ? "active" : ""}
                          onClick={() => setActiveTagFilter(tag.id)}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="subscriptions-tools">
                  {localUpdate?.available && (
                    <button
                      className={`app-update-button ${localUpdate.status === "downloading" ? "downloading" : ""}`}
                      onClick={() => void handleInstallUpdate()}
                      disabled={localUpdate.status === "downloading" || localUpdate.status === "downloaded"}
                      title={localUpdate.message}
                      aria-label={localUpdate.version ? `更新 Codex Switch 到 ${localUpdate.version}` : "更新 Codex Switch"}
                    >
                      <DownloadSimple size={20} weight="bold" />
                    </button>
                  )}
                  <button
                    className="sync-usage-button"
                    onClick={() => void refreshUsage(true)}
                    disabled={usageRefreshing}
                    title="同步中转站余额与官方余量"
                  >
                    <ArrowClockwise size={17} className={usageRefreshing ? "spinning" : ""} />
                    {usageRefreshing ? "同步中" : "同步额度"}
                  </button>
                  <label className="subscription-search">
                    <MagnifyingGlass size={18} />
                    <input
                      value={profileSearch}
                      onChange={(event) => setProfileSearch(event.target.value)}
                      placeholder="搜索配置"
                      autoComplete="off"
                    />
                    <kbd>⌘ F</kbd>
                  </label>
                  <button className="create-subscription-button" onClick={openCreateProfileModal}>
                    <PlusCircle size={21} weight="fill" />
                    添加配置
                  </button>
                </div>
              </div>

              {current && (
                <div className={`connection-status-banner ${current.connectionKind}`} role="status">
                  {current.connectionKind === "official" || current.connectionKind === "relay"
                    ? <ShieldCheck size={18} weight="fill" />
                    : <WarningCircle size={18} weight="fill" />}
                  <strong>{current.connectionKind === "official" ? "官方登录" : current.connectionKind === "relay" ? "中转站" : current.connectionKind === "error" ? "配置错误" : "未识别"}</strong>
                  <span>{current.connectionMessage}</span>
                </div>
              )}

              <div className="subscription-section-title">
                <h2>可用配置</h2>
                {profilePageCount > 1 && (
                  <div className="subscription-pager">
                    <button onClick={() => setProfilePage((page) => Math.max(0, page - 1))} disabled={profilePage === 0}>
                      上一页
                    </button>
                    <span>{profilePage + 1}/{profilePageCount}</span>
                    <button
                      onClick={() => setProfilePage((page) => Math.min(profilePageCount - 1, page + 1))}
                      disabled={profilePage >= profilePageCount - 1}
                    >
                      下一页
                    </button>
                  </div>
                )}
              </div>

              {filteredProfiles.length === 0 ? (
                <div className="empty-state library-empty">
                  <Database size={28} />
                  <p>{profiles.length ? "这个标签下还没有配置" : "还没有保存的配置"}</p>
                </div>
              ) : (
                <div className="subscription-card-grid">
                  {visibleProfiles.map((profile) => (
                    <SubscriptionCard
                      key={profile.id}
                      profile={profile}
                      tags={tags}
                      isWorking={isWorking}
                      isTesting={testingProfileId === profile.id}
                      isConnectingDashboard={connectingDashboardProfileId === profile.id}
                      onApply={handleApply}
                      onSaveApiKey={handleSaveProfileApiKey}
                      onDeleteApiKey={handleDeleteProfileApiKey}
                      onConnectDashboardAuth={handleConnectDashboardAuth}
                      onDelete={handleDelete}
                      onEdit={startEditProfile}
                      onOpen={handleOpenProfile}
                      onTest={handleTestProfile}
                    />
                  ))}
                </div>
              )}
            </section>
          </section>
        )}

        {activeView === "settings" && (
          <section className="view-panel settings-view">
            <section className="settings-panel">
              <div className="settings-header">
                <h1>设置</h1>
                <button
                  className="sync-usage-button"
                  onClick={() => void refreshUsage(true)}
                  disabled={usageRefreshing || isWorking}
                  title="同步中转站余额与官方余量"
                >
                  <ArrowClockwise size={17} className={usageRefreshing ? "spinning" : ""} />
                  {usageRefreshing ? "同步中" : "同步额度"}
                </button>
              </div>

              <div className="settings-grid">
                <section className="settings-card dynamic-card">
                  <div className="settings-card-head">
                    <span className="settings-icon">
                      <BatteryCharging size={22} />
                    </span>
                    <div>
                      <h2>动态续航</h2>
                      <p>{dynamicEndurance.enabled ? "已启用" : "已关闭"}</p>
                      <small className="experimental-note">目前动态续航仍在测试中，谨慎使用</small>
                    </div>
                    <button
                      className={`switch-toggle ${dynamicEndurance.enabled ? "on" : ""}`}
                      onClick={() => void handleUpdateDynamicEndurance({ enabled: !dynamicEndurance.enabled })}
                      disabled={isWorking}
                      aria-pressed={dynamicEndurance.enabled}
                    >
                      {dynamicEndurance.enabled ? <ToggleRight size={24} weight="fill" /> : <ToggleLeft size={24} />}
                      {dynamicEndurance.enabled ? "开启" : "关闭"}
                    </button>
                  </div>

                  <div className="strategy-options" aria-label="动态续航策略">
                    <button
                      className={dynamicEndurance.strategy === "economy" ? "selected" : ""}
                      onClick={() => void handleUpdateDynamicEndurance({ strategy: "economy" })}
                      disabled={isWorking}
                    >
                      <CurrencyCircleDollar size={20} />
                      <span>
                        <strong>经济模式</strong>
                        <small>价格低优先</small>
                      </span>
                    </button>
                    <button
                      className={dynamicEndurance.strategy === "quality" ? "selected" : ""}
                      onClick={() => void handleUpdateDynamicEndurance({ strategy: "quality" })}
                      disabled={isWorking}
                    >
                      <Pulse size={20} />
                      <span>
                        <strong>质量模式</strong>
                        <small>稳定高优先</small>
                      </span>
                    </button>
                  </div>

                  <div className="settings-action-row">
                    <button
                      className="primary-action"
                      onClick={() => void handleRunDynamicEndurance()}
                      disabled={isWorking || !dynamicEndurance.enabled}
                    >
                      <Shuffle size={18} />
                      {busy === "dynamic-endurance" ? "分配中" : "立即分配"}
                    </button>
                    <button className="secondary-action" onClick={() => setActiveView("profile-file")} disabled={isWorking}>
                      <ClipboardText size={18} />
                      配置文件
                    </button>
                  </div>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head compact">
                    <span className="settings-icon muted">
                      <Gauge size={21} />
                    </span>
                    <div>
                      <h2>候选状态</h2>
                      <p>{dynamicReadyProfiles.length ? `${dynamicReadyProfiles.length} 个可直接分配` : "等待可用候选"}</p>
                    </div>
                  </div>
                  <div className="settings-stat-grid">
                    <div>
                      <span>有余额</span>
                      <strong>{balanceReadyProfiles.length}</strong>
                    </div>
                    <div>
                      <span>可连接</span>
                      <strong>{connectedProfiles.length}</strong>
                    </div>
                    <div>
                      <span>就绪</span>
                      <strong>{dynamicReadyProfiles.length}</strong>
                    </div>
                  </div>
                  <div className="settings-last-run">
                    <span>上次结果</span>
                    <strong>{dynamicEndurance.lastMessage || "暂无记录"}</strong>
                    <small>{lastDynamicProfile ? lastDynamicProfile.name : formatDate(dynamicEndurance.lastRunAt) || "尚未运行"}</small>
                  </div>
                </section>

                <section className="settings-card settings-wide">
                  <div className="settings-card-head compact">
                    <span className="settings-icon muted">
                      <Shuffle size={21} />
                    </span>
                    <div>
                      <h2>候选队列</h2>
                      <p>{dynamicEndurance.strategy === "quality" ? "按稳定标签排序" : "按价格标签排序"}</p>
                    </div>
                  </div>

                  {dynamicPreviewProfiles.length ? (
                    <div className="dynamic-candidate-list">
                      {dynamicPreviewProfiles.map((profile, index) => (
                        <div className="dynamic-candidate-row" key={profile.id}>
                          <span className="candidate-rank">{index + 1}</span>
                          <ProviderIcon profile={profile} compact />
                          <span>
                            <strong>{profile.name}</strong>
                            <small>{profile.usage?.value || profile.host}</small>
                          </span>
                          <ProfileTagList tagIds={profile.tagIds} tags={tags} />
                          <em className={profile.testStatus === "ok" ? "ok" : profile.testStatus === "failed" ? "failed" : ""}>
                            {rowStatusLabel(profile)}
                          </em>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state settings-empty">
                      <BatteryCharging size={28} />
                      <p>暂无有余额的中转站</p>
                    </div>
                  )}
                </section>
              </div>
            </section>
          </section>
        )}

        {activeView === "backups" && (
          <section className="view-panel backups-view">
            <section className="backups-panel">
              <div className="backups-header">
                <h1>备份恢复</h1>
                {backups.length > 0 && (
                  <div className="backup-toolbar">
                    {backupSelectionMode ? (
                      <>
                        <button
                          className="secondary-action"
                          onClick={() => setSelectedBackupIds(selectedBackupIds.length === backups.length ? [] : backups.map((item) => item.id))}
                          disabled={isWorking}
                        >
                          <Checks size={17} />
                          {selectedBackupIds.length === backups.length ? "取消全选" : "全部选择"}
                        </button>
                        <button
                          className="danger-action"
                          onClick={() => void handleDeleteBackups(selectedBackupIds, `清理选中的 ${selectedBackupIds.length} 条备份`)}
                          disabled={isWorking || selectedBackupIds.length === 0}
                        >
                          <Trash size={17} />
                          清理所选
                        </button>
                        <button className="secondary-action" onClick={closeBackupSelection} disabled={isWorking}>
                          <XCircle size={17} />
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="secondary-action" onClick={() => setBackupSelectionMode(true)} disabled={isWorking}>
                          <CheckSquare size={17} />
                          选择清理
                        </button>
                        <button
                          className="danger-action"
                          onClick={() => void handleDeleteBackups(backups.map((backup) => backup.id), `清理全部 ${backups.length} 条备份`)}
                          disabled={isWorking}
                        >
                          <Trash size={17} />
                          全部清理
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {busy === "loading" ? (
                <div className="backup-loading" aria-live="polite">
                  <span />
                  <span />
                  <span />
                </div>
              ) : backups.length === 0 ? (
                <div className="empty-state backup-empty">
                  <Archive size={30} />
                  <p>还没有备份记录，首次切换配置后会自动创建。</p>
                </div>
              ) : (
                <div className="backup-list">
                  {backups.map((backup) => (
                    <article className={`backup-row ${backupSelectionMode ? "selecting" : ""}`} key={backup.id}>
                      {backupSelectionMode && (
                        <button
                          className={`backup-select-button ${selectedBackupIds.includes(backup.id) ? "selected" : ""}`}
                          onClick={() => toggleBackupSelection(backup.id)}
                          aria-label={selectedBackupIds.includes(backup.id) ? `取消选择 ${backup.profileName}` : `选择 ${backup.profileName}`}
                        >
                          {selectedBackupIds.includes(backup.id) ? <CheckSquare size={20} weight="fill" /> : <Square size={20} />}
                        </button>
                      )}
                      <span className="backup-row-icon">
                        <Archive size={20} />
                      </span>
                      <div className="backup-main">
                        <strong>{backup.profileName}</strong>
                        <small>{backup.baseUrl || "Codex 本地配置"}</small>
                      </div>
                      <div className="backup-files" aria-label="备份包含的文件">
                        <span className={backup.hasAuth ? "available" : ""}>auth.json</span>
                        <span className={backup.hasConfig ? "available" : ""}>config.toml</span>
                      </div>
                      <time dateTime={backup.createdAt}>{formatBackupDate(backup.createdAt)}</time>
                      <button
                        className="backup-restore-button"
                        onClick={() => void handleRestoreBackup(backup)}
                        disabled={isWorking || (!backup.hasAuth && !backup.hasConfig)}
                      >
                        <ClockCounterClockwise size={16} />
                        {busy === "restoring-backup" ? "恢复中" : "恢复"}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        )}
      </section>

      {restartPromptOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setRestartPromptOpen(false)}>
          <section
            className="restart-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restart-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="restart-modal-icon"><ArrowClockwise size={22} /></span>
            <div>
              <h2 id="restart-modal-title">配置已经保存</h2>
              <p>将立即强制关闭并重新启动 Codex，正在运行的任务可能中断。配置会在重启后生效。</p>
            </div>
            <div className="restart-modal-actions">
              <button className="secondary-action" onClick={() => setRestartPromptOpen(false)}>稍后生效</button>
              <button className="primary-action" onClick={() => void handleSafeRestart()}>
                <ArrowClockwise size={17} />
                立即重启
              </button>
            </div>
          </section>
        </div>
      )}

      {profileModalMode && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeProfileModal}>
          <section className="relay-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="relay-modal-head">
              <div>
                <span>{profileModalMode === "edit" ? "Edit relay" : "Create relay"}</span>
                <h2>{profileModalMode === "edit" ? "编辑中转站配置" : "新建中转站配置"}</h2>
              </div>
            </div>

            <form
              className="relay-modal-form"
              onSubmit={(event) => {
                if (profileModalMode === "edit" && modalProfile) {
                  void handleEditSave(event, modalProfile);
                  return;
                }
                void handleSave(event, false);
              }}
            >
              <label>
                <span>中转站地址</span>
                <div className="input-shell">
                  <LinkSimple size={18} />
                  <input
                    value={modalForm.baseUrl}
                    onChange={(event) => updateProfileModalForm({ baseUrl: event.target.value })}
                    placeholder="https://relay.example.com"
                    autoComplete="off"
                  />
                </div>
              </label>

              <label>
                <span>API Key</span>
                <div className="input-shell">
                  <Key size={18} />
                  <input
                    value={modalForm.apiKey}
                    onChange={(event) => updateProfileModalForm({ apiKey: event.target.value })}
                    placeholder={profileModalMode === "edit" ? "留空则保留现有 Key" : "sk-..."}
                    type={showKey ? "text" : "password"}
                    autoComplete="off"
                  />
                  <button type="button" className="inline-icon" onClick={() => setShowKey((value) => !value)}>
                    {showKey ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <label>
                <span>API Key 备注</span>
                <div className="input-shell">
                  <ClipboardText size={18} />
                  <input
                    value={modalForm.apiKeyNotes}
                    onChange={(event) => updateProfileModalForm({ apiKeyNotes: event.target.value })}
                    placeholder="例如：低价 / 高并发 / 按量计费"
                    autoComplete="off"
                  />
                </div>
              </label>

              <label>
                <span>显示名称</span>
                <div className="input-shell">
                  <MagicWand size={18} />
                  <input
                    value={modalForm.name}
                    onChange={(event) => updateProfileModalForm({ name: event.target.value })}
                    placeholder={detected?.name || "自动识别"}
                    autoComplete="off"
                  />
                </div>
              </label>

              <label>
                <span>标签</span>
                <TagSelector tags={tags} selectedIds={modalForm.tagIds} onToggle={toggleProfileModalTag} disabled={isWorking} />
              </label>

              <div className="relay-modal-actions">
                <button type="button" className="secondary-action" onClick={closeProfileModal} disabled={isWorking}>
                  取消
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={isWorking || !modalForm.baseUrl || (profileModalMode === "create" && !modalForm.apiKey)}
                >
                  <Check size={19} />
                  {profileModalMode === "edit" ? "保存修改" : "创建配置"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {toast && (
        <div className={`test-toast ${toast.tone}`} role="status" aria-live="polite">
          <span>
            {toast.tone === "ok" ? <CheckCircle size={18} weight="bold" /> : <WarningCircle size={18} weight="bold" />}
          </span>
          <strong>{toast.title}</strong>
          {toast.detail && <small>{toast.detail}</small>}
          <button type="button" onClick={() => setToast(null)} aria-label="关闭测试结果">
            <XCircle size={17} />
          </button>
        </div>
      )}
    </main>
  );
}

const DEFAULT_AUTH_LABEL = "auth.json · OPENAI_API_KEY";

function parseUsageNumber(value?: string): number | undefined {
  const match = (value || "").replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)(\s*[kmbKMB])?/);
  if (!match) {
    return undefined;
  }
  const base = Number(match[1]);
  if (!Number.isFinite(base)) {
    return undefined;
  }
  const unit = match[2]?.trim().toUpperCase();
  const scale = unit === "B" ? 1_000_000_000 : unit === "M" ? 1_000_000 : unit === "K" ? 1_000 : 1;
  return base * scale;
}

function usageHasBalance(value?: string): boolean {
  const parsed = parseUsageNumber(value);
  if (parsed !== undefined) {
    return parsed > 0;
  }
  return Boolean(value && !/^[$￥¥]?\s*0(?:\.0+)?\s*$/i.test(value.trim()));
}

function levelRank(level?: ProfileTag["level"], preferLow = false): number {
  if (!level) {
    return 0;
  }
  if (preferLow) {
    return level === "low" ? 3 : level === "medium" ? 2 : 1;
  }
  return level === "high" ? 3 : level === "medium" ? 2 : 1;
}

function dynamicPreviewScore(profile: PublicProfile, tags: ProfileTag[], strategy: DynamicEnduranceStrategy): number {
  const price = levelRank(selectedMetricTag(profile.tagIds, tags, "price")?.level, true);
  const stability = levelRank(selectedMetricTag(profile.tagIds, tags, "stability")?.level);
  const speed = levelRank(selectedMetricTag(profile.tagIds, tags, "speed")?.level);
  const dilution = levelRank(selectedMetricTag(profile.tagIds, tags, "dilution")?.level, true);
  const balance = Math.min(99, Math.floor(Math.log10(Math.max(1, parseUsageNumber(profile.usage?.value) || 1)) * 10));

  if (strategy === "quality") {
    return stability * 100000 + price * 10000 + speed * 1000 + dilution * 100 + balance;
  }
  return price * 100000 + stability * 10000 + speed * 1000 + dilution * 100 + balance;
}

function toggleMetricTag(ids: string[], id: string, tags: ProfileTag[]): string[] {
  const tag = tags.find((item) => item.id === id);
  if (!tag) {
    return ids;
  }
  if (ids.includes(id)) {
    return ids.filter((item) => item !== id);
  }
  const sameMetricIds = new Set(tags.filter((item) => item.metric === tag.metric).map((item) => item.id));
  return [...ids.filter((item) => !sameMetricIds.has(item)), id];
}

function metricTags(tags: ProfileTag[], metric: TagMetric): ProfileTag[] {
  const order: Record<ProfileTag["level"], number> = { high: 0, medium: 1, low: 2 };
  return tags.filter((tag) => tag.metric === metric).sort((left, right) => order[left.level] - order[right.level]);
}

function selectedMetricTag(tagIds: string[], tags: ProfileTag[], metric: TagMetric): ProfileTag | undefined {
  return metricTags(tags, metric).find((tag) => tagIds.includes(tag.id));
}

function uniqueMetricTags(tagIds: string[], tags: ProfileTag[]): ProfileTag[] {
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const selectedByMetric = new Map<TagMetric, ProfileTag>();
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const id of tagIds) {
    if (seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    const tag = tagById.get(id);
    if (!tag) {
      continue;
    }
    const nameKey = tag.name.trim();
    if (seenNames.has(nameKey)) {
      continue;
    }
    seenNames.add(nameKey);
    if (!selectedByMetric.has(tag.metric)) {
      selectedByMetric.set(tag.metric, tag);
    }
  }
  return metricOrder.map((metric) => selectedByMetric.get(metric)).filter((tag): tag is ProfileTag => Boolean(tag));
}

function tagUsage(tag: ProfileTag, profiles: PublicProfile[]): number {
  return profiles.filter((profile) => profile.tagIds.includes(tag.id)).length;
}

function metricUsage(metric: TagMetric, tags: ProfileTag[], profiles: PublicProfile[]): number {
  const ids = new Set(metricTags(tags, metric).map((tag) => tag.id));
  return profiles.filter((profile) => profile.tagIds.some((id) => ids.has(id))).length;
}

function taggedMetricCount(profile: PublicProfile, tags: ProfileTag[]): number {
  return metricOrder.filter((metric) => selectedMetricTag(profile.tagIds, tags, metric)).length;
}

function tagToneClass(tag: ProfileTag): "success" | "warning" | "danger" {
  if (tag.color.toLowerCase() === "#2aa84a") {
    return "success";
  }
  if (tag.color.toLowerCase() === "#c4362a") {
    return "danger";
  }
  return "warning";
}

function tagToneIcon(tag: ProfileTag): ReactElement {
  const tone = tagToneClass(tag);
  if (tone === "success") {
    return <CheckCircle size={14} weight="bold" />;
  }
  if (tone === "danger") {
    return <XCircle size={14} weight="bold" />;
  }
  return <WarningCircle size={14} weight="bold" />;
}

function TagBadge({ tag }: { tag: ProfileTag }): ReactElement {
  return (
    <span className={`tag-badge ${tagToneClass(tag)}`} style={{ ["--tag-color" as string]: tag.color }}>
      {tagToneIcon(tag)}
      {tag.name}
    </span>
  );
}

function ProfileTagList({ tagIds, tags }: { tagIds: string[]; tags: ProfileTag[] }): ReactElement | null {
  const selected = uniqueMetricTags(tagIds, tags);
  if (!selected.length) {
    return null;
  }
  return (
    <span className="profile-tags-inline">
      {selected.slice(0, 2).map((tag) => (
        <TagBadge key={tag.id} tag={tag} />
      ))}
      {selected.length > 2 && <em>+{selected.length - 2}</em>}
    </span>
  );
}

function SubscriptionCard({
  profile,
  tags,
  isWorking,
  isTesting,
  isConnectingDashboard,
  onApply,
  onSaveApiKey,
  onDeleteApiKey,
  onConnectDashboardAuth,
  onDelete,
  onEdit,
  onOpen,
  onTest
}: {
  profile: PublicProfile;
  tags: ProfileTag[];
  isWorking: boolean;
  isTesting: boolean;
  isConnectingDashboard: boolean;
  onApply: (profileId: string, apiKeyId?: string) => Promise<void>;
  onSaveApiKey: (profileId: string, apiKey: string, notes: string) => Promise<boolean>;
  onDeleteApiKey: (profileId: string, apiKeyId: string) => Promise<void>;
  onConnectDashboardAuth: (profile: PublicProfile) => Promise<void>;
  onDelete: (profile: PublicProfile) => Promise<void>;
  onEdit: (profile: PublicProfile) => void;
  onOpen: (profile: PublicProfile) => Promise<void>;
  onTest: (profileId: string) => Promise<void>;
}): ReactElement {
  const [keyListOpen, setKeyListOpen] = useState(false);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [newApiKeyNotes, setNewApiKeyNotes] = useState("");
  const [showNewApiKey, setShowNewApiKey] = useState(false);
  const isOfficial = profile.builtin || profile.kind === "official";
  const statusTone = profile.isActive ? "active" : profile.testStatus || "idle";
  const statusText = profile.isActive ? "当前使用" : rowStatusLabel(profile);
  const authLabel = isOfficial ? "认证方式" : "API Key";
  const activeApiKey = profile.apiKeys.find((key) => key.id === profile.activeApiKeyId) || profile.apiKeys[0];
  const authValue = isOfficial ? "ChatGPT 登录" : activeApiKey?.preview || profile.apiKeyPreview;
  const endpointLabel = isOfficial ? "官方入口" : "Base URL";
  const endpointValue = isOfficial ? "codex login" : profile.normalizedBaseUrl;
  const canConnectDashboard = !isOfficial && profile.dashboardAuth?.supported;
  const dashboardConnected = Boolean(profile.dashboardAuth?.connected);

  async function submitApiKey(event: { preventDefault: () => void }): Promise<void> {
    event.preventDefault();
    const saved = await onSaveApiKey(profile.id, newApiKey, newApiKeyNotes);
    if (saved) {
      setNewApiKey("");
      setNewApiKeyNotes("");
      setShowNewApiKey(false);
      setKeyModalOpen(false);
      setKeyListOpen(true);
    }
  }

  return (
    <>
    <article className={`subscription-card ${statusTone} ${isOfficial ? "builtin" : ""} ${keyListOpen ? "keys-expanded" : ""}`}>
      <div className="subscription-card-top">
        <ProviderIcon profile={profile} />
        <span>
          <strong>{profile.name}</strong>
          <small>{profile.host}</small>
        </span>
        <span className="subscription-card-tools">
          {profile.isActive && <span className="card-current-pill">当前使用</span>}
          {isOfficial && <span className="card-builtin-pill">官方</span>}
          <button className="card-open-button" onClick={() => void onOpen(profile)} title={isOfficial ? "打开官方 Codex" : "打开中转站"}>
            <ArrowUpRight size={16} />
          </button>
          {!isOfficial && (
            <button className="card-open-button" onClick={() => onEdit(profile)} title="编辑配置">
              <PencilSimple size={15} />
            </button>
          )}
        </span>
      </div>

      <div className="subscription-card-tiles">
        <div className={`subscription-mini-tile ${!isOfficial ? "api-key-tile" : ""}`}>
          {isOfficial ? <ShieldCheck size={17} /> : <Key size={17} />}
          <span>{authLabel}</span>
          <strong title={activeApiKey?.notes || authValue}>{authValue}</strong>
          {!isOfficial && (
            <span className="api-key-tile-actions">
              <button type="button" onClick={() => setKeyModalOpen(true)} disabled={isWorking} title="添加 API Key" aria-label="添加 API Key">
                <LucidePlus size={15} />
              </button>
              <button
                type="button"
                className={keyListOpen ? "open" : ""}
                onClick={() => setKeyListOpen((value) => !value)}
                title={keyListOpen ? "收起 API Key" : "展开 API Key"}
                aria-label={keyListOpen ? "收起 API Key" : "展开 API Key"}
                aria-expanded={keyListOpen}
              >
                <LucideChevronDown size={15} />
              </button>
            </span>
          )}
        </div>
        {!isOfficial && keyListOpen && (
          <div className="api-key-list">
            {profile.apiKeys.map((apiKey) => (
              <div className={`api-key-option ${apiKey.isActive ? "active" : ""}`} key={apiKey.id}>
                <button type="button" className="api-key-apply" onClick={() => void onApply(profile.id, apiKey.id)} disabled={isWorking}>
                  <span className="api-key-radio">{apiKey.isActive ? <LucideCheck size={12} strokeWidth={2.5} /> : null}</span>
                  <span className="api-key-copy">
                    <strong>{apiKey.preview}</strong>
                    <small>{apiKey.notes || "未添加备注"}</small>
                  </span>
                  <em>{apiKey.isActive ? "当前配置" : "应用配置"}</em>
                </button>
                <button
                  type="button"
                  className="api-key-delete"
                  onClick={() => void onDeleteApiKey(profile.id, apiKey.id)}
                  disabled={isWorking || profile.apiKeys.length <= 1}
                  title={profile.apiKeys.length <= 1 ? "至少保留一个 API Key" : "删除 API Key"}
                  aria-label="删除 API Key"
                >
                  <LucideTrash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className={`subscription-mini-tile tinted ${statusTone}`}>
          <ShieldCheck size={17} />
          <span>状态</span>
          <strong>{statusText}</strong>
        </div>
      </div>

      <div className="subscription-url-row">
        <span className="url-icon">
          <LinkSimple size={16} />
        </span>
        <span>
          <strong title={endpointValue}>{endpointValue}</strong>
          <small>{endpointLabel}</small>
        </span>
        <button
          onClick={() => void navigator.clipboard?.writeText(endpointValue)}
          title={isOfficial ? "复制登录命令" : "复制地址"}
        >
          <CopySimple size={15} />
        </button>
      </div>

      <UsagePanel usage={profile.usage} isOfficial={isOfficial} />

      <div className="subscription-tag-row">
        {!isOfficial && (
          <>
            <ProfileTagList tagIds={profile.tagIds} tags={tags} />
            {!profile.tagIds.length && <em>未设置标签</em>}
          </>
        )}
      </div>

      <div className="subscription-card-footer">
        <span className="subscription-footer-meta">
          <ProviderIcon profile={profile} compact />
          <span>
            <strong>{formatDate(profile.lastAppliedAt || profile.updatedAt) || "暂无记录"}</strong>
            <small>{profile.isActive ? "Last applied" : "Last updated"}</small>
          </span>
        </span>
        <span className="subscription-code">{isOfficial ? "OFFICIAL" : `#${profile.id.slice(0, 6)}`}</span>
      </div>

      <div className="subscription-card-actions">
        {canConnectDashboard && (
          <button
            className={`balance-auth ${dashboardConnected ? "connected" : ""}`}
            onClick={() => void onConnectDashboardAuth(profile)}
            disabled={isWorking}
            title={profile.dashboardAuth?.message}
          >
            <Plug size={16} />
            {isConnectingDashboard ? "登录中" : dashboardConnected ? "重连余额" : "连接余额"}
          </button>
        )}
        {!isOfficial && (
          <button onClick={() => void onTest(profile.id)} disabled={isWorking}>
            <CloudCheck size={16} />
            {isTesting ? "测试中" : "测试"}
          </button>
        )}
        <button className="dark" onClick={() => void onApply(profile.id)} disabled={isWorking}>
          <Lightning size={16} weight="fill" />
          {isOfficial ? "官方登录" : "切换"}
        </button>
        {!isOfficial && (
          <button className="danger" onClick={() => void onDelete(profile)} disabled={isWorking}>
            <Trash size={16} />
          </button>
        )}
      </div>
    </article>
    {keyModalOpen && (
      <div className="modal-backdrop" role="presentation" onMouseDown={() => setKeyModalOpen(false)}>
        <section className="relay-modal api-key-modal" role="dialog" aria-modal="true" aria-labelledby={`api-key-modal-${profile.id}`} onMouseDown={(event) => event.stopPropagation()}>
          <div className="relay-modal-head">
            <div>
              <span>API key</span>
              <h2 id={`api-key-modal-${profile.id}`}>为 {profile.name} 添加 Key</h2>
            </div>
          </div>
          <form className="relay-modal-form" onSubmit={(event) => void submitApiKey(event)}>
            <label>
              <span>API Key</span>
              <div className="input-shell">
                <Key size={18} />
                <input value={newApiKey} onChange={(event) => setNewApiKey(event.target.value)} placeholder="sk-..." type={showNewApiKey ? "text" : "password"} autoComplete="off" autoFocus />
                <button type="button" className="inline-icon" onClick={() => setShowNewApiKey((value) => !value)} title={showNewApiKey ? "隐藏 API Key" : "显示 API Key"}>
                  {showNewApiKey ? <LucideEyeOff size={17} /> : <LucideEye size={17} />}
                </button>
              </div>
            </label>
            <label>
              <span>备注</span>
              <div className="input-shell">
                <ClipboardText size={18} />
                <input value={newApiKeyNotes} onChange={(event) => setNewApiKeyNotes(event.target.value)} placeholder="例如：低价 / 高并发 / 按量计费" autoComplete="off" />
              </div>
            </label>
            <div className="relay-modal-actions">
              <button type="button" className="secondary-action" onClick={() => setKeyModalOpen(false)} disabled={isWorking}>取消</button>
              <button type="submit" className="primary-action" disabled={isWorking || !newApiKey.trim()}>
                <LucideCheck size={17} strokeWidth={2.25} />
                添加
              </button>
            </div>
          </form>
        </section>
      </div>
    )}
    </>
  );
}

function UsagePanel({
  usage,
  isOfficial
}: {
  usage: PublicProfile["usage"];
  isOfficial: boolean;
}): ReactElement {
  if (!usage) {
    return (
      <div className="subscription-usage-panel unknown">
        <div className="usage-panel-head">
          <ChartBar size={16} />
          <span>
            <strong>{isOfficial ? "官方余量待同步" : "余额待同步"}</strong>
            <small>后台会自动刷新</small>
          </span>
        </div>
      </div>
    );
  }

  const hasWindows = isOfficial && usage.windows?.length;
  return (
    <div className={`subscription-usage-panel ${usage.status} ${isOfficial ? "official" : ""}`}>
      <div className="usage-panel-head">
        <ChartBar size={16} />
        <span>
          <strong title={usage.value}>{usage.value}</strong>
          <small title={usage.message || ""}>
            {usage.label}
            {usage.updatedAt ? ` · ${formatDate(usage.updatedAt)}` : ""}
            {usage.message ? ` · ${usage.message}` : ""}
          </small>
        </span>
      </div>
      {hasWindows && (
        <div className="usage-window-list">
          {usage.windows?.map((window) => {
            const remaining = window.remainingPercent ?? (window.usedPercent !== undefined ? 100 - window.usedPercent : undefined);
            return (
              <div className="usage-window-row" key={window.id}>
                <span>
                  <strong>{window.label}</strong>
                  <small>{window.resetAt ? `${formatDate(window.resetAt)} 重置` : "等待重置时间"}</small>
                </span>
                <div className="usage-window-meter" aria-label={`${window.label} 剩余 ${remaining !== undefined ? formatPercent(remaining) : "未知"}`}>
                  <i style={{ width: `${remaining !== undefined ? Math.max(4, Math.min(100, remaining)) : 4}%` }} />
                </div>
                <em>{remaining !== undefined ? formatPercent(remaining) : "--"}</em>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TagSelector({
  tags,
  selectedIds,
  onToggle,
  disabled = false
}: {
  tags: ProfileTag[];
  selectedIds: string[];
  onToggle: (tagId: string) => void;
  disabled?: boolean;
}): ReactElement {
  const [openMetric, setOpenMetric] = useState<TagMetric | null>(null);

  if (!tags.length) {
    return (
      <div className="tag-selector empty">
        <span>暂无标签</span>
      </div>
    );
  }

  return (
    <div className="tag-selector">
      {metricOrder.map((metric) => {
        const selected = selectedMetricTag(selectedIds, tags, metric);
        const isOpen = openMetric === metric;
        return (
          <div className={`metric-chip-group ${isOpen ? "open" : ""}`} key={metric}>
            <button
              type="button"
              className="metric-chip-trigger"
              onClick={() => setOpenMetric(isOpen ? null : metric)}
              disabled={disabled}
              style={selected ? { ["--tag-color" as string]: selected.color } : undefined}
            >
              <span className="metric-chip-icon">
                <Tag size={12} weight="fill" />
              </span>
              <span className="metric-chip-copy">
                <strong>{metricLabels[metric]}</strong>
                <small>{selected ? levelLabels[selected.level] : "未设置"}</small>
              </span>
              <CaretDown size={13} className="metric-caret" />
            </button>
            {isOpen && (
              <div className="metric-chip-options">
                {metricTags(tags, metric).map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className={`metric-level-chip ${selectedIds.includes(tag.id) ? "selected" : ""}`}
                    onClick={() => {
                      onToggle(tag.id);
                      setOpenMetric(null);
                    }}
                    disabled={disabled}
                    style={{ ["--tag-color" as string]: tag.color }}
                  >
                    {tagToneIcon(tag)}
                    <span>{levelLabels[tag.level]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MetricFilter({
  tags,
  profiles,
  activeTagId,
  onChange
}: {
  tags: ProfileTag[];
  profiles: PublicProfile[];
  activeTagId: string;
  onChange: (tagId: string) => void;
}): ReactElement {
  const [openMetric, setOpenMetric] = useState<TagMetric | null>(null);
  const activeTag = tags.find((tag) => tag.id === activeTagId);

  return (
    <div className="metric-filter">
      <button className={`filter-all ${activeTagId === "all" ? "active" : ""}`} onClick={() => onChange("all")}>
        <FunnelSimple size={14} />
        全部
        <span>{profiles.length}</span>
      </button>
      <div className="metric-filter-fields">
        {metricOrder.map((metric) => {
          const selected = activeTag?.metric === metric ? activeTag : undefined;
          const isOpen = openMetric === metric;
          return (
            <div className={`metric-filter-field ${isOpen ? "open" : ""}`} key={metric}>
              <button type="button" className="metric-filter-trigger" onClick={() => setOpenMetric(isOpen ? null : metric)}>
                <span>
                  <strong>{metricLabels[metric]}</strong>
                  <small>{selected ? levelLabels[selected.level] : "全部"}</small>
                </span>
                <CaretDown size={13} />
              </button>
              {isOpen && (
                <div className="metric-filter-options">
                  {metricTags(tags, metric).map((tag) => {
                    const count = tagUsage(tag, profiles);
                    const selectedTag = activeTagId === tag.id;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        className={selectedTag ? "selected" : ""}
                        onClick={() => {
                          onChange(selectedTag ? "all" : tag.id);
                          setOpenMetric(null);
                        }}
                        style={{ ["--tag-color" as string]: tag.color }}
                      >
                        {tagToneIcon(tag)}
                        <span>{levelLabels[tag.level]}</span>
                        <strong>{count}</strong>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TagManagementBoard({ tags, profiles }: { tags: ProfileTag[]; profiles: PublicProfile[] }): ReactElement {
  const [openMetric, setOpenMetric] = useState<TagMetric>("stability");

  return (
    <div className="tag-board">
      <div className="tag-board-kicker">
        <SlidersHorizontal size={17} />
        <span>内置指标</span>
      </div>
      <div className="tag-board-list">
        {metricOrder.map((metric, index) => {
          const count = metricUsage(metric, tags, profiles);
          const isOpen = openMetric === metric;
          const total = profiles.length || 0;
          const percent = total ? Math.round((count / total) * 100) : 0;
          return (
            <section className={`tag-board-item ${isOpen ? "open" : ""}`} key={metric}>
              <button className="tag-board-trigger" type="button" onClick={() => setOpenMetric(metric)}>
                <span className="tag-board-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="tag-board-copy">
                  <strong>{metricLabels[metric]}</strong>
                  <small>{metricHints[metric]}</small>
                </span>
                <span className="tag-board-coverage">
                  <strong>{count}</strong>
                  <small>/{total}</small>
                </span>
                <CaretDown size={15} />
              </button>
              {isOpen && (
                <div className="tag-levels">
                  {metricTags(tags, metric).map((tag) => {
                    const countForTag = tagUsage(tag, profiles);
                    const tagPercent = total ? Math.round((countForTag / total) * 100) : 0;
                    return (
                      <div className="tag-level-chip" key={tag.id} style={{ ["--tag-color" as string]: tag.color }}>
                        <TagBadge tag={tag} />
                        <strong>{countForTag}</strong>
                        <span className="level-meter">
                          <i style={{ width: `${tagPercent}%` }} />
                        </span>
                      </div>
                    );
                  })}
                  <div className="metric-coverage-note">
                    <span>覆盖率</span>
                    <strong>{percent}%</strong>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TagInsightPanel({ tags, profiles }: { tags: ProfileTag[]; profiles: PublicProfile[] }): ReactElement {
  const fullyTagged = profiles.filter((profile) => taggedMetricCount(profile, tags) === metricOrder.length).length;
  const partiallyTagged = profiles.filter((profile) => {
    const count = taggedMetricCount(profile, tags);
    return count > 0 && count < metricOrder.length;
  }).length;
  const untagged = profiles.filter((profile) => taggedMetricCount(profile, tags) === 0).length;

  return (
    <div className="tag-insights">
      <div className="tag-insight-title">
        <ChartBar size={18} />
        <span>分类概览</span>
      </div>
      <div className="tag-summary-grid">
        <div>
          <span>完整标注</span>
          <strong>{fullyTagged}</strong>
        </div>
        <div>
          <span>部分标注</span>
          <strong>{partiallyTagged}</strong>
        </div>
        <div>
          <span>未标注</span>
          <strong>{untagged}</strong>
        </div>
        <div>
          <span>内置标签</span>
          <strong>{tags.length}</strong>
        </div>
      </div>

      <div className="metric-distribution">
        {metricOrder.map((metric) => (
          <div className="metric-distribution-row" key={metric}>
            <span>{metricLabels[metric]}</span>
            <div>
              {metricTags(tags, metric).map((tag) => (
                <span key={tag.id} style={{ ["--tag-color" as string]: tag.color }}>
                  {levelLabels[tag.level]}
                  <strong>{tagUsage(tag, profiles)}</strong>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="tag-incomplete-list">
        <div>
          <WarningCircle size={16} />
          <span>待补全配置</span>
        </div>
        {profiles.filter((profile) => taggedMetricCount(profile, tags) < metricOrder.length).slice(0, 4).map((profile) => (
          <span key={profile.id}>
            <strong>{profile.name}</strong>
            <small>{taggedMetricCount(profile, tags)}/{metricOrder.length}</small>
          </span>
        ))}
        {profiles.length > 0 && fullyTagged === profiles.length && <em>全部配置已完成标注</em>}
        {profiles.length === 0 && <em>暂无配置</em>}
      </div>
    </div>
  );
}

function StatusTile({
  icon,
  label,
  value,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "ok" | "warn" | "neutral";
}): ReactElement {
  return (
    <div className={`status-tile ${tone}`}>
      <div className="status-icon">{icon}</div>
      <span>
        <small>{label}</small>
        <strong title={value}>{value}</strong>
      </span>
    </div>
  );
}

function ProviderIcon({
  profile,
  compact = false,
  large = false
}: {
  profile: Pick<PublicProfile | ProviderDetection, "name" | "iconUrl" | "iconCandidates" | "color">;
  compact?: boolean;
  large?: boolean;
}): ReactElement {
  const variant = hashText(profile.name) % 6;
  const className = `provider-icon relay-avatar avatar-${variant} ${compact ? "compact" : ""} ${large ? "large" : ""}`;
  const letter = profile.name.slice(0, 1).toUpperCase();

  return (
    <span className={className} style={{ ["--avatar-color" as string]: profile.color }}>
      <span>{letter}</span>
    </span>
  );
}

function hashText(value: string): number {
  return value.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
}

function formatDate(value?: string): string {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatBackupDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatPercent(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function testLabel(profile: PublicProfile): string {
  if (profile.testStatus === "ok") {
    return profile.lastTestedAt ? `正常 ${formatDate(profile.lastTestedAt)}` : "正常";
  }
  if (profile.testStatus === "failed") {
    return profile.lastTestMessage || "失败";
  }
  return "未测试";
}

function rowStatusLabel(profile: PublicProfile): string {
  if (profile.testStatus === "ok") {
    return "正常";
  }
  if (profile.testStatus === "failed") {
    return profile.lastTestMessage || "失败";
  }
  return "未测试";
}

export default App;
