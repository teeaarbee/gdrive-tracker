import { google } from "googleapis";

export async function getAuthenticatedClient(refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return oauth2Client;
}

export function getDriveService(auth: any) {
  return google.drive({ version: "v3", auth });
}
