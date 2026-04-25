import { useRef } from "react";
import { cn } from "@/lib/utils";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  errors: { index: number; message: string }[];
  resourceCount: number;
  filename: string;
  sample: string;
  placeholder: string;
}

export function YamlEditor({
  value,
  onChange,
  errors,
  resourceCount,
  filename,
  sample,
  placeholder,
}: EditorProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const texts: string[] = [];
    for (const file of Array.from(files)) {
      if (!/\.(ya?ml)$/i.test(file.name)) continue;
      texts.push(await file.text());
    }
    if (texts.length === 0) return;
    const joined = texts.join("\n---\n");
    onChange(value.trim() ? `${value.trim()}\n---\n${joined}` : joined);
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-kumo-base">
      <div className="flex h-9 min-w-0 shrink-0 items-center justify-between gap-2 border-b border-kumo-hairline px-3">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
          <span className="truncate font-mono uppercase tracking-wider text-kumo-subtle">
            {filename}
          </span>
          {resourceCount > 0 && (
            <span className="shrink-0 rounded-full bg-kumo-success-tint px-1.5 py-0.5 font-mono text-[10px] leading-none text-kumo-success">
              {resourceCount}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded px-1.5 py-1 text-[11px] text-kumo-strong transition-colors hover:bg-kumo-tint"
          >
            Upload
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".yaml,.yml,application/x-yaml,text/yaml"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => onChange(sample)}
            className="rounded px-1.5 py-1 text-[11px] text-kumo-strong transition-colors hover:bg-kumo-tint"
          >
            Sample
          </button>
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded px-1.5 py-1 text-[11px] text-kumo-strong transition-colors hover:bg-kumo-tint"
          >
            Clear
          </button>
        </div>
      </div>

      <div
        ref={dropRef}
        className="relative flex-1 overflow-hidden"
        onDragOver={(e) => {
          e.preventDefault();
          dropRef.current?.classList.add("ring-2", "ring-kumo-brand");
        }}
        onDragLeave={() => {
          dropRef.current?.classList.remove("ring-2", "ring-kumo-brand");
        }}
        onDrop={(e) => {
          e.preventDefault();
          dropRef.current?.classList.remove("ring-2", "ring-kumo-brand");
          handleFiles(e.dataTransfer.files);
        }}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder={placeholder}
          className={cn(
            "yaml-editor h-full w-full resize-none bg-kumo-base p-4 font-mono text-[13px] leading-relaxed text-kumo-default outline-none",
            "placeholder:text-kumo-placeholder [scrollbar-width:thin] [scrollbar-color:var(--kumo-hairline-strong)_transparent]",
          )}
        />
      </div>

      {errors.length > 0 && (
        <div className="border-t border-kumo-hairline bg-kumo-danger-tint px-4 py-2 text-xs text-kumo-danger">
          {errors.map((e, i) => (
            <div key={i} className="font-mono">
              ⚠ doc {e.index}: {e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
