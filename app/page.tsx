"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Change {
  id: number;
  tracked_folder_id: number;
  google_folder_id: string;
  change_type: string;
  item_name: string;
  parent_name: string;
  item_id: string;
  mime_type: string;
  modified_time: string;
  size: string;
  full_path: string;
  created_at: string;
  additional_data: any;
  modification_details: any;
}

export default function DriveTracker() {
  const [folderLink, setFolderLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [changes, setChanges] = useState<Change[]>([]);
  const [historicalChanges, setHistoricalChanges] = useState<Change[]>([]);
  const [folderInfo, setFolderInfo] = useState<{
    name?: string;
    fileCount?: number;
    createdTime?: string;
    modifiedTime?: string;
    shared?: boolean;
    owners?: Array<{
      displayName: string;
      emailAddress: string;
    }>;
    permissions?: Array<{
      role: string;
      type: string;
      emailAddress?: string;
    }>;
  } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const savedFolder = localStorage.getItem("activeFolder");
    const savedFolderLink = localStorage.getItem("folderLink");
    if (savedFolder) {
      setFolderLink(savedFolderLink || "");
    }
  }, []);

  useEffect(() => {
    if (folderLink) {
      localStorage.setItem("activeFolder", folderLink);
      fetchFolderInfo(folderLink);
      fetchHistoricalChanges(folderLink);
    }
  }, [folderLink]);

  useEffect(() => {
    if (!folderLink) return;

    // Poll for folder info every 30 seconds
    const folderInfoInterval = setInterval(() => {
      fetchFolderInfo(folderLink);
    }, 30000);

    // Poll for drive updates every 10 minutes
    const driveUpdateInterval = setInterval(() => {
      handleDriveUpdate();
    }, 600000); // 10 minutes in milliseconds

    return () => {
      clearInterval(folderInfoInterval);
      clearInterval(driveUpdateInterval);
    };
  }, [folderLink]);

  useEffect(() => {
    // Check if we have a refresh token
    const refreshToken = localStorage.getItem("googleRefreshToken");
    if (refreshToken) {
      setIsAuthenticated(true);
    }
  }, []);

  const fetchFolderInfo = async (folderId: string) => {
    try {
      const refreshToken = localStorage.getItem("googleRefreshToken");
      const response = await fetch(
        `/api/folder_info?folderUrl=${folderId}&type=info`,
        {
          headers: {
            "X-Refresh-Token": refreshToken || "",
          },
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch folder info");
      }

      const transformedData = {
        name: data.folder.name,
        fileCount: Object.keys(data.structure.children).length,
        createdTime: data.folder.createdTime,
        modifiedTime: data.folder.modifiedTime,
        shared: data.folder.shared,
        owners: data.folder.owners,
        permissions: data.folder.permissions,
      };

      setFolderInfo(transformedData);
    } catch (error) {
      toast.error("Failed to load folder information");
    }
  };

  const fetchHistoricalChanges = async (folderId: string) => {
    try {
      const refreshToken = localStorage.getItem("googleRefreshToken");
      const response = await fetch(
        `/api/folder_info?folderUrl=${folderId}&type=changes`,
        {
          headers: {
            "X-Refresh-Token": refreshToken || "",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch history");
      }

      setHistoricalChanges(data.changes);
    } catch (error) {
      toast.error("Failed to load change history");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const refreshToken = localStorage.getItem("googleRefreshToken");
      const response = await fetch("/api/drive_update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Refresh-Token": refreshToken || "",
        },
        body: JSON.stringify({ folderLink }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to track folder");
      }

      const folderId = data.changes[0]?.item.parents?.[0];
      if (folderId) {
        localStorage.setItem("activeFolder", folderId);
        localStorage.setItem("folderLink", folderLink);
      }
      setChanges(data.changes);
      toast.success(data.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  function formatFileSize(bytes: string): string {
    const size = parseInt(bytes);
    if (isNaN(size)) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let filesize = size;

    while (filesize >= 1024 && i < units.length - 1) {
      filesize /= 1024;
      i++;
    }

    return `${filesize.toFixed(1)} ${units[i]}`;
  }

  const renderChangeItem = (change: Change, isHistorical: boolean = false) => (
    <div className="p-4 border rounded shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium flex items-center gap-2">
          {change.change_type === "added"
            ? "➕"
            : change.change_type === "removed"
            ? "❌"
            : "🔄"}{" "}
          {change.change_type.charAt(0).toUpperCase() +
            change.change_type.slice(1)}
        </div>
        <div className="text-sm text-gray-500">
          {change.modified_time && (
            <time dateTime={change.modified_time}>
              {new Date(change.modified_time).toLocaleString()}
            </time>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="font-medium text-gray-800">{change.item_name}</div>
          <div className="text-sm text-gray-500 mb-1">
            📁 {change.full_path || "Unknown path"}
          </div>
          <div className="text-sm text-gray-600 space-y-1">
            <div>Type: {change.mime_type.split("/").pop()}</div>
            {change.size && <div>Size: {formatFileSize(change.size)}</div>}
          </div>
        </div>
      </div>
    </div>
  );

  const handleAuth = async () => {
    try {
      // Get auth URL
      const response = await fetch("/api/auth/google");
      const { url } = await response.json();

      // Open popup for authentication
      const popup = window.open(url, "Google Auth", "width=800,height=600");

      // Listen for the OAuth callback
      window.addEventListener("message", async (event) => {
        if (event.data.type === "oauth-callback") {
          const { code } = event.data;

          // Exchange code for tokens
          const tokenResponse = await fetch(`/api/auth/google?code=${code}`);
          const tokens = await tokenResponse.json();

          if (tokens.refresh_token) {
            localStorage.setItem("googleRefreshToken", tokens.refresh_token);
            localStorage.setItem("googleAccessToken", tokens.access_token);
            setIsAuthenticated(true);
            toast.success("Successfully authenticated with Google");
          }
        }
      });
    } catch (error) {
      toast.error("Authentication failed");
    }
  };

  // Add new helper function for drive updates
  const handleDriveUpdate = async () => {
    if (!folderLink || loading) return;

    try {
      const refreshToken = localStorage.getItem("googleRefreshToken");
      const response = await fetch("/api/drive_update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Refresh-Token": refreshToken || "",
        },
        body: JSON.stringify({ folderLink }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update folder");
      }

      setChanges(data.changes);
    } catch (error) {
      console.error("Failed to poll for updates:", error);
      // Silently fail for automatic updates to avoid spam
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Google Drive Authentication Required</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={handleAuth}>Authenticate with Google</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Google Drive Folder Tracker</h1>

      <Card className="mb-8">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex gap-4">
            <Input
              type="text"
              value={folderLink}
              onChange={(e) => setFolderLink(e.target.value)}
              placeholder="Enter Google Drive folder link"
              className="flex-1"
              required
            />
            <Button type="submit" disabled={loading}>
              {loading ? "Tracking..." : "Track Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        {folderInfo && (
          <Card>
            <CardHeader>
              <CardTitle>Folder Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p>
                  <strong>Name:</strong> {folderInfo.name}
                </p>
                {folderInfo.owners && folderInfo.owners[0] && (
                  <p>
                    <strong>Owner:</strong> {folderInfo.owners[0].displayName} (
                    {folderInfo.owners[0].emailAddress})
                  </p>
                )}
                <p>
                  <strong>Total Files:</strong> {folderInfo.fileCount}
                </p>
                {folderInfo.createdTime && (
                  <p>
                    <strong>Created:</strong>{" "}
                    {new Date(folderInfo.createdTime).toLocaleString()}
                  </p>
                )}
                {folderInfo.modifiedTime && (
                  <p>
                    <strong>Last Modified:</strong>{" "}
                    {new Date(folderInfo.modifiedTime).toLocaleString()}
                  </p>
                )}
                <p>
                  <strong>Sharing Status:</strong>{" "}
                  {folderInfo.shared ? "Shared" : "Private"}
                </p>
                {folderInfo.permissions &&
                  folderInfo.permissions.length > 0 && (
                    <div>
                      <strong>Shared With:</strong>
                      <ul className="mt-1 ml-4 list-disc">
                        {folderInfo.permissions
                          .filter((p) => p.emailAddress)
                          .map((permission, index) => (
                            <li key={index}>
                              {permission.emailAddress} ({permission.role})
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="recent" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="recent">Recent Changes</TabsTrigger>
            <TabsTrigger value="history">Change History</TabsTrigger>
          </TabsList>

          <TabsContent value="recent">
            <Card>
              <CardHeader>
                <CardTitle>Recent Changes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {changes.map((change, index) => (
                  <div key={index}>{renderChangeItem(change)}</div>
                ))}
                {changes.length === 0 && (
                  <p className="text-muted-foreground">
                    No recent changes to display
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Change History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {historicalChanges.map((change, index) => (
                  <div key={`history-${index}`}>
                    {renderChangeItem(change, true)}
                  </div>
                ))}
                {historicalChanges.length === 0 && (
                  <p className="text-muted-foreground">
                    No historical changes to display
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
