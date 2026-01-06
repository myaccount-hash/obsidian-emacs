import { Editor, EditorPosition } from 'obsidian';

/**
 * Class responsible for mark management and cursor movement.
 * Implements Emacs mark, cursor movement, and kill/yank operations.
 */
export class MarkManager {
  private markPos: EditorPosition | null = null;

  /**
   * Set or clear the mark.
   * If the mark is not set, set it to the current position; otherwise clear it.
   */
  setMark(editor: Editor) {
    this.markPos = this.markPos ? null : editor.getCursor();
    if (!this.markPos) editor.setCursor(editor.getCursor());
  }

  /**
   * Move the cursor.
   * If the mark is set, extend the selection; otherwise just move.
   */
  moveCursor(editor: Editor, newPos: EditorPosition) {
    if (this.markPos) {
      editor.setSelection(this.markPos, newPos);
    } else {
      editor.setCursor(newPos);
    }
  }

  /**
   * Move the cursor by a relative offset.
   * @param lineDelta Line delta.
   * @param chDelta Character delta.
   */
  moveByOffset(editor: Editor, lineDelta: number, chDelta: number) {
    const cursor = editor.getCursor();
    const newLine = cursor.line + lineDelta;
    const newCh = cursor.ch + chDelta;

    // Out-of-range guard.
    if (newLine < 0 || newLine >= editor.lineCount()) return;

    // Clamp to line length.
    const lineLength = editor.getLine(newLine).length;
    const clampedCh = Math.max(0, Math.min(newCh, lineLength));

    this.moveCursor(editor, { line: newLine, ch: clampedCh });
  }

  /**
   * Move to the beginning or end of the line.
   * @param position 'beginning' or 'end'.
   */
  moveToLinePosition(editor: Editor, position: 'beginning' | 'end') {
    const cursor = editor.getCursor();
    const ch = position === 'beginning' ? 0 : editor.getLine(cursor.line).length;
    this.moveCursor(editor, { line: cursor.line, ch });
  }

  /**
   * Delete text from the mark to the cursor and copy to the clipboard.
   */
  async killRegion(editor: Editor) {
    if (!this.markPos) return;

    const text = editor.getRange(this.markPos, editor.getCursor());
    await navigator.clipboard.writeText(text);
    editor.replaceRange('', this.markPos, editor.getCursor());
    this.markPos = null;
  }

  /**
   * Delete text from the cursor to the end of the line and copy to the clipboard.
   */
  async killLine(editor: Editor) {
    const cursor = editor.getCursor();
    const lineEnd = { line: cursor.line, ch: editor.getLine(cursor.line).length };
    const text = editor.getRange(cursor, lineEnd);
    await navigator.clipboard.writeText(text);
    editor.replaceRange('', cursor, lineEnd);
  }

  /**
   * Paste clipboard text at the current position.
   */
  async yank(editor: Editor) {
    const text = await navigator.clipboard.readText();
    editor.replaceSelection(text);
  }
  /**
   * Clear the mark.
   */
  clearMark(editor: Editor) {
    this.markPos = null;
    editor.setCursor(editor.getCursor());
  }
  /**
   * Move to the beginning or end of the buffer.
   * @param position 'beginning' or 'end'.
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
