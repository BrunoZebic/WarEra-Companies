"use client";

import { useRouter } from "next/navigation";

type CountryOption = {
  code: string;
  name: string;
};

type CountryFilterSelectProps = {
  countries: CountryOption[];
  currentCountry?: string;
};

export function CountryFilterSelect({ countries, currentCountry }: CountryFilterSelectProps) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === "all") {
      router.push("/regions");
    } else {
      router.push(`/regions?country=${encodeURIComponent(value)}`);
    }
  }

  return (
    <label className="flex items-center gap-3 text-sm text-slate-400">
      <span className="font-medium text-blue-200">Filtriraj po drzavi</span>
      <select
        value={currentCountry ?? "all"}
        onChange={handleChange}
        className="rounded-full border border-blue-800/50 bg-blue-950 px-4 py-2 text-sm text-blue-100 outline-none transition focus:border-blue-500"
      >
        <option value="all">Sve drzave</option>
        {countries.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </select>
    </label>
  );
}
