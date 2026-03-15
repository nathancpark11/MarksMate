import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MarksMate",
  description: "Your personal AI marks assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <div className="flex h-(--unclassified-bar-height) w-full items-center justify-center bg-green-500 text-center text-xs font-semibold tracking-wide text-black">
          UNCLASSIFIED
        </div>
        <main className="flex-1">{children}</main>
        <footer className="w-full border-t border-slate-300/80 bg-slate-100/90 px-4 py-2 text-center text-xs font-medium text-slate-800">
          Unofficial Tool – Do not enter classified, CUI, or operationally sensitive information.
        </footer>
      </body>
    </html>
  );
}
