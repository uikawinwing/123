const SCRIPT_TITLE = '精灵条目清理器';
const CLEAN_BUTTON = '清理精灵条目';
const CLEAN_CONTENT_COMMENTS = new Set(['[世界主设定]', '[种族概览]', '[势力概览]']);

type CleanMode = 'delete' | 'disable';

type CleanContentEntry = {
  entry: LorebookEntry;
  cleaned_content: string;
};

type CleanPlan = {
  force_delete_entries: LorebookEntry[];
  remove_entries: LorebookEntry[];
  clean_entries: CleanContentEntry[];
};

type CleanResult = {
  target_worldbook: string;
  force_deleted_count: number;
  removed_count: number;
  cleaned_count: number;
  mode: CleanMode;
};

let styles_installed = false;
let last_clean_click_at = 0;

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

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getUiDocument(): Document {
  try {
    return window.parent?.document ?? document;
  } catch {
    return document;
  }
}

function ensureCleanerStyles(): void {
  if (styles_installed) {
    return;
  }
  styles_installed = true;

  const ui_document = getUiDocument();
  const style = ui_document.createElement('style');
  style.textContent = `
    .elf-cleaner-overlay {
      position: fixed;
      inset: 0;
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(0, 0, 0, 0.62);
    }

    .elf-cleaner-dialog {
      width: min(920px, calc(100vw - 32px));
      max-height: min(760px, calc(100vh - 32px));
      display: grid;
      grid-template-rows: auto auto minmax(220px, 1fr) auto;
      gap: 14px;
      padding: 18px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      background: #191a20;
      color: #f4f1ea;
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.46);
    }

    .elf-cleaner-dialog.compact {
      width: min(560px, calc(100vw - 32px));
      grid-template-rows: auto auto auto;
    }

    .elf-cleaner-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
    }

    .elf-cleaner-title {
      margin: 0;
      font-size: 18px;
      line-height: 1.3;
      font-weight: 650;
    }

    .elf-cleaner-subtitle {
      margin: 4px 0 0;
      color: #c9c5ba;
      font-size: 13px;
      line-height: 1.45;
    }

    .elf-cleaner-close,
    .elf-cleaner-button {
      min-height: 36px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      color: #f4f1ea;
      background: rgba(255, 255, 255, 0.08);
      cursor: pointer;
      font: inherit;
    }

    .elf-cleaner-close {
      width: 32px;
      height: 32px;
    }

    .elf-cleaner-button {
      padding: 0 14px;
    }

    .elf-cleaner-button.primary {
      border-color: #b9d78a;
      background: #88b75b;
      color: #10140c;
      font-weight: 650;
    }

    .elf-cleaner-button.danger {
      border-color: #ff9d8f;
      background: #b94b3d;
      color: #fff7f4;
      font-weight: 650;
    }

    .elf-cleaner-field {
      display: grid;
      gap: 8px;
    }

    .elf-cleaner-label {
      font-size: 13px;
      color: #c9c5ba;
    }

    .elf-cleaner-select {
      min-height: 38px;
      border: 1px solid rgba(185, 215, 138, 0.58);
      border-radius: 6px;
      background: #22242b;
      color: #f4f1ea;
      padding: 0 10px;
      font: inherit;
    }

    .elf-cleaner-stats,
    .elf-cleaner-modes {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .elf-cleaner-chip,
    .elf-cleaner-mode {
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.06);
      padding: 8px 10px;
      font-size: 13px;
      line-height: 1.35;
    }

    .elf-cleaner-mode {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      cursor: pointer;
    }

    .elf-cleaner-mode strong,
    .elf-cleaner-mode span {
      display: block;
    }

    .elf-cleaner-mode span {
      color: #c9c5ba;
    }

    .elf-cleaner-list {
      min-height: 220px;
      overflow: auto;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.18);
    }

    .elf-cleaner-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .elf-cleaner-row:last-child {
      border-bottom: 0;
    }

    .elf-cleaner-entry-title {
      font-size: 13px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .elf-cleaner-entry-meta {
      margin-top: 4px;
      color: #c9c5ba;
      font-size: 12px;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }

    .elf-cleaner-tag {
      color: #b9d78a;
      font-size: 12px;
      white-space: nowrap;
    }

    .elf-cleaner-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
  `;
  ui_document.head.append(style);
}

function closeOnEscape(event: KeyboardEvent, close: () => void): void {
  if (event.key === 'Escape') {
    close();
  }
}

function askTargetWorldbook(): Promise<string | null> {
  const names = getWorldbookNames();
  const default_worldbook = pickDefaultWorldbook();
  const ui_document = getUiDocument();
  ensureCleanerStyles();

  return new Promise(resolve => {
    const overlay = ui_document.createElement('div');
    overlay.className = 'elf-cleaner-overlay';
    const options = names
      .map(name => `<option value="${escapeHtml(name)}" ${name === default_worldbook ? 'selected' : ''}>${escapeHtml(name)}</option>`)
      .join('');

    overlay.innerHTML = `
      <section class="elf-cleaner-dialog compact" role="dialog" aria-modal="true">
        <div class="elf-cleaner-header">
          <div>
            <h2 class="elf-cleaner-title">选择目标世界书</h2>
            <p class="elf-cleaner-subtitle">只会清理你选择的已存在世界书。</p>
          </div>
          <button class="elf-cleaner-close" type="button" data-elf-cancel aria-label="关闭">x</button>
        </div>
        <label class="elf-cleaner-field">
          <span class="elf-cleaner-label">目标世界书</span>
          <select class="elf-cleaner-select" data-elf-target>${options}</select>
        </label>
        <div class="elf-cleaner-actions">
          <button class="elf-cleaner-button" type="button" data-elf-cancel>取消</button>
          <button class="elf-cleaner-button primary" type="button" data-elf-confirm ${names.length ? '' : 'disabled'}>检查</button>
        </div>
      </section>
    `;

    const close = (value: string | null) => {
      ui_document.removeEventListener('keydown', onEscape);
      overlay.remove();
      resolve(value);
    };
    const onEscape = (event: KeyboardEvent) => closeOnEscape(event, () => close(null));
    ui_document.addEventListener('keydown', onEscape);

    overlay.querySelectorAll('[data-elf-cancel]').forEach(button => {
      button.addEventListener('click', () => close(null));
    });
    overlay.querySelector('[data-elf-confirm]')?.addEventListener('click', () => {
      const select = overlay.querySelector<HTMLSelectElement>('[data-elf-target]');
      close(select?.value.trim() || null);
    });

    ui_document.body.append(overlay);
    overlay.querySelector<HTMLSelectElement>('[data-elf-target]')?.focus();
  });
}

function shouldRemoveEntry(entry: LorebookEntry): boolean {
  const comment = entry.comment ?? '';
  const lower_comment = comment.toLowerCase();

  if (CLEAN_CONTENT_COMMENTS.has(comment)) {
    return false;
  }
  if (/艾璃丝|汐海妖精|光翅妖精/.test(comment)) {
    return false;
  }

  return (
    comment === '[种族-精灵]' ||
    comment.includes('[精灵文明-') ||
    comment.includes('[DLC][扩展][精灵扩展-') ||
    comment.includes('精灵扩展') ||
    comment.includes('半始源精灵') ||
    comment.includes('始源精灵') ||
    lower_comment.includes('elf') ||
    lower_comment.includes('elven') ||
    lower_comment.includes('elves')
  );
}

function shouldForceDeleteEntry(entry: LorebookEntry): boolean {
  return /银莳萝|伊丝特莱雅女王/.test(entry.content ?? '');
}

function cleanWorldMainContent(content: string): string {
  return content
    .split(/\r?\n/)
    .map(line =>
      line
        .replace(/精灵\(主\),\s*/g, '')
        .replace(/生命花粉\(精灵森林\),\s*/g, '')
        .replace(/,\s*金色迷雾\(精灵森林\)/g, ''),
    )
    .filter(line => !/精灵|艾尔文海姆|翠梦乡/.test(line))
    .join('\n');
}

function cleanRaceOverviewContent(content: string): string {
  return content
    .split(/\r?\n/)
    .filter(line => !/^\s*-\s*精灵:/.test(line))
    .join('\n');
}

function cleanFactionOverviewContent(content: string): string {
  return content
    .split(/\r?\n/)
    .filter(line => !/精灵文明-艾尔文海姆/.test(line))
    .join('\n');
}

function cleanContentForEntry(entry: LorebookEntry): string {
  if (entry.comment === '[世界主设定]') {
    return cleanWorldMainContent(entry.content);
  }
  if (entry.comment === '[种族概览]') {
    return cleanRaceOverviewContent(entry.content);
  }
  if (entry.comment === '[势力概览]') {
    return cleanFactionOverviewContent(entry.content);
  }
  return entry.content;
}

function buildCleanPlan(worldbook: LorebookEntry[]): CleanPlan {
  const force_delete_entries = worldbook.filter(shouldForceDeleteEntry).sort(compareEntryPosition);
  const force_delete_uids = new Set(force_delete_entries.map(entry => entry.uid));
  const remove_entries = worldbook.filter(entry => shouldRemoveEntry(entry) && !force_delete_uids.has(entry.uid)).sort(compareEntryPosition);
  const clean_entries = worldbook
    .filter(entry => CLEAN_CONTENT_COMMENTS.has(entry.comment))
    .map(entry => ({ entry, cleaned_content: cleanContentForEntry(entry) }))
    .filter(item => item.cleaned_content !== item.entry.content)
    .sort((left, right) => compareEntryPosition(left.entry, right.entry));

  return { force_delete_entries, remove_entries, clean_entries };
}

function compareEntryPosition(left: LorebookEntry, right: LorebookEntry): number {
  return left.display_index - right.display_index || left.order - right.order || left.uid - right.uid;
}

function entryLabel(entry: Pick<LorebookEntry, 'uid' | 'comment'>): string {
  return `#${entry.uid} ${entry.comment || '(无标题)'}`;
}

function planListHtml(plan: CleanPlan): string {
  const rows: string[] = [];

  for (const entry of plan.force_delete_entries) {
    rows.push(`
      <div class="elf-cleaner-row">
        <div>
          <div class="elf-cleaner-entry-title">${escapeHtml(entryLabel(entry))}</div>
          <div class="elf-cleaner-entry-meta">正文命中银莳萝/伊丝特莱雅女王，强制删除</div>
        </div>
        <div class="elf-cleaner-tag">force delete</div>
      </div>
    `);
  }

  for (const entry of plan.remove_entries) {
    rows.push(`
      <div class="elf-cleaner-row">
        <div>
          <div class="elf-cleaner-entry-title">${escapeHtml(entryLabel(entry))}</div>
          <div class="elf-cleaner-entry-meta">删除/禁用候选</div>
        </div>
        <div class="elf-cleaner-tag">remove</div>
      </div>
    `);
  }

  for (const item of plan.clean_entries) {
    rows.push(`
      <div class="elf-cleaner-row">
        <div>
          <div class="elf-cleaner-entry-title">${escapeHtml(entryLabel(item.entry))}</div>
          <div class="elf-cleaner-entry-meta">只清理精灵相关内容，不删除条目</div>
        </div>
        <div class="elf-cleaner-tag">clean</div>
      </div>
    `);
  }

  return rows.join('') || '<div class="elf-cleaner-row"><div class="elf-cleaner-entry-title">没有匹配到可清理条目。</div></div>';
}

function askCleanMode(target_worldbook: string, plan: CleanPlan): Promise<CleanMode | null> {
  const ui_document = getUiDocument();
  ensureCleanerStyles();

  return new Promise(resolve => {
    const overlay = ui_document.createElement('div');
    overlay.className = 'elf-cleaner-overlay';
    overlay.innerHTML = `
      <section class="elf-cleaner-dialog" role="dialog" aria-modal="true">
        <div class="elf-cleaner-header">
          <div>
            <h2 class="elf-cleaner-title">确认精灵条目清理</h2>
            <p class="elf-cleaner-subtitle">保留艾璃丝、汐海妖精、光翅妖精。正文命中银莳萝/伊丝特莱雅女王的条目会强制删除。</p>
          </div>
          <button class="elf-cleaner-close" type="button" data-elf-cancel aria-label="关闭">x</button>
        </div>
        <div>
          <div class="elf-cleaner-stats">
            <div class="elf-cleaner-chip">目标：${escapeHtml(target_worldbook)}</div>
            <div class="elf-cleaner-chip">强制删除：${plan.force_delete_entries.length}</div>
            <div class="elf-cleaner-chip">删除/禁用：${plan.remove_entries.length}</div>
            <div class="elf-cleaner-chip">内容清理：${plan.clean_entries.length}</div>
          </div>
          <div class="elf-cleaner-modes" role="radiogroup" aria-label="条目处理方式">
            <label class="elf-cleaner-mode">
              <input type="radio" name="elf-clean-mode" value="delete" checked>
              <span><strong>删除候选条目</strong><span>从目标世界书移除列表中的精灵条目。</span></span>
            </label>
            <label class="elf-cleaner-mode">
              <input type="radio" name="elf-clean-mode" value="disable">
              <span><strong>只禁用候选条目</strong><span>保留条目内容，只关闭启用状态。</span></span>
            </label>
          </div>
        </div>
        <div class="elf-cleaner-list">${planListHtml(plan)}</div>
        <div class="elf-cleaner-actions">
          <button class="elf-cleaner-button" type="button" data-elf-cancel>取消</button>
          <button class="elf-cleaner-button danger" type="button" data-elf-confirm>删除候选并清理内容</button>
        </div>
      </section>
    `;

    const confirm_button = overlay.querySelector<HTMLButtonElement>('[data-elf-confirm]');
    const close = (value: CleanMode | null) => {
      ui_document.removeEventListener('keydown', onEscape);
      overlay.remove();
      resolve(value);
    };
    const selectedMode = (): CleanMode => {
      const checked = overlay.querySelector<HTMLInputElement>('input[name="elf-clean-mode"]:checked');
      return checked?.value === 'disable' ? 'disable' : 'delete';
    };
    const updateAction = () => {
      const mode = selectedMode();
      if (!confirm_button) {
        return;
      }
      confirm_button.textContent = mode === 'delete' ? '删除候选并清理内容' : '禁用候选并清理内容';
      confirm_button.classList.toggle('danger', mode === 'delete');
      confirm_button.classList.toggle('primary', mode !== 'delete');
    };
    const onEscape = (event: KeyboardEvent) => closeOnEscape(event, () => close(null));
    ui_document.addEventListener('keydown', onEscape);

    overlay.querySelectorAll('[data-elf-cancel]').forEach(button => {
      button.addEventListener('click', () => close(null));
    });
    overlay.querySelectorAll<HTMLInputElement>('input[name="elf-clean-mode"]').forEach(input => {
      input.addEventListener('change', updateAction);
    });
    confirm_button?.addEventListener('click', () => close(selectedMode()));

    ui_document.body.append(overlay);
    confirm_button?.focus();
  });
}

async function cleanWorldbook(target_worldbook: string): Promise<CleanResult> {
  const worldbook = await getLorebookEntries(target_worldbook);
  const plan = buildCleanPlan(worldbook);
  const mode = await askCleanMode(target_worldbook, plan);

  if (!mode) {
    throw new Error('已取消清理');
  }

  const force_delete_uids = new Set(plan.force_delete_entries.map(entry => entry.uid));
  const remove_uids = new Set(plan.remove_entries.map(entry => entry.uid));
  const cleaned_content_by_uid = new Map(plan.clean_entries.map(item => [item.entry.uid, item.cleaned_content]));
  const delete_uids = new Set([...force_delete_uids]);
  if (mode === 'delete') {
    for (const uid of remove_uids) {
      delete_uids.add(uid);
    }
  }

  if (delete_uids.size > 0) {
    await deleteLorebookEntries(target_worldbook, [...delete_uids]);
  }

  if (cleaned_content_by_uid.size > 0 || (mode === 'disable' && remove_uids.size > 0)) {
    await updateLorebookEntriesWith(target_worldbook, entries =>
      entries.map(entry => {
        const cleaned_content = cleaned_content_by_uid.get(entry.uid);
        const next_entry = cleaned_content === undefined ? entry : { ...entry, content: cleaned_content };
        if (mode === 'disable' && remove_uids.has(entry.uid)) {
          return { ...next_entry, enabled: false };
        }
        return next_entry;
      }),
    );
  }

  try {
    builtin.reloadEditor(target_worldbook, true);
  } catch (error) {
    console.warn(`[${SCRIPT_TITLE}] 世界书编辑器刷新失败:`, error);
  }

  return {
    target_worldbook,
    force_deleted_count: plan.force_delete_entries.length,
    removed_count: plan.remove_entries.length,
    cleaned_count: plan.clean_entries.length,
    mode,
  };
}

async function runCleaner(): Promise<void> {
  console.info(`[${SCRIPT_TITLE}] 点击清理按钮`);
  toastr.info('正在打开清理面板。', SCRIPT_TITLE);
  try {
    const target_worldbook = await askTargetWorldbook();
    if (!target_worldbook) {
      toastr.warning('未选择世界书，已取消。', SCRIPT_TITLE);
      return;
    }
    if (!getWorldbookNames().includes(target_worldbook)) {
      toastr.error(`找不到世界书：${target_worldbook}`, SCRIPT_TITLE);
      return;
    }

    const result = await cleanWorldbook(target_worldbook);
    const action_text = result.mode === 'delete' ? '删除' : '禁用';
    toastr.success(
      `已强制删除 ${result.force_deleted_count} 条，${action_text} ${result.removed_count} 条候选，清理 ${result.cleaned_count} 条内容。`,
      SCRIPT_TITLE,
    );
    console.info(`[${SCRIPT_TITLE}] 清理完成`, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === '已取消清理') {
      toastr.info(message, SCRIPT_TITLE);
      return;
    }
    console.error(`[${SCRIPT_TITLE}] 清理失败:`, error);
    toastr.error(message, SCRIPT_TITLE);
  }
}

function handleCleanerButtonClick(): void {
  const now = Date.now();
  if (now - last_clean_click_at < 300) {
    return;
  }
  last_clean_click_at = now;
  void runCleaner();
}

function isCleanerMirrorButton(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') {
    return false;
  }
  const button = (target as Element).closest('button.action-item, .qr--button.menu_button.interactable');
  return button?.textContent?.trim() === CLEAN_BUTTON;
}

$(() => {
  const ui_document = getUiDocument();
  replaceScriptButtons([{ name: CLEAN_BUTTON, visible: true }]);
  eventOn(getButtonEvent(CLEAN_BUTTON), handleCleanerButtonClick);
  $(ui_document)
    .off('click.elfCleaner')
    .on('click.elfCleaner', event => {
      if (!isCleanerMirrorButton(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      handleCleanerButtonClick();
    });
  console.info(`[${SCRIPT_TITLE}] 已加载`);
});
