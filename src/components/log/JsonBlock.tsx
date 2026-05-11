"use client";

interface JsonBlockProps {
  value: unknown;
}

export function JsonBlock({ value }: JsonBlockProps) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre className="text-xs font-mono bg-[var(--bg-raised)] border border-[var(--border)] rounded p-3 overflow-x-auto text-[var(--text-muted)] whitespace-pre-wrap break-words min-w-0">
      <code>{text}</code>
    </pre>
  );
}
