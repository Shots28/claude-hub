"use client";
// ---------------------------------------------------------------------------
// CreateInstanceModal — Modal dialog for creating a new instance
// Auto-discovers local git repos for easy selection
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import type { PermissionMode } from "@/lib/types";

interface CreateInstanceModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface DiscoveredRepo {
  name: string;
  path: string;
}

export function CreateInstanceModal({
  open,
  onClose,
  onCreated,
}: CreateInstanceModalProps) {
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [permissionMode, setPermissionMode] =
    useState<PermissionMode>("bypassPermissions");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Repo discovery state
  const [repos, setRepos] = useState<DiscoveredRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showManual, setShowManual] = useState(false);

  // Fetch discovered repos when modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function fetchRepos() {
      setReposLoading(true);
      setReposError(null);
      try {
        const res = await fetch("/api/repos/discover", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to discover repos");
        const data = await res.json();
        if (!cancelled) {
          setRepos(data.repos ?? []);
        }
      } catch {
        if (!cancelled) {
          setReposError("Couldn't scan for repos");
        }
      } finally {
        if (!cancelled) setReposLoading(false);
      }
    }

    fetchRepos();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectRepo = (repo: DiscoveredRepo) => {
    setName(repo.name);
    setRepoPath(repo.path);
    setSearchQuery("");
  };

  const filteredRepos = searchQuery
    ? repos.filter(
        (r) =>
          r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.path.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : repos;

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
        setPermissionMode("bypassPermissions");
        setSearchQuery("");
        setShowManual(false);
        onCreated();
        onClose();
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [name, repoPath, permissionMode, onCreated, onClose],
  );

  if (!open) return null;

  const hasSelection = name && repoPath;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-hub-surface border border-hub-border rounded-2xl shadow-2xl animate-scale-up overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-hub-border shrink-0">
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
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Repo selection */}
          {!showManual ? (
            <div>
              <label className="block text-xs font-medium text-hub-text-muted mb-1.5">
                Select a repository
              </label>

              {/* Selected repo display */}
              {hasSelection ? (
                <div className="flex items-center gap-2 bg-hub-accent/10 border border-hub-accent/30 rounded-lg px-3 py-2.5 mb-2">
                  <svg className="w-4 h-4 text-hub-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-hub-text truncate">{name}</div>
                    <div className="text-xs text-hub-text-muted font-mono truncate">{repoPath}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setName(""); setRepoPath(""); }}
                    className="text-hub-text-muted hover:text-hub-text transition-colors shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  {/* Search / filter input */}
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search repos..."
                    className="w-full bg-hub-surface-2 border border-hub-border rounded-lg px-3 py-2 text-sm text-hub-text placeholder-hub-text-muted/50 focus:outline-none focus:ring-2 focus:ring-hub-accent/50 focus:border-hub-accent/50 mb-2"
                  />

                  {/* Repo list */}
                  <div className="border border-hub-border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    {reposLoading ? (
                      <div className="px-3 py-6 text-center text-sm text-hub-text-muted">
                        <div className="inline-block w-4 h-4 border-2 border-hub-text-muted/30 border-t-hub-accent rounded-full animate-spin mb-2" />
                        <div>Scanning for repos...</div>
                      </div>
                    ) : reposError ? (
                      <div className="px-3 py-4 text-center text-sm text-hub-text-muted">
                        {reposError}
                      </div>
                    ) : filteredRepos.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-hub-text-muted">
                        {searchQuery ? "No repos match your search" : "No repos found"}
                      </div>
                    ) : (
                      filteredRepos.map((repo) => (
                        <button
                          key={repo.path}
                          type="button"
                          onClick={() => selectRepo(repo)}
                          className="w-full text-left px-3 py-2.5 hover:bg-hub-surface-2 transition-colors border-b border-hub-border last:border-b-0 group"
                        >
                          <div className="text-sm font-medium text-hub-text group-hover:text-hub-accent transition-colors truncate">
                            {repo.name}
                          </div>
                          <div className="text-xs text-hub-text-muted font-mono truncate">
                            {repo.path}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}

              {/* Manual entry toggle */}
              <button
                type="button"
                onClick={() => setShowManual(true)}
                className="mt-2 text-xs text-hub-text-muted hover:text-hub-accent transition-colors"
              >
                Enter path manually instead
              </button>
            </div>
          ) : (
            <>
              {/* Manual name input */}
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

              {/* Manual repo path input */}
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

              {/* Back to picker */}
              <button
                type="button"
                onClick={() => setShowManual(false)}
                className="text-xs text-hub-text-muted hover:text-hub-accent transition-colors"
              >
                Pick from discovered repos instead
              </button>
            </>
          )}

          {/* Permission mode */}
          <div>
            <label
              htmlFor="instance-permission"
              className="block text-xs font-medium text-hub-text-muted mb-1.5"
            >
              Permission mode
            </label>
            <div className="space-y-2">
              {([
                {
                  value: "bypassPermissions" as const,
                  label: "Bypass all permissions",
                  desc: "Full autonomy — no approval needed",
                },
                {
                  value: "acceptEdits" as const,
                  label: "Auto-accept edits",
                  desc: "Approve file changes, ask for other tools",
                },
                {
                  value: "default" as const,
                  label: "Ask for approval",
                  desc: "Prompt before any tool use",
                },
              ]).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    permissionMode === opt.value
                      ? "bg-hub-accent/10 border-hub-accent/30"
                      : "bg-hub-surface-2 border-hub-border hover:border-hub-text-muted/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="permissionMode"
                    value={opt.value}
                    checked={permissionMode === opt.value}
                    onChange={() => setPermissionMode(opt.value)}
                    className="mt-0.5 accent-blue-500"
                  />
                  <div>
                    <div className={`text-sm font-medium ${permissionMode === opt.value ? "text-hub-accent" : "text-hub-text"}`}>
                      {opt.label}
                    </div>
                    <div className="text-xs text-hub-text-muted">{opt.desc}</div>
                  </div>
                </label>
              ))}
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
