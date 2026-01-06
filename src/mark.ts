import { Editor, EditorPosition } from 'obsidian';

/**
 * Class responsible for mark management and cursor movement.
 * Implements Emacs mark, cursor movement, and kill/yank operations.
 */
export class MarkManager {
  private markPos: EditorPosition | null = null;
  private getWordBoundaryChars: () => string;

  constructor(getWordBoundaryChars: () => string) {
    this.getWordBoundaryChars = getWordBoundaryChars;
  }

  /**
   * Convert boundary characters string into a Set.
   * Supports escaped "\t" and "\n" sequences.
   */
  private getBoundarySet(): Set<string> {
    const s = this.getWordBoundaryChars().replace(/\\t/g, '\t').replace(/\\n/g, '\n');
    return new Set([...s]);
  }

  /**
   * Determine whether a character is considered part of a word.
   * Word char = not in boundary set.
   */
  private isWordChar(ch: string, boundary: Set<string>): boolean {
    return ch.length === 1 && !boundary.has(ch);
  }

  /**
   * Set the mark to the current position.
   */
  setMark(editor: Editor) {
    this.markPos = editor.getCursor();
  }

  /**
   * Clear the mark and deactivate selection.
   */
  clearMark(editor: Editor) {
    this.markPos = null;
    const cursor = editor.getCursor();
    editor.setSelection(cursor, cursor);
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

    if (newLine < 0 || newLine >= editor.lineCount()) return;

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

  /**
   * Copy text from the mark to the cursor to the clipboard (without deleting).
   */
  async copyRegion(editor: Editor) {
    if (!this.markPos) return;

    const text = editor.getRange(this.markPos, editor.getCursor());
    await navigator.clipboard.writeText(text);
    this.clearMark(editor);
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
   * If the cursor is at the end of the line or on an empty line, delete the newline.
   */
  async killLine(editor: Editor) {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const restOfLine = line.substring(cursor.ch);

    let text: string;
    let end: EditorPosition;

    if (restOfLine.length === 0) {
      if (cursor.line < editor.lineCount() - 1) {
        end = { line: cursor.line + 1, ch: 0 };
        text = '\n';
      } else {
        return;
      }
    } else {
      end = { line: cursor.line, ch: line.length };
      text = restOfLine;
    }

    await navigator.clipboard.writeText(text);
    editor.replaceRange('', cursor, end);
  }

  /**
   * Paste clipboard text at the current position.
   */
  async yank(editor: Editor) {
    const text = await navigator.clipboard.readText();
    editor.replaceSelection(text);
  }

  /**
   * Find the end position of the next word from the given position.
   * Word char = not in boundary set.
   */
  private findNextWordEnd(editor: Editor, from: EditorPosition): EditorPosition | null {
    const boundary = this.getBoundarySet();

    let line = from.line;
    let ch = from.ch;

    while (line < editor.lineCount()) {
      const text = editor.getLine(line);

      // If already inside a word, go to its end.
      if (ch < text.length && this.isWordChar(text[ch], boundary)) {
        while (ch < text.length && this.isWordChar(text[ch], boundary)) ch++;
        return { line, ch };
      }

      // Skip boundary chars to the start of the next word.
      while (ch < text.length && !this.isWordChar(text[ch], boundary)) ch++;

      // Found next word: move to its end.
      if (ch < text.length) {
        while (ch < text.length && this.isWordChar(text[ch], boundary)) ch++;
        return { line, ch };
      }

      // Next line.
      line++;
      ch = 0;
    }

    return null;
  }

  /**
   * Find the start position of the previous word from the given position.
   * Word char = not in boundary set.
   */
  private findPrevWordStart(editor: Editor, from: EditorPosition): EditorPosition | null {
    const boundary = this.getBoundarySet();

    let line = from.line;
    let ch = from.ch;

    while (line >= 0) {
      const text = editor.getLine(line);

      // If at beginning of line, jump to previous line end.
      if (ch === 0) {
        if (line === 0) return null;
        line--;
        ch = editor.getLine(line).length;
        continue;
      }

      // Step left once so "at word start" goes to previous word.
      ch = Math.min(ch, text.length);
      ch--;

      // Skip boundary chars to the left.
      while (ch >= 0 && !this.isWordChar(text[ch], boundary)) ch--;

      // Skip word chars to the left to reach the start.
      while (ch >= 0 && this.isWordChar(text[ch], boundary)) ch--;

      // Start is one char to the right.
      const start = ch + 1;
      if (start >= 0 && start <= text.length) {
        // Ensure we actually found a word start on this line.
        if (start < text.length && this.isWordChar(text[start], boundary)) {
          return { line, ch: start };
        }
      }

      // Previous line.
      if (line === 0) return null;
      line--;
      ch = editor.getLine(line).length;
    }

    return null;
  }

  /**
   * Move forward to the end of the next word.
   */
  forwardWord(editor: Editor) {
    const cursor = editor.getCursor();
    const endPos = this.findNextWordEnd(editor, cursor);
    if (endPos) {
      this.moveCursor(editor, endPos);
    }
  }

  /**
   * Move backward to the beginning of the previous word.
   */
  backwardWord(editor: Editor) {
    const cursor = editor.getCursor();
    const startPos = this.findPrevWordStart(editor, cursor);
    if (startPos) {
      this.moveCursor(editor, startPos);
    }
  }

  /**
   * Delete from cursor to the end of the next word and copy to the clipboard.
   */
  async killWord(editor: Editor) {
    const startCursor = editor.getCursor();
    const endCursor = this.findNextWordEnd(editor, startCursor);
    if (!endCursor) return;

    const text = editor.getRange(startCursor, endCursor);
    await navigator.clipboard.writeText(text);
    editor.replaceRange('', startCursor, endCursor);
  }

  /**
   * Delete from cursor to the beginning of the previous word and copy to the clipboard.
   */
  async backwardKillWord(editor: Editor) {
    const endCursor = editor.getCursor();
    const startCursor = this.findPrevWordStart(editor, endCursor);
    if (!startCursor) return;

    const text = editor.getRange(startCursor, endCursor);
    await navigator.clipboard.writeText(text);
    editor.replaceRange('', startCursor, endCursor);
  }
}
