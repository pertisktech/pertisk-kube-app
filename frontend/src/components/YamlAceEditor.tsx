import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Ace } from 'ace-builds';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-tomorrow_night';
import 'ace-builds/src-noconflict/ext-searchbox';
import { Replace, Search } from './Icons';
import { useTheme } from '../context/ThemeContext';
import { useFeatureSettings } from '../context/FeatureSettingsContext';
import { cn } from '../utils';

export interface YamlAceEditorHandle {
  find: () => void;
  replace: () => void;
  focus: () => void;
}

interface YamlAceEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  editorClassName?: string;
  style?: CSSProperties;
  minHeight?: number;
  name?: string;
  showSearchToolbar?: boolean;
  toolbarLeft?: ReactNode;
  toolbarRight?: ReactNode;
}

export const YamlSearchReplaceButtons = ({
  onFind,
  onReplace,
  className,
}: {
  onFind: () => void;
  onReplace: () => void;
  className?: string;
}) => (
  <div className={cn('flex items-center gap-1.5', className)}>
    <button
      type="button"
      onClick={onFind}
      title="Find (Ctrl/Cmd+F)"
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-hover"
    >
      <Search size={12} className="flex-shrink-0" />
      Find
    </button>
    <button
      type="button"
      onClick={onReplace}
      title="Replace (Ctrl/Cmd+H)"
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-hover"
    >
      <Replace size={12} className="flex-shrink-0" />
      Replace
    </button>
  </div>
);

export const YamlAceEditor = forwardRef<YamlAceEditorHandle, YamlAceEditorProps>(function YamlAceEditor(
  {
    value,
    onChange,
    readOnly = false,
    className,
    editorClassName,
    style,
    minHeight,
    name,
    showSearchToolbar = true,
    toolbarLeft,
    toolbarRight,
  },
  ref,
) {
  const theme = useTheme();
  const { settings } = useFeatureSettings();
  const editorRef = useRef<Ace.Editor | null>(null);

  const runFind = () => editorRef.current?.execCommand('find');
  const runReplace = () => editorRef.current?.execCommand('replace');

  useImperativeHandle(ref, () => ({
    find: runFind,
    replace: runReplace,
    focus: () => editorRef.current?.focus(),
  }));

  const aceTheme =
    (settings.yamlEditor.theme === 'auto' ? !!theme?.isDark : settings.yamlEditor.theme === 'dark')
      ? 'tomorrow_night'
      : 'github';

  const showToolbar = showSearchToolbar || toolbarLeft || toolbarRight;

  return (
    <div className={cn('flex flex-col h-full min-h-0', className)}>
      {showToolbar ? (
        <div className="flex items-center justify-between gap-2 px-3 py-1 border-b border-border flex-shrink-0 bg-surface-elevated">
          <div className="min-w-0">{toolbarLeft}</div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {showSearchToolbar ? <YamlSearchReplaceButtons onFind={runFind} onReplace={runReplace} /> : null}
            {toolbarRight}
          </div>
        </div>
      ) : null}
      <div className={cn('flex-1 min-h-0 overflow-hidden', editorClassName)}>
        <AceEditor
          mode="yaml"
          theme={aceTheme}
          name={name}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          onLoad={(editor) => {
            editorRef.current = editor;
          }}
          width="100%"
          height="100%"
          showPrintMargin={false}
          setOptions={{ useWorker: false, tabSize: 2 }}
          editorProps={{ $blockScrolling: true }}
          style={{
            fontSize: settings.yamlEditor.fontSize,
            fontFamily: settings.yamlEditor.fontName,
            minHeight,
            ...style,
          }}
        />
      </div>
    </div>
  );
});
