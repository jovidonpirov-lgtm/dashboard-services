"use client";
import { ServicePricingFields, PricingPanel, PriceLabel } from "./pricing";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  Paperclip,
  Globe,
  ArrowLeft,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileClock,
  Coins,
  Layers3,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  TrendingUp,
  UsersRound,
  X,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  asOf,
  currentRegistryMetrics as registryMetrics,
  paymentBreakdown,
  analysisSnapshots,
  metricFilters,
  matchesRegistryFilters,
  registrySaveSchema,
  servicesByFreshness,
  audienceBreakdown,
  serviceCategories,
  serviceSchema,
  visibleMetrics,
  editVisibleMetric,
  audienceLabels,
  compare,
  dateLabel,
  ordered,
  shiftDay,
  statusLabels,
  today,
  type Metrics,
  type Service,
  type Snapshot,
  type Store,
} from "@/lib/model";
import { registerAnalysisTools, type ModelContext } from "@/lib/agent-tools";
import { uploadSchema } from "@/lib/file-model";
import { ServiceFiles, fileAccept } from "@/components/service-files";
const zero: Metrics = {
  declared: 0,
  portal: 0,
  working: 0,
  notWorking: 0,
  individual: 0,
  business: 0,
  both: 0,
};
const number = (value: number | null | undefined) =>
  value == null ? "—" : value.toLocaleString("ru-RU");
const signed = (value: number | null | undefined) =>
  value == null ? "—" : `${value > 0 ? "+" : ""}${number(value)}`;
const metricLabels: Record<keyof Metrics, string> = {
  declared: "Заявлено услуг",
  portal: "На портале",
  working: "Работают",
  notWorking: "Не работают",
  individual: "Физ",
  business: "Юр",
  both: "Физ/Юр",
};
const sections = {
  overview: "Обзор",
  services: "Реестр услуг",
  pricing: "Оплата услуг",
  history: "История изменений",
};
type Section = keyof typeof sections;
async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Не удалось выполнить запрос.");
  return body;
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement as HTMLElement;
    el?.showModal();
    return () => {
      el?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-head">
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Назад"
        >
          <ArrowLeft size={20} />
        </button>
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Закрыть">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Change({
  value,
  label = "за период",
  inverse = false,
}: {
  value: number | null;
  label?: string;
  inverse?: boolean;
}) {
  return (
    <span
      className={`change ${value === null || value === 0 ? "neutral" : (inverse ? value > 0 : value < 0) ? "negative" : ""}`}
    >
      {value === null ? (
        "Нет базы сравнения"
      ) : (
        <>
          {value === 0 ? null : value < 0 ? (
            <ArrowDownRight size={14} />
          ) : (
            <ArrowUpRight size={14} />
          )}{" "}
          {signed(value)} <span>{label}</span>
        </>
      )}
    </span>
  );
}
function Trend({
  snapshots,
  from,
  to,
}: {
  snapshots: Snapshot[];
  from: string;
  to: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const days =
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) +
    1;
  if (days < 1 || days > 3660)
    return (
      <div className="empty-small">Выберите период от 1 дня до 10 лет.</div>
    );
  const points = Array.from({ length: days }, (_, i) => {
    const date = shiftDay(from, i);
    return { date, snapshot: asOf(snapshots, date) };
  });
  const known = points.filter((p) => p.snapshot);
  const max = Math.max(...known.map((p) => p.snapshot!.metrics.declared), 10);
  const top = Math.ceil(max / 50) * 50;
  const w = 760,
    h = 210,
    pad = 36;
  const x = (i: number) => pad + (i / Math.max(days - 1, 1)) * (w - pad * 2),
    y = (n: number) => h - 18 - (n / top) * (h - 38);
  const line = (key: "declared" | "portal" | "working") =>
    points
      .map((p, i) => {
        const value = p.snapshot?.metrics[key];
        if (value == null) return "";
        const connected = i > 0 && points[i - 1].snapshot?.metrics[key] != null;
        return connected ? `H${x(i)} V${y(value)}` : `M${x(i)} ${y(value)}`;
      })
      .join(" ");
  const selected = hover === null ? null : points[hover];
  return (
    <div className="chart-wrap">
      <div className="chart-readout">
        {selected?.snapshot ? (
          <>
            <strong>{dateLabel(selected.date)}</strong>
            <span className="dot green" />
            Работают: {selected.snapshot.metrics.working}
            <span className="dot grey" />
            Заявлено: {selected.snapshot.metrics.declared}
            <span className="dot" style={{ background: "#5686d8" }} />
            На портале: {number(selected.snapshot.metrics.portal)}
          </>
        ) : (
          <span>Динамика по сохранённым отчётам</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Изменение количества услуг с ${dateLabel(from)} по ${dateLabel(to)}. ${known.length ? "Заявлено " + known.at(-1)!.snapshot!.metrics.declared + ", работают " + known.at(-1)!.snapshot!.metrics.working : "Нет данных"}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#12a67c" stopOpacity=".16" />
            <stop offset="1" stopColor="#12a67c" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line
              x1={pad}
              x2={w - pad}
              y1={y((top * i) / 4)}
              y2={y((top * i) / 4)}
              stroke="#e9edef"
              strokeDasharray="4 5"
            />
            <text x="1" y={y((top * i) / 4) + 4} fill="#89929d" fontSize="12">
              {Math.round((top * i) / 4)}
            </text>
          </g>
        ))}
        {known.length > 0 && (
          <>
            <path
              d={`${line("working")} L${x(points.findLastIndex((p) => !!p.snapshot))},${h - 18} L${x(points.findIndex((p) => !!p.snapshot))},${h - 18} Z`}
              fill="url(#area)"
            />
            <path
              d={line("declared")}
              fill="none"
              stroke="#aebac3"
              strokeWidth="2"
              strokeDasharray="5 5"
            />
            <path
              d={line("portal")}
              fill="none"
              stroke="#5686d8"
              strokeWidth="2"
            />
            <path
              d={line("working")}
              fill="none"
              stroke="#0b9c74"
              strokeWidth="3"
              strokeLinejoin="round"
            />
          </>
        )}
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={x(i) - (w - pad * 2) / Math.max(days - 1, 1) / 2}
            y="0"
            width={Math.max((w - pad * 2) / Math.max(days - 1, 1), 1)}
            height={h}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          >
            <title>
              {`${dateLabel(p.date)}: ${p.snapshot ? `${p.snapshot.metrics.working} работают / ${p.snapshot.metrics.declared} заявлено` : "Нет отчёта"}`}
            </title>
          </rect>
        ))}
        {selected?.snapshot && (
          <g>
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1="12"
              y2={h - 18}
              stroke="#4eb496"
              strokeDasharray="3 4"
            />
            <circle
              cx={x(hover!)}
              cy={y(selected.snapshot.metrics.working)}
              r="5"
              fill="#0b9c74"
              stroke="white"
              strokeWidth="3"
            />
          </g>
        )}
      </svg>
      <div className="chart-axis">
        {[0, Math.floor((days - 1) / 2), days - 1]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((i) => (
            <span key={i}>{dateLabel(shiftDay(from, i))}</span>
          ))}
      </div>
      {!known.length && (
        <div className="chart-no-data">За этот период пока нет отчётов</div>
      )}
    </div>
  );
}
export default function Dashboard({
  localPreview = false,
}: {
  localPreview?: boolean;
}) {
  const [store, setStore] = useState<Store>({
      revision: 0,
      services: [],
      snapshots: [],
    }),
    [admin, setAdmin] = useState(false),
    [ready, setReady] = useState(false),
    [hasData, setHasData] = useState(false),
    [section, updateSection] = useState<Section>("overview");
  const [login, setLogin] = useState(false),
    [editor, setEditor] = useState(false),
    [adding, setAdding] = useState(false),
    [editingService, setEditingService] = useState<Service | null>(null),
    [pendingEdit, setPendingEdit] = useState(false),
    [deleting, setDeleting] = useState<Service | null>(null),
    [fileService, setFileService] = useState<{
      service: Service;
      files?: File[];
    } | null>(null),
    [pendingAdd, setPendingAdd] = useState(false),
    [detail, setDetail] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [range, setRange] = useState("30"),
    [from, setFrom] = useState(shiftDay(today(), -29)),
    [to, setTo] = useState(today()),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [audience, setAudience] = useState("all"),
    [category, setCategory] = useState("all");
  useEffect(() => {
    let active = true;
    Promise.all([
      api("/api/data"),
      api("/api/auth").catch(() => ({ admin: false })),
    ])
      .then(([data, auth]) => {
        if (active) {
          setStore(data);
          setAdmin(auth.admin);
          setHasData(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const visibleData = useRef({ store, demo: localPreview });
  useEffect(() => {
    visibleData.current = {
      store: { ...store, snapshots: analysisSnapshots(store.snapshots) },
      demo: localPreview,
    };
  }, [store, localPreview]);
  useEffect(
    () =>
      hasData
        ? registerAnalysisTools(
            (document as Document & { modelContext?: ModelContext })
              .modelContext,
            () => visibleData.current,
          )
        : undefined,
    [hasData],
  );
  useEffect(() => {
    const restore = () => {
      const value = window.location.hash.slice(1);
      updateSection(
        value === "services" || value === "history" || value === "pricing"
          ? value
          : "overview",
      );
    };
    restore();
    window.addEventListener("hashchange", restore);
    return () => window.removeEventListener("hashchange", restore);
  }, []);
  function setSection(next: Section) {
    updateSection(next);
    window.location.hash = next;
  }
  const [payment, setPayment] = useState("all");
  function resetFilters() {
    setQuery("");
    setStatus("all");
    setAudience("all");
    setCategory("all");
    setPayment("all");
  }
  const latest = ordered(store.snapshots).at(-1),
    metrics = registryMetrics(latest?.metrics ?? zero, store.services),
    currentDate = today(),
    isFresh = latest?.date === currentDate;
  const calculatedSnapshots = analysisSnapshots(store.snapshots);
  const payments = paymentBreakdown(store.services);
  const daily = compare(calculatedSnapshots, currentDate, currentDate),
    period = from <= to ? compare(calculatedSnapshots, from, to) : null;
  const completion = metrics.declared
    ? Math.round((metrics.working / metrics.declared) * 100)
    : 0;
  const recentServices = useMemo(
    () => servicesByFreshness(store.services, store.snapshots, latest?.id),
    [store.services, store.snapshots, latest?.id],
  );
  const filtered = recentServices.filter(
    (s) =>
      (s.name + " " + s.id)
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (payment === "all" ||
        (payment === "unknown" ? !s.payment : s.payment === payment)) &&
      matchesRegistryFilters(s, status, audience) &&
      (category === "all" ||
        (category === "none" ? !s.category : s.category === category)),
  );
  function openMetric(key: keyof Metrics) {
    const filters = metricFilters(key);
    setPayment("all");
    setQuery("");
    setCategory("all");
    setStatus(filters.status);
    setAudience(filters.audience);
    setSection("services");
  }
  function changeRange(value: string) {
    setRange(value);
    if (value !== "custom") {
      setTo(currentDate);
      setFrom(shiftDay(currentDate, 1 - Number(value)));
    }
  }
  async function logout() {
    try {
      await api("/api/auth", { method: "DELETE" });
      setAdmin(false);
      setSection("overview");
      setToast("Вы вышли из аккаунта. Просмотр данных остаётся доступным.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const requestAdd = () => {
    if (admin) setAdding(true);
    else {
      setPendingAdd(true);
      setLogin(true);
    }
  };
  const requestEdit = () => {
    if (admin) setEditor(true);
    else {
      setPendingEdit(true);
      setLogin(true);
    }
  };
  if (!hasData)
    return (
      <main className="public-files" aria-busy={!ready}>
        <h1>Аналитика услуг</h1>
        {error ? (
          <div className="error" role="alert">
            <p>Не удалось загрузить актуальные данные. Попробуйте ещё раз.</p>
            <button className="secondary" onClick={() => location.reload()}>
              Повторить загрузку
            </button>
          </div>
        ) : (
          <p role="status">Загружаем актуальные данные…</p>
        )}
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Статус — главная">
          <span className="brand-mark">
            <Activity size={25} />
          </span>
          <span>
            статус<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace">
          <div className="workspace-icon">
            <Layers3 size={19} />
          </div>
          <div>
            <strong>Государственные услуги</strong>
            <span>Аналитический центр</span>
          </div>
        </div>
        <div className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav aria-label="Главная навигация">
          {(Object.keys(sections) as Section[]).map((key) => {
            const Icon =
              key === "overview"
                ? LayoutDashboard
                : key === "services"
                  ? Layers3
                  : key === "pricing"
                    ? Coins
                    : FileClock;
            return (
              <button
                key={key}
                className={section === key ? "active" : ""}
                onClick={() => setSection(key)}
                aria-current={section === key ? "page" : undefined}
              >
                <Icon size={19} />
                {sections[key]}
                {key === "services" && (
                  <span className="nav-count">{store.services.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={19} />
            <strong>Один источник данных</strong>
            <p>Каждое обновление сохраняется в истории отчётов.</p>
          </div>
          <button
            className="profile"
            onClick={() => (admin ? logout() : setLogin(true))}
          >
            <span className="avatar">{admin ? "А" : "Г"}</span>
            <span>
              <strong>{admin ? "Администратор" : "Режим просмотра"}</strong>
              <small>
                {admin ? "Управление данными" : "Войти для редактирования"}
              </small>
            </span>
            {admin ? <LogOut size={17} /> : <LockKeyhole size={17} />}
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            {section !== "overview" && (
              <button
                className="back-button"
                onClick={() => setSection("overview")}
              >
                <ArrowLeft size={17} /> К обзору
              </button>
            )}
            <ChevronRight size={14} />
            <strong>{sections[section]}</strong>
          </div>
          <div className="topbar-right">
            <span className="live-dot" /> {dateLabel(currentDate, true)}{" "}
            <span className="timezone">Душанбе · UTC+5</span>
          </div>
        </header>
        <main>
          {localPreview && (
            <p className="local-review-banner">
              Локальная проверка · Тестовые данные. Рабочий сайт и база не
              изменяются.
            </p>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">МОНИТОРИНГ УСЛУГ</div>
              <h1>
                {section === "overview"
                  ? "Всё о запуске услуг"
                  : sections[section]}
              </h1>
              <p>
                {section === "overview"
                  ? "От заявленных планов — к работающим сервисам."
                  : section === "services"
                    ? "Услуги, их аудитории и текущий статус запуска."
                    : section === "pricing"
                      ? "Стоимость услуг и сценарии дохода на основе заполненных тарифов."
                      : "Все обновления и изменения показателей в одном месте."}
              </p>
            </div>
            <div className="heading-actions">
              <a href="/files" className="secondary">
                <Paperclip size={17} />
                Файлы услуг
              </a>
              <button
                className="secondary"
                onClick={requestAdd}
                disabled={!ready}
              >
                <Plus size={18} />
                Добавить услугу
              </button>
              <button
                className="primary"
                onClick={requestEdit}
                disabled={!ready}
              >
                <Plus size={18} />
                Обновить данные
              </button>
            </div>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button className="text-button" onClick={() => location.reload()}>
                Повторить загрузку
              </button>
            </div>
          )}
          <div className="freshness">
            <span className={`status-dot ${isFresh ? "" : "amber"}`} />
            {latest ? (
              <>
                Данные на <strong>{dateLabel(latest.date, true)}</strong>
                <span className={`fresh-badge ${isFresh ? "" : "stale"}`}>
                  {isFresh ? "Актуально сегодня" : "Требуют обновления"}
                </span>
              </>
            ) : (
              <>Пока нет сохранённых отчётов</>
            )}
            <span className="freshness-right">
              <Clock3 size={14} />
              {latest
                ? `Последнее сохранение ${new Date(latest.createdAt).toLocaleTimeString("ru-RU", { timeZone: "Asia/Dushanbe", hour: "2-digit", minute: "2-digit" })}`
                : "Добавьте первый отчёт"}
            </span>
          </div>
          {section === "overview" && (
            <>
              <section className="metrics" aria-label="Основные показатели">
                {(Object.keys(metricLabels) as (keyof Metrics)[]).map(
                  (key, i) => {
                    const Icon = [
                      Layers3,
                      Globe,
                      CheckCheck,
                      CircleHelp,
                      UsersRound,
                      Building2,
                      UsersRound,
                    ][i];
                    return (
                      <button
                        type="button"
                        onClick={() => openMetric(key)}
                        aria-label={`Просмотреть услуги: ${metricLabels[key]}`}
                        key={key}
                        className={`metric-card ${key === "working" ? "featured" : key === "notWorking" ? "unavailable" : ""}`}
                      >
                        <div className="metric-label">
                          {key === "both" ? "Физ/Юр" : metricLabels[key]}
                          <span className="metric-icon">
                            <Icon size={19} />
                          </span>
                        </div>
                        <div className="metric-value">
                          {number(visibleMetrics(metrics)[key])}
                          {key === "working" && (
                            <span className="percentage">{completion}%</span>
                          )}
                        </div>
                        {key === "portal" && (
                          <p className="footnote">
                            {metrics.portal != null && metrics.declared > 0
                              ? `${Math.round((metrics.portal / metrics.declared) * 100)}% от заявленных`
                              : "— от заявленных"}
                          </p>
                        )}
                        {key === "working" && (
                          <p className="footnote">
                            {completion}% от заявленных ·{" "}
                            {metrics.portal
                              ? `${Math.round((metrics.working / metrics.portal) * 100)}%`
                              : "—"}{" "}
                            от портала
                          </p>
                        )}
                        <Change
                          value={daily.delta?.[key] ?? null}
                          label="за сегодня"
                          inverse={key === "notWorking"}
                        />
                        {key === "working" && (
                          <div className="mini-progress">
                            <span style={{ width: `${completion}%` }} />
                          </div>
                        )}
                      </button>
                    );
                  },
                )}
                <article
                  className="metric-card payment-card"
                  aria-label="Оплата услуг"
                >
                  <button
                    type="button"
                    className="metric-label payment-heading"
                    onClick={() => setSection("pricing")}
                    aria-label="Открыть оплату услуг и цены"
                  >
                    Оплата услуг
                    <span className="metric-icon">
                      <Coins size={19} />
                    </span>
                  </button>
                  <div className="payment-totals">
                    {(["paid", "free"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-label={`Открыть тарифы: ${value === "paid" ? "платные" : "бесплатные"} услуги`}
                        onClick={() => {
                          resetFilters();
                          setSection("pricing");
                        }}
                      >
                        <strong>{number(payments[value])}</strong>
                        <span>{value === "paid" ? "Платно" : "Бесплатно"}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="payment-unknown"
                    onClick={() => {
                      resetFilters();
                      setSection("pricing");
                    }}
                  >
                    Не указано: {number(payments.unknown)}
                  </button>
                  <button
                    className="payment-open"
                    onClick={() => setSection("pricing")}
                  >
                    Тарифы и расчёт <ArrowUpRight size={15} />
                  </button>
                </article>
              </section>
              <div className="analytics-grid">
                <section className="panel trend-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Динамика запуска</h2>
                      <p>Как меняется количество услуг</p>
                    </div>
                    <div className="segmented">
                      {["7", "30", "90"].map((v) => (
                        <button
                          key={v}
                          className={range === v ? "selected" : ""}
                          onClick={() => changeRange(v)}
                        >
                          {v} дней
                        </button>
                      ))}
                      <button
                        aria-label="Выбрать свой период"
                        className={range === "custom" ? "selected" : ""}
                        onClick={() => changeRange("custom")}
                      >
                        <CalendarDays size={16} />
                      </button>
                    </div>
                  </div>
                  {range === "custom" && (
                    <div className="date-range">
                      <label>
                        С
                        <input
                          type="date"
                          value={from}
                          max={to}
                          onChange={(e) => setFrom(e.target.value)}
                        />
                      </label>
                      <label>
                        По
                        <input
                          type="date"
                          value={to}
                          min={from}
                          max={currentDate}
                          onChange={(e) => setTo(e.target.value)}
                        />
                      </label>
                    </div>
                  )}
                  <div className="trend-summary">
                    <strong>
                      {period?.delta ? signed(period.delta.working) : "—"}
                    </strong>
                    <span>
                      работающих услуг
                      <br />
                      за выбранный период
                    </span>
                    <div className="legend">
                      <span>
                        <i className="dot green" />
                        Работают
                      </span>
                      <span>
                        <i className="dot" style={{ background: "#5686d8" }} />
                        На портале
                      </span>
                      <span>
                        <i className="dot grey" />
                        Заявлено
                      </span>
                    </div>
                  </div>
                  {from && to && from <= to ? (
                    <Trend
                      snapshots={calculatedSnapshots}
                      from={from}
                      to={to}
                    />
                  ) : (
                    <p className="empty-small">Укажите корректный период.</p>
                  )}
                  <div className="chart-footer">
                    <TrendingUp size={16} />
                    {period?.baseline
                      ? `Сравнение с отчётом на ${dateLabel(period.baseline.date)}${period.end ? " и на " + dateLabel(period.end.date) : ""}`
                      : "Для расчёта прироста нужен отчёт до начала периода"}
                  </div>
                </section>
                <section className="panel progress-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Выполнение плана</h2>
                      <p>Работающие услуги от заявленных</p>
                    </div>
                  </div>
                  <div
                    className="donut"
                    style={{
                      background: `conic-gradient(#109b77 0% ${completion}%, #edf1f3 ${completion}% 100%)`,
                    }}
                  >
                    <div>
                      <span>
                        {completion}
                        <small>%</small>
                      </span>
                      <p>уже работают</p>
                    </div>
                  </div>
                  <div className="progress-legend">
                    <div>
                      <span>
                        <i className="dot green" />
                        Работают
                      </span>
                      <strong>{number(metrics.working)}</strong>
                    </div>
                    <div>
                      <span>
                        <i className="dot light" />
                        Осталось запустить
                      </span>
                      <strong>
                        {number(metrics.declared - metrics.working)}
                      </strong>
                    </div>
                  </div>
                  <div className="progress-callout">
                    <Check size={15} />
                    {metrics.declared
                      ? `${number(metrics.working)} из ${number(metrics.declared)} услуг запущено`
                      : "Добавьте заявленные услуги"}
                  </div>
                </section>
              </div>
              <div className="bottom-grid">
                <section className="panel audience-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Для кого услуги</h2>
                      <p>Распределение по получателям</p>
                    </div>
                    <UsersRound className="muted" size={20} />
                  </div>
                  {audienceBreakdown(metrics).map(
                    ({ key, label, value }, i) => {
                      const share =
                        value == null
                          ? null
                          : metrics.declared
                            ? Math.round((value / metrics.declared) * 100)
                            : 0;
                      return (
                        <div className="audience-row" key={key}>
                          <div className={`audience-icon ${i ? "blue" : ""}`}>
                            {i ? (
                              <Building2 size={20} />
                            ) : (
                              <UsersRound size={20} />
                            )}
                          </div>
                          <div className="audience-info">
                            <div>
                              <strong>{label}</strong>
                              <span>
                                {number(value)}{" "}
                                {share != null && <small>· {share}%</small>}
                              </span>
                            </div>
                            <div className={`audience-bar ${i ? "blue" : ""}`}>
                              <span style={{ width: `${share ?? 0}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    },
                  )}
                  <p className="footnote">
                    {metrics.both == null
                      ? "Укажите число общих услуг в поле «Физ/Юр», чтобы определить отдельные группы. Для этого отчёта оно неизвестно."
                      : "Каждая услуга входит только в одну группу: Физ, Юр или Физ/Юр. Общая услуга считается один раз. Проценты — от заявленных услуг."}
                  </p>
                </section>
                <section className="panel recent-panel">
                  <div className="panel-heading">
                    <h2>Последние обновления</h2>
                    <button
                      className="text-button"
                      onClick={() => setSection("history")}
                    >
                      Вся история <ArrowRight size={15} />
                    </button>
                  </div>
                  {ordered(store.snapshots)
                    .slice(-3)
                    .reverse()
                    .map((s) => (
                      <button
                        className="recent-item"
                        key={s.id}
                        onClick={() => setDetail(s)}
                      >
                        <div className="timeline-icon">
                          <FileClock size={17} />
                        </div>
                        <div>
                          <strong>{s.note}</strong>
                          <span>{dateLabel(s.date)} · Администратор</span>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  {!latest && (
                    <div className="empty-small">
                      Здесь появится ваш первый отчёт.
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          {section === "pricing" && (
            <PricingPanel
              services={recentServices}
              onEdit={admin ? setEditingService : undefined}
              onLogin={() => setLogin(true)}
              onFiles={(service) => setFileService({ service })}
            />
          )}
          {section === "services" && (
            <section className="panel registry">
              <div className="panel-heading">
                <div>
                  <h2>
                    Реестр услуг{" "}
                    <span className="count-badge">{store.services.length}</span>
                  </h2>
                  <p>
                    В реестре {store.services.length} из{" "}
                    {number(metrics.declared)} заявленных услуг
                  </p>
                </div>
                <button className="secondary" onClick={requestAdd}>
                  <Plus size={16} />
                  Добавить услугу
                </button>
              </div>
              <div className="filters">
                <label className="search">
                  <Search size={17} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Поиск по названию или ID"
                    aria-label="Поиск услуг"
                  />
                </label>
                <label className="select-filter">
                  <ListFilter size={15} />
                  <select
                    aria-label="Статус услуги"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="all">Все статусы</option>
                    <option value="onPortal">На портале (реестр)</option>
                    {Object.entries(statusLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <select
                  aria-label="Получатели услуги"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                >
                  <option value="all">Все получатели</option>
                  <option value="individual">Только физические лица</option>
                  <option value="business">Только юридические лица</option>
                  <option value="both">Физлица и юрлица</option>
                </select>
                <select
                  aria-label="Категория услуги"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="all">Все категории</option>
                  <option value="none">Без категории</option>
                  {serviceCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-summary">
                <span>
                  Найдено <strong>{filtered.length}</strong> из{" "}
                  {store.services.length}
                </span>
                <select
                  aria-label="Оплата услуги"
                  value={payment}
                  onChange={(e) => setPayment(e.target.value)}
                >
                  <option value="all">Любая оплата</option>
                  <option value="free">Бесплатно</option>
                  <option value="paid">Платно</option>
                  <option value="unknown">Оплата не указана</option>
                </select>
                {(query ||
                  status !== "all" ||
                  audience !== "all" ||
                  category !== "all" ||
                  payment !== "all") && (
                  <button className="back-button" onClick={resetFilters}>
                    <X size={15} />
                    Сбросить фильтры
                  </button>
                )}
              </div>
              {(status === "onPortal" ||
                (status === "all" && audience === "all")) && (
                <p className="registry-note">
                  Показаны услуги из реестра. «На портале» — сумма работающих и
                  неработающих услуг. «Заявлено» задаётся вручную.
                </p>
              )}
              <ServiceTable
                services={filtered}
                onEdit={admin ? setEditingService : undefined}
                onDelete={admin ? setDeleting : undefined}
                onFiles={(service) => setFileService({ service })}
              />
              {!filtered.length && (
                <Empty
                  title={
                    store.services.length
                      ? "Услуги не найдены"
                      : "Реестр пока пуст"
                  }
                  text={
                    store.services.length
                      ? "Попробуйте изменить поиск или фильтры."
                      : "Нажмите «Добавить услугу», чтобы создать первую запись."
                  }
                />
              )}
              <div className="table-footer">
                Найдено: {filtered.length} услуг
                <span>Каждая услуга учитывается один раз</span>
              </div>
            </section>
          )}
          {section === "history" && (
            <>
              <section className="panel history-filter">
                <div className="panel-heading">
                  <div>
                    <h2>Изменения за период</h2>
                    <p>
                      Прирост относительно последнего отчёта до начала периода
                    </p>
                  </div>
                </div>
                <div className="history-controls">
                  <div className="segmented">
                    {[
                      ["1", "Сегодня"],
                      ["7", "7 дней"],
                      ["30", "30 дней"],
                      ["custom", "Свой период"],
                    ].map(([v, l]) => (
                      <button
                        key={v}
                        className={range === v ? "selected" : ""}
                        onClick={() => changeRange(v)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <div className="date-range">
                    <label>
                      С
                      <input
                        type="date"
                        max={to}
                        value={from}
                        onChange={(e) => {
                          setRange("custom");
                          setFrom(e.target.value);
                        }}
                      />
                    </label>
                    <label>
                      По
                      <input
                        type="date"
                        min={from}
                        max={currentDate}
                        value={to}
                        onChange={(e) => {
                          setRange("custom");
                          setTo(e.target.value);
                        }}
                      />
                    </label>
                  </div>
                </div>
                {from > to ? (
                  <p className="error">
                    Дата начала должна быть не позже даты окончания.
                  </p>
                ) : (
                  <div className="history-metrics">
                    {(Object.keys(metricLabels) as (keyof Metrics)[]).map(
                      (key) => (
                        <div key={key}>
                          <span>{metricLabels[key]}</span>
                          <strong>
                            {period?.delta ? signed(period.delta[key]) : "—"}
                          </strong>
                        </div>
                      ),
                    )}
                  </div>
                )}
                <p className="footnote">
                  {period?.baseline
                    ? `База сравнения: ${dateLabel(period.baseline.date, true)}. Конец периода: ${period.end ? dateLabel(period.end.date, true) : "нет отчёта"}.`
                    : "Нет отчёта до начала периода — прирост пока не определён."}
                </p>
              </section>
              <p className="footnote">
                В сохранённых отчётах прежние значения «На портале» остаются без
                изменений. Обзор и сравнение выше рассчитывают этот показатель
                по статусам услуг.
              </p>
              <section className="panel history-list">
                <div className="panel-heading">
                  <h2>Сохранённые отчёты</h2>
                  <span className="count-badge">
                    {
                      store.snapshots.filter(
                        (s) => s.date >= from && s.date <= to,
                      ).length
                    }
                  </span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Дата отчёта</th>
                        <th>Комментарий</th>
                        <th>Заявлено</th>
                        <th>На портале</th>
                        <th>Работают</th>
                        <th>Не работают</th>
                        <th>Физ</th>
                        <th>Юр</th>
                        <th>Физ/Юр</th>
                        <th>
                          <span className="sr-only">Действие</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordered(store.snapshots)
                        .filter((s) => s.date >= from && s.date <= to)
                        .reverse()
                        .map((s) => (
                          <tr key={s.id}>
                            <td>
                              <strong>{dateLabel(s.date, true)}</strong>
                              <small className="cell-note">
                                Сохранён{" "}
                                {new Date(s.createdAt).toLocaleString("ru-RU", {
                                  timeZone: "Asia/Dushanbe",
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </small>
                            </td>
                            <td className="history-note">{s.note}</td>
                            <td>{number(s.metrics.declared)}</td>
                            <td>{number(s.metrics.portal)}</td>
                            <td>
                              <span className="working-number">
                                {number(s.metrics.working)}
                              </span>
                            </td>
                            <td>{number(s.metrics.notWorking ?? 0)}</td>
                            <td>
                              {number(visibleMetrics(s.metrics).individual)}
                            </td>
                            <td>
                              {number(visibleMetrics(s.metrics).business)}
                            </td>
                            <td>{number(s.metrics.both)}</td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Открыть отчёт ${dateLabel(s.date)}`}
                                onClick={() => setDetail(s)}
                              >
                                <ArrowUpRight size={18} />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!store.snapshots.some(
                  (s) => s.date >= from && s.date <= to,
                ) && (
                  <Empty
                    title="За этот период нет отчётов"
                    text="Выберите другие даты или сохраните первое обновление."
                  />
                )}
              </section>
            </>
          )}
          <footer>
            <span>
              <span className="footer-brand">статус.</span> Аналитика
              государственных услуг
            </span>
            <span>Часовой пояс: Душанбе · Данные обновляются вручную</span>
          </footer>
        </main>
      </div>
      {login && (
        <Login
          onClose={() => {
            setLogin(false);
            setPendingAdd(false);
            setPendingEdit(false);
          }}
          onSuccess={async () => {
            const data = await api("/api/data");
            setStore(data);
            setAdmin(true);
            if (pendingAdd) {
              setAdding(true);
              setPendingAdd(false);
            }
            if (pendingEdit) {
              setEditor(true);
              setPendingEdit(false);
            }
            setLogin(false);
            setError("");
            setToast("Вы вошли как администратор.");
          }}
        />
      )}
      {fileService && (
        <Modal
          title={`Файлы: ${fileService.service.name}`}
          onClose={() => setFileService(null)}
          wide
        >
          <div className="modal-body">
            <ServiceFiles
              serviceId={fileService.service.id}
              admin={admin}
              initialFiles={fileService.files}
            />
          </div>
        </Modal>
      )}
      {deleting && (
        <DeleteService
          store={store}
          service={deleting}
          onClose={() => setDeleting(null)}
          onSaved={(data) => {
            setStore(data);
            setDeleting(null);
            setToast("Услуга удалена из реестра. История сохранена.");
          }}
        />
      )}
      {editingService && (
        <AddService
          store={store}
          initialService={editingService}
          onClose={() => setEditingService(null)}
          onSaved={(data, service, files) => {
            setStore(data);
            setEditingService(null);
            if (service && files?.length) setFileService({ service, files });
            setToast("Изменения услуги сохранены в истории.");
          }}
        />
      )}
      {adding && (
        <AddService
          store={store}
          onClose={() => setAdding(false)}
          onSaved={(data, service, files) => {
            setStore(data);
            setAdding(false);
            if (service && files?.length) setFileService({ service, files });
            setToast(
              "Услуга добавлена. Расчётные показатели и история обновлены.",
            );
          }}
        />
      )}
      {editor && (
        <Editor
          store={store}
          onClose={() => setEditor(false)}
          onSaved={(data) => {
            setStore(data);
            setEditor(false);
            setToast("Отчёт сохранён. Предыдущие данные доступны в истории.");
          }}
        />
      )}
      {detail && (
        <Modal
          title={`Отчёт на ${dateLabel(detail.date, true)}`}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="modal-body">
            <p>{detail.note}</p>
            <div className="history-metrics">
              {(Object.keys(metricLabels) as (keyof Metrics)[]).map((key) => (
                <div key={key}>
                  <span>{metricLabels[key]}</span>
                  <strong>{number(visibleMetrics(detail.metrics)[key])}</strong>
                </div>
              ))}
            </div>
            <h3>Реестр на дату отчёта</h3>
            <ServiceTable
              services={servicesByFreshness(
                detail.services,
                store.snapshots,
                detail.id,
              )}
            />
            {!detail.services.length && (
              <p className="muted">В этом отчёте реестр не заполнен.</p>
            )}
            <p className="footnote">
              Сохранён{" "}
              {new Date(detail.createdAt).toLocaleString("ru-RU", {
                timeZone: "Asia/Dushanbe",
              })}
              , Душанбе. Отчёт доступен только для просмотра.
            </p>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          {toast}
          <button
            className="icon-button"
            aria-label="Скрыть уведомление"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <Layers3 size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function ServiceTable({
  services,
  onEdit,
  onDelete,
  onFiles,
}: {
  services: Service[];
  onEdit?: (service: Service) => void;
  onDelete?: (service: Service) => void;
  onFiles?: (service: Service) => void;
}) {
  const [page, setPage] = useState(0);
  const signature = services.map((s) => s.id).join("\0");
  useEffect(() => setPage(0), [signature]);
  const pages = Math.max(1, Math.ceil(services.length / 25));
  const currentPage = Math.min(page, pages - 1);
  return (
    <>
      <p className="registry-note">
        Сначала недавно добавленные и изменённые услуги
      </p>
      <div
        className="table-scroll"
        tabIndex={0}
        aria-label="Таблица услуг, прокрутка по горизонтали"
      >
        <table>
          <thead>
            <tr>
              <th>Название услуги</th>
              <th>Категория</th>
              <th>Получатели</th>
              <th>Статус</th>
              <th>Оплата</th>
              {(onEdit || onDelete || onFiles) && (
                <th>
                  <span className="sr-only">Действия</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {services
              .slice(currentPage * 25, (currentPage + 1) * 25)
              .map((s) => (
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
                    <span className="service-id" title={s.id}>
                      ID: {s.id}
                    </span>
                  </td>
                  <td>{s.category || "Без категории"}</td>
                  <td>
                    <span className="audience-tag">
                      {audienceLabels[s.audience]}
                    </span>
                  </td>
                  <td>
                    <span className={`status-tag ${s.status}`}>
                      <i />
                      {statusLabels[s.status]}
                    </span>
                  </td>
                  <td>
                    <span className={`payment-tag ${s.payment || "unknown"}`}>
                      {s.payment === "paid"
                        ? "Платно"
                        : s.payment === "free"
                          ? "Бесплатно"
                          : "Не указано"}
                    </span>
                    <PriceLabel service={s} />
                  </td>
                  {(onEdit || onDelete || onFiles) && (
                    <td className="service-actions">
                      {onEdit && (
                        <button
                          className="icon-button"
                          aria-label={`Редактировать ${s.name}`}
                          onClick={() => onEdit(s)}
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {onFiles && (
                        <button
                          className="icon-button"
                          title="Файлы услуги"
                          aria-label={`Файлы услуги ${s.name}`}
                          onClick={() => onFiles(s)}
                        >
                          <Paperclip size={16} />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          className="icon-button delete"
                          aria-label={`Удалить услугу ${s.name}`}
                          title="Удалить услугу"
                          onClick={() => onDelete(s)}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="pagination" aria-label="Страницы реестра">
          <button
            className="secondary"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ArrowLeft size={16} />
            Назад
          </button>
          <span>
            Страница {currentPage + 1} из {pages}
          </span>
          <button
            className="secondary"
            disabled={currentPage + 1 === pages}
            onClick={() => setPage(currentPage + 1)}
          >
            Далее
            <ArrowRight size={16} />
          </button>
        </nav>
      )}
    </>
  );
}
function Login({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      await onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Вход администратора" onClose={onClose}>
      <form onSubmit={submit} className="modal-body">
        <div className="login-symbol">
          <LockKeyhole size={28} />
        </div>
        <p className="muted">
          Войдите, чтобы добавлять и изменять услуги, прикреплять файлы и
          сохранять отчёты.
        </p>
        <label className="field">
          Пароль
          <input
            autoFocus
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Введите пароль администратора"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <LockKeyhole size={17} />
          )}
          Войти
        </button>
      </form>
    </Modal>
  );
}
function Editor({
  store,
  onClose,
  onSaved,
}: {
  store: Store;
  onClose: () => void;
  onSaved: (store: Store) => void;
}) {
  const latest = ordered(store.snapshots).at(-1);
  const [metrics, setMetrics] = useState<Metrics>(
      registryMetrics(latest?.metrics ?? zero, store.services),
    ),
    [services, setServices] = useState<Service[]>(
      store.services.map((s) => ({ ...s })),
    ),
    [date, setDate] = useState(today()),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [discard, setDiscard] = useState(false),
    [dirty, setDirty] = useState(false);
  function close() {
    if (dirty) setDiscard(true);
    else onClose();
  }
  function update(index: number, patch: Partial<Service>) {
    setDirty(true);
    setMetrics((m) =>
      registryMetrics(
        m,
        services.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      ),
    );
    setServices((rows) =>
      rows.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const input = { revision: store.revision, date, note, metrics, services };
    const result = registrySaveSchema.safeParse(input);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      onSaved(
        await api("/api/data", {
          method: "POST",
          body: JSON.stringify(result.data),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Обновить данные" onClose={busy ? () => {} : close} wide>
      <form onSubmit={submit}>
        <div className="modal-body editor-body">
          <p className="muted">
            Сохраните показатели и реестр одним отчётом. Предыдущие версии
            останутся в истории.
          </p>
          <label className="field date-field">
            Дата актуальности
            <input
              required
              type="date"
              max={today()}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          {date < (latest?.date ?? "") && (
            <div className="info-note">
              Вы добавляете исторический отчёт. Текущие показатели останутся на
              дату последнего отчёта. Реестр ниже скопирован из текущего
              состояния — при необходимости исправьте его для выбранной даты.
            </div>
          )}
          <h3>Общие цифры</h3>
          <div className="form-metrics">
            {(Object.keys(metricLabels) as (keyof Metrics)[]).map((key) => (
              <label key={key} className="field">
                {metricLabels[key]}
                <input
                  required={key === "declared"}
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  readOnly={key !== "declared"}
                  aria-label={`${metricLabels[key]}${key !== "declared" ? ": рассчитано по реестру" : ""}`}
                  value={
                    Number.isNaN(visibleMetrics(metrics)[key])
                      ? ""
                      : (visibleMetrics(metrics)[key] ?? "")
                  }
                  onChange={(e) => {
                    setMetrics((m) =>
                      editVisibleMetric(
                        m,
                        key,
                        e.target.value === ""
                          ? key === "both"
                            ? null
                            : NaN
                          : Number(e.target.value),
                      ),
                    );
                    setDirty(true);
                  }}
                />
              </label>
            ))}
          </div>
          <p className="footnote">
            Вручную задаётся «Заявлено услуг». «На портале» = «Работают» + «Не
            работают». Остальные показатели рассчитываются по услугам. Старые
            отчёты сохраняют прежние значения.
          </p>
          <details
            className="registry-editor-details"
            onInvalid={(e) => {
              e.currentTarget.open = true;
            }}
          >
            <summary>
              Редактировать реестр{" "}
              <span className="count-badge">{services.length}</span>
            </summary>
            <div className="editor-section-heading">
              <h3>
                Реестр услуг{" "}
                <span className="count-badge">{services.length}</span>
              </h3>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const service: Service = {
                    id: "",
                    name: "",
                    audience: "individual",
                    status: "planned",
                  };
                  setServices((s) => [...s, service]);
                  setMetrics((m) => registryMetrics(m, [...services, service]));
                  setDirty(true);
                }}
              >
                <Plus size={16} />
                Добавить услугу
              </button>
            </div>
            {services.length === 0 && (
              <div className="empty-small">
                Добавьте услугу по названию. ID можно оставить пустым. Выберите
                получателей и статус — расчётные показатели обновятся
                автоматически.
              </div>
            )}
            <p className="footnote">
              Каждая запись учитывается один раз в своей группе получателей.
              Только статус «Работает» увеличивает число работающих услуг.
              «Заявлено» задаётся вручную. «На портале» рассчитывается по
              статусам.
            </p>
            <div className="service-editor-list">
              {services.map((s, i) => (
                <div className="service-editor-row" key={i}>
                  <label className="field">
                    ID (необязательно)
                    <input
                      maxLength={64}
                      readOnly={store.services.some(
                        (existing) => existing.id === s.id,
                      )}
                      value={s.id}
                      placeholder="Авто"
                      onChange={(e) => update(i, { id: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Оплата
                    <select
                      value={s.payment ?? ""}
                      onChange={(e) =>
                        update(i, {
                          payment: (e.target.value ||
                            undefined) as Service["payment"],
                          pricing: e.target.value === "paid" ? s.pricing : null,
                          audiencePricing:
                            e.target.value === "paid"
                              ? s.audiencePricing
                              : null,
                        })
                      }
                    >
                      <option value="">Не указано</option>
                      <option value="free">Бесплатно</option>
                      <option value="paid">Платно</option>
                    </select>
                  </label>
                  <label className="field service-title-field">
                    Название услуги
                    <input
                      required
                      minLength={2}
                      maxLength={240}
                      value={s.name}
                      placeholder="Название услуги"
                      onChange={(e) => update(i, { name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Получатели (одна или обе аудитории)
                    <select
                      value={s.audience}
                      onChange={(e) =>
                        update(i, {
                          audience: e.target.value as Service["audience"],
                        })
                      }
                    >
                      {Object.entries(audienceLabels).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Статус
                    <select
                      value={s.status}
                      onChange={(e) =>
                        update(i, {
                          status: e.target.value as Service["status"],
                        })
                      }
                    >
                      {Object.entries(statusLabels).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="icon-button delete"
                    aria-label={`Убрать услугу ${s.name || i + 1} из нового отчёта`}
                    onClick={() => {
                      setMetrics((m) =>
                        registryMetrics(
                          m,
                          services.filter((_, n) => n !== i),
                        ),
                      );
                      setServices((rows) => rows.filter((_, n) => n !== i));
                      setDirty(true);
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                  <label className="field service-category-field">
                    Категория
                    <select
                      value={s.category ?? ""}
                      onChange={(e) =>
                        update(i, {
                          category: (e.target.value ||
                            undefined) as Service["category"],
                        })
                      }
                    >
                      <option value="">Выберите категорию</option>
                      {serviceCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  {s.payment === "paid" && (
                    <ServicePricingFields
                      service={s}
                      onChange={(patch) => update(i, patch)}
                    />
                  )}
                </div>
              ))}
            </div>
          </details>
          <label className="field">
            Комментарий к обновлению
            <textarea
              required
              minLength={2}
              maxLength={500}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setDirty(true);
              }}
              placeholder="Например: запущены 3 услуги для физических лиц"
              rows={3}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {discard && (
            <div className="discard">
              <strong>Закрыть без сохранения?</strong>
              <p>Изменения в этом отчёте будут потеряны.</p>
              <button
                className="secondary"
                type="button"
                onClick={() => setDiscard(false)}
              >
                Продолжить редактирование
              </button>
              <button className="danger-button" type="button" onClick={onClose}>
                Закрыть без сохранения
              </button>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={close}
          >
            Отмена
          </button>
          <button className="primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <Check size={18} />
            )}
            Сохранить отчёт
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddService({
  store,
  initialService,
  onClose,
  onSaved,
}: {
  store: Store;
  initialService?: Service;
  onClose: () => void;
  onSaved: (store: Store, service?: Service, files?: File[]) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [service, setService] = useState<Service>(
    initialService ?? {
      id: "",
      name: "",
      audience: "individual",
      status: "planned",
    },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [discard, setDiscard] = useState(false);
  const latest = ordered(store.snapshots).at(-1);
  const base = latest?.metrics ?? zero;
  const nextServices = (value: Service) =>
    initialService
      ? store.services.map((s) =>
          s.id === initialService.id ? { ...value, id: initialService.id } : s,
        )
      : [...store.services, value];
  const totals = registryMetrics(base, nextServices(service));
  function update(patch: Partial<Service>) {
    setService((s) => ({ ...s, ...patch }));
    setDirty(true);
  }
  function close() {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (files.length > 20) {
      setError("Можно прикрепить до 20 файлов к услуге.");
      return;
    }
    for (const file of files) {
      const check = uploadSchema.safeParse({
        serviceId: "new",
        name: file.name,
        size: file.size,
      });
      if (!check.success) {
        setError(check.error.issues[0].message);
        return;
      }
    }
    const parsedService = serviceSchema.safeParse(service);
    if (!parsedService.success) {
      setError(parsedService.error.issues[0].message);
      return;
    }
    const input = registrySaveSchema.safeParse({
      revision: store.revision,
      date: today(),
      note: `${initialService ? "Изменена" : "Добавлена"} услуга: ${parsedService.data.name}`,
      metrics: totals,
      services: nextServices(parsedService.data),
    });
    if (!input.success) {
      setError(input.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      onSaved(
        await api("/api/data", {
          method: "POST",
          body: JSON.stringify(input.data),
        }),
        parsedService.data,
        files,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={initialService ? "Редактировать услугу" : "Добавить услугу"}
      onClose={close}
    >
      <form className="service-form" onSubmit={submit}>
        <div className="modal-body">
          <p className="muted">
            {initialService
              ? "Измените свойства этой услуги. "
              : "Заполните данные новой услуги. "}
            Показатели пересчитаются автоматически. Изменения сохранятся в
            истории за сегодня.
          </p>
          <label className="field">
            Название услуги
            <input
              required
              minLength={2}
              maxLength={240}
              value={service.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Например: Электронная подпись"
            />
          </label>
          <label className="field">
            Категория
            <select
              value={service.category ?? ""}
              onChange={(e) =>
                update({
                  category: (e.target.value ||
                    undefined) as Service["category"],
                })
              }
            >
              <option value="">Выберите категорию</option>
              {serviceCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Получатели
            <select
              value={service.audience}
              onChange={(e) =>
                update({ audience: e.target.value as Service["audience"] })
              }
            >
              {Object.entries(audienceLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Статус
            <select
              value={service.status}
              onChange={(e) =>
                update({ status: e.target.value as Service["status"] })
              }
            >
              {Object.entries(statusLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Оплата
            <select
              value={service.payment ?? ""}
              onChange={(e) =>
                update({
                  payment: (e.target.value || undefined) as Service["payment"],
                  pricing: e.target.value === "paid" ? service.pricing : null,
                  audiencePricing:
                    e.target.value === "paid" ? service.audiencePricing : null,
                })
              }
            >
              <option value="">Не указано</option>
              <option value="free">Бесплатно</option>
              <option value="paid">Платно</option>
            </select>
            <small>
              Можно заполнить позже. Это свойство не влияет на количество услуг.
            </small>
          </label>
          {service.payment === "paid" && (
            <ServicePricingFields service={service} onChange={update} />
          )}
          <label className="field">
            Файлы услуги
            <input
              type="file"
              accept={fileAccept}
              multiple
              onChange={(e) => {
                setFiles(Array.from(e.target.files || []));
                setDirty(true);
              }}
            />
            <small>
              До 20 МБ каждый. После сохранения услуги начнётся загрузка. Файлы
              будут видны всем.
            </small>
          </label>
          <label className="field">
            ID (необязательно)
            <input
              maxLength={64}
              readOnly={!!initialService}
              value={service.id}
              onChange={(e) => update({ id: e.target.value })}
              placeholder="Создаётся автоматически"
            />
          </label>
          <p className="footnote">
            После сохранения: заявлено {number(totals.declared)}, на портале{" "}
            {number(totals.portal)}, работают {number(totals.working)}, не
            работают {number(totals.notWorking)}, физ{" "}
            {number(visibleMetrics(totals).individual)}, юр{" "}
            {number(visibleMetrics(totals).business)}, физ/юр{" "}
            {number(totals.both)}.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {discard && (
            <div className="discard">
              <strong>Закрыть без сохранения?</strong>
              <button
                type="button"
                className="secondary"
                onClick={() => setDiscard(false)}
              >
                Продолжить ввод
              </button>
              <button type="button" className="secondary" onClick={onClose}>
                Закрыть без сохранения
              </button>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="secondary"
            onClick={close}
            disabled={busy}
          >
            Отмена
          </button>
          <button className="primary" disabled={busy}>
            {busy
              ? "Сохранение…"
              : initialService
                ? "Сохранить изменения"
                : "Добавить услугу"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteService({
  store,
  service,
  onClose,
  onSaved,
}: {
  store: Store;
  service: Service;
  onClose: () => void;
  onSaved: (store: Store) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function remove() {
    setError("");
    const latest = ordered(store.snapshots).at(-1);
    if (!latest || !store.services.some((s) => s.id === service.id)) {
      setError("Услуга уже отсутствует. Обновите страницу.");
      return;
    }
    const input = registrySaveSchema.safeParse({
      revision: store.revision,
      date: today(),
      note: `Удалена услуга: ${service.name}`,
      metrics: latest.metrics,
      services: store.services.filter((s) => s.id !== service.id),
    });
    if (!input.success) {
      setError(input.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      onSaved(
        await api("/api/data", {
          method: "POST",
          body: JSON.stringify(input.data),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Удалить услугу?" onClose={busy ? () => {} : onClose}>
      <div className="modal-body">
        <strong>{service.name}</strong>
        <p className="muted">
          Услуга будет удалена из текущего реестра. Расчётные показатели
          обновятся, включая «На портале». «Заявлено» останется прежним.
          Предыдущие отчёты сохранятся в истории.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="modal-footer">
        <button className="secondary" disabled={busy} onClick={onClose}>
          Отмена
        </button>
        <button
          className="primary danger-action"
          disabled={busy}
          onClick={remove}
        >
          {busy ? "Удаление…" : "Удалить услугу"}
        </button>
      </div>
    </Modal>
  );
}
