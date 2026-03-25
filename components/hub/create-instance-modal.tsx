"use client";
// ---------------------------------------------------------------------------
// CreateInstanceModal — Modal dialog for creating a new instance
// ---------------------------------------------------------------------------

import { useCallback, useState } from "react";
import type { PermissionMode } from "@/lib/types";

interface CreateInstanceModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const COMMON_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "NotebookEdit",
];

export function CreateInstanceModal({
  open,
  onClose,
  onCreated,
}: CreateInstanceModalProps) {
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [permissionMode, setPermissionMode] =
    useState<PermissionMode>("auto");
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !repoPath.trim()) return;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/instances", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            repoPath: repoPath.trim(),
            permissionMode,
            allowedTools,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to create instance");
          return;
        }

        // Reset form
        setName("");
        setRepoPath("");
        setPermissionMode("auto");
        setAllowedTools([]);
        onCreated();
        onClose();
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [name, repoPath, permissionMode, allowedTools, onCreated, onClose],
  );

  const toggleTool = (tool: string) => {
    setAllowedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-hub-surface border border-hub-border rounded-2xl shadow-2xl animate-scale-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-hub-border">
          <h2 className="text-base font-semibold">New Instance</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-hub-surface-2 transition-colors"
          >
            <svg
              className="w-4 h-4 text-hub-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label
              htmlFor="instance-name"
              className="block text-xs font-medium text-hub-text-muted mb-1.5"
            >
              Name
            </label>
            <input
              id="instance-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              required
              className="w-full bg-hub-surface-2 border border-hub-border rounded-lg px-3 py-2 text-sm text-hub-text placeholder-hub-text-muted/50 focus:outline-none focus:ring-2 focus:ring-hub-accent/50 focus:border-hub-accent/50"
            />
          </div>

          {/* Repo path */}
          <div>
            <label
              htmlFor="instance-repo"
              className="block text-xs font-medium text-hub-text-muted mb-1.5"
            >
              Repository path
            </label>
            <input
              id="instance-repo"
              type="text"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="/home/user/projects/my-repo"
              required
              className="w-full bg-hub-surface-2 border border-hub-border rounded-lg px-3 py-2 text-sm text-hub-text placeholder-hub-text-muted/50 focus:outline-none focus:ring-2 focus:ring-hub-accent/50 focus:border-hub-accent/50 font-mono"
            />
          </div>

          {/* Permission mode */}
          <div>
            <label
              htmlFor="instance-permission"
              className="block text-xs font-medium text-hub-text-muted mb-1.5"
            >
              Permission mode
            </label>
            <select
              id="instance-permission"
              value={permissionMode}
              onChange={(e) =>
                setPermissionMode(e.target.value as PermissionMode)
              }
              className="w-full bg-hub-surface-2 border border-hub-border rounded-lg px-3 py-2 text-sm text-hub-text focus:outline-none focus:ring-2 focus:ring-hub-accent/50 focus:border-hub-accent/50"
            >
              <option value="auto">Auto-approve all</option>
              <option value="approve">Ask for approval</option>
              <option value="deny">Auto-deny all</option>
            </select>
          </div>

          {/* Allowed tools */}
          <div>
            <span className="block text-xs font-medium text-hub-text-muted mb-1.5">
              Allowed tools
            </span>
            <div className="flex flex-wrap gap-2">
              {COMMON_TOOLS.map((tool) => {
                const isSelected = allowedTools.includes(tool);
                return (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => toggleTool(tool)}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                      isSelected
                        ? "bg-hub-accent/20 border-hub-accent/50 text-hub-accent"
                        : "bg-hub-surface-2 border-hub-border text-hub-text-muted hover:border-hub-text-muted/30"
                    }`}
                  >
                    {tool}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-hub-text-muted hover:text-hub-text rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim() || !repoPath.trim()}
              className="px-4 py-2 text-sm font-medium bg-hub-accent hover:bg-hub-accent-hover active:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-hub-accent/50"
            >
              {loading ? "Creating..." : "Create Instance"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
