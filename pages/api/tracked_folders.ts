import { NextApiRequest, NextApiResponse } from "next";
import logger from "../../lib/logger";
import db from "../../lib/db";
import {
  getAuthenticatedClient,
  getDriveService,
} from "../../lib/googleAuthClient";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    try {
      const folders = await db.getAllTrackedFolders();
      logger.debug(`Retrieved ${folders.length} tracked folders`);

      return res.status(200).json({
        folders,
        count: folders.length,
      });
    } catch (error: any) {
      logger.error("Error fetching tracked folders:", error);
      return res.status(500).json({
        error: "Failed to fetch tracked folders",
        message: error.message,
      });
    }
  }

  if (req.method === "POST") {
    const { folderUrl } = req.body;
    const refreshToken = req.headers["x-refresh-token"] as string;

    if (!folderUrl || !refreshToken) {
      return res.status(400).json({
        error: "Folder URL and authentication token are required",
      });
    }

    try {
      // Extract folder ID from URL
      const folderId = extractFolderId(folderUrl);
      if (!folderId) {
        return res.status(400).json({ error: "Invalid folder URL" });
      }

      // Check if folder already exists
      const existingFolders = await db.getAllTrackedFolders();
      if (
        existingFolders.some(
          (f: { google_folder_id: string }) => f.google_folder_id === folderId
        )
      ) {
        return res
          .status(409)
          .json({ error: "Folder is already being tracked" });
      }

      // Verify folder exists and get its details
      const auth = await getAuthenticatedClient(refreshToken);
      const driveService = getDriveService(auth);
      const folder = await driveService.files.get({
        fileId: folderId,
        fields: "name",
      });

      // Add folder to tracking
      await db.addTrackedFolder(folderId, folder.data.name, []);
      logger.info(`Added new folder to tracking: ${folder.data.name}`);

      return res.status(201).json({
        message: "Folder added to tracking successfully",
        folder: {
          google_folder_id: folderId,
          folder_name: folder.data.name,
          is_active: true,
        },
      });
    } catch (error: any) {
      logger.error("Error adding folder to tracking:", error);
      return res.status(500).json({
        error: "Failed to add folder to tracking",
        message: error.message,
      });
    }
  }

  if (req.method === "PUT") {
    const { folderId, isActive } = req.body;

    if (typeof folderId !== "string" || typeof isActive !== "boolean") {
      return res.status(400).json({
        error:
          "Invalid parameters. Required: folderId (string) and isActive (boolean)",
      });
    }

    try {
      const updatedFolder = await db.updateFolderActiveStatus(
        folderId,
        isActive
      );
      if (!updatedFolder) {
        return res.status(404).json({ error: "Folder not found" });
      }

      return res.status(200).json({
        message: `Folder tracking ${
          isActive ? "enabled" : "disabled"
        } successfully`,
        folder: updatedFolder,
      });
    } catch (error: any) {
      logger.error("Error updating folder tracking status:", error);
      return res.status(500).json({
        error: "Failed to update folder tracking status",
        message: error.message,
      });
    }
  }

  if (req.method === "DELETE") {
    const { folderId } = req.query;

    if (typeof folderId !== "string") {
      return res.status(400).json({
        error: "Invalid parameters. Required: folderId as query parameter",
      });
    }

    try {
      const result = await db.removeTrackedFolder(folderId);
      if (!result) {
        return res.status(404).json({ error: "Folder not found" });
      }

      return res.status(200).json({
        message: "Folder removed from tracking successfully",
        folderId,
      });
    } catch (error: any) {
      logger.error("Error removing tracked folder:", error);
      return res.status(500).json({
        error: "Failed to remove folder from tracking",
        message: error.message,
      });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

function extractFolderId(url: string): string | null {
  try {
    const patterns = [
      /\/folders\/([a-zA-Z0-9-_]+)/,
      /\?id=([a-zA-Z0-9-_]+)/,
      /^([a-zA-Z0-9-_]+)$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  } catch (error) {
    logger.error("Error extracting folder ID:", error);
    return null;
  }
}
