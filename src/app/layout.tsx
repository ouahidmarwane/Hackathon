import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const workshopFont = localFont({ src: "../../public/fonts/manrope.ttf", variable: "--font-workshop", display: "swap" });

export const metadata: Metadata = {
  title: "Workshop Flow Intelligence",
  description: "Operational intelligence for automotive workshop workflows.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={workshopFont.variable}>
        {children}
      </body>
    </html>
  );
}
