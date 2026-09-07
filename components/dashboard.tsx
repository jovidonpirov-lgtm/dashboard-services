"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  Globe,
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
  adjustServiceTotals,
  audienceBreakdown,
  serviceCategories,
  audienceLabels,
  compare,
  dateLabel,
  ordered,
  saveSchema,
  shiftDay,
  statusLabels,
  today,
  type Metrics,
  type Service,
  type Snapshot,
  type Store,
} from "@/lib/model";
import { registerAnalysisTools, type ModelContext } from "@/lib/agent-tools";
const zero: Metrics = {
  declared: 0,
  portal: 0,
  working: 0,
  individual: 0,
  business: 0,
  both: 0,
};
const number = (value: number | null | undefined) =>
  value == null ? "—" : value.toLocaleString("ru-RU");
const signed = (value: number | null) =>
  value == null ? "—" : `${value > 0 ? "+" : ""}${number(value)}`;
const metricLabels: Record<keyof Metrics, string> = {
  declared: "Заявлено услуг",
  portal: "На портале",
  working: "Работают",
  individual: "Физ",
  business: "Юр",
  both: "Из них для физ и юр",
};
const sections = {
  overview: "Обзор",
  services: "Реестр услуг",
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
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-head">
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
}: {
  value: number | null;
  label?: string;
}) {
  return (
    <span
      className={`change ${value === null ? "neutral" : value < 0 ? "negative" : ""}`}
    >
      {value === null ? (
        "Нет базы сравнения"
      ) : (
        <>
          {value < 0 ? (
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
              {dateLabel(p.date)}:{" "}
              {p.snapshot
                ? `${p.snapshot.metrics.working} работают / ${p.snapshot.metrics.declared} заявлено`
                : "Нет отчёта"}
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
export default function Dashboard({ demo }: { demo: Store }) {
  const [store, setStore] = useState<Store>(demo),
    [admin, setAdmin] = useState(false),
    [ready, setReady] = useState(false),
    [section, setSection] = useState<Section>("overview");
  const [login, setLogin] = useState(false),
    [editor, setEditor] = useState(false),
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
    api("/api/auth")
      .then(async (auth) => {
        if (auth.admin) {
          const data = await api("/api/data");
          if (active) {
            setStore(data);
            setAdmin(true);
          }
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
  const visibleData = useRef({ store, demo: !admin });
  useEffect(() => {
    visibleData.current = { store, demo: !admin };
  }, [store, admin]);
  useEffect(
    () =>
      registerAnalysisTools(
        (document as Document & { modelContext?: ModelContext }).modelContext,
        () => visibleData.current,
      ),
    [],
  );
  const latest = ordered(store.snapshots).at(-1),
    metrics = latest?.metrics ?? zero,
    currentDate = today(),
    isFresh = latest?.date === currentDate;
  const daily = compare(store.snapshots, currentDate, currentDate),
    period = from <= to ? compare(store.snapshots, from, to) : null;
  const completion = metrics.declared
    ? Math.round((metrics.working / metrics.declared) * 100)
    : 0;
  const filtered = store.services.filter(
    (s) =>
      (s.name + " " + s.id).toLowerCase().includes(query.toLowerCase()) &&
      (status === "all" || s.status === status) &&
      (category === "all" ||
        (category === "none" ? !s.category : s.category === category)) &&
      (audience === "all" || s.audience === audience || s.audience === "both"),
  );
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
      setStore(demo);
      setSection("overview");
      setToast("Вы вышли из аккаунта. Открыт демонстрационный обзор.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const requestEdit = () => (admin ? setEditor(true) : setLogin(true));
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
            <span className="avatar">{admin ? "А" : "Д"}</span>
            <span>
              <strong>{admin ? "Администратор" : "Демонстрация"}</strong>
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
            Рабочее пространство <ChevronRight size={14} />
            <strong>{sections[section]}</strong>
          </div>
          <div className="topbar-right">
            <span className="live-dot" /> {dateLabel(currentDate, true)}{" "}
            <span className="timezone">Душанбе · UTC+5</span>
          </div>
        </header>
        <main>
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
                    : "Все обновления и изменения показателей в одном месте."}
              </p>
            </div>
            <button className="primary" onClick={requestEdit} disabled={!ready}>
              <Plus size={18} />
              Обновить данные
            </button>
          </div>
          {!admin && (
            <div className="demo-banner">
              <span>
                <CircleHelp size={17} />
                <strong>Демонстрационные данные</strong>
                <span>
                  Пример дашборда. Реальные показатели доступны после входа.
                </span>
              </span>
              <button onClick={() => setLogin(true)}>
                Войти <ArrowRight size={15} />
              </button>
            </div>
          )}
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
                      UsersRound,
                      Building2,
                      UsersRound,
                    ][i];
                    return (
                      <article
                        key={key}
                        className={`metric-card ${key === "working" ? "featured" : ""}`}
                      >
                        <div className="metric-label">
                          {key === "both" ? "Физ/Юр" : metricLabels[key]}
                          <span className="metric-icon">
                            <Icon size={19} />
                          </span>
                        </div>
                        <div className="metric-value">
                          {number(metrics[key])}
                          {key === "working" && (
                            <span className="percentage">{completion}%</span>
                          )}
                        </div>
                        <Change
                          value={daily.delta?.[key] ?? null}
                          label="за сегодня"
                        />
                        {key === "working" && (
                          <div className="mini-progress">
                            <span style={{ width: `${completion}%` }} />
                          </div>
                        )}
                      </article>
                    );
                  },
                )}
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
                    <Trend snapshots={store.snapshots} from={from} to={to} />
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
                      ? "Укажите «Из них для физ и юр» в общих цифрах, чтобы увидеть три группы. В этом отчёте пересечение ещё не задано."
                      : "Три группы не пересекаются. Верхние показатели Физ и Юр включают общие услуги. Проценты — от заявленных услуг."}
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
                          <span>
                            {dateLabel(s.date)} ·{" "}
                            {admin ? "Администратор" : "Пример отчёта"}
                          </span>
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
                <button className="secondary" onClick={requestEdit}>
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
                  <option value="individual">Физические лица</option>
                  <option value="business">Юридические лица</option>
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
              <ServiceTable
                services={filtered}
                onEdit={admin ? requestEdit : undefined}
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
                      : "Добавьте ID и название услуги в новый отчёт."
                  }
                />
              )}
              <div className="table-footer">
                Найдено: {filtered.length} услуг
                <span>Итоги отчёта вводятся отдельно от реестра</span>
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
                        <th>Физ</th>
                        <th>Юр</th>
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
                            <td>{number(s.metrics.individual)}</td>
                            <td>{number(s.metrics.business)}</td>
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
          onClose={() => setLogin(false)}
          onSuccess={async () => {
            const data = await api("/api/data");
            setStore(data);
            setAdmin(true);
            setLogin(false);
            setError("");
            setToast("Вы вошли как администратор.");
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
                  <strong>{number(detail.metrics[key])}</strong>
                </div>
              ))}
            </div>
            <h3>Реестр на дату отчёта</h3>
            <ServiceTable services={detail.services} />
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
}: {
  services: Service[];
  onEdit?: () => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Название услуги</th>
            <th>Категория</th>
            <th>Получатели</th>
            <th>Статус</th>
            {onEdit && (
              <th>
                <span className="sr-only">Редактировать</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id}>
              <td>
                <span className="service-id">{s.id}</span>
              </td>
              <td className="service-name">{s.name}</td>
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
              {onEdit && (
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Редактировать ${s.name}`}
                    onClick={onEdit}
                  >
                    <Pencil size={15} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
          Войдите, чтобы просматривать реальные данные, добавлять услуги и
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
  const [metrics, setMetrics] = useState<Metrics>(latest?.metrics ?? zero),
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
    const before = services[index];
    setMetrics((m) => adjustServiceTotals(m, before, { ...before, ...patch }));
    setServices((rows) =>
      rows.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const input = { revision: store.revision, date, note, metrics, services };
    const result = saveSchema.safeParse(input);
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
                  required={key !== "both"}
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  value={Number.isNaN(metrics[key]) ? "" : (metrics[key] ?? "")}
                  onChange={(e) => {
                    setMetrics((m) => ({
                      ...m,
                      [key]:
                        e.target.value === ""
                          ? key === "both"
                            ? null
                            : NaN
                          : Number(e.target.value),
                    }));
                    setDirty(true);
                  }}
                />
              </label>
            ))}
          </div>
          <p className="footnote">
            «Из них для физ и юр» — услуги, входящие в оба показателя. Укажите
            0, если общих нет; оставьте пустым, если число пока неизвестно. Все
            пять итогов можно редактировать вручную. Новая услуга прибавляется к
            этим цифрам автоматически. Существующие услуги уже учтены и повторно
            не суммируются. Аудитории можно заполнять постепенно: их сумма не
            обязана равняться заявленным услугам.
          </p>
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
                setMetrics((m) => adjustServiceTotals(m, undefined, service));
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
              получателей и статус — общие цифры увеличатся автоматически.
            </div>
          )}
          <p className="footnote">
            Каждая новая услуга: +1 к заявленным и выбранной аудитории. Статус
            «На портале» также добавляет +1 к порталу; «Работает» — к порталу и
            работающим. При смене статуса или удалении суммы пересчитываются.
          </p>
          <div className="service-editor-list">
            {services.map((s, i) => (
              <div className="service-editor-row" key={i}>
                <label className="field">
                  ID (необязательно)
                  <input
                    maxLength={64}
                    value={s.id}
                    placeholder="Авто"
                    onChange={(e) => update(i, { id: e.target.value })}
                  />
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
                      update(i, { status: e.target.value as Service["status"] })
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
                    setMetrics((m) => adjustServiceTotals(m, s, undefined));
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
              </div>
            ))}
          </div>
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
