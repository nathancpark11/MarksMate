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
  title: "BulletProof – AI Military Performance Mark Generator",
  description:
    "AI-powered platform to create, track, and improve military performance bullets. Built for Coast Guard members to strengthen marks, save time, and boost advancement potential.",
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
        <div className="app-classification-bar flex h-(--unclassified-bar-height) w-full items-center justify-center text-center text-xs font-semibold tracking-wide">
          UNCLASSIFIED
        </div>
        <main className="flex-1">{children}</main>
        <footer className="app-footer w-full border-t px-4 py-2 text-center text-xs font-medium">
          Unofficial Tool – Do not enter classified, CUI, or operationally sensitive information.
        </footer>
      </body>
    </html>
  );
}
