import type { DriverAuthUser } from '@shared/utils/driverAuthApi';
import type { DriverUnit } from '@shared/types/hospitalOps.types';

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function stableHash(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash >>> 0);
}

function getEmailDriverOrdinal(email: string): number | null {
  const localPart = normalizeText(email).split('@')[0] ?? '';
  const match = /^driver(\d+)$/.exec(localPart);

  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed - 1;
}

function sortDriverUnits(drivers: DriverUnit[]): DriverUnit[] {
  return [...drivers].sort((left, right) => left.id.localeCompare(right.id));
}

export function resolveDriverUnitId(params: {
  driverUser: DriverAuthUser | null;
  drivers: DriverUnit[];
  previousDriverId?: string | null;
}): string | null {
  const { driverUser, drivers, previousDriverId } = params;

  if (drivers.length === 0) {
    return null;
  }

  if (!driverUser) {
    if (previousDriverId && drivers.some((driver) => driver.id === previousDriverId)) {
      return previousDriverId;
    }

    return drivers[0]?.id ?? null;
  }

  const byId = sortDriverUnits(drivers);

  const exactIdMatch = drivers.find((driver) => driver.id === driverUser.id);
  if (exactIdMatch) {
    return exactIdMatch.id;
  }

  const normalizedCallSign = normalizeText(driverUser.callSign);
  if (normalizedCallSign) {
    const callSignMatch = drivers.find((driver) => normalizeText(driver.callSign) === normalizedCallSign);
    if (callSignMatch) {
      return callSignMatch.id;
    }
  }

  const normalizedName = normalizeText(driverUser.name);
  if (normalizedName) {
    const nameMatch = drivers.find((driver) => normalizeText(driver.name) === normalizedName);
    if (nameMatch) {
      return nameMatch.id;
    }
  }

  const presetOrdinal = getEmailDriverOrdinal(driverUser.email);
  if (presetOrdinal !== null) {
    return byId[presetOrdinal % byId.length]?.id ?? null;
  }

  const seed = normalizeText(driverUser.email) || normalizedName || driverUser.id;
  const index = stableHash(seed) % byId.length;
  return byId[index]?.id ?? null;
}
