"use client";
/* A Notion-style rich-text scratchpad for a research run. Built on TipTap (ProseMirror): headings,
   bold/italic/underline/strike, text colour + highlight, links, images, lists, quote, code. Content
   is auto-saved as HTML to localStorage per job — purely the user's own notes, no backend. */
import { useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  NotePencil,
  Check,
  TextB,
  TextItalic,
  TextUnderline,
  TextStrikethrough,
  TextHOne,
  TextHTwo,
  TextHThree,
  ListBullets,
  ListNumbers,
  Quotes,
  CodeSimple,
  LinkSimple,
  Image as ImageIcon,
  Highlighter,
  TextT,
  Eraser,
} from "@phosphor-icons/react";

const key = (jobId: string) => `lynx-notes-${jobId}`;
const load = (jobId: string) => {
  try {
    return typeof window !== "undefined" ? (localStorage.getItem(key(jobId)) ?? "") : "";
  } catch {
    return "";
  }
};

const SWATCHES = ["#9d7bff", "#7dd3fc", "#4ade9f", "#fcd34d", "#fb923c", "#ff7a92", "#f0abfc", "#eef0f8"];

function Btn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`press flex h-8 w-8 items-center justify-center rounded-md border text-[var(--muted)] ${
        active
          ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]"
          : "border-transparent hover:bg-[var(--panel-2)] hover:text-[var(--text-strong)]"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const addLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  const addImage = () => {
    const url = window.prompt("Image URL");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border border-b-0 border-[var(--border)] bg-[var(--panel)] p-1.5">
      <Btn title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><TextHOne weight="bold" className="h-4 w-4" /></Btn>
      <Btn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><TextHTwo weight="bold" className="h-4 w-4" /></Btn>
      <Btn title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><TextHThree weight="bold" className="h-4 w-4" /></Btn>
      <span className="mx-1 h-5 w-px bg-[var(--border)]" />
      <Btn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><TextB weight="bold" className="h-4 w-4" /></Btn>
      <Btn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><TextItalic weight="bold" className="h-4 w-4" /></Btn>
      <Btn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><TextUnderline weight="bold" className="h-4 w-4" /></Btn>
      <Btn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><TextStrikethrough weight="bold" className="h-4 w-4" /></Btn>
      <Btn title="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}><CodeSimple weight="bold" className="h-4 w-4" /></Btn>
      <span className="mx-1 h-5 w-px bg-[var(--border)]" />
      <Btn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><ListBullets weight="bold" className="h-4 w-4" /></Btn>
      <Btn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListNumbers weight="bold" className="h-4 w-4" /></Btn>
      <Btn title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quotes weight="bold" className="h-4 w-4" /></Btn>
      <span className="mx-1 h-5 w-px bg-[var(--border)]" />
      <Btn title="Link" active={editor.isActive("link")} onClick={addLink}><LinkSimple weight="bold" className="h-4 w-4" /></Btn>
      <Btn title="Image by URL" onClick={addImage}><ImageIcon weight="bold" className="h-4 w-4" /></Btn>
      <Btn title="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight({ color: "#fcd34d55" }).run()}><Highlighter weight="bold" className="h-4 w-4" /></Btn>
      <span className="mx-1 h-5 w-px bg-[var(--border)]" />
      {/* text colour swatches */}
      <span className="flex items-center gap-0.5 px-0.5">
        <TextT weight="bold" className="h-4 w-4 text-[var(--faint)]" />
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            title={`Text colour ${c}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setColor(c).run()}
            className="press h-4 w-4 rounded-full border border-[var(--border)]"
            style={{ background: c }}
          />
        ))}
        <button
          type="button"
          title="Reset colour"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().unsetColor().run()}
          className="press flex h-6 w-6 items-center justify-center rounded-md text-[var(--faint)] hover:text-[var(--text-strong)]"
        >
          <Eraser weight="bold" className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

export function NotesView({ jobId, entityName }: { jobId: string; entityName?: string }) {
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    immediatelyRender: false, // Next SSR-safe
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Image.configure({ HTMLAttributes: { class: "rounded-lg border border-[var(--border)]" } }),
      Placeholder.configure({
        placeholder: "Jot down anything about this company — a thesis, questions, quotes, links… Type / for a fresh line. Auto-saved.",
      }),
    ],
    content: load(jobId),
    editorProps: { attributes: { class: "notes-content min-h-[55vh] focus:outline-none" } },
    onUpdate: ({ editor }) => {
      setSaved(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        try {
          localStorage.setItem(key(jobId), editor.getHTML());
          setSaved(true);
        } catch {
          /* ignore */
        }
      }, 500);
    },
  });

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col py-2">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-strong)]">
          <NotePencil weight="duotone" className="h-5 w-5 text-[var(--accent)]" />
          Notes{entityName ? ` · ${entityName}` : ""}
        </h2>
        <span className={`flex items-center gap-1 text-[11px] ${saved ? "text-[var(--muted)]" : "text-[var(--faint)]"}`}>
          {saved ? (
            <>
              <Check weight="bold" className="h-3.5 w-3.5 text-[var(--accent)]" /> Saved
            </>
          ) : (
            "Saving…"
          )}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {editor && <Toolbar editor={editor} />}
        <div className="panel rounded-t-none border-t-0 p-4">
          <EditorContent editor={editor} />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-[var(--faint)]">Stored only in this browser (localStorage), per research run.</p>
    </div>
  );
}
