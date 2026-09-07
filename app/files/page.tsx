import { ServiceFiles } from "@/components/service-files";
export default function FilesPage() {
  return (
    <main className="public-files">
      <a className="text-button" href="/">
        ← Дашборд услуг
      </a>
      <h1>Файлы услуг</h1>
      <p className="muted">
        Документы можно просматривать и скачивать без входа.
      </p>
      <ServiceFiles />
    </main>
  );
}
