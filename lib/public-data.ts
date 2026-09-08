import type { Service, Store } from "./model";
import { registryIdFor } from "./service-identity";

// Never send tariff amounts, calculation rates or private source columns to guests.
// Project both current records and EVERY historical version without mutating storage.
export function publicService(service: Service): Service {
  const { pricing, audiencePricing, work, ...safe } = service;
  void pricing;
  void audiencePricing;
  if (!work) return safe;
  const { sources, ...visibleWork } = work;
  void sources;
  return {
    ...safe,
    ...(work.sources?.length
      ? { registryId: registryIdFor(service) || null }
      : {}),
    work: visibleWork,
  };
}
export function publicStore(store: Store): Store {
  return {
    ...store,
    services: store.services.map(publicService),
    snapshots: store.snapshots.map((snapshot) => ({
      ...snapshot,
      services: snapshot.services.map(publicService),
    })),
  };
}
