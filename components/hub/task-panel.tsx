"use client";
// ---------------------------------------------------------------------------
// TaskPanel — Task/todo list for tracking ideas and work items
// Stored in localStorage, can push tasks to active chat
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useRef } from "react";

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

interface TaskPanelProps {
  open: boolean;
  onClose: () => void;
  onPushToChat?: (text: string) => void;
}

const STORAGE_KEY = "claude-hub-tasks";

function loadTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveTasks(tasks: Task[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // Ignore storage errors
  }
}

export function TaskPanel({ open, onClose, onPushToChat }: TaskPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load tasks on mount
  useEffect(() => {
    setTasks(loadTasks());
  }, []);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const addTask = useCallback(() => {
    const text = newTaskText.trim();
    if (!text) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    const updated = [newTask, ...tasks];
    setTasks(updated);
    saveTasks(updated);
    setNewTaskText("");
  }, [newTaskText, tasks]);

  const toggleTask = useCallback((id: string) => {
    const updated = tasks.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    setTasks(updated);
    saveTasks(updated);
  }, [tasks]);

  const deleteTask = useCallback((id: string) => {
    const updated = tasks.filter((t) => t.id !== id);
    setTasks(updated);
    saveTasks(updated);
  }, [tasks]);

  const copyTask = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard not available
    }
  }, []);

  const pushToChat = useCallback((text: string) => {
    onPushToChat?.(text);
    onClose();
  }, [onPushToChat, onClose]);

  const startEdit = useCallback((task: Task) => {
    setEditingId(task.id);
    setEditText(task.text);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingId) return;
    const text = editText.trim();
    if (!text) {
      setEditingId(null);
      return;
    }

    const updated = tasks.map((t) =>
      t.id === editingId ? { ...t, text } : t
    );
    setTasks(updated);
    saveTasks(updated);
    setEditingId(null);
  }, [editingId, editText, tasks]);

  const clearCompleted = useCallback(() => {
    const updated = tasks.filter((t) => !t.completed);
    setTasks(updated);
    saveTasks(updated);
  }, [tasks]);

  const completedCount = tasks.filter((t) => t.completed).length;
  const pendingCount = tasks.length - completedCount;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="absolute top-16 right-4 w-80 max-h-[70vh] bg-hub-surface border border-hub-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-scale-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hub-border">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-sm font-semibold">Tasks</h2>
            {tasks.length > 0 && (
              <span className="text-[11px] text-hub-text-muted">
                {pendingCount} pending
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-hub-surface-2 text-hub-text-muted hover:text-hub-text transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Add task input */}
        <div className="px-3 py-2 border-b border-hub-border">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder="Add a task..."
              className="flex-1 bg-hub-surface-2 border border-hub-border rounded-lg px-3 py-2 text-sm text-hub-text placeholder-hub-text-muted/50 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50"
            />
            <button
              type="button"
              onClick={addTask}
              disabled={!newTaskText.trim()}
              className="px-3 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto">
          {tasks.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="w-10 h-10 rounded-full bg-hub-surface-2 flex items-center justify-center mx-auto mb-2">
                <svg className="w-5 h-5 text-hub-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-hub-text-muted">No tasks yet</p>
              <p className="text-xs text-hub-text-muted/60 mt-1">Add tasks to track your ideas</p>
            </div>
          ) : (
            <ul className="py-1">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className={`group px-3 py-2 hover:bg-hub-surface-2 transition-colors ${
                    task.completed ? "opacity-60" : ""
                  }`}
                >
                  {editingId === task.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onBlur={saveEdit}
                        autoFocus
                        className="flex-1 bg-hub-surface-2 border border-violet-500/50 rounded-lg px-2 py-1 text-sm text-hub-text focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      />
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => toggleTask(task.id)}
                        className={`flex-shrink-0 w-4 h-4 mt-0.5 rounded border transition-colors ${
                          task.completed
                            ? "bg-violet-500 border-violet-500"
                            : "border-hub-border hover:border-violet-500/50"
                        }`}
                      >
                        {task.completed && (
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>

                      {/* Task text */}
                      <span
                        className={`flex-1 text-sm cursor-pointer ${
                          task.completed ? "text-hub-text-muted line-through" : "text-hub-text"
                        }`}
                        onClick={() => !task.completed && startEdit(task)}
                      >
                        {task.text}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Copy */}
                        <button
                          type="button"
                          onClick={() => copyTask(task.text)}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-hub-border text-hub-text-muted hover:text-hub-text transition-colors"
                          title="Copy"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>

                        {/* Push to chat */}
                        {onPushToChat && !task.completed && (
                          <button
                            type="button"
                            onClick={() => pushToChat(task.text)}
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-hub-border text-hub-text-muted hover:text-violet-400 transition-colors"
                            title="Send to chat"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                            </svg>
                          </button>
                        )}

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/10 text-hub-text-muted hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {completedCount > 0 && (
          <div className="border-t border-hub-border px-4 py-2 flex items-center justify-between">
            <span className="text-[11px] text-hub-text-muted">
              {completedCount} completed
            </span>
            <button
              type="button"
              onClick={clearCompleted}
              className="text-[11px] text-red-400 hover:text-red-300 transition-colors"
            >
              Clear completed
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Hook to get task count for the header pill
export function useTaskCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      const tasks = loadTasks();
      setCount(tasks.filter((t) => !t.completed).length);
    };

    updateCount();

    // Listen for storage changes (from other tabs)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) updateCount();
    };
    window.addEventListener("storage", handleStorage);

    // Poll for changes (same tab updates)
    const interval = setInterval(updateCount, 1000);

    return () => {
      window.removeEventListener("storage", handleStorage);
      clearInterval(interval);
    };
  }, []);

  return count;
}
