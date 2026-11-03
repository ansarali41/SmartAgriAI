"use client";

import { SessionProvider } from "next-auth/react";
import { SWRConfig } from "swr";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SWRConfig
        value={{
          fetcher: (url: string) =>
            fetch(url).then((r) => {
              if (!r.ok) throw new Error("Request failed");
              return r.json();
            }),
          revalidateOnFocus: false,
        }}
      >
        {children}
      </SWRConfig>
    </SessionProvider>
  );
}
