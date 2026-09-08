---
type: spec
created: 2026-09-08
updated: 2026-09-08
topic: extension-selector-scroll
route: setup-llm UX follow-up
parent_spec: 2026-09-08-jesus-setup-llm-onboarding-design §3.3.2
tags: [project, agent, jesus, tui, selector, scroll, setup-llm-ux]
---

# ExtensionSelectorComponent Scroll Support

## 0. 背景

`docs/superpowers/specs/2026-09-08-jesus-setup-llm-onboarding-design.md` §3.3.2 诚实标注:`ExtensionSelectorComponent` 当前没有 scroll / pagination 逻辑,39 个 provider 在 80x24 终端会撑爆。`pi --setup-llm` 第 1 步直接受影响。

本 spec 给 ExtensionSelectorComponent 加:
1. 固定可见区大小(`maxVisibleItems = 12`)
2. `scrollOffset` 状态
3. PageUp / PageDown 跳整页
4. selectedIndex 改变时自动 scroll-to-cursor
5. 顶部 muted 指示 `showing X-Y of N (cursor at Z)`

## 1. 目标 / 非目标

**做**:
- 改 `packages/coding-agent/src/modes/interactive/components/extension-selector.ts`:
  - 加 `private scrollOffset = 0` + `private readonly maxVisibleItems = 12` 字段
  - `updateList()` 只渲染 `[scrollOffset, scrollOffset+maxVisibleItems)` 区间
  - 顶部 `titleText` 下面加一行 muted 指示(渲染时动态算)
  - handleInput 加 `pageUp` / `pageDown` 分支(直接走 key 字符串比较,不依赖 keybindings manager 映射)
  - 选中上下移动时调 `scrollToKeepSelectedVisible()` 调整 scrollOffset
- 单测覆盖 4 个 case:small list(<12)不滚动 / selectedIndex=末尾时 scroll / PageDown 跳整页 / 指示文本正确

**不做**:
- 不改其他 selector / picker(只 ExtensionSelectorComponent)
- 不动 setup-llm wizard(自动受益)
- 不动 FirstTimeSetupComponent(它用别的 selector,无需滚动)
- 不引入 ScrollView(用户决策:内置 scroll state)
- 不加 fuzzy search / typeahead
- 不改 TUI 公共 API

## 2. 不变量

- 路线 A I-1~I-6 全部维持
- ExtensionSelectorComponent 公共 API 不变(title/options/onSelect/onCancel/opts)
- 现有 ExtensionSelectorComponent 3 个 caller (search packages/coding-agent/) 不需改

## 3. 设计

### 3.1 字段

```ts
private scrollOffset = 0;
private readonly maxVisibleItems = 12;
private get visibleEnd(): number { return Math.min(this.scrollOffset + this.maxVisibleItems, this.options.length); }
```

### 3.2 updateList 改动

```ts
private updateList(): void {
    this.listContainer.clear();
    for (let i = this.scrollOffset; i < this.visibleEnd; i++) {
        const isSelected = i === this.selectedIndex;
        const text = isSelected
            ? theme.fg("accent", "→ ") + theme.fg("accent", this.options[i])
            : `  ${theme.fg("text", this.options[i]}`;
        this.listContainer.addChild(new Text(text, 1, 0));
    }
    // Indicator: "showing X-Y of N (cursor at Z)"
    const start = this.scrollOffset + 1;
    const end = this.visibleEnd;
    const total = this.options.length;
    const cursor = this.selectedIndex + 1;
    this.indicatorText.setText(
        theme.fg("muted", `showing ${start}-${end} of ${total} (cursor at ${cursor})`),
    );
}
```

新增 `private indicatorText: Text;` 字段 + 在 constructor 加到 title 之后。

### 3.3 handleInput 加 pageUp/pageDown

```ts
} else if (keyData === "pageUp") {
    this.scrollOffset = Math.max(0, this.scrollOffset - this.maxVisibleItems);
    this.selectedIndex = Math.max(0, this.selectedIndex - this.maxVisibleItems);
    this.updateList();
} else if (keyData === "pageDown") {
    const maxOffset = Math.max(0, this.options.length - this.maxVisibleItems);
    this.scrollOffset = Math.min(maxOffset, this.scrollOffset + this.maxVisibleItems);
    this.selectedIndex = Math.min(this.options.length - 1, this.selectedIndex + this.maxVisibleItems);
    this.updateList();
}
```

直接字符串比较,不走 getKeybindings()。理由:pageUp/pageDown 在 TUI keys.ts 里 codepoint 是 -12/-13,转字符串可能不直观;selector 自己处理 PageUp/PageDown 边界更可控。

### 3.4 scrollToKeepSelectedVisible

```ts
private scrollToKeepSelectedVisible(): void {
    if (this.selectedIndex < this.scrollOffset) {
        this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.visibleEnd) {
        this.scrollOffset = this.selectedIndex - this.maxVisibleItems + 1;
        // clamp to max
        const maxOffset = Math.max(0, this.options.length - this.maxVisibleItems);
        if (this.scrollOffset > maxOffset) this.scrollOffset = maxOffset;
    }
}
```

在 up/down handler 调 `scrollToKeepSelectedVisible()` 后再 `updateList()`。

### 3.5 constructor 改动

加 indicatorText 字段 + 在 titleText 后 addChild:

```ts
this.indicatorText = new Text("", 1, 0);
this.addChild(this.indicatorText);
```

位置:在 titleText 之后、Spacer 之前(让指示紧跟标题,看起来像一个整体)。

### 3.6 风险

- `maxVisibleItems = 12` 是硬编码 — 假设 80x24 终端够用。若终端更小,12 项可能溢出。建议后续 spec 改为 `process.stdout.rows` 自适应(MVP 接受固定值)
- 改 updateList 渲染区间 — 若其他 selector 实例依赖全量渲染,会丢行。检查:39 个 provider 是 setup-llm 第1步,model 是 12+。39 < maxVisibleItems 的列表(theme/analytics options)不受影响
- handleInput 直接 key 字符串比较 — 如果未来 keybindings 加 PageUp/PageDown 别名,需要同步更新

## 4. 测试

`packages/coding-agent/test/extension-selector-scroll.test.ts`(vitest,新文件):

1. **small list(<12)**:12 项或更少,scrollOffset 始终 0,渲染全部项,指示 "showing 1-N of N"
2. **selectedIndex at end triggers scroll**:selectedIndex = 35(共 39),scrollOffset 变为 35 - 12 + 1 = 24,指示 "showing 25-39 of 39 (cursor at 36)"
3. **PageDown jumps full page**:selectedIndex = 2,PageDown,selectedIndex 变为 14,scrollOffset 变为 2
4. **indicator text format**:模拟 39 项,selectedIndex = 5,指示 "showing 1-12 of 39 (cursor at 6)"
5. **selectedIndex bounds**:空 options 列表不崩(防御性)

测试用 vitest,不调真实 TUI render —— 用 `handleInput()` 直接触发,inspect `selectedIndex` 和 `scrollOffset` + `listContainer.children.length`(或 indicatorText 内容)。

## 5. 文件清单

```
A  packages/coding-agent/test/extension-selector-scroll.test.ts
M  packages/coding-agent/src/modes/interactive/components/extension-selector.ts
```

单 commit:

```
feat(tui): add scroll support to ExtensionSelectorComponent

39 items (setup-llm providers) overflow 80x24. Adds:
- maxVisibleItems=12 visible window
- scrollOffset auto-adjusts to keep selectedIndex in view
- PageUp/PageDown jump full pages
- muted indicator "showing X-Y of N (cursor at Z)"

Public API unchanged (constructor + handleInput). 5 unit tests
cover small list / scroll-to-end / page jump / indicator format /
empty-list safety.
```

## 6. 范围之外

- 不动其他 selector / picker
- 不动 setup-llm wizard
- 不加 typeahead / fuzzy search
- 不引入 ScrollView
- 不改 TUI 包
- 不修 ExtensionSelectorComponent 的 3 个 caller

## 7. 关联

- 父 spec: `2026-09-08-jesus-setup-llm-onboarding-design.md` §3.3.2
- 直接受益: setup-llm 的 Step 1 (provider picker) + Step 2 (model picker)