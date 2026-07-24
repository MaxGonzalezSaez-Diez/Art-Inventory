import { chmod } from "fs/promises";
import { execFile } from "child_process";

/**
 * Word/macOS often open freshly written files as read-only Protected View when
 * quarantine / zone attributes are present. Clear those and ensure the file is
 * user-writable so the artist can edit after generation.
 */
export async function makeGeneratedFileEditable(filePath: string): Promise<void> {
  try {
    await chmod(filePath, 0o644);
  } catch {
    /* ignore */
  }

  if (process.platform === "darwin") {
    await new Promise<void>((resolve) => {
      // Clear all xattrs (quarantine and friends), not only com.apple.quarantine.
      execFile("xattr", ["-c", filePath], () => resolve());
    });
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-Command", `Unblock-File -LiteralPath '${filePath.replace(/'/g, "''")}'`],
        () => resolve()
      );
    });
  }
}
