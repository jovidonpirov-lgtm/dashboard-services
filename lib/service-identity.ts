import type { Service } from "./model";

/** Registry codes can repeat between subservices. The internal id remains a stable attachment key. */
export function registryIdFor(service: Service): string {
  if (service.registryId !== undefined) return service.registryId ?? "";
  if (service.work?.sources?.length) {
    return [
      ...new Set(
        service.work.sources
          .map((source) => source.cells["ID реестра"]?.trim())
          .filter((id): id is string => !!id),
      ),
    ].join(", ");
  }
  // Legacy manually entered IDs remain visible; generated keys are never presented as registry codes.
  if (
    /^TRK-/i.test(service.id) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      service.id,
    )
  )
    return "";
  return service.id;
}
