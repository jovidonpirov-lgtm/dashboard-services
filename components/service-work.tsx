"use client";
import type { Service } from "@/lib/model";
import type { ServiceWork } from "@/lib/work";

const labels = {
  state: "Состояние по трекеру",
  agency: "Ведомство",
  responsible: "Ответственный",
  owner: "Кто держит",
  deadline: "Дедлайн из трекера",
  revisedDeadline: "Новый срок / условие",
} as const;

export function WorkFields({
  service,
  onChange,
}: {
  service: Service;
  onChange: (patch: Partial<Service>) => void;
}) {
  const work = service.work ?? {};
  const update = (key: keyof ServiceWork, value: string) =>
    onChange({ work: { ...work, [key]: value } });
  return (
    <details
      className="work-fields"
      open={service.status === "progress" || !!service.work}
    >
      <summary>Ход работы и комментарии</summary>
      <div className="work-form-grid">
        <label className="field work-wide">
          Что нужно сделать
          <textarea
            rows={4}
            maxLength={12000}
            value={work.todo ?? ""}
            onChange={(e) => update("todo", e.target.value)}
            placeholder="Следующий шаг, доработки или условия запуска"
          />
        </label>
        <label className="field work-wide">
          Комментарий к услуге
          <textarea
            rows={3}
            maxLength={12000}
            value={work.comment ?? ""}
            onChange={(e) => update("comment", e.target.value)}
          />
        </label>
        {Object.entries(labels).map(([key, label]) => (
          <label className="field" key={key}>
            {label}
            <textarea
              rows={2}
              maxLength={
                key === "revisedDeadline"
                  ? 4000
                  : key === "state" || key === "owner"
                    ? 1000
                    : 2000
              }
              value={work[key as keyof typeof labels] ?? ""}
              onChange={(e) =>
                update(key as keyof typeof labels, e.target.value)
              }
            />
          </label>
        ))}
      </div>
      <p className="footnote">
        Состояние по трекеру — исходная информация. Текущий статус услуги
        выбирается выше. Источник и предыдущие версии сохраняются.
      </p>
    </details>
  );
}

export function WorkDetails({
  service,
  admin = false,
}: {
  service: Service;
  admin?: boolean;
}) {
  const work = service.work;
  if (!work)
    return <p className="muted">Задачи и комментарии пока не заполнены.</p>;
  return (
    <div className="work-details">
      <section>
        <h3>Что нужно сделать</h3>
        <p>{work.todo || "Не указано"}</p>
      </section>
      <section>
        <h3>Комментарий</h3>
        <p>{work.comment || "Не указан"}</p>
      </section>
      <dl className="work-facts">
        {Object.entries(labels).map(
          ([key, label]) =>
            work[key as keyof typeof labels] && (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{work[key as keyof typeof labels]}</dd>
              </div>
            ),
        )}
      </dl>
      {admin &&
        work.sources?.map((source) => (
          <details
            key={`${source.file}:${source.sheet}:${source.row}`}
            className="work-source"
          >
            <summary>
              Исходная строка {source.row} · {source.sheet}
            </summary>
            <p className="footnote">
              {source.file}. Формулировки сохранены как в файле; пустые поля не
              заполнялись предположениями.
            </p>
            <dl className="work-facts">
              {Object.entries(source.cells).map(
                ([key, value]) =>
                  value && (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ),
              )}
            </dl>
          </details>
        ))}
    </div>
  );
}
