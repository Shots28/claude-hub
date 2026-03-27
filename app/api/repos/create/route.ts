// ---------------------------------------------------------------------------
// POST /api/repos/create — Create a new folder on the local filesystem
// This route is handled by the local bridge server, not Vercel.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies(req.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { parentPath, folderName } = body;

    if (!parentPath || !folderName) {
      return NextResponse.json(
        { error: "parentPath and folderName are required" },
        { status: 400 }
      );
    }

    // Validate folder name (no path separators, no dangerous characters)
    if (
      folderName.includes("/") ||
      folderName.includes("\\") ||
      folderName.startsWith(".") ||
      folderName.includes("..") ||
      !/^[a-zA-Z0-9_\-. ]+$/.test(folderName)
    ) {
      return NextResponse.json(
        { error: "Invalid folder name" },
        { status: 400 }
      );
    }

    // Expand ~ in parent path
    const expandedParent = parentPath.startsWith("~/")
      ? join(homedir(), parentPath.slice(2))
      : parentPath === "~"
      ? homedir()
      : parentPath;

    // Resolve and validate the parent path
    const resolvedParent = resolve(expandedParent);
    const home = homedir();

    // Security: parent must be under home directory
    if (!resolvedParent.startsWith(home)) {
      return NextResponse.json(
        { error: "Parent path must be under home directory" },
        { status: 400 }
      );
    }

    const newFolderPath = join(resolvedParent, folderName);

    // Create the folder
    await mkdir(newFolderPath, { recursive: true });

    return NextResponse.json(
      {
        success: true,
        folder: {
          name: folderName,
          path: newFolderPath,
          is_git_repo: false,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[repos/create] Error:", err);
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      return NextResponse.json(
        { error: "Folder already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create folder" },
      { status: 500 }
    );
  }
}
