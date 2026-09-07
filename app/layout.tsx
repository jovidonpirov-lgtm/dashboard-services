import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Статус — аналитика услуг",
  description:
    "Мониторинг запуска государственных услуг, реестр и история изменений.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
