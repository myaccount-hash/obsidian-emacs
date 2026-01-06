var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => EmacsKeybindingsPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// search.ts
var import_view = require("@codemirror/view");
var import_state = require("@codemirror/state");
var updateSearchState = import_state.StateEffect.define();
var searchStateField = import_state.StateField.define({
  create: () => ({
    active: false,
    direction: "forward",
    startPos: null,
    currentIndex: -1,
    matches: []
  }),
  update: (state, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(updateSearchState)) {
        return effect.value;
      }
    }
    return state;
  }
});
var searchHighlight = import_view.Decoration.mark({ class: "search-highlight" });
var currentHighlight = import_view.Decoration.mark({ class: "search-highlight-current" });
var searchHighlightPlugin = import_view.ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.buildDecorations(view);
  }
  update(update) {
    if (update.docChanged || update.transactions.some((tr) => tr.effects.some((e) => e.is(updateSearchState)))) {
      this.decorations = this.buildDecorations(update.view);
    }
  }
  buildDecorations(view) {
    const state = view.state.field(searchStateField);
    if (!state.active || state.matches.length === 0) {
      return import_view.Decoration.none;
    }
    const builder = new import_state.RangeSetBuilder();
    state.matches.forEach((match, index) => {
      const deco = index === state.currentIndex ? currentHighlight : searchHighlight;
      builder.add(match.from, match.to, deco);
    });
    return builder.finish();
  }
}, {
  decorations: (v) => v.decorations
});
var searchPlugin = [searchStateField, searchHighlightPlugin];
var SearchManager = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.searchState = {
      active: false,
      direction: "forward",
      startPos: null,
      currentIndex: -1,
      matches: []
    };
    this.minibufferEl = null;
    this.inputEl = null;
    this.currentEditor = null;
  }
  /**
   * 検索が有効かどうか
   */
  isSearchActive() {
    return this.searchState.active;
  }
  /**
   * インクリメンタル検索を開始
   */
  startSearch(editor, direction) {
    this.currentEditor = editor;
    this.searchState.active = true;
    this.searchState.direction = direction;
    this.searchState.startPos = editor.getCursor();
    this.searchState.currentIndex = -1;
    this.searchState.matches = [];
    this.updateEditorState(editor);
    this.createMinibuffer(editor);
  }
  /**
   * エディタの検索状態を更新
   */
  updateEditorState(editor) {
    const view = editor.cm;
    view.dispatch({
      effects: updateSearchState.of(this.searchState)
    });
  }
  /**
   * ミニバッファを作成
   */
  createMinibuffer(editor) {
    const editorEl = editor.cm.dom;
    const container = editorEl.closest(".workspace-leaf-content");
    if (!container) return;
    this.minibufferEl = document.createElement("div");
    this.minibufferEl.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 24px;
      background: var(--background-primary);
      border-top: 1px solid var(--background-modifier-border);
      padding: 2px 8px;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 4px;
    `;
    const label = document.createElement("span");
    label.textContent = this.searchState.direction === "forward" ? "I-search:" : "I-search backward:";
    label.style.cssText = `
      font-family: var(--font-monospace);
      font-size: 12px;
      white-space: nowrap;
    `;
    this.inputEl = document.createElement("input");
    this.inputEl.type = "text";
    this.inputEl.style.cssText = `
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      box-shadow: none;
      font-family: var(--font-monospace);
      font-size: 12px;
      color: var(--text-normal);
      padding: 0;
      margin: 0;
      height: 20px;
    `;
    this.minibufferEl.appendChild(label);
    this.minibufferEl.appendChild(this.inputEl);
    container.appendChild(this.minibufferEl);
    this.inputEl.focus();
    this.attachInputHandlers(editor);
  }
  /**
   * 入力ハンドラを設定
   */
  attachInputHandlers(editor) {
    if (!this.inputEl) return;
    this.plugin.registerDomEvent(this.inputEl, "input", () => {
      this.performSearch(editor, this.inputEl.value);
    });
    this.plugin.registerDomEvent(this.inputEl, "keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Escape") {
        this.exitSearch(editor, true);
        e.preventDefault();
      } else if (e.key === "Enter") {
        this.exitSearch(editor, false);
        e.preventDefault();
      }
    });
  }
  /**
   * 検索を実行
   */
  performSearch(editor, query) {
    if (!query || !this.searchState.startPos) {
      this.searchState.matches = [];
      this.searchState.currentIndex = -1;
      if (this.searchState.startPos) {
        editor.setCursor(this.searchState.startPos);
      }
      this.updateEditorState(editor);
      return;
    }
    const content = editor.getValue();
    const matches = [];
    let index = 0;
    while ((index = content.indexOf(query, index)) !== -1) {
      matches.push({ from: index, to: index + query.length });
      index++;
    }
    this.searchState.matches = matches;
    if (matches.length > 0) {
      const startOffset = editor.posToOffset(this.searchState.startPos);
      this.searchState.currentIndex = this.findNearestMatch(matches, startOffset, this.searchState.direction);
      this.moveToCurrentMatch(editor);
    } else {
      this.searchState.currentIndex = -1;
      this.updateLabel("(failed) I-search:");
    }
    this.updateEditorState(editor);
  }
  /**
   * 最も近いマッチを検索
   */
  findNearestMatch(matches, startOffset, direction) {
    if (direction === "forward") {
      for (let i = 0; i < matches.length; i++) {
        if (matches[i].from >= startOffset) return i;
      }
      return 0;
    } else {
      for (let i = matches.length - 1; i >= 0; i--) {
        if (matches[i].from <= startOffset) return i;
      }
      return matches.length - 1;
    }
  }
  /**
   * 次の検索結果に移動
   */
  searchNext(editor, direction) {
    if (!this.searchState.active) return;
    if (this.searchState.matches.length === 0) return;
    if (direction === "forward") {
      this.searchState.currentIndex = (this.searchState.currentIndex + 1) % this.searchState.matches.length;
    } else {
      this.searchState.currentIndex = (this.searchState.currentIndex - 1 + this.searchState.matches.length) % this.searchState.matches.length;
    }
    this.moveToCurrentMatch(editor);
    this.updateEditorState(editor);
  }
  /**
   * 現在のマッチ位置に移動
   */
  moveToCurrentMatch(editor) {
    if (this.searchState.currentIndex === -1) return;
    const match = this.searchState.matches[this.searchState.currentIndex];
    const from = editor.offsetToPos(match.from);
    const to = editor.offsetToPos(match.to);
    editor.setSelection(from, to);
    editor.scrollIntoView({ from, to }, true);
  }
  /**
   * ラベルを更新
   */
  updateLabel(text) {
    const label = this.minibufferEl?.querySelector("span");
    if (label) label.textContent = text;
  }
  /**
   * 検索を終了
   */
  exitSearch(editor, restore) {
    if (restore && this.searchState.startPos) {
      editor.setCursor(this.searchState.startPos);
    } else if (!restore && this.searchState.currentIndex !== -1) {
      const match = this.searchState.matches[this.searchState.currentIndex];
      const pos = editor.offsetToPos(match.from);
      editor.setCursor(pos);
    }
    this.searchState.active = false;
    this.searchState.startPos = null;
    this.searchState.currentIndex = -1;
    this.searchState.matches = [];
    this.updateEditorState(editor);
    if (this.minibufferEl) {
      this.minibufferEl.remove();
      this.minibufferEl = null;
    }
    this.inputEl = null;
    this.currentEditor = null;
    const view = editor.cm;
    view.focus();
  }
  /**
  * 検索をキャンセル
  */
  cancelSearch(editor) {
    if (!this.searchState.active) return;
    this.exitSearch(editor, true);
  }
};

// mark.ts
var MarkManager = class {
  constructor() {
    this.markPos = null;
  }
  /**
   * マークを設定またはクリア
   * マークが設定されていない場合は現在位置に設定，設定されている場合はクリア
   */
  setMark(editor) {
    this.markPos = this.markPos ? null : editor.getCursor();
    if (!this.markPos) editor.setCursor(editor.getCursor());
  }
  /**
   * カーソルを移動
   * マークが設定されている場合は選択範囲を拡張，そうでない場合は単純に移動
   */
  moveCursor(editor, newPos) {
    if (this.markPos) {
      editor.setSelection(this.markPos, newPos);
    } else {
      editor.setCursor(newPos);
    }
  }
  /**
   * 相対位置でカーソルを移動
   * @param lineDelta 行の移動量
   * @param chDelta 文字の移動量
   */
  moveByOffset(editor, lineDelta, chDelta) {
    const cursor = editor.getCursor();
    const newLine = cursor.line + lineDelta;
    const newCh = cursor.ch + chDelta;
    if (newLine < 0 || newLine >= editor.lineCount()) return;
    const lineLength = editor.getLine(newLine).length;
    const clampedCh = Math.max(0, Math.min(newCh, lineLength));
    this.moveCursor(editor, { line: newLine, ch: clampedCh });
  }
  /**
   * 行の先頭または末尾に移動
   * @param position 'beginning' または 'end'
   */
  moveToLinePosition(editor, position) {
    const cursor = editor.getCursor();
    const ch = position === "beginning" ? 0 : editor.getLine(cursor.line).length;
    this.moveCursor(editor, { line: cursor.line, ch });
  }
  /**
   * マーク位置から現在位置までのテキストを削除してクリップボードにコピー
   */
  async killRegion(editor) {
    if (!this.markPos) return;
    const text = editor.getRange(this.markPos, editor.getCursor());
    await navigator.clipboard.writeText(text);
    editor.replaceRange("", this.markPos, editor.getCursor());
    this.markPos = null;
  }
  /**
   * 現在位置から行末までのテキストを削除してクリップボードにコピー
   */
  async killLine(editor) {
    const cursor = editor.getCursor();
    const lineEnd = { line: cursor.line, ch: editor.getLine(cursor.line).length };
    const text = editor.getRange(cursor, lineEnd);
    await navigator.clipboard.writeText(text);
    editor.replaceRange("", cursor, lineEnd);
  }
  /**
   * クリップボードのテキストを現在位置に貼り付け
   */
  async yank(editor) {
    const text = await navigator.clipboard.readText();
    editor.replaceSelection(text);
  }
  /**
  * マークをクリア
  */
  clearMark(editor) {
    this.markPos = null;
    editor.setCursor(editor.getCursor());
  }
  /**
  * バッファの先頭または末尾に移動
  * @param position 'beginning' または 'end'
  */
  moveToBufferPosition(editor, position) {
    if (position === "beginning") {
      this.moveCursor(editor, { line: 0, ch: 0 });
    } else {
      const lastLine = editor.lineCount() - 1;
      const lastCh = editor.getLine(lastLine).length;
      this.moveCursor(editor, { line: lastLine, ch: lastCh });
    }
  }
};

// main.ts
var EmacsKeybindingsPlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.registerEditorExtension(searchPlugin);
    this.searchManager = new SearchManager(this);
    this.markManager = new MarkManager();
    this.addCommand({
      id: "beginning-of-buffer",
      name: "Beginning of buffer",
      hotkeys: [{ modifiers: ["Alt"], key: "<" }],
      editorCallback: (editor) => {
        this.markManager.moveToBufferPosition(editor, "beginning");
      }
    });
    this.addCommand({
      id: "end-of-buffer",
      name: "End of buffer",
      hotkeys: [{ modifiers: ["Alt"], key: ">" }],
      editorCallback: (editor) => {
        this.markManager.moveToBufferPosition(editor, "end");
      }
    });
    this.addCommand({
      id: "keyboard-quit",
      name: "Keyboard quit",
      hotkeys: [{ modifiers: ["Ctrl"], key: "g" }],
      editorCallback: (editor) => {
        if (this.searchManager.isSearchActive()) {
          this.searchManager.cancelSearch(editor);
        } else {
          this.markManager.clearMark(editor);
        }
      }
    });
    this.addCommand({
      id: "set-mark",
      name: "Set mark",
      editorCallback: (editor) => {
        this.markManager.setMark(editor);
      }
    });
    const movements = [
      { id: "forward-char", name: "Forward char", line: 0, ch: 1 },
      { id: "backward-char", name: "Backward char", line: 0, ch: -1 },
      { id: "next-line", name: "Next line", line: 1, ch: 0 },
      { id: "previous-line", name: "Previous line", line: -1, ch: 0 }
    ];
    movements.forEach((m) => {
      this.addCommand({
        id: m.id,
        name: m.name,
        editorCallback: (editor) => {
          this.markManager.moveByOffset(editor, m.line, m.ch);
        }
      });
    });
    this.addCommand({
      id: "beginning-of-line",
      name: "Beginning of line",
      editorCallback: (editor) => {
        this.markManager.moveToLinePosition(editor, "beginning");
      }
    });
    this.addCommand({
      id: "end-of-line",
      name: "End of line",
      editorCallback: (editor) => {
        this.markManager.moveToLinePosition(editor, "end");
      }
    });
    this.addCommand({
      id: "kill-region",
      name: "Kill region",
      editorCallback: async (editor) => {
        await this.markManager.killRegion(editor);
      }
    });
    this.addCommand({
      id: "kill-line",
      name: "Kill line",
      editorCallback: async (editor) => {
        await this.markManager.killLine(editor);
      }
    });
    this.addCommand({
      id: "yank",
      name: "Yank",
      editorCallback: async (editor) => {
        await this.markManager.yank(editor);
      }
    });
    this.addCommand({
      id: "isearch-forward",
      name: "Isearch forward",
      hotkeys: [{ modifiers: ["Ctrl"], key: "s" }],
      editorCallback: (editor) => {
        if (this.searchManager.isSearchActive()) {
          this.searchManager.searchNext(editor, "forward");
        } else {
          this.searchManager.startSearch(editor, "forward");
        }
      }
    });
    this.addCommand({
      id: "isearch-backward",
      name: "Isearch backward",
      hotkeys: [{ modifiers: ["Ctrl"], key: "r" }],
      editorCallback: (editor) => {
        if (this.searchManager.isSearchActive()) {
          this.searchManager.searchNext(editor, "backward");
        } else {
          this.searchManager.startSearch(editor, "backward");
        }
      }
    });
  }
};
