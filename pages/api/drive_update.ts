import logger from "../../lib/logger";
import db from "../../lib/db";
import {
  getAuthenticatedClient,
  getDriveService,
} from "../../lib/googleAuthClient";
import DiffTracker from "../../lib/diffTracker";
import { NextApiRequest, NextApiResponse } from "next";

async function extractFolderId(folderLink: string) {
  const match = folderLink.match(/folders\/([^/?]+)/);
  if (!match) {
    throw new Error("Invalid Google Drive folder link");
  }
  return match[1];
}

// Main handler function for the API route
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { folderLink } = req.body;
  const refreshToken = req.headers["x-refresh-token"] as string;

  if (!folderLink || !refreshToken) {
    return res
      .status(400)
      .json({ error: "Folder link and authentication token are required" });
  }

  try {
    // Use the client's refresh token for authentication
    const auth = await getAuthenticatedClient(refreshToken);
    const driveService = getDriveService(auth);

    const folderId = await extractFolderId(folderLink);
    await db.initializeTables();

    // Get folder details
    const folder = await driveService.files.get({
      fileId: folderId,
      fields: "name",
    });

    const diffTracker = new DiffTracker(driveService);
    const currentContents = await diffTracker.getFolderContents(folderId);
    const previousContents = await db.getFolderContents(folderId);

    // First run - just store the contents without recording changes
    if (!previousContents) {
      await db.addTrackedFolder(folderId, folder.data.name, currentContents);
      logger.info(
        "Initial folder contents stored - no changes recorded for first run"
      );
      return res.status(200).json({
        message: "Initial folder contents stored",
        changes: [],
      });
    }

    // For subsequent runs, detect and process changes
    const changes = await diffTracker.detectChanges(
      currentContents,
      previousContents
    );

    // Update folder contents and get tracked folder ID
    const trackedFolderId = await db.addTrackedFolder(
      folderId,
      folder.data.name,
      currentContents
    );

    // Process detected changes
    for (const change of changes) {
      const parentName = await diffTracker.getParentFolderName(change.item.id);
      await db.saveChange(
        trackedFolderId,
        folderId,
        change.type,
        change.item,
        parentName
      );
    }

    await db.updateLastChecked(folderId);
    logger.info(
      `Folder tracking completed successfully with ${changes.length} changes detected`
    );

    return res.status(200).json({
      message: "Folder tracking completed successfully",
      changes: changes,
    });
  } catch (error: any) {
    logger.error("Error tracking folder:", error);
    return res.status(500).json({
      error: "Failed to track folder",
      message: error.message,
    });
  }
}
