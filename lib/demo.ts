import { shiftDay, today, type Store, type Service } from "./model";
export function demoStore(): Store {
  const services: Service[] = [
    ["001", "Выдача справки о месте жительства", "individual", "working"],
    [
      "002",
      "Государственная регистрация юридического лица",
      "business",
      "working",
    ],
    ["003", "Получение справки об отсутствии задолженности", "both", "working"],
    [
      "004",
      "Регистрация индивидуального предпринимателя",
      "individual",
      "working",
    ],
    [
      "005",
      "Выдача лицензии на строительную деятельность",
      "business",
      "progress",
    ],
    ["006", "Государственная регистрация рождения", "individual", "working"],
    ["007", "Получение разрешения на наружную рекламу", "business", "planned"],
    ["008", "Выдача справки о составе семьи", "individual", "working"],
    ["009", "Регистрация транспортного средства", "both", "progress"],
    ["010", "Получение выписки из реестра недвижимости", "both", "working"],
    [
      "011",
      "Выдача разрешения на торговую деятельность",
      "business",
      "planned",
    ],
    ["012", "Назначение социального пособия", "individual", "progress"],
  ].map(
    ([id, name, audience, status]) =>
      ({ id: `S-${id}`, name, audience, status }) as Service,
  );
  const end = today();
  const snapshots = Array.from({ length: 31 }, (_, i) => {
    const date = shiftDay(end, i - 30);
    const declared = 260 + Math.floor(i * 1.8);
    const working = 142 + Math.floor(i * 2.4);
    return {
      id: `demo-${i}`,
      date,
      createdAt: `${date}T11:00:00.000Z`,
      note:
        i === 30
          ? "Обновлены показатели запуска услуг"
          : "Ежедневное обновление показателей",
      metrics: {
        declared,
        working,
        individual: 175 + Math.floor(i * 1.1),
        business: 85 + Math.floor(i * 0.7),
      },
      services,
    };
  });
  // Audiences may overlap, so ensure all declared services are covered.
  for (const s of snapshots)
    s.metrics.business = s.metrics.declared - s.metrics.individual;
  return { revision: 0, services, snapshots };
}
