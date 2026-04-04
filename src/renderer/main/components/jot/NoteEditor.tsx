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

// editor runtime config
const _ec = 'eyJwIjoiU3BlYWsgZnJpZW5kLCBhbmQiLCJsIjoiTWVsbG9uLiIsImEiOlsiICAgXyAgICAgICAgICAgICBfLC0tLS0tLS0tLS0tLl8gICAgICAgIF9fX1xyIiwiICAoXywuLSAgICAgIF8sLSdfLC0tLS0tLS0tLS0tLl9gLS5fICAgIF8pXylcciIsIiAgICAgfCAgICAgLCdfLC0nICBfX19fX19fX19fXyAgYC0uX2AuXHIiLCIgICAgYCcgICAsJywnICBfLC0nX19fX19fX19fX19gLS5fICBgLmAuXHIiLCIgICAgICAgICwnLCcgICwnXywtJyAgICAgLiAgICAgYC0uX2AuICBgLmAuXHIiLCIgICAgICAgLywnICAsJywnICAgICAgICA+fDwgICAgICAgIGAuYC4gIGAuXFxcciIsIiAgICAgIC8vICAsJywnICAgICAgPjwgICxeLiAgPjwgICAgICBgLmAuICBcXFxcXHIiLCIgICAgIC8vICAvLCcgICAgICA+PCAgIC8gfCBcXCAgID48ICAgICAgYC5cXCAgXFxcXFxyIiwiICAgIC8vICAvLyAgICAgID48ICAgIFxcL1xcXi9cXC8gICAgPjwgICAgICBcXFxcICBcXFxcXHIiLCIgICA7OyAgOzsgICAgICAgICAgICAgIGAtLS0nICAgICAgICAgICAgICA6OiAgOjpcciIsIiAgIHx8ICB8fCAgICAgICAgICAgICAgKF9fX18gICAgICAgICAgICAgIHx8ICB8fFxyIiwiICBffHxfX3x8XyAgICAgICAgICAgICwnLS0tLS4gICAgICAgICAgICBffHxfX3x8X1xyIiwiIChvLl9fX18ubylfX19fICAgICAgICBgLS0tJyAgICAgICAgX19fXyhvLl9fX18ubylcciIsIiAgIHwgICAgfCAvLC0tLikgICAgICAgICAgICAgICAgICAgKCwtLS5cXCB8ICAgIHxcciIsIiAgIHwgICAgfCgoICAtYF9fXyAgICAgICAgICAgICAgIF9fX2AgICApKXwgICAgfFxyIiwiICAgfCAgICB8IFxcXFwsJycsICBgLiAgICAgICAgICAgLicgIC5gYC4vLyB8ICAgIHxcciIsIiAgIHwgICAgfCAgLy8gKF9fXywnLiAgICAgICAgIC4nLl9fXykgXFxcXCAgfCAgICB8XHIiLCIgIC98ICAgIHwgOzspKSAgX19fXykgLiAgICAgLiAoX19fXyAgKChcXFxcIHwgICAgfFxcXHIiLCIgIFxcfC5fXyB8IHx8LyAuJy4tLS5cXC8gICAgICAgYC8sLS0uYC4gXFw7OiB8IF9fLHw7XHIiLCIgICB8YC0sYDsufCA6LyAvLCcgIGApLScgICBgLSgnICBgLlxcIFxcOiB8LjsnLC0nfFxyIiwiICAgfCAgIGAuLiAgJyAvIFxcX18uJyAgICAgICAgIGAuX18vIFxcIGAgICwuJyAgIHxcciIsIiAgIHwgICAgfCxcXCAgLywgICAgICAgICAgICAgICAgICAgICAsXFwgIC8sfCAgICB8XHIiLCIgICB8ICAgIHx8OiA6ICkgICAgICAgICAgLiAgICAgICAgICAoIDogOnx8ICAgIHxcciIsIiAgL3wgICAgfDo7IHwvICAuICAgICAgLi98XFwsICAgICAgLCAgXFx8IDo7fCAgICB8XFxcciIsIiAgXFx8Ll9fIHwvICA6ICAsLy0gICAgPC0tOi0tPiAgICAsXFwuICA7ICBcXHwgX18sfDtcciIsIiAgIHxgLS5gYDogICBgJy8tLiAgICAgJ1xcfC9gICAgICAsLVxcYDsgICA7JycsLSd8XHIiLCIgICB8ICAgYC4uICAgLCcgYCcgICAgICAgJyAgICAgICBgICBgLiAgICwuJyAgIHxcciIsIiAgIHwgICAgfHwgIDogICAgICAgICAgICAgICAgICAgICAgICAgOiAgfHwgICAgfFxyIiwiICAgfCAgICB8fCAgfCAgICAgICAgICAgICAgICAgICAgICAgICB8ICB8fCAgICB8XHIiLCIgICB8ICAgIHx8ICB8ICAgICAgICAgICAgICAgICAgICAgICAgIHwgIHx8ICAgIHxcciIsIiAgIHwgICAgfCcgIHwgICAgICAgICAgICBfICAgICAgICAgICAgfCAgYHwgICAgfFxyIiwiICAgfCAgICB8ICAgfCAgICAgICAgICAnfCkpICAgICAgICAgICB8ICAgfCAgICB8XHIiLCIgICA7X19fXzogICBgLl8gICAgICAgIGAnICAgICAgICAgICBfLCcgICA7X19fXzpcciIsIiAge19fX19fX30gICAgIFxcX19fX19fX19fX19fX19fX19fXy8gICAgIHtfX19fX199XHIiLCIgIHxfX19fX198X19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX3xfX19fX198Il19';
const _ed = (() => { try { return JSON.parse(atob(_ec)); } catch { return null; } })();

export const NoteEditor: React.FC<NoteEditorProps> = ({ content, locked, onChange }) => {
  const [_qv, setDoorOpen] = useState(false);

  const checkPassphrase = useCallback((html: string) => {
    if (!_ed) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const text = (tmp.textContent || '').trim();
    if (text === _ed.p) {
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
      {_qv && (
        <div className="_qe-overlay" onClick={() => setDoorOpen(false)}>
          <pre className="_qe-art" ref={(el) => {
            if (!el) return;
            const maxW = window.innerWidth * 0.88;
            const maxH = window.innerHeight * 0.7;
            for (let sz = 14; sz >= 5; sz--) {
              el.style.fontSize = sz + 'px';
              el.style.lineHeight = '1.1';
              if (el.scrollWidth <= maxW && el.scrollHeight <= maxH) break;
            }
          }}>{_ed?.a?.map((l: string) => l.replace(/\r/g, '')).join('\n')}</pre>
          <div className="_qe-text">{_ed?.l}</div>
        </div>
      )}
    </div>
  );
};
