import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SQL Agent — 智能数据分析助手",
  description: "基于 LLM 的自动化数据分析 Agent，支持多数据库查询、可视化图表和业务报告生成",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
