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
   * Copy text from the mark to the cursor to the clipboard (without deleting).
   */
  async copyRegion(editor: Editor) {
    if (!this.markPos) return;

    const text = editor.getRange(this.markPos, editor.getCursor());
    await navigator.clipboard.writeText(text);
    this.markPos = null;
    editor.setCursor(editor.getCursor());
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
      // Cursor is at the end of the line or on an empty line
      // Delete the newline character to join with the next line
      if (cursor.line < editor.lineCount() - 1) {
        end = { line: cursor.line + 1, ch: 0 };
        text = '\n';
      } else {
        // Last line, nothing to delete
        return;
      }
    } else {
      // There is content from cursor to end of line
      // Delete only the content (not the newline)
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

  /**
   * Move forward to the end of the next word.
   * Word boundary: whitespace and underscore.
   */
  forwardWord(editor: Editor) {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const restOfLine = line.substring(cursor.ch);

    // Word pattern: non-whitespace and non-underscore characters
    const wordPattern = /[^\s_]+/g;

    // Skip any leading delimiters (whitespace or underscore)
    const skipPattern = /[\s_]+/g;
    skipPattern.lastIndex = 0;
    const skipMatch = skipPattern.exec(restOfLine);
    let searchStart = 0;
    if (skipMatch && skipMatch.index === 0) {
      searchStart = skipMatch[0].length;
    }

    // Find the next word
    wordPattern.lastIndex = searchStart;
    const match = wordPattern.exec(restOfLine);

    if (match) {
      // Move to the end of the word
      const newCh = cursor.ch + match.index + match[0].length;
      this.moveCursor(editor, { line: cursor.line, ch: newCh });
    } else {
      // No word found on current line, move to the next line
      if (cursor.line < editor.lineCount() - 1) {
        this.moveCursor(editor, { line: cursor.line + 1, ch: 0 });
        // Recursively find the next word
        this.forwardWord(editor);
      }
    }
  }

  /**
   * Move backward to the beginning of the previous word.
   * Word boundary: whitespace and underscore.
   */
  backwardWord(editor: Editor) {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const beforeCursor = line.substring(0, cursor.ch);

    // Word pattern: non-whitespace and non-underscore characters
    const wordPattern = /[^\s_]+/g;

    // Find all words before the cursor
    const words: Array<{ index: number; length: number }> = [];
    let match;
    while ((match = wordPattern.exec(beforeCursor)) !== null) {
      words.push({ index: match.index, length: match[0].length });
    }

    if (words.length > 0) {
      // Check if cursor is inside a word
      const lastWord = words[words.length - 1];
      const lastWordEnd = lastWord.index + lastWord.length;

      if (cursor.ch > lastWordEnd) {
        // Cursor is after the last word (in whitespace), move to its beginning
        this.moveCursor(editor, { line: cursor.line, ch: lastWord.index });
      } else if (cursor.ch === lastWord.index && words.length > 1) {
        // Cursor is at the beginning of a word, move to the previous word's beginning
        const prevWord = words[words.length - 2];
        this.moveCursor(editor, { line: cursor.line, ch: prevWord.index });
      } else {
        // Cursor is inside or at the end of a word, move to its beginning
        this.moveCursor(editor, { line: cursor.line, ch: lastWord.index });
      }
    } else {
      // No word found on current line, move to the previous line
      if (cursor.line > 0) {
        const prevLine = editor.getLine(cursor.line - 1);
        this.moveCursor(editor, { line: cursor.line - 1, ch: prevLine.length });
        // Recursively find the previous word
        this.backwardWord(editor);
      }
    }
  }
}
