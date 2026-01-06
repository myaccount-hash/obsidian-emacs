import { Editor, EditorPosition } from 'obsidian';

/**
 * マーク管理とカーソル移動を担当するクラス
 * Emacsのマーク機能，カーソル移動，Kill/Yank操作を実装
 */
export class MarkManager {
  private markPos: EditorPosition | null = null;

  /**
   * マークを設定またはクリア
   * マークが設定されていない場合は現在位置に設定，設定されている場合はクリア
   */
  setMark(editor: Editor) {
    this.markPos = this.markPos ? null : editor.getCursor();
    if (!this.markPos) editor.setCursor(editor.getCursor());
  }

  /**
   * カーソルを移動
   * マークが設定されている場合は選択範囲を拡張，そうでない場合は単純に移動
   */
  moveCursor(editor: Editor, newPos: EditorPosition) {
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
  moveByOffset(editor: Editor, lineDelta: number, chDelta: number) {
    const cursor = editor.getCursor();
    const newLine = cursor.line + lineDelta;
    const newCh = cursor.ch + chDelta;

    // 範囲外チェック
    if (newLine < 0 || newLine >= editor.lineCount()) return;

    // 行の長さに収まるように調整
    const lineLength = editor.getLine(newLine).length;
    const clampedCh = Math.max(0, Math.min(newCh, lineLength));

    this.moveCursor(editor, { line: newLine, ch: clampedCh });
  }

  /**
   * 行の先頭または末尾に移動
   * @param position 'beginning' または 'end'
   */
  moveToLinePosition(editor: Editor, position: 'beginning' | 'end') {
    const cursor = editor.getCursor();
    const ch = position === 'beginning' ? 0 : editor.getLine(cursor.line).length;
    this.moveCursor(editor, { line: cursor.line, ch });
  }

  /**
   * マーク位置から現在位置までのテキストを削除してクリップボードにコピー
   */
  async killRegion(editor: Editor) {
    if (!this.markPos) return;

    const text = editor.getRange(this.markPos, editor.getCursor());
    await navigator.clipboard.writeText(text);
    editor.replaceRange('', this.markPos, editor.getCursor());
    this.markPos = null;
  }

  /**
   * 現在位置から行末までのテキストを削除してクリップボードにコピー
   */
  async killLine(editor: Editor) {
    const cursor = editor.getCursor();
    const lineEnd = { line: cursor.line, ch: editor.getLine(cursor.line).length };
    const text = editor.getRange(cursor, lineEnd);
    await navigator.clipboard.writeText(text);
    editor.replaceRange('', cursor, lineEnd);
  }

  /**
   * クリップボードのテキストを現在位置に貼り付け
   */
  async yank(editor: Editor) {
    const text = await navigator.clipboard.readText();
    editor.replaceSelection(text);
  }
  /**
 * マークをクリア
 */
  clearMark(editor: Editor) {
    this.markPos = null;
    editor.setCursor(editor.getCursor());
  }
  /**
 * バッファの先頭または末尾に移動
 * @param position 'beginning' または 'end'
 */
  moveToBufferPosition(editor: Editor, position: 'beginning' | 'end') {
    if (position === 'beginning') {
      this.moveCursor(editor, { line: 0, ch: 0 });
    } else {
      const lastLine = editor.lineCount() - 1;
      const lastCh = editor.getLine(lastLine).length;
      this.moveCursor(editor, { line: lastLine, ch: lastCh });
    }
  }
}
