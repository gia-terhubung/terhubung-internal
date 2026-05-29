'use client';

import { useEffect, useState } from 'react';

// Indonesian region data — same static CDN the mobile AddressPicker uses.
const WILAYAH_BASE = 'https://gia-terhubung.github.io/api-wilayah-indonesia/api';

interface Region {
  id: string;
  name: string;
}

export interface LocationValue {
  province: string;
  province_id: string;
  city: string;
  city_id: string;
  district: string;
  district_id: string;
  sub_district: string;
  sub_district_id: string;
  address: string;
}

export const emptyLocation: LocationValue = {
  province: '',
  province_id: '',
  city: '',
  city_id: '',
  district: '',
  district_id: '',
  sub_district: '',
  sub_district_id: '',
  address: '',
};

async function fetchRegions(endpoint: string): Promise<Region[]> {
  try {
    const res = await fetch(`${WILAYAH_BASE}${endpoint}`);
    if (!res.ok) return [];
    return (await res.json()) as Region[];
  } catch {
    return [];
  }
}

const selectClass =
  'mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-brand disabled:opacity-50';

export function LocationPicker({
  value,
  onChange,
}: {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
}) {
  const [provinces, setProvinces] = useState<Region[]>([]);
  const [cities, setCities] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<Region[]>([]);
  const [subDistricts, setSubDistricts] = useState<Region[]>([]);

  useEffect(() => {
    fetchRegions('/provinces.json').then(setProvinces);
  }, []);
  useEffect(() => {
    if (!value.province_id) return;
    fetchRegions(`/regencies/${value.province_id}.json`).then(setCities);
  }, [value.province_id]);
  useEffect(() => {
    if (!value.city_id) return;
    fetchRegions(`/districts/${value.city_id}.json`).then(setDistricts);
  }, [value.city_id]);
  useEffect(() => {
    if (!value.district_id) return;
    fetchRegions(`/villages/${value.district_id}.json`).then(setSubDistricts);
  }, [value.district_id]);

  function selectProvince(id: string) {
    const r = provinces.find((x) => x.id === id);
    setCities([]);
    setDistricts([]);
    setSubDistricts([]);
    onChange({ ...emptyLocation, address: value.address, province: r?.name ?? '', province_id: id });
  }
  function selectCity(id: string) {
    const r = cities.find((x) => x.id === id);
    setDistricts([]);
    setSubDistricts([]);
    onChange({
      ...value,
      city: r?.name ?? '',
      city_id: id,
      district: '',
      district_id: '',
      sub_district: '',
      sub_district_id: '',
    });
  }
  function selectDistrict(id: string) {
    const r = districts.find((x) => x.id === id);
    setSubDistricts([]);
    onChange({ ...value, district: r?.name ?? '', district_id: id, sub_district: '', sub_district_id: '' });
  }
  function selectSubDistrict(id: string) {
    const r = subDistricts.find((x) => x.id === id);
    onChange({ ...value, sub_district: r?.name ?? '', sub_district_id: id });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm text-text-secondary">
          Provinsi
          <select className={selectClass} value={value.province_id} onChange={(e) => selectProvince(e.target.value)}>
            <option value="">Pilih provinsi…</option>
            {provinces.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-text-secondary">
          Kota/Kabupaten
          <select
            className={selectClass}
            value={value.city_id}
            onChange={(e) => selectCity(e.target.value)}
            disabled={!value.province_id}
          >
            <option value="">Pilih kota/kabupaten…</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-text-secondary">
          Kecamatan
          <select
            className={selectClass}
            value={value.district_id}
            onChange={(e) => selectDistrict(e.target.value)}
            disabled={!value.city_id}
          >
            <option value="">Pilih kecamatan…</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-text-secondary">
          Kelurahan/Desa
          <select
            className={selectClass}
            value={value.sub_district_id}
            onChange={(e) => selectSubDistrict(e.target.value)}
            disabled={!value.district_id}
          >
            <option value="">Pilih kelurahan/desa…</option>
            {subDistricts.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm text-text-secondary">
        Alamat
        <textarea
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          rows={2}
          placeholder="Jl. Merdeka No. 1, RT 01/RW 02"
          className="mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-brand"
        />
      </label>
    </div>
  );
}
