// src/search.ts
import { Editor, EditorPosition, Plugin } from 'obsidian';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';

/**
 * Extended Editor interface with CodeMirror instance.
 */
interface EditorWithCM extends Editor {
  cm: EditorView;
}

/**
 * Interface for managing search state.
 */
interface SearchState {
  active: boolean;
  direction: 'forward' | 'backward';
  startPos: EditorPosition | null;
  currentIndex: number;
  matches: { from: number; to: number }[];
}

/**
 * StateEffect for updating search state.
 */
const updateSearchState = StateEffect.define<SearchState>();

/**
 * StateField that stores search state.
 */
const searchStateField = StateField.define<SearchState>({
  create: () => ({
    active: false,
    direction: 'forward',
    startPos: null,
    currentIndex: -1,
    matches: [],
  }),
  update: (state, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(updateSearchState)) {
        return effect.value;
      }
    }
    return state;
  },
});

/**
 * Decorations for search highlights.
 */
const searchHighlight = Decoration.mark({ class: 'search-highlight' });
const currentHighlight = Decoration.mark({ class: 'search-highlight-current' });

/**
 * ViewPlugin that provides search highlights.
 */
const searchHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.transactions.some(tr => tr.effects.some(e => e.is(updateSearchState)))
      ) {
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
  },
  {
    decorations: v => v.decorations,
  }
);

/**
 * Search plugin export.
 */
export const searchPlugin = [searchStateField, searchHighlightPlugin];

/**
 * Class that manages incremental search.
 */
export class SearchManager {
  private searchState: SearchState = {
    active: false,
    direction: 'forward',
    startPos: null,
    currentIndex: -1,
    matches: [],
  };
  private minibufferEl: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;

  constructor(private plugin: Plugin) {}

  /**
   * Whether search is active.
   */
  isSearchActive(): boolean {
    return this.searchState.active;
  }

  /**
   * Start incremental search.
   */
  startSearch(editor: Editor, direction: 'forward' | 'backward') {
    this.searchState.active = true;
    this.searchState.direction = direction;
    this.searchState.startPos = editor.getCursor();
    this.searchState.currentIndex = -1;
    this.searchState.matches = [];

    this.updateEditorState(editor);
    this.createMinibuffer(editor);
  }

  /**
   * Update the editor search state.
   */
  private updateEditorState(editor: Editor) {
    const view = (editor as EditorWithCM).cm;
    view.dispatch({
      effects: updateSearchState.of(this.searchState),
    });
  }

  /**
   * Create the minibuffer.
   */
  private createMinibuffer(editor: Editor) {
    const editorEl = (editor as EditorWithCM).cm.dom;
    const container = editorEl.closest('.workspace-leaf-content');

    if (!container) return;

    this.minibufferEl = document.createElement('div');
    this.minibufferEl.className = 'emacs-minibuffer';

    const label = document.createElement('span');
    label.textContent =
      this.searchState.direction === 'forward' ? 'I-search:' : 'I-search backward:';
    label.className = 'emacs-minibuffer-label';

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'emacs-minibuffer-input';

    this.minibufferEl.appendChild(label);
    this.minibufferEl.appendChild(this.inputEl);
    container.appendChild(this.minibufferEl);

    this.inputEl.focus();
    this.attachInputHandlers(editor);
  }

  /**
   * Attach input handlers.
   */
  private attachInputHandlers(editor: Editor) {
    if (!this.inputEl) return;

    const inputEl = this.inputEl;
    this.plugin.registerDomEvent(inputEl, 'input', () => {
      this.performSearch(editor, inputEl.value);
    });

    this.plugin.registerDomEvent(inputEl, 'keydown', (e: KeyboardEvent) => {
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
   * Check if the query contains uppercase letters.
   */
  private hasUpperCase(str: string): boolean {
    return str !== str.toLowerCase();
  }

  /**
   * Perform a search.
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

    // Emacs-style smart case: case-insensitive if query is all lowercase
    const caseSensitive = this.hasUpperCase(query);

    if (caseSensitive) {
      // Case-sensitive search
      let index = 0;
      while ((index = content.indexOf(query, index)) !== -1) {
        matches.push({ from: index, to: index + query.length });
        index++;
      }
    } else {
      // Case-insensitive search
      const lowerContent = content.toLowerCase();
      const lowerQuery = query.toLowerCase();
      let index = 0;
      while ((index = lowerContent.indexOf(lowerQuery, index)) !== -1) {
        matches.push({ from: index, to: index + query.length });
        index++;
      }
    }

    this.searchState.matches = matches;

    if (matches.length > 0) {
      const startOffset = editor.posToOffset(this.searchState.startPos);
      this.searchState.currentIndex = this.findNearestMatch(
        matches,
        startOffset,
        this.searchState.direction
      );
      this.moveToCurrentMatch(editor);
    } else {
      this.searchState.currentIndex = -1;
      this.updateLabel('(failed) I-search:');
    }

    this.updateEditorState(editor);
  }

  /**
   * Find the nearest match.
   */
  private findNearestMatch(
    matches: { from: number; to: number }[],
    startOffset: number,
    direction: 'forward' | 'backward'
  ): number {
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
   * Move to the next match.
   */
  searchNext(editor: Editor, direction: 'forward' | 'backward') {
    if (!this.searchState.active) return;

    if (this.searchState.matches.length === 0) return;

    if (direction === 'forward') {
      this.searchState.currentIndex =
        (this.searchState.currentIndex + 1) % this.searchState.matches.length;
    } else {
      this.searchState.currentIndex =
        (this.searchState.currentIndex - 1 + this.searchState.matches.length) %
        this.searchState.matches.length;
    }

    this.moveToCurrentMatch(editor);
    this.updateEditorState(editor);
  }

  /**
   * Move to the current match.
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
   * Update the label.
   */
  private updateLabel(text: string) {
    const label = this.minibufferEl?.querySelector('span');
    if (label) label.textContent = text;
  }

  /**
   * Exit search.
   */
  private exitSearch(editor: Editor, restore: boolean) {
    if (restore && this.searchState.startPos) {
      editor.setCursor(this.searchState.startPos);
    } else if (!restore && this.searchState.currentIndex !== -1) {
      const match = this.searchState.matches[this.searchState.currentIndex];
      const pos = editor.offsetToPos(match.to);
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

    // Return focus to the editor.
    const view = (editor as EditorWithCM).cm;
    view.focus();
  }
  /**
   * Cancel search.
   */
  cancelSearch(editor: Editor) {
    if (!this.searchState.active) return;
    this.exitSearch(editor, true);
  }
}
