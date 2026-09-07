"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Paperclip, Trash2, ExternalLink } from "lucide-react";
import { MAX_FILE_SIZE, type FileEntry } from "@/lib/file-model";
export const fileAccept = ".pdf,.doc,.docx,.png,.jpg,.jpeg";
async function request(path: string, options?: RequestInit) {
  const r = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Не удалось выполнить операцию.");
  return data;
}
export function ServiceFiles({
  serviceId,
  admin = false,
  initialFiles = [],
}: {
  serviceId?: string;
  admin?: boolean;
  initialFiles?: File[];
}) {
  const [files, setFiles] = useState<FileEntry[]>([]),
    [selected, setSelected] = useState<File[]>(initialFiles),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(""),
    [query, setQuery] = useState(""),
    [confirm, setConfirm] = useState<string | null>(null);
  const started = useRef(false),
    input = useRef<HTMLInputElement>(null);
  async function reload() {
    setLoading(true);
    setError("");
    try {
      setFiles(
        await request(
          "/api/files" +
            (serviceId ? "?serviceId=" + encodeURIComponent(serviceId) : ""),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function upload(chosen: File[]) {
    if (!serviceId || !chosen.length || busy) return;
    setBusy(true);
    setError("");
    const remaining = [...chosen];
    try {
      for (const file of chosen) {
        if (file.size > MAX_FILE_SIZE)
          throw new Error(`${file.name}: максимальный размер — 20 МБ.`);
        setProgress(`Загрузка: ${file.name}`);
        const upload = await request("/api/files", {
          method: "POST",
          body: JSON.stringify({ serviceId, name: file.name, size: file.size }),
        });
        try {
          const body = new FormData();
          for (const [k, v] of Object.entries(upload.fields))
            body.append(k, String(v));
          body.append("file", file);
          const response = await fetch(upload.url, { method: "POST", body });
          if (!response.ok)
            throw new Error("Хранилище не приняло файл. Повторите загрузку.");
          await request("/api/files/" + upload.id, { method: "POST" });
        } catch (e) {
          await request("/api/files/" + upload.id, { method: "DELETE" }).catch(
            () => {},
          );
          throw e;
        }
        remaining.shift();
        setSelected([...remaining]);
      }
      setProgress("Файлы прикреплены и доступны всем посетителям.");
      if (input.current) input.current.value = "";
    } catch (e) {
      setError((e as Error).message);
      setProgress("");
    } finally {
      setBusy(false);
      await reload();
    }
  }
  useEffect(() => {
    void reload();
  }, [serviceId]);
  useEffect(() => {
    if (initialFiles.length && !started.current) {
      started.current = true;
      void upload(initialFiles);
    }
  }, []);
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await request("/api/files/" + id, { method: "DELETE" });
      setConfirm(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const shown = files.filter((f) =>
    (f.name + " " + f.serviceName).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="file-panel">
      {!serviceId && (
        <label className="field">
          Найти файл или услугу
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название документа или услуги"
          />
        </label>
      )}
      {admin && serviceId && (
        <div className="file-upload">
          <label className="field">
            Прикрепить файлы
            <input
              ref={input}
              type="file"
              accept={fileAccept}
              multiple
              disabled={busy}
              onChange={(e) => setSelected(Array.from(e.target.files || []))}
            />
          </label>
          <p className="footnote">
            PDF, Word, PNG, JPG · до 20 МБ каждый · до 20 файлов на услугу.
            Файлы доступны всем посетителям.
          </p>
          <button
            type="button"
            className="primary"
            disabled={busy || !selected.length}
            onClick={() => upload(selected)}
          >
            <Paperclip size={16} />
            {busy
              ? "Загрузка…"
              : `Загрузить${selected.length ? " (" + selected.length + ")" : ""}`}
          </button>
        </div>
      )}
      {progress && <p role="status">{progress}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
          <button
            type="button"
            className="secondary"
            onClick={reload}
            disabled={loading || busy}
          >
            Повторить
          </button>
        </p>
      )}
      {loading ? (
        <p className="muted">Загрузка файлов…</p>
      ) : error && !shown.length ? null : !shown.length ? (
        <p className="muted">
          {query
            ? "Файлы не найдены."
            : serviceId
              ? "К этой услуге пока нет вложений."
              : "Файлы пока не добавлены."}
        </p>
      ) : (
        <ul className="file-list">
          {shown.map((file) => (
            <li key={file.id}>
              <div className="file-info">
                <strong>{file.name}</strong>
                {!serviceId && <span>{file.serviceName}</span>}
                <small>
                  {(file.size / 1024 / 1024).toLocaleString("ru-RU", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  МБ
                </small>
              </div>
              <div className="file-actions">
                <a
                  className="secondary"
                  href={"/api/files/" + file.id}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={15} />
                  Открыть
                </a>
                <a
                  className="secondary"
                  href={"/api/files/" + file.id + "?download=1"}
                >
                  <Download size={15} />
                  Скачать
                </a>
                {admin && (
                  <button
                    className="icon-button delete"
                    disabled={busy}
                    aria-label={`Удалить файл ${file.name}`}
                    onClick={() => setConfirm(file.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {confirm === file.id && (
                <div className="file-confirm">
                  Удалить этот файл?{" "}
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => remove(file.id)}
                  >
                    Удалить
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setConfirm(null)}
                  >
                    Отмена
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
