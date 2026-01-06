// search.ts
import { Editor, EditorPosition, Plugin } from 'obsidian';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';

/**
 * 検索状態を管理するインターフェース
 */
interface SearchState {
  active: boolean;
  direction: 'forward' | 'backward';
  startPos: EditorPosition | null;
  currentIndex: number;
  matches: { from: number; to: number }[];
}

/**
 * 検索状態更新用のStateEffect
 */
const updateSearchState = StateEffect.define<SearchState>();

/**
 * 検索状態を保持するStateField
 */
const searchStateField = StateField.define<SearchState>({
  create: () => ({
    active: false,
    direction: 'forward',
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

/**
 * 検索ハイライト用のDecoration
 */
const searchHighlight = Decoration.mark({ class: 'search-highlight' });
const currentHighlight = Decoration.mark({ class: 'search-highlight-current' });

/**
 * 検索ハイライトを提供するViewPlugin
 */
const searchHighlightPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.transactions.some(tr => tr.effects.some(e => e.is(updateSearchState)))) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: EditorView): DecorationSet {
    const state = view.state.field(searchStateField);
    if (!state.active || state.matches.length === 0) {
      return Decoration.none;
    }

    const builder = new RangeSetBuilder<Decoration>();
    state.matches.forEach((match, index) => {
      const deco = index === state.currentIndex ? currentHighlight : searchHighlight;
      builder.add(match.from, match.to, deco);
    });
    return builder.finish();
  }
}, {
  decorations: v => v.decorations
});

/**
 * 検索プラグインのエクスポート
 */
export const searchPlugin = [searchStateField, searchHighlightPlugin];

/**
 * インクリメンタル検索を管理するクラス
 */
export class SearchManager {
  private searchState: SearchState = {
    active: false,
    direction: 'forward',
    startPos: null,
    currentIndex: -1,
    matches: []
  };
  private minibufferEl: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private currentEditor: Editor | null = null;

  constructor(private plugin: Plugin) { }

  /**
   * 検索が有効かどうか
   */
  isSearchActive(): boolean {
    return this.searchState.active;
  }

  /**
   * インクリメンタル検索を開始
   */
  startSearch(editor: Editor, direction: 'forward' | 'backward') {
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
  private updateEditorState(editor: Editor) {
    const view = (editor as any).cm as EditorView;
    view.dispatch({
      effects: updateSearchState.of(this.searchState)
    });
  }

  /**
   * ミニバッファを作成
   */
  private createMinibuffer(editor: Editor) {
    const editorEl = (editor as any).cm.dom as HTMLElement;
    const container = editorEl.closest('.workspace-leaf-content') as HTMLElement;

    if (!container) return;

    this.minibufferEl = document.createElement('div');
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

    const label = document.createElement('span');
    label.textContent = this.searchState.direction === 'forward' ? 'I-search:' : 'I-search backward:';
    label.style.cssText = `
      font-family: var(--font-monospace);
      font-size: 12px;
      white-space: nowrap;
    `;

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
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
  private attachInputHandlers(editor: Editor) {
    if (!this.inputEl) return;

    this.plugin.registerDomEvent(this.inputEl, 'input', () => {
      this.performSearch(editor, this.inputEl!.value);
    });

    this.plugin.registerDomEvent(this.inputEl, 'keydown', (e: KeyboardEvent) => {
      if (e.isComposing) return;

      if (e.key === 'Escape') {
        this.exitSearch(editor, true);
        e.preventDefault();
      } else if (e.key === 'Enter') {
        this.exitSearch(editor, false);
        e.preventDefault();
      }
    });
  }

  /**
   * 検索を実行
   */
  private performSearch(editor: Editor, query: string) {
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
    const matches: { from: number; to: number }[] = [];
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
      this.updateLabel('(failed) I-search:');
    }

    this.updateEditorState(editor);
  }

  /**
   * 最も近いマッチを検索
   */
  private findNearestMatch(matches: { from: number; to: number }[], startOffset: number, direction: 'forward' | 'backward'): number {
    if (direction === 'forward') {
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
  searchNext(editor: Editor, direction: 'forward' | 'backward') {
    if (!this.searchState.active) return;

    if (this.searchState.matches.length === 0) return;

    if (direction === 'forward') {
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
  private moveToCurrentMatch(editor: Editor) {
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
  private updateLabel(text: string) {
    const label = this.minibufferEl?.querySelector('span');
    if (label) label.textContent = text;
  }

  /**
   * 検索を終了
   */
  private exitSearch(editor: Editor, restore: boolean) {
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

    // エディタにフォーカスを戻す
    const view = (editor as any).cm as EditorView;
    view.focus();
  }
  /**
  * 検索をキャンセル
  */
  cancelSearch(editor: Editor) {
    if (!this.searchState.active) return;
    this.exitSearch(editor, true);
  }
}