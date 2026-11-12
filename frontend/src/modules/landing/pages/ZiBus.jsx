import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../shared/api/axiosInstance';
import { useSettings } from '../../../shared/context/SettingsContext';
import BusHomeDesktop from '../../user/pages/bus/BusHomeDesktop';
import { toDateKey } from '../../user/components/bus/zibusFormat';

const MAX_PASSENGERS = 6;
const normalizeCity = (value = '') => String(value).trim().toLowerCase();
const isEnabledFlag = (value) =>
  ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value ?? '').trim().toLowerCase()) || value === true || value === 1;

// The Zi Bus banners set in admin under Promotions > Banner Image, the same
// list the rider app's bus screen shows.
const bannerImages = (settings = {}) => {
  const list = settings.busBanners ?? settings.bus_banners;
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => (typeof item === 'string' ? item : item?.image || item?.imageUrl || item?.url || ''))
    .map((image) => String(image).trim())
    .filter(Boolean);
};

/// The public Zi Bus page on the website: open to everyone, with the site's own
/// menu. Searching takes the rider into the booking flow, which asks them to log in.
const ZiBus = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const busEnabled = isEnabledFlag(settings.transportRide?.enable_bus_service);
  const today = toDateKey();

  const [routes, setRoutes] = useState([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [banners, setBanners] = useState([]);
  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [date, setDate] = useState(today);
  const [returnDate, setReturnDate] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .get('/users/buses/popular-routes')
      .then((response) => {
        const results = response?.data?.results || response?.data?.data?.results || [];
        if (active) setRoutes(Array.isArray(results) ? results : []);
      })
      .catch(() => {})
      .finally(() => active && setRoutesLoading(false));
    api
      .get('/user-home-management')
      .then((response) => {
        const data = response?.data?.data || response?.data || {};
        if (active) setBanners(bannerImages(data));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const cities = useMemo(
    () => [...new Set(routes.flatMap((route) => [route.fromCity, route.toCity]).filter(Boolean))].sort(),
    [routes],
  );
  const matchingRoute = routes.find(
    (route) => normalizeCity(route.fromCity) === normalizeCity(fromCity) && normalizeCity(route.toCity) === normalizeCity(toCity),
  );

  const search = (from = fromCity, to = toCity) => {
    if (!busEnabled) return setError('Bus booking is paused right now.');
    if (!from.trim() || !to.trim()) return setError('Choose where you are leaving from and going to.');
    if (normalizeCity(from) === normalizeCity(to)) return setError('From and To can’t be the same city.');
    setError('');
    navigate('/bus/list', {
      state: { fromCity: from.trim(), toCity: to.trim(), date, passengers, ...(returnDate ? { returnDate } : {}) },
    });
    return undefined;
  };

  return (
    <BusHomeDesktop
      embedded
      heroImages={banners}
      busEnabled={busEnabled}
      cities={cities}
      routes={routes}
      routesLoading={routesLoading}
      fromCity={fromCity}
      toCity={toCity}
      date={date}
      returnDate={returnDate}
      passengers={passengers}
      today={today}
      error={error}
      matchingRoute={matchingRoute}
      maxPassengers={MAX_PASSENGERS}
      routePrefix=""
      nextTrip={null}
      onFromChange={setFromCity}
      onToChange={setToCity}
      onDateChange={(key) => {
        setDate(key);
        if (returnDate && returnDate < key) setReturnDate('');
      }}
      onReturnDateChange={setReturnDate}
      onPassengersChange={setPassengers}
      onSwap={() => { setFromCity(toCity); setToCity(fromCity); }}
      onSearch={() => search()}
      onRouteSearch={(route) => {
        setFromCity(route.fromCity);
        setToCity(route.toCity);
        search(route.fromCity, route.toCity);
      }}
    />
  );
};

export default ZiBus;
