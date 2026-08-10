import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "パープラン | Par Plan",
  description: "出発地からの総額でゴルフラウンドプランを比較",
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
