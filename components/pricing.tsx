"use client";
import { useState } from "react";
import { ArrowUpRight, Pencil, Search } from "lucide-react";
import type { Service } from "@/lib/model";
import { statusLabels, audienceLabels } from "@/lib/model";
import {
  DEFAULT_INDICATOR_RATE,
  money,
  paidFirst,
  priceBasis,
  priceBounds,
  pricingSummary,
  revenueScenario,
  type Pricing,
} from "@/lib/pricing";

export function PricingFields({
  value,
  onChange,
}: {
  value: Service["pricing"];
  onChange: (value: Service["pricing"]) => void;
}) {
  const kind = value?.kind ?? "unknown";
  const numeric = (raw: string) => (raw === "" ? NaN : Number(raw));
  const shown = (v: number) => (Number.isFinite(v) ? v : "");
  const patch = (p: Partial<Pricing>) =>
    onChange({ ...value, ...p } as Pricing);
  const preview = priceBounds({ payment: "paid", pricing: value });
  return (
    <fieldset className="pricing-fields">
      <legend>Тариф услуги</legend>
      <div className="price-form-grid">
        <label className="field">
          Тип цены
          <select
            value={kind}
            onChange={(e) => {
              const kind = e.target.value;
              if (kind === "unknown") {
                onChange(null);
                return;
              }
              const base = {
                unit: value?.unit ?? ("somoni" as const),
                indicatorRate: value?.indicatorRate ?? DEFAULT_INDICATOR_RATE,
              };
              const min =
                value?.kind === "fixed" ? value.amount : (value?.min ?? NaN);
              onChange(
                kind === "fixed"
                  ? { ...base, kind, amount: min }
                  : {
                      ...base,
                      kind: "range",
                      min,
                      max: value?.kind === "range" ? value.max : min,
                    },
              );
            }}
          >
            <option value="unknown">Цена пока не указана</option>
            <option value="fixed">Фиксированная</option>
            <option value="range">Диапазон от–до</option>
          </select>
        </label>
        {value && (
          <>
            <label className="field">
              Единица расчёта
              <select
                value={value.unit}
                onChange={(e) => {
                  // Changing the basis needs explicit new amounts; never silently reinterpret somoni as indicators.
                  onChange(
                    value.kind === "fixed"
                      ? {
                          ...value,
                          unit: e.target.value as Pricing["unit"],
                          amount: NaN,
                        }
                      : {
                          ...value,
                          unit: e.target.value as Pricing["unit"],
                          min: NaN,
                          max: NaN,
                        },
                  );
                }}
              >
                <option value="somoni">Сомони</option>
                <option value="indicator">Показатели</option>
              </select>
            </label>
            {value.kind === "fixed" ? (
              <label className="field">
                {value.unit === "indicator"
                  ? "Количество показателей"
                  : "Фиксированная цена, с."}
                <input
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  required
                  value={shown(value.amount)}
                  onChange={(e) => patch({ amount: numeric(e.target.value) })}
                />
              </label>
            ) : (
              <>
                <label className="field">
                  {value.unit === "indicator"
                    ? "Минимум, показателей"
                    : "Минимальная цена, с."}
                  <input
                    type="number"
                    min="0.01"
                    max="1000000"
                    step="0.01"
                    required
                    value={shown(value.min)}
                    onChange={(e) => patch({ min: numeric(e.target.value) })}
                  />
                </label>
                <label className="field">
                  {value.unit === "indicator"
                    ? "Максимум, показателей"
                    : "Максимальная цена, с."}
                  <input
                    type="number"
                    min="0.01"
                    max="1000000"
                    step="0.01"
                    required
                    value={shown(value.max)}
                    onChange={(e) => patch({ max: numeric(e.target.value) })}
                  />
                </label>
              </>
            )}
            {value.unit === "indicator" && (
              <label className="field">
                Один показатель, с.
                <input
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  required
                  value={shown(value.indicatorRate)}
                  onChange={(e) =>
                    patch({ indicatorRate: numeric(e.target.value) })
                  }
                />
                <small>
                  По умолчанию 78 с. Ставка сохраняется с этой услугой.
                </small>
              </label>
            )}
          </>
        )}
      </div>
      {preview && (
        <div className="price-preview">
          <span>Стоимость одного обращения</span>
          <strong>
            {preview.min === preview.max
              ? money(preview.min)
              : `${money(preview.min)} – ${money(preview.max)}`}
          </strong>
          {value && <small>{priceBasis(value)}</small>}
        </div>
      )}
      <p className="footnote">
        Заполните известный тариф за одно обращение. Незаполненная цена не
        участвует в суммах. Изменение ставки здесь не меняет другие услуги и
        прошлые отчёты.
      </p>
    </fieldset>
  );
}

export function PriceLabel({ service }: { service: Service }) {
  const bounds = priceBounds(service);
  if (service.payment === "free")
    return <span className="price-label">0 с.</span>;
  if (!bounds)
    return <span className="price-label muted">Цена не указана</span>;
  return (
    <span className="price-label">
      <strong>
        {bounds.min === bounds.max
          ? money(bounds.min)
          : `${money(bounds.min)} – ${money(bounds.max)}`}
      </strong>
      {service.pricing && <small>{priceBasis(service.pricing)}</small>}
    </span>
  );
}

export function PricingPanel({
  services,
  onEdit,
  onLogin,
  onFiles,
}: {
  services: Service[];
  onEdit?: (s: Service) => void;
  onLogin: () => void;
  onFiles: (s: Service) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [workingOnly, setWorkingOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [quantity, setQuantity] = useState("1");
  const [commission, setCommission] = useState("10");
  const filtered = paidFirst(services).filter(
    (s) =>
      (!workingOnly || s.status === "working") &&
      `${s.name} ${s.id}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()) &&
      (filter === "all" ||
        (filter === "missing"
          ? s.payment === "paid" && !priceBounds(s)
          : filter === "unknown"
            ? !s.payment
            : s.payment === filter)),
  );
  const summary = pricingSummary(filtered);
  const scenario = revenueScenario(
    filtered,
    quantity === "" ? NaN : Number(quantity),
    commission === "" ? NaN : Number(commission),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const activePage = Math.min(page, pages - 1);
  return (
    <div className="pricing-page">
      <section className="panel pricing-intro">
        <div>
          <h2>Тарифы и расчёт стоимости</h2>
          <p>
            Фиксированные цены, диапазоны и расчёт по показателям. Базовая
            ставка при заполнении — 78 с.
          </p>
        </div>
        {!onEdit && (
          <button className="secondary" onClick={onLogin}>
            Войти, чтобы заполнить цены
          </button>
        )}
        <div className="pricing-filters">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Поиск тарифов"
              placeholder="Найти услугу"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <select
            aria-label="Фильтр тарифов"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">Все услуги · сначала платные</option>
            <option value="paid">Платные</option>
            <option value="missing">Платные без цены</option>
            <option value="free">Бесплатные</option>
            <option value="unknown">Оплата не указана</option>
          </select>
          <label className="pricing-check">
            <input
              type="checkbox"
              checked={workingOnly}
              onChange={(e) => {
                setWorkingOnly(e.target.checked);
                setPage(0);
              }}
            />
            Только работающие
          </label>
        </div>
      </section>
      <section className="pricing-cards" aria-label="Сводка тарифов">
        <article>
          <span>Сумма минимальных цен</span>
          <strong>{money(summary.min)}</strong>
          <small>По {summary.priced} платным услугам с ценой</small>
        </article>
        <article>
          <span>Сумма максимальных цен</span>
          <strong>{money(summary.max)}</strong>
          <small>У фиксированной цены минимум = максимум</small>
        </article>
        <article>
          <span>Заполнение тарифов</span>
          <strong>
            {summary.priced}
            <em> / {summary.paid}</em>
          </strong>
          <small>
            {summary.missing
              ? `Не заполнено: ${summary.missing}`
              : "Все выбранные платные услуги учтены"}
          </small>
        </article>
        <article>
          <span>Бесплатные услуги</span>
          <strong>{summary.free}</strong>
          <small>Оплата не указана: {summary.unknown}</small>
        </article>
      </section>
      <p className="pricing-explanation">
        Суммы рассчитаны по текущему фильтру: по одному обращению к каждой
        платной услуге с заполненным тарифом. Это стоимость набора услуг, а не
        фактическая выручка. Услуга «Физ/Юр» учитывается один раз.
      </p>
      {(summary.missing > 0 || summary.unknown > 0) && (
        <p className="pricing-notice">
          Расчёт неполный: у {summary.missing} платных услуг нет цены, у{" "}
          {summary.unknown} услуг не указан тип оплаты. Они не включены в
          денежные суммы.
        </p>
      )}
      <details className="panel pricing-calculator">
        <summary>Сценарий монетизации</summary>
        <p>
          Одинаковое число обращений к каждой выбранной платной услуге с ценой ×
          предполагаемая доля дохода. Фильтры выше применяются и здесь;
          параметры сценария не изменяют тарифы.
        </p>
        <div className="price-form-grid">
          <label className="field">
            Обращений к каждой услуге
            <input
              type="number"
              min="0"
              max="1000000"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label className="field">
            Предполагаемая доля дохода, %
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
            />
            <small>Для расчёта оборота укажите 100%.</small>
          </label>
        </div>
        {scenario ? (
          <div className="price-preview">
            <span>Расчётный доход по {summary.priced} услугам</span>
            <strong>
              {money(scenario.min)} – {money(scenario.max)}
            </strong>
            <small>
              {summary.priced
                ? "Без учёта затрат и налогов. Доля дохода — ваше допущение, а не утверждённая комиссия."
                : "Заполните цены платных услуг, чтобы получить расчёт."}
            </small>
          </div>
        ) : (
          <p className="error" role="alert">
            Укажите целое число обращений от 0 до 1 000 000 и долю от 0 до 100%.
            Для слишком большой суммы уменьшите число обращений.
          </p>
        )}
      </details>
      <section className="panel pricing-registry">
        <div className="panel-heading">
          <div>
            <h2>
              Стоимость услуг{" "}
              <span className="count-badge">{filtered.length}</span>
            </h2>
            <p>
              Сначала платные, затем бесплатные. Внутри групп — последние
              изменения сверху.
            </p>
          </div>
        </div>
        <div
          className="table-scroll"
          tabIndex={0}
          aria-label="Таблица тарифов, прокрутка по горизонтали"
        >
          <table className="pricing-table">
            <thead>
              <tr>
                <th>Услуга</th>
                <th>Тариф</th>
                <th>Минимум, с.</th>
                <th>Максимум, с.</th>
                <th>
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice(activePage * 25, (activePage + 1) * 25)
                .map((s) => {
                  const bounds = priceBounds(s);
                  return (
                    <tr key={s.id}>
                      <td className="service-name">
                        {onEdit ? (
                          <button
                            className="service-title-button"
                            onClick={() => onEdit(s)}
                          >
                            {s.name}
                          </button>
                        ) : (
                          s.name
                        )}
                        <span className="pricing-service-meta">
                          {audienceLabels[s.audience]} ·{" "}
                          {s.category || "Без категории"}
                        </span>
                        <span className={`status-tag ${s.status}`}>
                          <i />
                          {statusLabels[s.status]}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`payment-tag ${s.payment || "unknown"}`}
                        >
                          {s.payment === "free"
                            ? "Бесплатно"
                            : s.payment === "paid"
                              ? s.pricing
                                ? s.pricing.kind === "fixed"
                                  ? "Фиксированная"
                                  : "Диапазон"
                                : "Цена не указана"
                              : "Оплата не указана"}
                        </span>
                        {s.payment === "paid" && s.pricing && (
                          <small className="pricing-service-meta">
                            {s.pricing.unit === "indicator"
                              ? priceBasis(s.pricing)
                              : "В сомони"}
                          </small>
                        )}
                      </td>
                      <td className="price-number">
                        {money(bounds?.min ?? null)}
                      </td>
                      <td className="price-number">
                        {money(bounds?.max ?? null)}
                      </td>
                      <td>
                        <div className="pricing-actions">
                          {onEdit && (
                            <button
                              className="secondary"
                              aria-label={`Изменить цену: ${s.name}`}
                              onClick={() => onEdit(s)}
                            >
                              <Pencil size={14} />
                              {s.payment === "paid" && !bounds
                                ? "Указать цену"
                                : "Изменить"}
                            </button>
                          )}
                          <button
                            className="back-button"
                            onClick={() => onFiles(s)}
                          >
                            Файлы <ArrowUpRight size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <p className="empty-small">
            Услуги не найдены. Измените фильтр или добавьте услугу в реестр.
          </p>
        )}
        <div className="table-footer">
          <span>
            Страница {activePage + 1} из {pages} · {filtered.length} услуг
          </span>
          <div className="pricing-actions">
            <button
              className="secondary"
              disabled={activePage === 0}
              onClick={() => setPage(activePage - 1)}
            >
              Назад
            </button>
            <button
              className="secondary"
              disabled={activePage + 1 >= pages}
              onClick={() => setPage(activePage + 1)}
            >
              Далее
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
