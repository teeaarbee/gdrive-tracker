"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function OAuth2Callback() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams?.get("code");
    if (code) {
      // Send code to parent window
      window.opener.postMessage(
        {
          type: "oauth-callback",
          code,
        },
        window.location.origin
      );
      window.close();
    }
  }, [searchParams]);

  return (
    <div className="p-4">
      <p>Authentication successful! You can close this window.</p>
    </div>
  );
}
