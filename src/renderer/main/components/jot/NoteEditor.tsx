import React, { useEffect, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';

interface NoteEditorProps {
  content: string;
  locked: boolean;
  onChange: (content: string) => void;
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

// mellon
const _g = [
  '   _             _,-----------._        ___',
  '  (_,.-      _,-\'_,-----------._`-._    _)_)',
  '     |     ,\'_,-\'  ___________  `-._`.',
  '    `\'   ,\',\'  _,-\'___________`-._  `.`.',
  '        ,\',\'  ,\'_,-\'     .     `-._`.  `.`.',
  '       /,\'  ,\',\'        >|<        `.`.  `.\\',
  '      //  ,\',\'      ><  ,^.  ><      `.`.  \\\\',
  '     //  /,\'      ><   / | \\   ><      `.\\  \\\\',
  '    //  //      ><    \\/\\^/\\/    ><      \\\\  \\\\',
  '   ;;  ;;              `---\'              ::  ::',
  '   ||  ||              (____              ||  ||',
  '  _||__||_            ,\'----.            _||__||_',
  ' (o.____.o)____        `---\'        ____(o.____.o)',
  '   |    | /,--.)                   (,--.\\  |    |',
  '   |    |((  -`___               ___`   ))|    |',
  '   |    | \\\\,\'\',  `.           .\'  .``.// |    |',
  '   |    |  // (___,\'.         .\'.___) \\\\  |    |',
  '  /|    | ;;))  ____) .     . (____  ((\\\\ |    |\\',
  '  \\|.__ | ||/ .\'.--.\\/(       `/,--.\'. \\;: | __,|;',
  '   |`-,`;.| :/ /,\'  `)-\'   `-(\'  `.\\  \\: |.;\',-\'|',
  '   |   `..  \' / \\__,\'         `.__/ \\  `  ,.\'   |',
  '   |    |,\\  /,                     ,\\  /,|    |',
  '   |    ||: : )          .          ( : :||    |',
  '  /|    |:; |/  .      ./|\\,      ,  \\| :;|    |\\',
  '  \\|.__ |/  :  ,/-    <--:-->    ,\\.  ;  \\| __,|;',
  '   |`-.``:   `\'/-.     \'\\|/`     ,-\\`;   ;\'\' ,-\'|',
  '   |   `..   ,\' `\'       \'       `  `.   ,.\'   |',
  '   |    ||  :                         :  ||    |',
  '   |    ||  |                         |  ||    |',
  '   |    ||  |                         |  ||    |',
  '   |    |\'  |            _            |  `|    |',
  '   |    |   |          \'|))           |   |    |',
  '   ;____:   `._        `\'           _,\'   ;____:',
  '  {______}     \\___________________/     {______}',
  '  |______|_______________________________|______|',
];

export const NoteEditor: React.FC<NoteEditorProps> = ({ content, locked, onChange }) => {
  const [doorOpen, setDoorOpen] = useState(false);

  const checkPassphrase = useCallback((html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const text = (tmp.textContent || '').trim();
    if (text === 'Speak friend, and') {
      setDoorOpen(true);
      setTimeout(() => setDoorOpen(false), 8000);
    }
  }, []);

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

  // Listen for Enter key to check passphrase
  useEffect(() => {
    if (!editor) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        checkPassphrase(editor.getHTML());
      }
    };
    const el = document.querySelector('.note-editor');
    if (el) {
      el.addEventListener('keydown', handleKey as EventListener);
      return () => el.removeEventListener('keydown', handleKey as EventListener);
    }
  }, [editor, checkPassphrase]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!locked);
    }
  }, [editor, locked]);

  return (
    <div className={`note-editor-wrapper${locked ? ' locked' : ''}`}>
      <EditorContent editor={editor} className="note-editor" />
      {doorOpen && (
        <div className="mellon-overlay" onClick={() => setDoorOpen(false)}>
          <pre className="mellon-art" ref={(el) => {
            if (!el) return;
            // Auto-scale to fit window regardless of UI text size
            const maxW = window.innerWidth * 0.88;
            const maxH = window.innerHeight * 0.7;
            // The art is 51 chars wide, 35 lines tall at the chosen font
            for (let sz = 14; sz >= 5; sz--) {
              el.style.fontSize = sz + 'px';
              el.style.lineHeight = '1.1';
              if (el.scrollWidth <= maxW && el.scrollHeight <= maxH) break;
            }
          }}>{_g.join('\n')}</pre>
          <div className="mellon-text">Mellon.</div>
        </div>
      )}
    </div>
  );
};
