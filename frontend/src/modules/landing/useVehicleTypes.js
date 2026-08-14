import { useEffect, useState } from 'react';
import api from '../../shared/api/axiosInstance';

/**
 * Vehicle cards for the marketing site, from the admin vehicle-category list.
 *
 * `fallback` is what renders until the request resolves, and stays if the call
 * fails or the catalog is empty — the landing page must never show an empty
 * fleet section just because the API is unreachable.
 */

const RUPEE = '₹';

// Admin stores an uploaded path or a bare filename; bare names live in /uploads.
const resolveImage = (value, fallbackImage) => {
  const raw = String(value || '').trim();
  if (!raw) return fallbackImage;
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw;
  return `/uploads/${raw}`;
};

const toCard = (item, index, fallback) => {
  const spare = fallback[index % fallback.length] || {};
  const seats = Number(item.capacity || 0);
  const perKm = Number(item.price_per_km ?? item.pricePerKm ?? 0);

  return {
    id: item.id || item._id || `v-${index}`,
    name: item.name || spare.name || 'Vehicle',
    type: item.category || item.short_description || spare.type || '',
    seats: seats > 0 ? `${seats} Seats` : spare.seats || '',
    bags: spare.bags || '',
    price: perKm > 0 ? `${RUPEE}${perKm}` : spare.price || '',
    unit: perKm > 0 ? '/km' : spare.unit || '',
    image: resolveImage(item.image || item.icon || item.map_icon, spare.image),
  };
};

export default function useVehicleTypes(fallback = []) {
  const [vehicles, setVehicles] = useState(fallback);
  const [source, setSource] = useState('fallback');

  useEffect(() => {
    let alive = true;

    api
      .get('/users/vehicle-types')
      .then((res) => {
        if (!alive) return;
        const list = res?.data?.data?.results || res?.data?.results || [];
        const active = list.filter((v) => v.active !== false);
        if (!active.length) return; // keep the fallback rather than blank the section
        setVehicles(active.map((item, i) => toCard(item, i, fallback)));
        setSource('api');
      })
      .catch(() => {
        /* keep the fallback */
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { vehicles, source };
}
