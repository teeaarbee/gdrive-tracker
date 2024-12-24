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
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { folderUrl, type } = req.query;
  const refreshToken = req.headers["x-refresh-token"] as string;

  if (!folderUrl || !refreshToken) {
    return res
      .status(400)
      .json({ error: "Folder URL and authentication token are required" });
  }

  // Extract folder ID from URL
  const folderId = extractFolderId(folderUrl as string);
  if (!folderId) {
    return res.status(400).json({ error: "Invalid folder URL" });
  }

  try {
    // Use the client's refresh token for authentication
    const auth = await getAuthenticatedClient(refreshToken);
    const driveService = getDriveService(auth);

    // Get folder metadata from Google Drive
    const folderMetadata = await driveService.files.get({
      fileId: folderId,
      fields:
        "id, name, mimeType, createdTime, modifiedTime, owners, shared, sharingUser, permissions",
    });

    switch (type) {
      case "changes":
        // Get folder changes history with logging
        const changes = await db.getFolderChanges(folderId as string);
        logger.debug(
          `Retrieved ${changes?.length || 0} changes for folder ${folderId}`
        );

        // Return 404 if no changes found
        if (!changes || changes.length === 0) {
          return res.status(404).json({
            message: "No changes found for this folder",
            folderId,
          });
        }

        return res.status(200).json({ changes });

      case "structure":
        // Get current folder structure
        const contents = await db.getFolderContents(folderId as string);
        const structure = buildFolderStructure(contents);
        return res.status(200).json({ structure });

      default:
        // Get both changes and structure with logging
        const [historyChanges, folderContents] = await Promise.all([
          db.getFolderChanges(folderId as string),
          db.getFolderContents(folderId as string),
        ]);

        logger.debug(
          `Retrieved ${historyChanges?.length || 0} changes and ${
            folderContents ? "valid" : "no"
          } contents for folder ${folderId}`
        );

        return res.status(200).json({
          folder: folderMetadata.data,
          changes: historyChanges || [],
          structure: buildFolderStructure(folderContents),
        });
    }
  } catch (error: any) {
    logger.error("Error fetching folder information:", error);
    return res.status(500).json({
      error: "Failed to fetch folder information",
      message: error.message,
    });
  }
}

function buildFolderStructure(contents: any[]) {
  const structure: any = { name: "root", type: "folder", children: {} };

  if (!contents) return structure;

  contents.forEach((item: any) => {
    const path = item.fullPath.split("/");
    let current = structure;

    path.forEach((name: string, index: number) => {
      if (!current.children[name]) {
        current.children[name] = {
          name,
          type:
            index === path.length - 1
              ? item.mimeType === "application/vnd.google-apps.folder"
                ? "folder"
                : "file"
              : "folder",
          children: {},
          ...(index === path.length - 1
            ? {
                id: item.id,
                mimeType: item.mimeType,
                modifiedTime: item.modifiedTime,
                size: item.size,
              }
            : {}),
        };
      }
      current = current.children[name];
    });
  });

  return structure;
}

function extractFolderId(url: string): string | null {
  try {
    // Handle different Google Drive URL formats
    const patterns = [
      /\/folders\/([a-zA-Z0-9-_]+)/, // Standard folder URL
      /\?id=([a-zA-Z0-9-_]+)/, // URL with id parameter
      /^([a-zA-Z0-9-_]+)$/, // Direct folder ID
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
