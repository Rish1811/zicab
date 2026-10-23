import React, { useEffect, useState } from 'react';
import { GoogleMap, MarkerF, PolylineF } from '@react-google-maps/api';
import { Clock, MapPin, Navigation, Radio } from 'lucide-react';
import userBusService from '../../services/busService';
import { socketService } from '../../../../shared/api/socket';
import { HAS_VALID_GOOGLE_MAPS_KEY, useBaseGoogleMapsLoader } from '../../../admin/utils/googleMaps';

// Positions arrive over the socket the moment the driver's app sends them;
// this slower poll only covers a dropped connection.
const POLL_MS = 30_000;
const LIVE_EVENTS = { TRACK: 'bus:track', UNTRACK: 'bus:untrack', LOCATION: 'bus:live:location' };
const MAX_TRAIL_POINTS = 60;
const unwrap = (response) => response?.data?.data || response?.data || response || null;

const formatTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

const stopName = (stop) => [stop?.pointName, stop?.city].filter(Boolean).join(', ') || 'Stop';

const pinIcon = (color, scale = 7) =>
  typeof window !== 'undefined' && window.google?.maps
    ? { path: window.google.maps.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 }
    : undefined;

/// The run's stops in order with times, the passenger's boarding and dropping
/// stops called out.
const StopList = ({ stops }) => {
  if (!stops?.length) return null;
  return (
    <ol className="space-y-0 px-4 pb-4 pt-1">
      {stops.map((stop, index) => {
        const mine = stop.isBoarding || stop.isDropping;
        const time = stop.departureTime || stop.arrivalTime;
        return (
          <li key={stop.id || index} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <span
                className="mt-1 h-3 w-3 shrink-0 rounded-full border-2"
                style={{
                  borderColor: stop.isBoarding ? '#16a34a' : stop.isDropping ? '#dc2626' : 'var(--zb-line)',
                  background: mine ? (stop.isBoarding ? '#16a34a' : '#dc2626') : 'transparent',
                }}
              />
              {index < stops.length - 1 ? <span className="h-6 w-px" style={{ background: 'var(--zb-line)' }} /> : null}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className={`text-sm ${mine ? 'zb-text font-extrabold' : 'zb-muted font-semibold'}`}>{stopName(stop)}</p>
              {stop.isBoarding ? <p className="text-[11px] font-bold" style={{ color: '#16a34a' }}>Your boarding point</p> : null}
              {stop.isDropping ? <p className="text-[11px] font-bold" style={{ color: '#dc2626' }}>Your drop point</p> : null}
            </div>
            {time ? <span className={`text-xs ${mine ? 'zb-text font-extrabold' : 'zb-muted font-bold'}`}>{time}</span> : null}
          </li>
        );
      })}
    </ol>
  );
};

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

  const isAvailable = Boolean(tracking?.available);
  useEffect(() => {
    if (!bookingId || !isAvailable) return undefined;

    const socket = socketService.connect({ role: 'user' });
    const subscribe = () => socketService.emit(LIVE_EVENTS.TRACK, { bookingId });
    const handleLocation = (payload) => {
      setTracking((current) => {
        if (!current) return current;
        const location = payload?.location || current.location;
        const lastPoint = current.recentPath?.[current.recentPath.length - 1];
        const moved = location && (!lastPoint || lastPoint.lat !== location.lat || lastPoint.lng !== location.lng);
        return {
          ...current,
          ...(payload?.opensAt ? payload : {}),
          state: payload?.state || current.state,
          location,
          lastUpdatedAt: payload?.lastUpdatedAt || current.lastUpdatedAt,
          recentPath: moved
            ? [...(current.recentPath || []), { lat: location.lat, lng: location.lng }].slice(-MAX_TRAIL_POINTS)
            : current.recentPath,
        };
      });
    };

    socketService.on(LIVE_EVENTS.LOCATION, handleLocation);
    socketService.on('connect', subscribe);
    if (socket?.connected) subscribe();

    return () => {
      socketService.emit(LIVE_EVENTS.UNTRACK, {});
      socketService.off(LIVE_EVENTS.LOCATION, handleLocation);
      socketService.off('connect', subscribe);
    };
  }, [bookingId, isAvailable]);

  const position = tracking?.location ? { lat: tracking.location.lat, lng: tracking.location.lng } : null;
  const stops = Array.isArray(tracking?.stops) ? tracking.stops : [];
  const boardingStop = stops.find((stop) => stop.isBoarding) || null;
  const boardingLabel = boardingStop
    ? stopName(boardingStop)
    : [tracking?.boardingPoint?.pointName, tracking?.boardingPoint?.city].filter(Boolean).join(', ');
  const boardingTime = boardingStop?.departureTime || boardingStop?.arrivalTime || tracking?.boardingPoint?.time || '';
  // Before the bus shares its position, the map still shows where to board.
  const mapCenter = position || boardingStop?.location || null;

  if (!tracking || tracking.state === 'closed') {
    return null;
  }

  if (tracking.state === 'not_yet_open') {
    return (
      <div className="zb-card flex items-center gap-3 p-4">
        <span className="zb-soft flex h-10 w-10 shrink-0 items-center justify-center"><Clock size={18} className="zb-accent-text" /></span>
        <div className="min-w-0">
          <p className="zb-text text-sm font-extrabold">Live tracking from {formatTime(tracking.opensAt)}</p>
          <p className="zb-muted text-xs font-semibold">Opens 1 hour before your boarding time.</p>
          {boardingLabel ? (
            <p className="zb-text mt-1 flex items-center gap-1 text-xs font-bold">
              <MapPin size={12} style={{ color: '#16a34a' }} /> Board at {boardingLabel}{boardingTime ? ` · ${boardingTime}` : ''}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const live = tracking.state === 'live';
  return (
    <div className="zb-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className={`zb-badge ${live ? 'is-green' : tracking.state === 'paused' ? 'is-accent' : 'is-blue'}`}>
          <Radio size={12} className={live ? 'zb-pulse' : ''} />
          {live ? 'Bus is live' : tracking.state === 'paused' ? 'Tracking paused' : 'Waiting for the bus to start'}
        </span>
        {tracking.lastUpdatedAt ? <span className="zb-muted text-[11px] font-bold">Updated {formatTime(tracking.lastUpdatedAt)}</span> : null}
      </div>

      {boardingLabel ? (
        <div className="zb-soft mx-4 mb-3 flex items-center gap-2 p-3">
          <MapPin size={16} style={{ color: '#16a34a' }} />
          <div className="min-w-0 flex-1">
            <p className="zb-muted text-[10px] font-bold uppercase tracking-wider">Your boarding point</p>
            <p className="zb-text truncate text-sm font-extrabold">{boardingLabel}</p>
          </div>
          {boardingTime ? <span className="zb-text text-sm font-extrabold">{boardingTime}</span> : null}
        </div>
      ) : null}

      {mapCenter && isLoaded && HAS_VALID_GOOGLE_MAPS_KEY ? (
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '240px' }}
          center={mapCenter}
          zoom={13}
          options={{ disableDefaultUI: true, zoomControl: true }}
        >
          {tracking.recentPath?.length > 1 ? (
            <PolylineF path={tracking.recentPath} options={{ strokeColor: '#FFC400', strokeOpacity: 0.9, strokeWeight: 4 }} />
          ) : null}
          {/* Every stop on the route; the passenger's boarding (green) and drop (red) stand out. */}
          {stops.filter((stop) => stop.location).map((stop) => (
            <MarkerF
              key={`stop-${stop.id}`}
              position={stop.location}
              title={`${stopName(stop)}${stop.departureTime || stop.arrivalTime ? ` · ${stop.departureTime || stop.arrivalTime}` : ''}`}
              icon={pinIcon(stop.isBoarding ? '#16a34a' : stop.isDropping ? '#dc2626' : '#64748b', stop.isBoarding || stop.isDropping ? 8 : 5)}
              zIndex={stop.isBoarding || stop.isDropping ? 2 : 1}
            />
          ))}
          {position ? <MarkerF position={position} zIndex={3} title="Bus" /> : null}
        </GoogleMap>
      ) : position ? (
        <a
          href={`https://www.google.com/maps?q=${position.lat},${position.lng}`}
          target="_blank"
          rel="noreferrer"
          className="zb-soft mx-4 mb-4 flex items-center justify-between gap-2 p-3"
        >
          <span className="zb-text flex items-center gap-2 text-sm font-extrabold"><Navigation size={16} className="zb-accent-text" /> See the bus on the map</span>
          <span className="zb-muted text-[11px] font-bold">{position.lat.toFixed(3)}, {position.lng.toFixed(3)}</span>
        </a>
      ) : (
        <p className="zb-muted px-4 pb-4 text-xs font-semibold">The driver hasn&apos;t started sharing location yet. This updates by itself.</p>
      )}
      {!position && mapCenter ? (
        <p className="zb-muted px-4 pt-2 text-xs font-semibold">The bus appears on the map once the driver starts sharing location.</p>
      ) : null}
      <StopList stops={stops} />
    </div>
  );
};

export default BusLiveTrackingCard;
