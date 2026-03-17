import type {
  CompanyGetByIdResponse,
  CountryGetAllCountriesResponse,
  RegionGetRegionsObjectResponse,
  UserGetUserLiteResponse,
} from "@wareraprojects/api";

export type CountryReferenceRowInput = {
  snapshotId: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  incomeTax: number;
  marketTax: number;
  selfWorkTax: number;
};

export type RegionReferenceRowInput = {
  snapshotId: string;
  regionId: string;
  regionCode: string;
  regionName: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  development: number | null;
  mainCity: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type OwnerSnapshotInput = {
  ownerUserId: string;
  ownerUsername: string | null;
  ownerCountryId: string | null;
  ownerCountryCode: string | null;
  ownerCountryName: string | null;
};

export type CompanySnapshotRowInput = {
  snapshotId: string;
  companyId: string;
  companyName: string;
  itemCode: string | null;
  regionId: string;
  regionCode: string;
  regionName: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  ownerUserId: string;
  ownerUsername: string | null;
  ownerCountryId: string | null;
  ownerCountryCode: string | null;
  ownerCountryName: string | null;
  workerCount: number | null;
  estimatedValue: number | null;
  production: number | null;
  isFull: boolean | null;
  wareraUpdatedAt: Date | null;
};

export function normalizeCountries(
  snapshotId: string,
  countries: CountryGetAllCountriesResponse,
) {
  return countries.map<CountryReferenceRowInput>((country) => ({
    snapshotId,
    countryId: country._id,
    countryCode: country.code,
    countryName: country.name,
    incomeTax: country.taxes.income,
    marketTax: country.taxes.market,
    selfWorkTax: country.taxes.selfWork,
  }));
}

export function normalizeRegions(
  snapshotId: string,
  regions: RegionGetRegionsObjectResponse,
  countryById: Map<string, CountryReferenceRowInput>,
) {
  return Object.values(regions).map<RegionReferenceRowInput>((region) => {
    const country = countryById.get(region.country);

    if (!country) {
      throw new Error(`Missing country reference for region ${region._id}.`);
    }

    return {
      snapshotId,
      regionId: region._id,
      regionCode: region.code,
      regionName: region.name,
      countryId: country.countryId,
      countryCode: country.countryCode,
      countryName: country.countryName,
      development: region.development ?? null,
      mainCity: region.mainCity ?? null,
      latitude: region.position?.[1] ?? null,
      longitude: region.position?.[0] ?? null,
    };
  });
}

export function normalizeOwnerSnapshot(
  user: UserGetUserLiteResponse,
  countryById: Map<string, CountryReferenceRowInput>,
): OwnerSnapshotInput {
  const ownerCountry = user.country ? countryById.get(user.country) : undefined;

  return {
    ownerUserId: user._id,
    ownerUsername: user.username ?? null,
    ownerCountryId: user.country ?? null,
    ownerCountryCode: ownerCountry?.countryCode ?? null,
    ownerCountryName: ownerCountry?.countryName ?? null,
  };
}

export function normalizeCompanySnapshotRow(input: {
  snapshotId: string;
  company: CompanyGetByIdResponse;
  regionById: Map<string, RegionReferenceRowInput>;
  owner: OwnerSnapshotInput;
}): CompanySnapshotRowInput {
  const region = input.regionById.get(input.company.region);

  if (!region) {
    throw new Error(`Missing region reference for company ${input.company._id}.`);
  }

  return {
    snapshotId: input.snapshotId,
    companyId: input.company._id,
    companyName: input.company.name,
    itemCode: input.company.itemCode ?? null,
    regionId: region.regionId,
    regionCode: region.regionCode,
    regionName: region.regionName,
    countryId: region.countryId,
    countryCode: region.countryCode,
    countryName: region.countryName,
    ownerUserId: input.owner.ownerUserId,
    ownerUsername: input.owner.ownerUsername,
    ownerCountryId: input.owner.ownerCountryId,
    ownerCountryCode: input.owner.ownerCountryCode,
    ownerCountryName: input.owner.ownerCountryName,
    workerCount: input.company.workerCount ?? null,
    estimatedValue: input.company.estimatedValue ?? null,
    production: input.company.production ?? null,
    isFull: input.company.isFull ?? null,
    wareraUpdatedAt: input.company.updatedAt ? new Date(input.company.updatedAt) : null,
  };
}
