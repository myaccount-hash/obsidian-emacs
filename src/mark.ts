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
   * Get the word pattern regex based on boundary characters.
   * Word pattern matches characters that are NOT boundary characters.
   */
  private getWordPattern(): RegExp {
    // Dynamically get current boundary characters
    const boundaryChars = this.getWordBoundaryChars();
    // Replace \t and \n with actual tab and newline first
    const processed = boundaryChars.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
    // Escape special regex characters (- at start to avoid range interpretation, ] near start)
    const escaped = processed.replace(/[-[\]\\{}()*+?.,^$|#]/g, '\\$&');
    return new RegExp(`[^${escaped}]+`, 'g');
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
   * Find the end position of the next word from the given position.
   * Word boundary: whitespace and underscore.
   * @param editor The editor instance.
   * @param from The starting position.
   * @returns The end position of the next word, or null if not found.
   */
  private findNextWordEnd(editor: Editor, from: EditorPosition): EditorPosition | null {
    const line = editor.getLine(from.line);
    const restOfLine = line.substring(from.ch);

    const wordPattern = this.getWordPattern();
    const match = wordPattern.exec(restOfLine);

    if (match) {
      return {
        line: from.line,
        ch: from.ch + match.index + match[0].length,
      };
    }

    if (from.line < editor.lineCount() - 1) {
      return this.findNextWordEnd(editor, { line: from.line + 1, ch: 0 });
    }

    return null;
  }

  /**
   * Find the start position of the previous word from the given position.
   * Word boundary: whitespace and underscore.
   * @param editor The editor instance.
   * @param from The starting position.
   * @returns The start position of the previous word, or null if not found.
   */
  private findPrevWordStart(editor: Editor, from: EditorPosition): EditorPosition | null {
    const line = editor.getLine(from.line);
    const beforeCursor = line.substring(0, from.ch);

    const wordPattern = this.getWordPattern();

    const words: Array<{ index: number; length: number }> = [];
    let match;
    while ((match = wordPattern.exec(beforeCursor)) !== null) {
      words.push({ index: match.index, length: match[0].length });
    }

    if (words.length > 0) {
      const lastWord = words[words.length - 1];
      const lastWordEnd = lastWord.index + lastWord.length;

      if (from.ch > lastWordEnd) {
        return { line: from.line, ch: lastWord.index };
      } else if (from.ch === lastWord.index && words.length > 1) {
        const prevWord = words[words.length - 2];
        return { line: from.line, ch: prevWord.index };
      } else {
        return { line: from.line, ch: lastWord.index };
      }
    }

    if (from.line > 0) {
      const prevLine = editor.getLine(from.line - 1);
      return this.findPrevWordStart(editor, {
        line: from.line - 1,
        ch: prevLine.length,
      });
    }

    return null;
  }

  /**
   * Move forward to the end of the next word.
   * Word boundary: whitespace and underscore.
   */
  forwardWord(editor: Editor) {
    const cursor = editor.getCursor();
    const endPos = this.findNextWordEnd(editor, cursor);
    if (endPos) {
      this.moveCursor(editor, endPos);
    }
  }

  /**
   * Delete from cursor to the end of the next word.
   * Word boundary: whitespace and underscore.
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
   * Delete from cursor to the beginning of the previous word.
   * Word boundary: whitespace and underscore.
   */
  async backwardKillWord(editor: Editor) {
    const endCursor = editor.getCursor();
    const startCursor = this.findPrevWordStart(editor, endCursor);
    if (!startCursor) return;

    const text = editor.getRange(startCursor, endCursor);
    await navigator.clipboard.writeText(text);
    editor.replaceRange('', startCursor, endCursor);
  }

  /**
   * Move backward to the beginning of the previous word.
   * Word boundary: whitespace and underscore.
   */
  backwardWord(editor: Editor) {
    const cursor = editor.getCursor();
    const startPos = this.findPrevWordStart(editor, cursor);
    if (startPos) {
      this.moveCursor(editor, startPos);
    }
  }
}
