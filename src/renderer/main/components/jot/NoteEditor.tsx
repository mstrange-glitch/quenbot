import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { isMellonPhrase, playMellonSound } from './mellon';
import { MellonDoor } from './MellonDoor';

interface NoteEditorProps {
  content: string;
  locked: boolean;
  onChange: (content: string) => void;
  /** Increments each time the Quick Note hotkey asks for the cursor to be placed in the editor. */
  focusRequest?: number;
}

// Detect if text is likely markdown
function isMarkdown(text: string): boolean {
  if (!text) return false;
  const blockPatterns = [/^#{1,6}\s/m, /^```/m, /^>\s/m, /^(---|\*\*\*|___)\s*$/m];
  for (const p of blockPatterns) { if (p.test(text)) return true; }
  const inlinePatterns = [/\*\*[^*]+\*\*/, /`[^`]+`/, /\[.+?\]\(.+?\)/];
  let hits = 0;
  for (const p of inlinePatterns) { if (p.test(text)) hits++; }
  return hits >= 2;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMarkdown(text: string): string {
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '<em>$1</em>');
  text = text.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<em>$1</em>');
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  return text;
}

function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) { codeLines.push(escapeHtml(lines[i])); i++; }
      if (i < lines.length) i++;
      html.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) { html.push(`<h${headingMatch[1].length}>${inlineMarkdown(headingMatch[2])}</h${headingMatch[1].length}>`); i++; continue; }
    if (/^(---|\*\*\*|___)\s*$/.test(line.trim())) { html.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      html.push(`<blockquote><p>${inlineMarkdown(q.join(' '))}</p></blockquote>`);
      continue;
    }
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*+]\s/, '')); i++; }
      html.push(`<ul>${items.map(it => `<li>${inlineMarkdown(it)}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, '')); i++; }
      html.push(`<ol>${items.map(it => `<li>${inlineMarkdown(it)}</li>`).join('')}</ol>`);
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^#{1,6}\s/.test(lines[i]) && !/^[-*+]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !/^>\s/.test(lines[i]) && !lines[i].trimStart().startsWith('```') && !/^(---|\*\*\*|___)\s*$/.test(lines[i].trim())) {
      para.push(lines[i]); i++;
    }
    if (para.length > 0) html.push(`<p>${inlineMarkdown(para.join(' '))}</p>`);
  }
  return html.join('');
}

// Highest Quick Note focus request already handled. Module-level so it survives the
// editor remounting when the user switches notes.
let lastFocusRequest = 0;

export const NoteEditor: React.FC<NoteEditorProps> = ({ content, locked, onChange, focusRequest = 0 }) => {
  const [doorOpen, setDoorOpen] = useState(false);
  // useEditor reads its options once, so the key handler reaches current state through this ref.
  const openDoorRef = useRef(() => {});
  openDoorRef.current = () => {
    setDoorOpen(true);
    playMellonSound();
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Placeholder.configure({ placeholder: 'Jot your notes here...' }),
    ],
    content: content || '<p></p>',
    editable: !locked,
    editorProps: {
      attributes: { class: 'tiptap-editor', spellcheck: 'false' },
      // Runs before Enter splits the line, so it sees the line the user just finished typing.
      handleKeyDown: (view, event) => {
        if (event.key !== 'Enter' || event.isComposing || event.repeat || !view.editable) return false;
        const { empty, $from } = view.state.selection;
        const block = $from.parent;
        if (!empty || !block.isTextblock) return false;
        // A paragraph can hold several lines separated by Shift+Enter breaks; check only the caret's line.
        const breakAsNewline = (node: { type: { name: string } }) => (node.type.name === 'hardBreak' ? '\n' : '');
        const before = block.textBetween(0, $from.parentOffset, undefined, breakAsNewline);
        const after = block.textBetween($from.parentOffset, block.content.size, undefined, breakAsNewline);
        const caretAtLineEnd = after === '' || after.startsWith('\n');
        const line = before.slice(before.lastIndexOf('\n') + 1);
        if (caretAtLineEnd && isMellonPhrase(line)) openDoorRef.current();
        return false; // Enter still starts a new line as usual
      },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        // Image paste
        const imageItem = items.find(item => item.type.startsWith('image/'));
        if (imageItem) {
          event.preventDefault();
          const file = imageItem.getAsFile();
          if (!file) return true;
          const reader = new FileReader();
          reader.onload = (e) => {
            const base64 = e.target?.result as string;
            editor?.chain().focus().setImage({ src: base64 }).run();
          };
          reader.readAsDataURL(file);
          return true;
        }
        // Markdown paste
        const plainText = event.clipboardData?.getData('text/plain');
        if (plainText && isMarkdown(plainText)) {
          event.preventDefault();
          const html = markdownToHtml(plainText);
          editor?.chain().focus().insertContent(html).run();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor) {
      editor.setEditable(!locked);
    }
  }, [editor, locked]);

  // Quick Note hotkey: put the cursor at the end of the note.
  useEffect(() => {
    if (!editor || focusRequest <= lastFocusRequest) return;
    lastFocusRequest = focusRequest;
    editor.commands.focus('end');
  }, [editor, focusRequest]);

  const closeDoor = useCallback(() => {
    setDoorOpen(false);
    editor?.commands.focus();
  }, [editor]);

  return (
    <div className={`note-editor-wrapper${locked ? ' locked' : ''}`}>
      <EditorContent editor={editor} className="note-editor" />
      {doorOpen && <MellonDoor onClose={closeDoor} />}
    </div>
  );
};
