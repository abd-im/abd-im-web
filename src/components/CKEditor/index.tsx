import "./index.scss";
import "ckeditor5/ckeditor5.css";

import { CKEditor } from "@ckeditor/ckeditor5-react";
import { ClassicEditor, Essentials, Paragraph } from "ckeditor5";
import {
  forwardRef,
  ForwardRefRenderFunction,
  memo,
  useImperativeHandle,
  useRef,
} from "react";

export type CKEditorRef = {
  focus: (moveToEnd?: boolean) => void;
  insertEmoji: (emoji: string) => void;
  insertMention: (text: string, replaceLength: number) => void;
};

export type MentionQuery = {
  query: string;
  replaceLength: number;
  anchorRect?: DOMRect;
};

interface CKEditorProps {
  value: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  onEnter?: () => void;
  onMentionQueryChange?: (query?: MentionQuery) => void;
  onMentionKeyDown?: (key: string, isComposing: boolean) => boolean;
}

export interface EmojiData {
  src: string;
  alt: string;
}

const keyCodes = {
  delete: 46,
  backspace: 8,
};

const keysByCode: Record<number, string> = {
  9: "Tab",
  13: "Enter",
  27: "Escape",
  38: "ArrowUp",
  40: "ArrowDown",
};

const Index: ForwardRefRenderFunction<CKEditorRef, CKEditorProps> = (
  { value, placeholder, onChange, onEnter, onMentionQueryChange, onMentionKeyDown },
  ref,
) => {
  const ckEditor = useRef<ClassicEditor | null>(null);
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;
  const onMentionQueryChangeRef = useRef(onMentionQueryChange);
  onMentionQueryChangeRef.current = onMentionQueryChange;
  const onMentionKeyDownRef = useRef(onMentionKeyDown);
  onMentionKeyDownRef.current = onMentionKeyDown;

  const emitMentionQuery = (editor: ClassicEditor) => {
    const focus = editor.model.document.selection.focus;
    if (!focus) return onMentionQueryChangeRef.current?.();
    const start = editor.model.createPositionAt(focus.parent, 0);
    const range = editor.model.createRange(start, focus);
    let text = "";
    for (const item of range.getItems()) {
      if ("data" in item && typeof item.data === "string") text += item.data;
    }
    const match = text.match(/(?:^|\s)@([^\s@]*)$/);
    const domSelection = window.getSelection();
    const anchorRect =
      domSelection?.rangeCount && !domSelection.getRangeAt(0).collapsed
        ? undefined
        : domSelection?.rangeCount
        ? domSelection.getRangeAt(0).getBoundingClientRect()
        : undefined;
    onMentionQueryChangeRef.current?.(
      match
        ? {
            query: match[1],
            replaceLength: match[1].length + 1,
            anchorRect,
          }
        : undefined,
    );
  };

  const focus = (moveToEnd = false) => {
    const editor = ckEditor.current;

    if (editor) {
      const model = editor.model;
      const view = editor.editing.view;
      const root = model.document.getRoot();
      if (moveToEnd && root) {
        const range = model.createRange(model.createPositionAt(root, "end"));

        model.change((writer) => {
          writer.setSelection(range);
        });
      }
      view.focus();
    }
  };

  const insertEmoji = (emoji: string) => {
    const editor = ckEditor.current;
    if (editor) {
      editor.model.change((writer) => {
        editor.model.insertContent(writer.createText(emoji));
      });
      editor.editing.view.focus();
    }
  };

  const insertMention = (text: string, replaceLength: number) => {
    const editor = ckEditor.current;
    const focus = editor?.model.document.selection.focus;
    if (!editor || !focus || focus.offset < replaceLength) return;
    editor.model.change((writer) => {
      const start = focus.getShiftedBy(-replaceLength);
      writer.remove(writer.createRange(start, focus));
      writer.setSelection(start);
      editor.model.insertContent(writer.createText(text));
    });
    editor.editing.view.focus();
    onMentionQueryChangeRef.current?.();
  };

  const listenKeydown = (editor: ClassicEditor) => {
    editor.editing.view.document.on(
      "keydown",
      (evt, data) => {
        const key = keysByCode[data.keyCode];
        if (
          key &&
          onMentionKeyDownRef.current?.(key, Boolean(data.domEvent?.isComposing))
        ) {
          data.preventDefault();
          evt.stop();
          return;
        }
        if (data.keyCode === 13 && !data.shiftKey) {
          data.preventDefault();
          evt.stop();
          onEnterRef.current?.();
          return;
        }
        if (data.keyCode === keyCodes.backspace || data.keyCode === keyCodes.delete) {
          const selection = editor.model.document.selection;
          const hasSelectContent = !editor.model.getSelectedContent(selection).isEmpty;
          const hasEditorContent = Boolean(editor.getData());

          if (!hasEditorContent) {
            return;
          }

          if (hasSelectContent) return;
        }
      },
      { priority: "high" },
    );
  };

  useImperativeHandle(
    ref,
    () => ({
      focus,
      insertEmoji,
      insertMention,
    }),
    [],
  );

  return (
    <CKEditor
      editor={ClassicEditor}
      data={value}
      config={{
        placeholder,
        toolbar: [],
        image: {
          toolbar: [],
          insert: {
            type: "inline",
          },
        },
        plugins: [Essentials, Paragraph],
      }}
      onReady={(editor) => {
        ckEditor.current = editor;
        listenKeydown(editor);
        editor.model.document.selection.on("change:range", () => {
          window.setTimeout(() => emitMentionQuery(editor));
        });
        focus(true);
      }}
      onChange={(event, editor) => {
        const data = editor.getData();
        onChange?.(data);
        emitMentionQuery(editor);
      }}
    />
  );
};

export default memo(forwardRef(Index));
