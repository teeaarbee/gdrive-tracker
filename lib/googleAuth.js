const { google } = require("googleapis");
const logger = require("./logger");

class GoogleDriveAuth {
  constructor() {
    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  async authenticate() {
    try {
      // Check existing refresh token
      if (process.env.GOOGLE_REFRESH_TOKEN) {
        this.auth.setCredentials({
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        });
        return this.auth;
      }

      // Generate auth URL for permanent access
      const authUrl = this.auth.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: ["https://www.googleapis.com/auth/drive"],
      });

      logger.info(
        `One-time setup: Please visit this URL to authenticate: ${authUrl}`
      );
      logger.info(
        "After authentication, you will receive a refresh token that can be used for permanent access"
      );

      // Get the authorization code
      const code = await this.waitForAuthorizationCode();

      // Exchange the code for tokens
      const { tokens } = await this.auth.getToken(code);

      if (!tokens.refresh_token) {
        logger.error(
          "No refresh token received. Please ensure you have revoked previous access and try again"
        );
        throw new Error("No refresh token received");
      }

      // Save the refresh token to your .env file
      logger.info("IMPORTANT: Add this refresh token to your .env file:");
      logger.info(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);

      this.auth.setCredentials(tokens);
      return this.auth;
    } catch (error) {
      logger.error("Authentication error:", error);
      throw error;
    }
  }

  // Helper method to get authorization code (basic implementation)
  async waitForAuthorizationCode() {
    return new Promise((resolve, reject) => {
      const express = require("express");
      const app = express();
      const server = app.listen(3000, () => {
        logger.info("Waiting for Google authentication...");
      });

      app.get("/oauth2callback", (req, res) => {
        const code = req.query.code;
        if (!code) {
          reject(new Error("No authorization code received"));
          return;
        }

        // Send a success message to the browser
        res.send("Authentication successful! You can close this window.");

        // Close the server
        server.close();

        // Resolve the promise with the authorization code
        resolve(code);
      });
    });
  }

  getDriveService() {
    return google.drive({ version: "v3", auth: this.auth });
  }
}

module.exports = new GoogleDriveAuth();
