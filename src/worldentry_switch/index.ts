const SCRIPT_TITLE = '世界书原版/DLC切换器';
const SWITCH_BUTTON = '切换原版/DLC条目';
const DLC_PREFIX = '[DLC][扩展]';
const ELF_ORIGINAL_PATTERN = /精灵文明-[^|｜\s，,、；;）)】\]]*/;
const ELF_DLC_MARKER = '[DLC][扩展][精灵王国-织阳林冠]';
const SWITCHER_STATE_KEY = '__world_entry_flavor_switcher_state__';

const SWITCH_RULES = [
  '世界主设定',
  '经济价格指南',
  '种族-精灵',
  '冒险区域-无尽树海',
  '势力概览',
  '索伦蒂斯王国||翼民圣都梵尼亚||精灵文明||兽族联盟-政治与社会',
  '房产与装修',
  '妓女和娼妇',
  '奴隶',
] as const;

type SwitcherState = {
  active_token: symbol;
  last_click_at: number;
  running: boolean;
};

type RenamePlan = { next_name: string };
type SwitchResult = {
  target_worldbook: string;
  renamed_count: number;
  matched_count: number;
};

const script_token = Symbol(SCRIPT_TITLE);

function getSharedWindow(): Window & Record<string, unknown> {
  try {
    return (window.parent ?? window) as unknown as Window & Record<string, unknown>;
  } catch {
    return window as unknown as Window & Record<string, unknown>;
  }
}

function getSwitcherState(): SwitcherState {
  const shared_window = getSharedWindow();
  const old_state = shared_window[SWITCHER_STATE_KEY] as Partial<SwitcherState> | undefined;
  const state: SwitcherState = {
    active_token: old_state?.active_token ?? script_token,
    last_click_at: old_state?.last_click_at ?? 0,
    running: old_state?.running ?? false,
  };
  shared_window[SWITCHER_STATE_KEY] = state;
  return state;
}

function markCurrentScriptActive(): void {
  getSwitcherState().active_token = script_token;
}

function isCurrentScriptActive(): boolean {
  return getSwitcherState().active_token === script_token;
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

function replaceFirst(value: string, search: string, replacement: string): string {
  const index = value.indexOf(search);
  if (index < 0) {
    return value;
  }
  return `${value.slice(0, index)}${replacement}${value.slice(index + search.length)}`;
}

function planEntryRename(entry: WorldbookEntry): RenamePlan | null {
  const name = entry.name ?? '';

  if (name.includes(ELF_DLC_MARKER)) {
    return { next_name: replaceFirst(name, ELF_DLC_MARKER, '精灵文明') };
  }
  if (ELF_ORIGINAL_PATTERN.test(name)) {
    return { next_name: name.replace(ELF_ORIGINAL_PATTERN, ELF_DLC_MARKER) };
  }

  for (const original_name of SWITCH_RULES) {
    const dlc_name = `${DLC_PREFIX}${original_name}`;
    if (name.includes(dlc_name)) {
      return { next_name: replaceFirst(name, dlc_name, original_name) };
    }
    if (name.includes(original_name)) {
      return { next_name: replaceFirst(name, original_name, dlc_name) };
    }
  }

  return null;
}

async function switchWorldbookFlavor(target_worldbook: string): Promise<SwitchResult> {
  let renamed_count = 0;
  let matched_count = 0;

  await updateWorldbookWith(target_worldbook, entries =>
    entries.map(entry => {
      const plan = planEntryRename(entry);
      if (!plan) {
        return entry;
      }

      matched_count += 1;
      if (entry.name === plan.next_name) {
        return entry;
      }
      renamed_count += 1;
      return { ...entry, name: plan.next_name };
    }),
  );

  try {
    builtin.reloadEditor(target_worldbook, true);
  } catch (error) {
    console.warn(`[${SCRIPT_TITLE}] 世界书编辑器刷新失败:`, error);
  }

  return { target_worldbook, renamed_count, matched_count };
}

async function runSwitcher(): Promise<void> {
  try {
    const target_worldbook = pickDefaultWorldbook();
    if (!target_worldbook) {
      toastr.error('找不到可切换的默认世界书。', SCRIPT_TITLE);
      return;
    }
    if (!getWorldbookNames().includes(target_worldbook)) {
      toastr.error(`找不到世界书：${target_worldbook}`, SCRIPT_TITLE);
      return;
    }

    toastr.info(`正在切换世界书：${target_worldbook}`, SCRIPT_TITLE);
    const result = await switchWorldbookFlavor(target_worldbook);
    toastr.success(`已切换条目名称：改名 ${result.renamed_count} 条，匹配 ${result.matched_count} 条。`, SCRIPT_TITLE);
    console.info(`[${SCRIPT_TITLE}] 切换完成`, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${SCRIPT_TITLE}] 切换失败:`, error);
    toastr.error(message, SCRIPT_TITLE);
  }
}

function handleSwitcherButtonClick(): void {
  const state = getSwitcherState();
  const now = Date.now();
  if (!isCurrentScriptActive() || state.running || now - state.last_click_at < 1000) {
    return;
  }

  state.last_click_at = now;
  state.running = true;
  void runSwitcher().finally(() => {
    state.running = false;
  });
}

$(() => {
  markCurrentScriptActive();
  replaceScriptButtons([{ name: SWITCH_BUTTON, visible: true }]);
  eventOn(getButtonEvent(SWITCH_BUTTON), handleSwitcherButtonClick);
  console.info(`[${SCRIPT_TITLE}] 已加载`);
});
