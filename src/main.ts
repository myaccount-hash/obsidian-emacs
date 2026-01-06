// main.ts
import { Plugin, Editor } from 'obsidian';
import { SearchManager, searchPlugin } from './search';
import { MarkManager } from './mark';

export default class EmacsKeybindingsPlugin extends Plugin {
  private searchManager!: SearchManager;
  private markManager!: MarkManager;

  async onload() {
    this.registerEditorExtension(searchPlugin);

    this.searchManager = new SearchManager(this);
    this.markManager = new MarkManager();

    // Added in main.ts.
    this.addCommand({
      id: 'beginning-of-buffer',
      name: 'Beginning of buffer',
      hotkeys: [{ modifiers: ['Alt'], key: '<' }],
      editorCallback: (editor: Editor) => {
        this.markManager.moveToBufferPosition(editor, 'beginning');
      }
    });

    this.addCommand({
      id: 'end-of-buffer',
      name: 'End of buffer',
      hotkeys: [{ modifiers: ['Alt'], key: '>' }],
      editorCallback: (editor: Editor) => {
        this.markManager.moveToBufferPosition(editor, 'end');
      }
    });

    this.addCommand({
      id: 'keyboard-quit',
      name: 'Keyboard quit',
      hotkeys: [{ modifiers: ['Ctrl'], key: 'g' }],
      editorCallback: (editor: Editor) => {
        if (this.searchManager.isSearchActive()) {
          this.searchManager.cancelSearch(editor);
        } else {
          this.markManager.clearMark(editor);
        }
      }
    });

    this.addCommand({
      id: 'set-mark',
      name: 'Set mark',
      editorCallback: (editor: Editor) => {
        this.markManager.setMark(editor);
      }
    });

    const movements = [
      { id: 'forward-char', name: 'Forward char', line: 0, ch: 1 },
      { id: 'backward-char', name: 'Backward char', line: 0, ch: -1 },
      { id: 'next-line', name: 'Next line', line: 1, ch: 0 },
      { id: 'previous-line', name: 'Previous line', line: -1, ch: 0 },
    ];

    movements.forEach(m => {
      this.addCommand({
        id: m.id,
        name: m.name,
        editorCallback: (editor: Editor) => {
          this.markManager.moveByOffset(editor, m.line, m.ch);
        }
      });
    });

    this.addCommand({
      id: 'beginning-of-line',
      name: 'Beginning of line',
      editorCallback: (editor: Editor) => {
        this.markManager.moveToLinePosition(editor, 'beginning');
      }
    });

    this.addCommand({
      id: 'end-of-line',
      name: 'End of line',
      editorCallback: (editor: Editor) => {
        this.markManager.moveToLinePosition(editor, 'end');
      }
    });

    this.addCommand({
      id: 'kill-region',
      name: 'Kill region',
      editorCallback: async (editor: Editor) => {
        await this.markManager.killRegion(editor);
      }
    });

    this.addCommand({
      id: 'kill-line',
      name: 'Kill line',
      editorCallback: async (editor: Editor) => {
        await this.markManager.killLine(editor);
      }
    });

    this.addCommand({
      id: 'yank',
      name: 'Yank',
      editorCallback: async (editor: Editor) => {
        await this.markManager.yank(editor);
      }
    });

    this.addCommand({
      id: 'isearch-forward',
      name: 'Isearch forward',
      hotkeys: [{ modifiers: ['Ctrl'], key: 's' }],
      editorCallback: (editor: Editor) => {
        if (this.searchManager.isSearchActive()) {
          this.searchManager.searchNext(editor, 'forward');
        } else {
          this.searchManager.startSearch(editor, 'forward');
        }
      }
    });

    this.addCommand({
      id: 'isearch-backward',
      name: 'Isearch backward',
      hotkeys: [{ modifiers: ['Ctrl'], key: 'r' }],
      editorCallback: (editor: Editor) => {
        if (this.searchManager.isSearchActive()) {
          this.searchManager.searchNext(editor, 'backward');
        } else {
          this.searchManager.startSearch(editor, 'backward');
        }
      }
    });
  }
}
