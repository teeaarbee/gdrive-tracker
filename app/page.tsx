"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useInterval } from "@/lib/hooks/useInterval";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Clock,
  Folder,
  FolderOpen,
  RefreshCw,
  FileIcon,
  Trash2,
  Power,
  Eye,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileEdit,
  FilePlus2,
  FileX2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TrackedFolder {
  google_folder_id: string;
  folder_name: string;
  last_modified?: string;
  is_active: boolean;
}

interface DriveChangeItem {
  mimeType: string;
  parents: string[];
  owners: {
    displayName: string;
    emailAddress: string;
    photoLink?: string;
  }[];
  size: string;
  id: string;
  name: string;
  modifiedTime: string;
  fullPath: string;
}

interface DriveChange {
  type: "added" | "removed" | "modified";
  item: DriveChangeItem;
}

interface FolderInfoChange {
  id: number;
  tracked_folder_id: number;
  google_folder_id: string;
  change_type: "added" | "removed" | "modified";
  item_name: string;
  parent_name: string;
  item_id: string;
  mime_type: string;
  modified_time: string;
  size: string;
  full_path: string;
  created_at: string;
  additional_data: Record<string, any>;
  modification_details: any;
}

interface FolderChanges {
  folderId: string | null;
  changes: FolderInfoChange[];
  isLoading: boolean;
}

interface FolderAction {
  folderId: string;
  action: "delete" | "toggle";
  isActive?: boolean;
}

export default function DriveFolderTracker() {
  const [isLoading, setIsLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [folders, setFolders] = useState<TrackedFolder[]>([]);
  const [newFolderUrl, setNewFolderUrl] = useState("");
  const [changes, setChanges] = useState<DriveChange[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const POLL_INTERVAL = 30000; // 30 seconds
  const [folderChanges, setFolderChanges] = useState<FolderChanges>({
    folderId: null,
    changes: [],
    isLoading: false,
  });
  const [hasNewChanges, setHasNewChanges] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check for auth code on load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
      handleAuthCode(code);
    }

    // Load saved refresh token
    const savedToken = localStorage.getItem("googleRefreshToken");
    if (savedToken) {
      setRefreshToken(savedToken);
      loadFolders(savedToken);
    }
  }, []);

  // Add polling functionality
  useInterval(
    async () => {
      if (refreshToken && folders.length > 0) {
        await checkFolderUpdates();
      }
    },
    isPolling ? POLL_INTERVAL : null
  );

  const handleAuthCode = async (code: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/auth/google?code=${code}`);
      const data = await response.json();

      if (data.refresh_token) {
        localStorage.setItem("googleRefreshToken", data.refresh_token);
        setRefreshToken(data.refresh_token);
        loadFolders(data.refresh_token);

        toast.success(
          "Successfully authenticated. You can now start tracking folders"
        );
      }
    } catch (error) {
      toast.error("Authentication failed. Please try again");
    } finally {
      setIsLoading(false);
      window.history.replaceState({}, "", "/");
    }
  };

  const startAuth = async () => {
    try {
      const response = await fetch("/api/auth/google");
      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      toast.error("Failed to start authentication. Please try again");
    }
  };

  const loadFolders = async (token: string) => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/tracked_folders", {
        headers: {
          "X-Refresh-Token": token,
        },
      });
      const data = await response.json();
      setFolders(data.folders);
    } catch (error) {
      toast.error("Failed to load folders. Please try again");
    } finally {
      setIsLoading(false);
    }
  };

  const addFolder = async () => {
    if (!refreshToken || !newFolderUrl) return;

    try {
      setIsLoading(true);
      const response = await fetch("/api/tracked_folders", {
        method: "POST",
        headers: {
          "X-Refresh-Token": refreshToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ folderUrl: newFolderUrl }),
      });

      if (response.ok) {
        setNewFolderUrl("");
        loadFolders(refreshToken);
        toast.success("Folder added successfully");
      }
    } catch (error) {
      toast.error("Failed to add folder. Please check the URL and try again");
    } finally {
      setIsLoading(false);
    }
  };

  // Add new functions for folder management
  const handleFolderAction = async ({
    folderId,
    action,
    isActive,
  }: FolderAction) => {
    if (!refreshToken) return;

    try {
      setIsLoading(true);
      let response;

      if (action === "delete") {
        response = await fetch(`/api/tracked_folders?folderId=${folderId}`, {
          method: "DELETE",
          headers: { "X-Refresh-Token": refreshToken },
        });
      } else if (action === "toggle") {
        response = await fetch("/api/tracked_folders", {
          method: "PUT",
          headers: {
            "X-Refresh-Token": refreshToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ folderId, isActive }),
        });
      }

      if (response?.ok) {
        await loadFolders(refreshToken);
        toast.success(
          action === "delete"
            ? "Folder removed"
            : `Folder ${isActive ? "activated" : "deactivated"}`
        );
      }
    } catch (error) {
      toast.error("Action failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const checkFolderUpdates = async () => {
    if (!refreshToken) return;

    try {
      setIsRefreshing(true);
      const activeFolders = folders.filter((f) => f.is_active);

      // Check all folders in parallel using Promise.all
      const checkPromises = activeFolders.map((folder) =>
        fetch("/api/drive_update", {
          method: "POST",
          headers: {
            "X-Refresh-Token": refreshToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            folderLink: `https://drive.google.com/folders/${folder.google_folder_id}`,
          }),
        }).then((res) => res.json())
      );

      const results = await Promise.all(checkPromises);

      // Combine all changes
      const allChanges = results.flatMap((data) => data.changes || []);
      if (allChanges.length > 0) {
        setChanges((prev) => [...allChanges, ...prev]);
        setHasNewChanges(true);
        loadFolders(refreshToken);
      }
    } catch (error) {
      console.error("Error checking for updates:", error);
      toast.error("Failed to check for updates");
    } finally {
      setIsRefreshing(false);
    }
  };

  const getFolderChanges = async (folderId: string) => {
    if (!refreshToken) return;

    try {
      setFolderChanges((prev) => ({ ...prev, isLoading: true, folderId }));
      const response = await fetch(
        `/api/folder_info?folderUrl=https://drive.google.com/folders/${folderId}&type=changes`,
        {
          headers: {
            "X-Refresh-Token": refreshToken,
          },
        }
      );

      const data = await response.json();
      setFolderChanges((prev) => ({
        ...prev,
        changes: data.changes || [],
        isLoading: false,
      }));
    } catch (error) {
      toast.error("Failed to load folder changes. Please try again");
      setFolderChanges((prev) => ({ ...prev, isLoading: false }));
    }
  };

  // Add this helper function near the top
  const getChangeIcon = (type: string, mimeType: string) => {
    if (type === "added")
      return <FilePlus2 className="h-4 w-4 text-green-500" />;
    if (type === "removed") return <FileX2 className="h-4 w-4 text-red-500" />;
    return <FileEdit className="h-4 w-4 text-yellow-500" />;
  };

  // Update the ChangesDisplay component
  const ChangesDisplay = ({
    change,
    folderName,
  }: {
    change: DriveChange | FolderInfoChange;
    folderName?: string;
  }) => {
    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date instanceof Date && !isNaN(date.getTime())
        ? date.toLocaleString()
        : "Date unavailable";
    };

    const isDriverChange = (
      change: DriveChange | FolderInfoChange
    ): change is DriveChange => {
      return "type" in change;
    };

    const getChangeDetails = () => {
      if (isDriverChange(change)) {
        return {
          type: change.type,
          name: change.item.name,
          modifiedTime: change.item.modifiedTime,
          size: change.item.size,
          path: change.item.fullPath,
          mimeType: change.item.mimeType,
          owner: change.item.owners?.[0],
        };
      } else {
        return {
          type: change.change_type,
          name: change.item_name,
          modifiedTime: change.modified_time,
          size: change.size,
          path: change.full_path,
          mimeType: change.mime_type,
          owner: change.additional_data?.owners?.[0],
        };
      }
    };

    const details = getChangeDetails();
    const displayPath = details.path || "Root folder";
    const sizeInMB = (parseInt(details.size) / (1024 * 1024)).toFixed(2);

    return (
      <Card className="hover:bg-accent/50 transition-colors">
        <CardContent className="p-4 flex items-start gap-4">
          {getChangeIcon(details.type, details.mimeType)}
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{details.name}</span>
              {folderName && (
                <span className="text-sm text-muted-foreground">
                  in {folderName}
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
              {details.owner && (
                <div className="flex items-center gap-2 col-span-2">
                  {details.owner.photoLink && (
                    <img
                      src={details.owner.photoLink}
                      alt={details.owner.displayName}
                      className="w-5 h-5 rounded-full"
                    />
                  )}
                  <span>{details.owner.displayName}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(details.modifiedTime)}
              </div>
              <div className="flex items-center gap-1">
                <FileIcon className="h-3 w-3" />
                {sizeInMB} MB
              </div>
              <div className="flex items-center gap-1 col-span-2">
                <FolderOpen className="h-3 w-3" />
                {displayPath}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Add this helper function
  const groupChangesByTime = (changes: FolderInfoChange[]) => {
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisMonth = new Date(today);
    thisMonth.setMonth(thisMonth.getMonth() - 1);

    return changes.reduce((groups, change) => {
      const changeDate = new Date(change.created_at);

      let period = "Older";
      if (changeDate >= today) {
        period = "Today";
      } else if (changeDate >= yesterday) {
        period = "Yesterday";
      } else if (changeDate >= thisWeek) {
        period = "This Week";
      } else if (changeDate >= thisMonth) {
        period = "This Month";
      }

      if (!groups[period]) {
        groups[period] = [];
      }
      groups[period].push(change);
      return groups;
    }, {} as Record<string, FolderInfoChange[]>);
  };

  // Update the folders tab content
  const FoldersTab = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {folders.map((folder) => (
        <Card
          key={folder.google_folder_id}
          className={`${
            folder.is_active ? "border-primary/50" : "border-muted"
          } transition-colors`}
        >
          <CardHeader className="p-4">
            <CardTitle className="flex justify-between items-center text-base">
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4" />
                <span>{folder.folder_name}</span>
                {folder.is_active ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
              <Clock className="h-3 w-3" />
              Last modified: {folder.last_modified || "Never"}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => getFolderChanges(folder.google_folder_id)}
              >
                <Eye className="h-4 w-4 mr-1" />
                Changes
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() =>
                  handleFolderAction({
                    folderId: folder.google_folder_id,
                    action: "toggle",
                    isActive: !folder.is_active,
                  })
                }
              >
                <Power className="h-4 w-4 mr-1" />
                {folder.is_active ? "Disable" : "Enable"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() =>
                  handleFolderAction({
                    folderId: folder.google_folder_id,
                    action: "delete",
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog
        open={!!folderChanges.folderId}
        onOpenChange={() =>
          setFolderChanges({ folderId: null, changes: [], isLoading: false })
        }
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Folder Changes History
              {folderChanges.isLoading && (
                <Loader2 className="ml-2 h-4 w-4 inline animate-spin" />
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-6">
            {folderChanges.changes.length === 0 ? (
              <p className="text-center text-muted-foreground">
                No changes recorded for this folder
              </p>
            ) : (
              Object.entries(groupChangesByTime(folderChanges.changes)).map(
                ([period, changes]) => (
                  <div key={period}>
                    <h3 className="font-medium mb-3 text-muted-foreground flex items-center gap-2">
                      {period}
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                        {changes.length}
                      </span>
                    </h3>
                    <div className="space-y-4">
                      {changes.map((change) => (
                        <ChangesDisplay key={change.id} change={change} />
                      ))}
                    </div>
                  </div>
                )
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  // Add polling controls
  const PollingControls = () => (
    <div className="flex justify-between items-center mb-4 gap-2">
      <Button
        variant={isPolling ? "destructive" : "default"}
        onClick={() => setIsPolling(!isPolling)}
        className="flex items-center gap-2"
      >
        {isPolling ? (
          <>
            <AlertCircle className="h-4 w-4" />
            Stop Monitoring
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Start Monitoring
          </>
        )}
      </Button>
      <Button
        variant="outline"
        onClick={checkFolderUpdates}
        disabled={isRefreshing}
        className="flex items-center gap-2"
      >
        {isRefreshing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Check Now
      </Button>
    </div>
  );

  return (
    <div className="container mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Google Drive Folder Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          {!refreshToken ? (
            <Button onClick={startAuth} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Connect Google Drive"
              )}
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Paste Google Drive folder URL"
                  value={newFolderUrl}
                  onChange={(e) => setNewFolderUrl(e.target.value)}
                />
                <Button
                  onClick={addFolder}
                  disabled={isLoading || !newFolderUrl}
                >
                  Add Folder
                </Button>
              </div>

              <PollingControls />

              <Tabs
                defaultValue="folders"
                onValueChange={(value) => {
                  if (value === "changes") {
                    setHasNewChanges(false);
                  }
                }}
              >
                <TabsList>
                  <TabsTrigger value="folders">Tracked Folders</TabsTrigger>
                  <TabsTrigger value="changes" className="relative">
                    Recent Changes
                    {hasNewChanges && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="folders">
                  <FoldersTab />
                </TabsContent>

                <TabsContent value="changes">
                  <div className="space-y-4">
                    {changes.length === 0 ? (
                      <p className="text-center text-muted-foreground">
                        No recent changes detected
                      </p>
                    ) : (
                      changes.map((change) => {
                        const folder = folders.find((f) =>
                          change.item.parents?.includes(f.google_folder_id)
                        );
                        return (
                          <ChangesDisplay
                            key={change.item.id}
                            change={change}
                            folderName={folder?.folder_name}
                          />
                        );
                      })
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
