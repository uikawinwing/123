const SCRIPT_TITLE = '世界书原版/DLC互斥切换器';
const SWITCH_BUTTON = '切换世界书原版/DLC';
const DLC_PREFIX = '[DLC][扩展]';
const ELF_DLC_ENTRY_NAME = '[DLC][扩展][精灵王国-织阳林冠]';
const RUNTIME_STATE_KEY = '__rebuilt_worldentry_switch_runtime__';

const NORMAL_RULES = [
  '索伦蒂斯王国||翼民圣都梵尼亚||精灵文明||兽族联盟-政治与社会',
  '冒险区域-无尽树海',
  '经济价格指南',
  '世界主设定',
  '种族-精灵',
  '势力概览',
  '房产与装修',
  '妓女和娼妇',
  '奴隶',
] as const;

type Flavor = 'original' | 'dlc';

type RuntimeState = {
  active_token: symbol;
  is_running: boolean;
  last_started_at: number;
};

type EntryMatch = {
  flavor: Flavor;
  rule: string;
};

type SwitchSummary = {
  target_worldbook: string;
  next_flavor: Flavor;
  matched_count: number;
  enabled_count: number;
  disabled_count: number;
  skipped_count: number;
};

const runtime_token = Symbol(SCRIPT_TITLE);

function getSharedWindow(): Window & Record<string, unknown> {
  try {
    return (window.parent ?? window) as unknown as Window & Record<string, unknown>;
  } catch {
    return window as unknown as Window & Record<string, unknown>;
  }
}

function getRuntimeState(): RuntimeState {
  const shared_window = getSharedWindow();
  const existing_state = shared_window[RUNTIME_STATE_KEY] as Partial<RuntimeState> | undefined;
  const state: RuntimeState = {
    active_token: existing_state?.active_token ?? runtime_token,
    is_running: existing_state?.is_running ?? false,
    last_started_at: existing_state?.last_started_at ?? 0,
  };
  shared_window[RUNTIME_STATE_KEY] = state;
  return state;
}

function activateThisRuntime(): void {
  getRuntimeState().active_token = runtime_token;
}

function isThisRuntimeActive(): boolean {
  return getRuntimeState().active_token === runtime_token;
}

function pickDefaultWorldbook(): string {
  try {
    const primary = getCharWorldbookNames('current').primary;
    if (primary) {
      return primary;
    }
  } catch (error) {
    console.warn(`[${SCRIPT_TITLE}] 读取当前角色世界书失败:`, error);
  }

  try {
    const chat_worldbook = getChatWorldbookName('current');
    if (chat_worldbook) {
      return chat_worldbook;
    }
  } catch (error) {
    console.warn(`[${SCRIPT_TITLE}] 读取当前聊天世界书失败:`, error);
  }

  try {
    return getGlobalWorldbookNames()[0] ?? '';
  } catch (error) {
    console.warn(`[${SCRIPT_TITLE}] 读取全局世界书失败:`, error);
    return '';
  }
}

function getEntryTitle(entry: WorldbookEntry): string {
  return entry.name ?? '';
}

function matchEntry(entry: WorldbookEntry): EntryMatch | null {
  const title = getEntryTitle(entry);

  if (title.includes(ELF_DLC_ENTRY_NAME)) {
    return { flavor: 'dlc', rule: ELF_DLC_ENTRY_NAME };
  }
  if (!title.includes(DLC_PREFIX) && title.includes('精灵文明-')) {
    return { flavor: 'original', rule: '精灵文明-xxx' };
  }

  for (const original_name of NORMAL_RULES) {
    const dlc_name = `${DLC_PREFIX}${original_name}`;
    if (title.includes(dlc_name)) {
      return { flavor: 'dlc', rule: original_name };
    }
    if (!title.includes(DLC_PREFIX) && title.includes(original_name)) {
      return { flavor: 'original', rule: original_name };
    }
  }

  return null;
}

function decideNextFlavor(entries: WorldbookEntry[]): Flavor {
  let enabled_original_count = 0;
  let enabled_dlc_count = 0;

  for (const entry of entries) {
    if (!entry.enabled) {
      continue;
    }

    const match = matchEntry(entry);
    if (!match) {
      continue;
    }

    if (match.flavor === 'dlc') {
      enabled_dlc_count += 1;
    } else {
      enabled_original_count += 1;
    }
  }

  return enabled_dlc_count > enabled_original_count ? 'original' : 'dlc';
}

async function switchWorldbookFlavor(target_worldbook: string): Promise<SwitchSummary> {
  const worldbook = await getWorldbook(target_worldbook);
  const next_flavor = decideNextFlavor(worldbook);
  let matched_count = 0;
  let enabled_count = 0;
  let disabled_count = 0;
  let skipped_count = 0;

  const next_worldbook = worldbook.map(entry => {
    const match = matchEntry(entry);
    if (!match) {
      skipped_count += 1;
      return entry;
    }

    matched_count += 1;
    const next_enabled = match.flavor === next_flavor;
    if (entry.enabled === next_enabled) {
      return entry;
    }

    if (next_enabled) {
      enabled_count += 1;
    } else {
      disabled_count += 1;
    }
    return { ...entry, enabled: next_enabled };
  });

  await replaceWorldbook(target_worldbook, next_worldbook, { render: 'immediate' });

  try {
    builtin.reloadEditor(target_worldbook, true);
  } catch (error) {
    console.warn(`[${SCRIPT_TITLE}] 世界书编辑器刷新失败:`, error);
  }

  return { target_worldbook, next_flavor, matched_count, enabled_count, disabled_count, skipped_count };
}

async function runSwitchOnce(): Promise<void> {
  const target_worldbook = pickDefaultWorldbook();
  if (!target_worldbook) {
    toastr.error('找不到当前角色、聊天或全局绑定的世界书。', SCRIPT_TITLE);
    return;
  }
  if (!getWorldbookNames().includes(target_worldbook)) {
    toastr.error(`找不到世界书：${target_worldbook}`, SCRIPT_TITLE);
    return;
  }

  toastr.info(`正在切换：${target_worldbook}`, SCRIPT_TITLE);
  const summary = await switchWorldbookFlavor(target_worldbook);
  const flavor_label = summary.next_flavor === 'dlc' ? 'DLC flavor' : 'original flavor';
  console.info(`[${SCRIPT_TITLE}] 切换完成`, summary);
  toastr.success(
    `已切换为 ${flavor_label}：启用 ${summary.enabled_count} 条，禁用 ${summary.disabled_count} 条，匹配 ${summary.matched_count} 条。`,
    SCRIPT_TITLE,
  );
}

function handleSwitchButtonClick(): void {
  const state = getRuntimeState();
  const now = Date.now();

  if (!isThisRuntimeActive()) {
    return;
  }
  if (state.is_running || now - state.last_started_at < 1500) {
    console.warn(`[${SCRIPT_TITLE}] 忽略重复触发`, {
      is_running: state.is_running,
      last_started_at: state.last_started_at,
      now,
    });
    return;
  }

  state.is_running = true;
  state.last_started_at = now;
  void runSwitchOnce()
    .catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${SCRIPT_TITLE}] 切换失败:`, error);
      toastr.error(message, SCRIPT_TITLE);
    })
    .finally(() => {
      state.is_running = false;
    });
}

$(() => {
  activateThisRuntime();
  replaceScriptButtons([{ name: SWITCH_BUTTON, visible: true }]);
  eventOn(getButtonEvent(SWITCH_BUTTON), handleSwitchButtonClick);
  console.info(`[${SCRIPT_TITLE}] 已加载`);
});
