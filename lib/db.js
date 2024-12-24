const { Pool } = require("pg");
const logger = require("./logger");

// Load database configuration from environment variables
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Add table creation function
const initializeTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tracked_folders (
        id SERIAL PRIMARY KEY,
        google_folder_id TEXT UNIQUE NOT NULL,
        folder_name TEXT NOT NULL,
        last_checked TIMESTAMP,
        folder_contents JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        owner_email TEXT,
        folder_size BIGINT,
        total_items INTEGER
      );

      CREATE TABLE IF NOT EXISTS folder_changes (
        id SERIAL PRIMARY KEY,
        tracked_folder_id INTEGER REFERENCES tracked_folders(id),
        google_folder_id TEXT NOT NULL,
        change_type TEXT NOT NULL,
        item_name TEXT NOT NULL,
        parent_name TEXT NOT NULL,
        item_id TEXT NOT NULL,
        mime_type TEXT,
        modified_time TIMESTAMP,
        size BIGINT,
        full_path TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        additional_data JSONB,
        modification_details JSONB
      );
    `);
    logger.info("Database tables initialized");
  } catch (error) {
    logger.error("Error initializing tables:", error);
    throw error;
  }
};

const db = {
  initializeTables, // Export the initialization function

  // Update addTrackedFolder to store contents
  async addTrackedFolder(folderId, folderName, contents) {
    try {
      const totalSize = contents.reduce(
        (sum, item) => sum + (parseInt(item.size) || 0),
        0
      );
      const ownerEmail = contents[0]?.owners?.[0]?.emailAddress || null;

      const query = `
        INSERT INTO tracked_folders (
          google_folder_id, folder_name, last_checked, folder_contents, 
          owner_email, folder_size, total_items
        )
        VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6)
        ON CONFLICT (google_folder_id) DO UPDATE 
        SET folder_contents = $3,
            folder_size = $5,
            total_items = $6,
            last_checked = CURRENT_TIMESTAMP
        RETURNING id`;

      const result = await pool.query(query, [
        folderId,
        folderName,
        JSON.stringify(contents),
        ownerEmail,
        totalSize,
        contents.length,
      ]);
      return result.rows[0]?.id;
    } catch (error) {
      logger.error("Error adding tracked folder:", error);
      throw error;
    }
  },

  // Add function to get stored contents
  async getFolderContents(folderId) {
    try {
      const query = `
        SELECT folder_contents 
        FROM tracked_folders 
        WHERE google_folder_id = $1`;
      const result = await pool.query(query, [folderId]);
      return result.rows[0]?.folder_contents || null;
    } catch (error) {
      logger.error("Error getting folder contents:", error);
      throw error;
    }
  },

  async hasRecentChange(folderId, changeType, itemName, parentName) {
    try {
      const query = `
        SELECT EXISTS (
          SELECT 1 FROM folder_changes 
          WHERE google_folder_id = $1 
          AND change_type = $2 
          AND item_name = $3 
          AND parent_name = $4
          AND created_at > NOW() - INTERVAL '1 hour'
        )`;
      const result = await pool.query(query, [
        folderId,
        changeType,
        itemName,
        parentName,
      ]);
      return result.rows[0].exists;
    } catch (error) {
      logger.error("Error checking for recent change:", error);
      throw error;
    }
  },

  async saveChange(
    trackedFolderId,
    googleFolderId,
    changeType,
    item,
    parentName,
    additionalData = {}
  ) {
    try {
      const hasRecent = await this.hasRecentChange(
        googleFolderId,
        changeType,
        item.name,
        parentName
      );
      if (hasRecent) {
        logger.debug(`Skipping duplicate change: ${changeType} - ${item.name}`);
        return;
      }

      const query = `
        INSERT INTO folder_changes (
          tracked_folder_id, google_folder_id, change_type, item_name, parent_name, 
          item_id, mime_type, modified_time, size,
          full_path, additional_data, modification_details
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;

      await pool.query(query, [
        trackedFolderId,
        googleFolderId,
        changeType,
        item.name,
        parentName,
        item.id,
        item.mimeType,
        item.modifiedTime,
        item.size || 0,
        item.fullPath || "",
        JSON.stringify(additionalData),
        JSON.stringify(item.modificationDetails || null),
      ]);
    } catch (error) {
      logger.error("Error saving change:", error);
      throw error;
    }
  },

  async updateLastChecked(folderId) {
    try {
      const query = `
        UPDATE tracked_folders 
        SET last_checked = CURRENT_TIMESTAMP 
        WHERE google_folder_id = $1`;
      await pool.query(query, [folderId]);
    } catch (error) {
      logger.error("Error updating last_checked:", error);
      throw error;
    }
  },

  async getFolderChanges(folderId) {
    try {
      const query = `
        SELECT * FROM folder_changes 
        WHERE google_folder_id = $1 
        ORDER BY created_at DESC`;
      const result = await pool.query(query, [folderId]);
      return result.rows;
    } catch (error) {
      logger.error("Error fetching folder changes:", error);
      throw error;
    }
  },
};

module.exports = db;
