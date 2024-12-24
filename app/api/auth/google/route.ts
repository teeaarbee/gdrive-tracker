import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");

  if (!code) {
    // Generate authentication URL
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/drive"],
      prompt: "consent", // Force to get refresh token
    });

    return NextResponse.json({ url });
  }

  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    return NextResponse.json({
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expiry_date: tokens.expiry_date,
    });
  } catch (error) {
    console.error("Token exchange error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 400 }
    );
  }
}
