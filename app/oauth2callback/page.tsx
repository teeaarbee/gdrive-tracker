"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function OAuth2Callback() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams?.get("code");
    if (code) {
      // Redirect to main page with auth code
      window.location.href = `/?code=${code}`;
    }
  }, [searchParams]);

  if (error) {
    return <div>Error: {error}</div>;
  }

  return <div>Authenticating...</div>;
}
