const logger = require("./logger");
const diff = require("diff");

class DiffTracker {
  constructor(driveService) {
    this.driveService = driveService;
  }

  async getFolderContents(folderId) {
    try {
      const allFiles = [];
      const processFolder = async (currentFolderId, parentPath = "") => {
        const response = await this.driveService.files.list({
          q: `'${currentFolderId}' in parents and trashed = false`,
          fields:
            "files(id, name, mimeType, modifiedTime, parents, size, owners)",
          pageSize: 1000,
        });

        for (const file of response.data.files) {
          file.fullPath = parentPath ? `${parentPath}/${file.name}` : file.name;
          allFiles.push(file);
          if (file.mimeType === "application/vnd.google-apps.folder") {
            await processFolder(file.id, file.fullPath);
          }
        }
      };

      await processFolder(folderId);
      return allFiles;
    } catch (error) {
      logger.error("Error fetching folder contents recursively:", error);
      throw error;
    }
  }

  async detectChanges(currentContents, lastContents) {
    if (!lastContents) return [];

    const changes = [];
    const currentMap = new Map(currentContents.map((item) => [item.id, item]));
    const lastMap = new Map(lastContents.map((item) => [item.id, item]));

    // Track items by name for rename detection
    const currentNameMap = new Map(
      currentContents.map((item) => [
        `${item.parents?.[0] || "root"}-${item.name}`,
        item,
      ])
    );
    const lastNameMap = new Map(
      lastContents.map((item) => [
        `${item.parents?.[0] || "root"}-${item.name}`,
        item,
      ])
    );

    // Check for all types of changes
    for (const [id, current] of currentMap) {
      const last = lastMap.get(id);

      if (!last) {
        // Check if this might be a renamed file
        const possibleRename = this.findPossibleRename(current, lastContents);
        if (possibleRename) {
          changes.push({
            type: "renamed",
            item: current,
            oldName: possibleRename.name,
            similarity: possibleRename.similarity,
          });
        } else {
          changes.push({ type: "added", item: current });
        }
      } else {
        // Enhanced modification detection
        if (current.modifiedTime !== last.modifiedTime) {
          const modificationDetails = await this.getModificationDetails(
            current,
            last
          );
          changes.push({
            type: "modified",
            item: current,
            modificationDetails,
          });
        }

        if (current.parents?.[0] !== last.parents?.[0]) {
          changes.push({
            type: "moved",
            item: current,
            oldParentId: last.parents?.[0],
            newParentId: current.parents?.[0],
          });
        }
      }
    }

    // Check for removed items
    for (const [id, last] of lastMap) {
      if (!currentMap.has(id) && !this.wasRenamed(last, changes)) {
        changes.push({ type: "removed", item: last });
      }
    }

    return changes;
  }

  findPossibleRename(current, lastContents) {
    const threshold = 0.8; // Similarity threshold for rename detection

    // Look for files with similar names that are missing in current contents
    for (const oldFile of lastContents) {
      if (
        current.mimeType === oldFile.mimeType &&
        current.size === oldFile.size
      ) {
        const similarity = this.calculateNameSimilarity(
          current.name,
          oldFile.name
        );

        if (similarity > threshold) {
          return {
            name: oldFile.name,
            similarity,
          };
        }
      }
    }
    return null;
  }

  calculateNameSimilarity(name1, name2) {
    // Remove file extensions for comparison
    const base1 = name1.replace(/\.[^/.]+$/, "");
    const base2 = name2.replace(/\.[^/.]+$/, "");

    // Use diff to calculate similarity
    const changes = diff.diffChars(base1.toLowerCase(), base2.toLowerCase());
    const similarity =
      changes.reduce((acc, part) => {
        return acc + (part.added || part.removed ? 0 : part.value.length);
      }, 0) / Math.max(base1.length, base2.length);

    return similarity;
  }

  wasRenamed(item, changes) {
    return changes.some(
      (change) => change.type === "renamed" && change.oldName === item.name
    );
  }

  async getParentFolderName(fileId) {
    try {
      const response = await this.driveService.files.get({
        fileId: fileId,
        fields: "parents",
      });

      if (!response.data.parents?.length) {
        return "root";
      }

      const parentId = response.data.parents[0];
      const parent = await this.driveService.files.get({
        fileId: parentId,
        fields: "name",
      });

      return parent.data.name;
    } catch (error) {
      logger.error("Error fetching parent folder name:", error);
      return "unknown";
    }
  }

  async getModificationDetails(current, previous) {
    const details = {
      previousModifiedTime: previous.modifiedTime,
      newModifiedTime: current.modifiedTime,
      previousSize: previous.size || 0,
      newSize: current.size || 0,
      sizeDelta: (current.size || 0) - (previous.size || 0),
    };

    // Add file-type specific details
    if (current.mimeType?.includes("document")) {
      // For Google Docs, we might want to track revision history
      try {
        const revisionDetails = await this.getRevisionDetails(current.id);
        details.revisionInfo = revisionDetails;
      } catch (error) {
        logger.warn(
          `Could not fetch revision details for ${current.name}:`,
          error
        );
      }
    }

    return details;
  }

  async getRevisionDetails(fileId) {
    try {
      const response = await this.driveService.revisions.list({
        fileId,
        fields: "revisions(id,modifiedTime,lastModifyingUser)",
      });

      return {
        lastRevision: response.data.revisions?.slice(-1)[0] || null,
        revisionCount: response.data.revisions?.length || 0,
      };
    } catch (error) {
      logger.error(
        `Error fetching revision details for file ${fileId}:`,
        error
      );
      return null;
    }
  }
}

module.exports = DiffTracker;
