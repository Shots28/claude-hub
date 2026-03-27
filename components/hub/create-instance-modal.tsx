"use client";
// ---------------------------------------------------------------------------
// CreateInstanceModal — Modal dialog for creating a new instance
// Auto-discovers local folders (both git repos and regular folders)
// Also supports creating new folders and manual path entry
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";

interface CreateInstanceModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (instanceId: string) => void;
  existingNames?: string[];
}

interface DiscoveredFolder {
  name: string;
  path: string;
  is_git_repo?: boolean;
}

export function CreateInstanceModal({
  open,
  onClose,
  onCreated,
  existingNames,
}: CreateInstanceModalProps) {
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Folder discovery state
  const [folders, setFolders] = useState<DiscoveredFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [filterGitOnly, setFilterGitOnly] = useState(false);

  // Folder creation state
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParent, setNewFolderParent] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [createFolderError, setCreateFolderError] = useState<string | null>(null);

  // Function to fetch folders
  const fetchFolders = useCallback(async () => {
    setFoldersLoading(true);
    setFoldersError(null);
    try {
      const res = await fetch("/api/repos/discover", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to discover folders");
      const data = await res.json();
      setFolders(data.repos ?? []);
    } catch {
      setFoldersError("Couldn't scan for folders");
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  // Fetch discovered folders when modal opens
  useEffect(() => {
    if (!open) return;
    fetchFolders();
  }, [open, fetchFolders]);

  // Create new folder handler
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !newFolderParent.trim()) return;

    setCreatingFolder(true);
    setCreateFolderError(null);

    try {
      const res = await fetch("/api/repos/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentPath: newFolderParent.trim(),
          folderName: newFolderName.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setCreateFolderError(data.error || "Failed to create folder");
        return;
      }

      const data = await res.json();

      // Select the newly created folder
      selectFolder(data.folder);

      // Reset create folder state
      setShowCreateFolder(false);
      setNewFolderName("");
      setNewFolderParent("");

      // Refresh the folder list
      fetchFolders();
    } catch {
      setCreateFolderError("Network error. Please try again.");
    } finally {
      setCreatingFolder(false);
    }
  };

  const selectFolder = (folder: DiscoveredFolder) => {
    let baseName = folder.name;
    let finalName = baseName;
    let counter = 2;
    while (existingNames?.includes(finalName)) {
      finalName = `${baseName} (${counter})`;
      counter++;
    }
    setName(finalName);
    setRepoPath(folder.path);
    setSearchQuery("");
  };

  const filteredFolders = folders.filter((f) => {
    // Apply git filter if enabled
    if (filterGitOnly && !f.is_git_repo) return false;
    // Apply search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
    }
    return true;
  });

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
            permissionMode: "bypassPermissions",
            model: "opus",
            extendedThinking: true,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to create instance");
          return;
        }

        const data = await res.json();

        // Reset form
        setName("");
        setRepoPath("");
        setSearchQuery("");
        setShowManual(false);
        onCreated(data.instance.id);
        onClose();
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [name, repoPath, onCreated, onClose],
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
          {/* Folder selection */}
          {!showManual ? (
            <div>
              <label className="block text-xs font-medium text-hub-text-muted mb-1.5">
                Select a folder
              </label>

              {/* Selected folder display */}
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
                  {/* Search and filter row */}
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search folders..."
                      className="flex-1 bg-hub-surface-2 border border-hub-border rounded-lg px-3 py-2 text-sm text-hub-text placeholder-hub-text-muted/50 focus:outline-none focus:ring-2 focus:ring-hub-accent/50 focus:border-hub-accent/50"
                    />
                    <button
                      type="button"
                      onClick={() => setFilterGitOnly(!filterGitOnly)}
                      className={`px-3 py-2 text-xs rounded-lg border transition-colors whitespace-nowrap ${
                        filterGitOnly
                          ? "bg-hub-accent/10 border-hub-accent/30 text-hub-accent"
                          : "bg-hub-surface-2 border-hub-border text-hub-text-muted hover:border-hub-text-muted/30"
                      }`}
                    >
                      Git only
                    </button>
                  </div>

                  {/* Folder list */}
                  <div className="border border-hub-border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    {foldersLoading ? (
                      <div className="px-3 py-6 text-center text-sm text-hub-text-muted">
                        <div className="inline-block w-4 h-4 border-2 border-hub-text-muted/30 border-t-hub-accent rounded-full animate-spin mb-2" />
                        <div>Scanning for folders...</div>
                      </div>
                    ) : foldersError ? (
                      <div className="px-3 py-4 text-center text-sm text-hub-text-muted">
                        {foldersError}
                      </div>
                    ) : filteredFolders.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-hub-text-muted">
                        {searchQuery || filterGitOnly ? "No folders match your filters" : "No folders found"}
                      </div>
                    ) : (
                      filteredFolders.map((folder) => (
                        <button
                          key={folder.path}
                          type="button"
                          onClick={() => selectFolder(folder)}
                          className="w-full text-left px-3 py-2.5 hover:bg-hub-surface-2 transition-colors border-b border-hub-border last:border-b-0 group"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-hub-text group-hover:text-hub-accent transition-colors truncate flex-1">
                              {folder.name}
                            </span>
                            {folder.is_git_repo && (
                              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-hub-surface border border-hub-border text-hub-text-muted">
                                git
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-hub-text-muted font-mono truncate">
                            {folder.path}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setShowManual(true)}
                  className="text-xs text-hub-text-muted hover:text-hub-accent transition-colors"
                >
                  Enter path manually
                </button>
                <span className="text-hub-text-muted/30">|</span>
                <button
                  type="button"
                  onClick={() => setShowCreateFolder(true)}
                  className="text-xs text-hub-text-muted hover:text-hub-accent transition-colors"
                >
                  Create new folder
                </button>
              </div>
            </div>
          ) : showCreateFolder ? (
            /* Create folder form */
            <div>
              <label className="block text-xs font-medium text-hub-text-muted mb-1.5">
                Create a new folder
              </label>

              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="new-folder-parent"
                    className="block text-[11px] text-hub-text-muted/70 mb-1"
                  >
                    Parent folder (e.g. ~/Projects)
                  </label>
                  <input
                    id="new-folder-parent"
                    type="text"
                    value={newFolderParent}
                    onChange={(e) => setNewFolderParent(e.target.value)}
                    placeholder="~/Projects"
                    className="w-full bg-hub-surface-2 border border-hub-border rounded-lg px-3 py-2 text-sm text-hub-text placeholder-hub-text-muted/50 focus:outline-none focus:ring-2 focus:ring-hub-accent/50 focus:border-hub-accent/50 font-mono"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-folder-name"
                    className="block text-[11px] text-hub-text-muted/70 mb-1"
                  >
                    Folder name
                  </label>
                  <input
                    id="new-folder-name"
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="my-new-project"
                    className="w-full bg-hub-surface-2 border border-hub-border rounded-lg px-3 py-2 text-sm text-hub-text placeholder-hub-text-muted/50 focus:outline-none focus:ring-2 focus:ring-hub-accent/50 focus:border-hub-accent/50"
                  />
                </div>

                {createFolderError && (
                  <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-2.5 py-1.5">
                    {createFolderError}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCreateFolder}
                    disabled={creatingFolder || !newFolderName.trim() || !newFolderParent.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-hub-accent hover:bg-hub-accent-hover text-white rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {creatingFolder ? "Creating..." : "Create Folder"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateFolder(false);
                      setNewFolderName("");
                      setNewFolderParent("");
                      setCreateFolderError(null);
                    }}
                    className="px-3 py-1.5 text-xs text-hub-text-muted hover:text-hub-text transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
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

              {/* Manual folder path input */}
              <div>
                <label
                  htmlFor="instance-repo"
                  className="block text-xs font-medium text-hub-text-muted mb-1.5"
                >
                  Folder path
                </label>
                <input
                  id="instance-repo"
                  type="text"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="/home/user/projects/my-folder"
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
                Pick from discovered folders instead
              </button>
            </>
          )}

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
