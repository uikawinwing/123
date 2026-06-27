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

type Flavor = 'original' | 'dlc';
type SwitchMatch = { flavor: Flavor; rule_name: string };
type SwitchResult = {
  target_worldbook: string;
  next_flavor: Flavor;
  enabled_count: number;
  disabled_count: number;
  matched_count: number;
};

let last_switch_click_at = 0;

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

function matchSwitchEntry(entry: LorebookEntry): SwitchMatch | null {
  const name = getEntryName(entry);

  if (name.includes(ELF_DLC_MARKER)) {
    return { flavor: 'dlc', rule_name: ELF_DLC_MARKER };
  }
  if (name.includes('精灵文明-')) {
    return { flavor: 'original', rule_name: '精灵文明-xxx' };
  }

  const matched_rule = SWITCH_RULES.find(rule => name.includes(rule.dlc) || name.includes(rule.original));
  if (!matched_rule) {
    return null;
  }
  return {
    flavor: name.includes(matched_rule.dlc) ? 'dlc' : 'original',
    rule_name: matched_rule.original,
  };
}

function inferNextFlavor(entries: LorebookEntry[]): Flavor {
  const matched_entries = entries
    .map(entry => ({ entry, match: matchSwitchEntry(entry) }))
    .filter(item => item.match !== null);
  const enabled_original_count = matched_entries.filter(
    item => item.entry.enabled && item.match?.flavor === 'original',
  ).length;
  const enabled_dlc_count = matched_entries.filter(item => item.entry.enabled && item.match?.flavor === 'dlc').length;

  return enabled_dlc_count > enabled_original_count ? 'original' : 'dlc';
}

async function switchWorldbookFlavor(target_worldbook: string): Promise<SwitchResult> {
  let next_flavor: Flavor = 'dlc';
  let enabled_count = 0;
  let disabled_count = 0;
  let matched_count = 0;

  await updateLorebookEntriesWith(target_worldbook, entries => {
    next_flavor = inferNextFlavor(entries);
    return entries.map(entry => {
      const match = matchSwitchEntry(entry);
      if (!match) {
        return entry;
      }

      matched_count += 1;
      const should_enable = match.flavor === next_flavor;
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
  });

  try {
    builtin.reloadEditor(target_worldbook, true);
  } catch (error) {
    console.warn(`[${SCRIPT_TITLE}] 世界书编辑器刷新失败:`, error);
  }

  return { target_worldbook, next_flavor, enabled_count, disabled_count, matched_count };
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
    const flavor_text = result.next_flavor === 'dlc' ? 'DLC flavor' : 'original flavor';
    toastr.success(
      `已切换为 ${flavor_text}：启用 ${result.enabled_count} 条，禁用 ${result.disabled_count} 条，匹配 ${result.matched_count} 条。`,
      SCRIPT_TITLE,
    );
    console.info(`[${SCRIPT_TITLE}] 切换完成`, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${SCRIPT_TITLE}] 切换失败:`, error);
    toastr.error(message, SCRIPT_TITLE);
  }
}

function handleSwitcherButtonClick(): void {
  const now = Date.now();
  if (now - last_switch_click_at < 300) {
    return;
  }
  last_switch_click_at = now;
  void runSwitcher();
}

function isSwitcherMirrorButton(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') {
    return false;
  }
  const button = (target as Element).closest('button.action-item, .qr--button.menu_button.interactable');
  return button?.textContent?.trim() === SWITCH_BUTTON;
}

$(() => {
  const ui_document = (() => {
    try {
      return window.parent?.document ?? document;
    } catch {
      return document;
    }
  })();

  replaceScriptButtons([{ name: SWITCH_BUTTON, visible: true }]);
  eventOn(getButtonEvent(SWITCH_BUTTON), handleSwitcherButtonClick);
  $(ui_document)
    .off('click.worldEntrySwitcher')
    .on('click.worldEntrySwitcher', event => {
      if (!isSwitcherMirrorButton(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      handleSwitcherButtonClick();
    });
  console.info(`[${SCRIPT_TITLE}] 已加载`);
});
