import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "shift-craft-salon",
  description: "美容室向けシフト自動作成ツール（制約ベース最適化）",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
