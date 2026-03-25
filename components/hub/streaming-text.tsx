"use client";
// ---------------------------------------------------------------------------
// StreamingText — Renders markdown text with optional blinking cursor
// ---------------------------------------------------------------------------

import { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="px-2 py-1 text-[10px] font-medium rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300 hover:text-white transition-colors focus:outline-none"
      aria-label={copied ? "Copied" : "Copy code"}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
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
          pre: ({ children }) => {
            // Extract language and text content from children
            const child = Array.isArray(children) ? children[0] : children;
            let language = "";
            let codeText = "";

            if (
              child &&
              typeof child === "object" &&
              "props" in child
            ) {
              const className = child.props?.className || "";
              const match = className.match(/language-(\w+)/);
              language = match ? match[1] : "";

              // Extract text for copy button
              const extractText = (node: unknown): string => {
                if (typeof node === "string") return node;
                if (Array.isArray(node)) return node.map(extractText).join("");
                if (node && typeof node === "object" && "props" in (node as any)) {
                  return extractText((node as any).props?.children);
                }
                return "";
              };
              codeText = extractText(child.props?.children);
            }

            return (
              <div className="relative my-2 rounded-md overflow-hidden bg-neutral-900">
                {/* Header bar with language + copy */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-800/80 border-b border-neutral-700/50">
                  <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                    {language || "code"}
                  </span>
                  <CopyButton text={codeText} />
                </div>
                <pre className="overflow-x-auto m-0 rounded-none">
                  {children}
                </pre>
              </div>
            );
          },
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
