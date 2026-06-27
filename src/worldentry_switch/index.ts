const SCRIPT_TITLE = '世界书原版/DLC分组切换器';
const ORIGINAL_BUTTON = '强制原版世界书组';
const DLC_BUTTON = '强制DLC世界书组';
const DLC_PREFIX = '[DLC][扩展]';
const ELF_DLC_ENTRY_NAME = '[DLC][扩展][精灵王国-织阳林冠]';
const RUNTIME_STATE_KEY = '__worldentry_group_switch_runtime__';

const NORMAL_GROUP_NAMES = [
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

type EntryGroup = {
  flavor: Flavor;
  rule: string;
};

type SwitchSummary = {
  target_worldbook: string;
  target_flavor: Flavor;
  matched_count: number;
  enabled_count: number;
  disabled_count: number;
  untouched_count: number;
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

function entryName(entry: WorldbookEntry): string {
  return entry.name ?? '';
}

function getEntryGroup(entry: WorldbookEntry): EntryGroup | null {
  const name = entryName(entry);

  if (name.includes(ELF_DLC_ENTRY_NAME)) {
    return { flavor: 'dlc', rule: ELF_DLC_ENTRY_NAME };
  }
  if (!name.includes(DLC_PREFIX) && name.includes('精灵文明-')) {
    return { flavor: 'original', rule: '精灵文明-xxx' };
  }

  for (const original_name of NORMAL_GROUP_NAMES) {
    const dlc_name = `${DLC_PREFIX}${original_name}`;
    if (name.includes(dlc_name)) {
      return { flavor: 'dlc', rule: original_name };
    }
    if (!name.includes(DLC_PREFIX) && name.includes(original_name)) {
      return { flavor: 'original', rule: original_name };
    }
  }

  return null;
}

async function forceWorldbookGroup(target_worldbook: string, target_flavor: Flavor): Promise<SwitchSummary> {
  const worldbook = await getWorldbook(target_worldbook);
  let matched_count = 0;
  let enabled_count = 0;
  let disabled_count = 0;
  let untouched_count = 0;

  const next_worldbook = worldbook.map(entry => {
    const group = getEntryGroup(entry);
    if (!group) {
      untouched_count += 1;
      return entry;
    }

    matched_count += 1;
    const should_enable = group.flavor === target_flavor;
    if (entry.enabled === should_enable) {
      return entry;
    }

    if (should_enable) {
      enabled_count += 1;
    } else {
      disabled_count += 1;
    }
    return { ...entry, enabled: should_enable };
  });

  await replaceWorldbook(target_worldbook, next_worldbook, { render: 'immediate' });

  try {
    builtin.reloadEditor(target_worldbook, true);
  } catch (error) {
    console.warn(`[${SCRIPT_TITLE}] 世界书编辑器刷新失败:`, error);
  }

  return { target_worldbook, target_flavor, matched_count, enabled_count, disabled_count, untouched_count };
}

async function runForceSwitch(target_flavor: Flavor): Promise<void> {
  const target_worldbook = pickDefaultWorldbook();
  if (!target_worldbook) {
    toastr.error('找不到当前角色、聊天或全局绑定的世界书。', SCRIPT_TITLE);
    return;
  }
  if (!getWorldbookNames().includes(target_worldbook)) {
    toastr.error(`找不到世界书：${target_worldbook}`, SCRIPT_TITLE);
    return;
  }

  const flavor_label = target_flavor === 'dlc' ? 'DLC组' : '原版组';
  toastr.info(`正在强制切换到${flavor_label}：${target_worldbook}`, SCRIPT_TITLE);
  const summary = await forceWorldbookGroup(target_worldbook, target_flavor);
  console.info(`[${SCRIPT_TITLE}] 强制切换完成`, summary);
  toastr.success(
    `已强制切换到${flavor_label}：启用 ${summary.enabled_count} 条，禁用 ${summary.disabled_count} 条，匹配 ${summary.matched_count} 条。`,
    SCRIPT_TITLE,
  );
}

function handleButtonClick(target_flavor: Flavor): void {
  const state = getRuntimeState();
  const now = Date.now();

  if (!isThisRuntimeActive()) {
    return;
  }
  if (state.is_running || now - state.last_started_at < 1000) {
    console.warn(`[${SCRIPT_TITLE}] 忽略重复触发`, {
      is_running: state.is_running,
      last_started_at: state.last_started_at,
      now,
      target_flavor,
    });
    return;
  }

  state.is_running = true;
  state.last_started_at = now;
  void runForceSwitch(target_flavor)
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
  replaceScriptButtons([
    { name: ORIGINAL_BUTTON, visible: true },
    { name: DLC_BUTTON, visible: true },
  ]);
  eventOn(getButtonEvent(ORIGINAL_BUTTON), () => handleButtonClick('original'));
  eventOn(getButtonEvent(DLC_BUTTON), () => handleButtonClick('dlc'));
  console.info(`[${SCRIPT_TITLE}] 已加载`);
});
