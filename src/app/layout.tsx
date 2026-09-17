import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workshop Flow Intelligence",
  description: "Operational intelligence for automotive workshop workflows.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
