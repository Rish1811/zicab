import React, { useEffect, useState } from 'react';
import { GoogleMap, MarkerF, PolylineF } from '@react-google-maps/api';
import { Clock, Navigation, Radio } from 'lucide-react';
import userBusService from '../../services/busService';
import { HAS_VALID_GOOGLE_MAPS_KEY, useBaseGoogleMapsLoader } from '../../../admin/utils/googleMaps';

const POLL_MS = 10_000;
const unwrap = (response) => response?.data?.data || response?.data || response || null;

const formatTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

/// Live bus position for a confirmed ticket. The server only reveals it from
/// one hour before the passenger's boarding time.
const BusLiveTrackingCard = ({ bookingId }) => {
  const [tracking, setTracking] = useState(null);
  const { isLoaded } = useBaseGoogleMapsLoader();

  useEffect(() => {
    if (!bookingId) return undefined;
    let active = true;
    let timer = null;

    const load = async () => {
      try {
        const response = await userBusService.getLiveTracking(bookingId);
        if (!active) return;
        const next = unwrap(response);
        setTracking(next);
        // Poll only while there is something live to watch, or it is about
        // to open.
        const opensIn = next?.opensAt ? new Date(next.opensAt).getTime() - Date.now() : 0;
        if (next?.available || (opensIn > 0 && opensIn < 15 * 60_000)) {
          timer = setTimeout(load, POLL_MS);
        }
      } catch {
        if (active) setTracking(null);
      }
    };

    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [bookingId]);

  const position = tracking?.location ? { lat: tracking.location.lat, lng: tracking.location.lng } : null;

  if (!tracking || tracking.state === 'closed') {
    return null;
  }

  if (tracking.state === 'not_yet_open') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <Clock size={18} className="shrink-0 text-slate-400" />
        <p className="text-xs font-bold text-slate-600">
          Live bus tracking starts at {formatTime(tracking.opensAt)}, one hour before boarding.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
      <div className="flex items-center justify-between gap-3 bg-emerald-50 px-4 py-3">
        <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-700">
          <Radio size={14} className={tracking.state === 'live' ? 'animate-pulse' : ''} />
          {tracking.state === 'live' ? 'Bus is live' : tracking.state === 'paused' ? 'Tracking paused' : 'Waiting for the bus to start'}
        </span>
        {tracking.lastUpdatedAt ? (
          <span className="text-[10px] font-bold text-emerald-700">Updated {formatTime(tracking.lastUpdatedAt)}</span>
        ) : null}
      </div>

      {position && isLoaded && HAS_VALID_GOOGLE_MAPS_KEY ? (
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '220px' }}
          center={position}
          zoom={13}
          options={{ disableDefaultUI: true, zoomControl: true }}
        >
          {tracking.recentPath?.length > 1 ? (
            <PolylineF path={tracking.recentPath} options={{ strokeColor: '#0f172a', strokeOpacity: 0.7, strokeWeight: 4 }} />
          ) : null}
          <MarkerF position={position} />
        </GoogleMap>
      ) : position ? (
        <a
          href={`https://www.google.com/maps?q=${position.lat},${position.lng}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-4 py-4 text-sm font-black text-slate-900"
        >
          <Navigation size={16} /> Open bus location in Maps
        </a>
      ) : (
        <p className="px-4 py-4 text-xs font-bold text-slate-500">
          The driver hasn&apos;t started sharing location yet. This updates automatically.
        </p>
      )}
    </div>
  );
};

export default BusLiveTrackingCard;
