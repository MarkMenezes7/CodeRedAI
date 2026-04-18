import type { DriverAuthUser } from '@shared/utils/driverAuthApi';
import type { DriverUnit } from '@shared/types/hospitalOps.types';

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeAlphaNumeric(value: string | null | undefined): string {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
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

    return null;
  }

  const exactIdMatch = drivers.find((driver) => driver.id === driverUser.id);
  if (exactIdMatch) {
    return exactIdMatch.id;
  }

  const normalizedEmailAlias = normalizeText(driverUser.email).split('@')[0] ?? '';
  const normalizedEmailAliasCompact = normalizeAlphaNumeric(normalizedEmailAlias);

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

  if (normalizedEmailAliasCompact) {
    const aliasMatch = drivers.find((driver) => {
      const driverNameCompact = normalizeAlphaNumeric(driver.name);
      const driverCallSignCompact = normalizeAlphaNumeric(driver.callSign);
      return driverNameCompact === normalizedEmailAliasCompact || driverCallSignCompact === normalizedEmailAliasCompact;
    });

    if (aliasMatch) {
      return aliasMatch.id;
    }
  }

  return null;
}
