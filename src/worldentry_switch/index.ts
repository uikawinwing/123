const SCRIPT_TITLE = '世界书原版/DLC切换器';
const SWITCH_BUTTON = '切换原版/DLC条目';
const DLC_PREFIX = '[DLC][扩展]';
const ELF_DLC_MARKER = '[DLC][扩展][精灵王国-织阳林冠]';

const SWITCH_RULES = [
  { original: '世界主设定', dlc: `${DLC_PREFIX}世界主设定` },
  { original: '经济价格指南', dlc: `${DLC_PREFIX}经济价格指南` },
  { original: '种族-精灵', dlc: `${DLC_PREFIX}种族-精灵` },
  { original: '冒险区域-无尽树海', dlc: `${DLC_PREFIX}冒险区域-无尽树海` },
  { original: '势力概览', dlc: `${DLC_PREFIX}势力概览` },
  {
    original: '索伦蒂斯王国||翼民圣都梵尼亚||精灵文明||兽族联盟-政治与社会',
    dlc: `${DLC_PREFIX}索伦蒂斯王国||翼民圣都梵尼亚||精灵文明||兽族联盟-政治与社会`,
  },
  { original: '房产与装修', dlc: `${DLC_PREFIX}房产与装修` },
  { original: '妓女和娼妇', dlc: `${DLC_PREFIX}妓女和娼妇` },
  { original: '奴隶', dlc: `${DLC_PREFIX}奴隶` },
] as const;

type RenamePlan = { next_name: string };
type SwitchResult = {
  target_worldbook: string;
  renamed_count: number;
  matched_count: number;
};

let last_switch_click_at = 0;
let is_switch_running = false;

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

function getEntryName(entry: LorebookEntry): string {
  return entry.comment ?? '';
}

function replaceFirst(value: string, search: string, replacement: string): string {
  const index = value.indexOf(search);
  if (index < 0) {
    return value;
  }
  return `${value.slice(0, index)}${replacement}${value.slice(index + search.length)}`;
}

function planEntryRename(entry: LorebookEntry): RenamePlan | null {
  const name = getEntryName(entry);

  if (name.includes(ELF_DLC_MARKER)) {
    return { next_name: replaceFirst(name, ELF_DLC_MARKER, '精灵文明') };
  }
  if (name.includes('精灵文明-')) {
    return {
      next_name: name.replace(/精灵文明-[^|｜\s，,、；;）)】\]]*/, ELF_DLC_MARKER),
    };
  }

  for (const rule of SWITCH_RULES) {
    if (name.includes(rule.dlc)) {
      return { next_name: replaceFirst(name, rule.dlc, rule.original) };
    }
    if (name.includes(rule.original)) {
      return { next_name: replaceFirst(name, rule.original, rule.dlc) };
    }
  }

  return null;
}

async function switchWorldbookFlavor(target_worldbook: string): Promise<SwitchResult> {
  let renamed_count = 0;
  let matched_count = 0;

  await updateLorebookEntriesWith(target_worldbook, entries =>
    entries.map(entry => {
      const plan = planEntryRename(entry);
      if (!plan) {
        return entry;
      }

      matched_count += 1;
      if (entry.comment === plan.next_name) {
        return entry;
      }
      renamed_count += 1;
      return { ...entry, comment: plan.next_name };
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
  const now = Date.now();
  if (is_switch_running || now - last_switch_click_at < 1000) {
    return;
  }
  last_switch_click_at = now;
  is_switch_running = true;
  void runSwitcher().finally(() => {
    is_switch_running = false;
  });
}

$(() => {
  replaceScriptButtons([{ name: SWITCH_BUTTON, visible: true }]);
  eventOn(getButtonEvent(SWITCH_BUTTON), handleSwitcherButtonClick);
  console.info(`[${SCRIPT_TITLE}] 已加载`);
});
