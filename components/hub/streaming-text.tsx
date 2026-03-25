"use client";
// ---------------------------------------------------------------------------
// StreamingText — Renders markdown text with optional blinking cursor
// ---------------------------------------------------------------------------

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
}

export function StreamingText({
  content,
  isStreaming = false,
}: StreamingTextProps) {
  return (
    <div className="prose prose-invert prose-sm max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Style overrides for markdown elements
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code
                  className={`${className} block bg-neutral-900 rounded-md p-3 text-xs overflow-x-auto`}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className="bg-neutral-800 px-1.5 py-0.5 rounded text-xs text-emerald-400">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-neutral-900 rounded-md overflow-x-auto my-2">
              {children}
            </pre>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mt-3 mb-1">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold mt-2 mb-1">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-neutral-600 pl-3 my-2 text-hub-text-muted italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-hub-border px-2 py-1 text-left font-medium bg-hub-surface-2">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-hub-border px-2 py-1">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="cursor-blink inline-block w-1.5 h-4 bg-hub-text ml-0.5 align-text-bottom rounded-sm" />
      )}
    </div>
  );
}
