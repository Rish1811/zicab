import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  GoogleMap, 
  MarkerF, 
  MarkerClustererF, 
  TrafficLayer, 
  HeatmapLayerF,
  PolylineF
} from '@react-google-maps/api';
import { 
  Search, Filter, Activity, Users, Car, AlertTriangle, IndianRupee, Clock,
  Map as MapIcon, X, Maximize, Minimize, Crosshair, Layers, Flame, Navigation, ArrowLeft, RefreshCw,
  Battery, Gauge, MapPin, Phone, User as UserIcon, ShieldAlert, CheckCircle2, XCircle,
  LocateFixed, Radio, Send
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBaseGoogleMapsLoader, HAS_VALID_GOOGLE_MAPS_KEY } from '../../utils/googleMaps';
import { adminService } from '../../services/adminService';
import { computeDrivingRoute, sumComputedRouteLegs } from '@/shared/utils/googleRoutes';

import CarIcon from '@/assets/icons/car.png';
import BikeIcon from '@/assets/icons/bike.png';
import AutoIcon from '@/assets/icons/auto.png';

const INDIA_CENTER = { lat: 22.7196, lng: 75.8577 };

const mapOptions = {
  disableDefaultUI: true, // we build our own floating controls
  zoomControl: false,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  styles: [
    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
    { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
    { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
    { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
    { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
    { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] }
  ]
};

const getMapIconForVehicle = (iconType = '') => {
  const value = String(iconType || '').trim().toLowerCase();
  if (value.includes('bike')) return BikeIcon;
  if (value.includes('auto')) return AutoIcon;
  return CarIcon;
};

const hasUsableCoordinates = (latitude, longitude) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
};

// Generic white/black/yellow/grey theme classes
const btnClass = "flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-colors border shadow-sm";
const btnPrimary = `${btnClass} bg-yellow-400 text-black border-yellow-500 hover:bg-yellow-500`;
const btnSecondary = `${btnClass} bg-white text-slate-800 border-slate-200 hover:bg-slate-50`;


/// A driver's heading as a compass point, e.g. 44 -> "NE". Null when the driver
/// has not moved since coming online, so nothing is shown rather than a
/// misleading "N".
const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compassFromHeading = (heading) => {
  const degrees = Number(heading);
  if (!Number.isFinite(degrees)) return null;
  return COMPASS_POINTS[Math.round(((degrees % 360) + 360) % 360 / 45) % 8];
};

/// Google Maps cannot rotate an image marker, so the heading is drawn as a
/// separate arrow symbol layered over the vehicle icon.
const headingArrow = (heading) => ({
  path: 'M 0,-9 L 3.2,3 L 0,0.9 L -3.2,3 Z',
  fillColor: '#0F172A',
  fillOpacity: 0.9,
  strokeColor: '#FFFFFF',
  strokeWeight: 1.2,
  scale: 1,
  rotation: Number(heading) || 0,
  anchor: new window.google.maps.Point(0, 0),
});

/// Straight-line distance in metres, used when no road route can be computed.
const haversineMeters = (a, b) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const formatDistance = (meters) => {
  if (!Number.isFinite(meters)) return '—';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
};

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return '—';
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
};

/// Rounded (~10 m) so the route is only recomputed when someone has actually
/// moved, not on every GPS jitter or refresh.
const pointKey = (p) => (p ? `${p.lat.toFixed(4)},${p.lng.toFixed(4)}` : '');

const driverPoint = (d) =>
  d && hasUsableCoordinates(d.latitude, d.longitude) ? { lat: Number(d.latitude), lng: Number(d.longitude) } : null;

// Straight-line fallback ETA assumes city traffic (~25 km/h on a road ~1.3x longer).
const CITY_SPEED_KMH = 25;
const ROAD_FACTOR = 1.3;

const myLocationIcon = () => ({
  path: window.google.maps.SymbolPath.CIRCLE,
  scale: 8,
  fillColor: '#2563EB',
  fillOpacity: 1,
  strokeColor: '#FFFFFF',
  strokeWeight: 3,
});

const reverseGeocode = (point) =>
  new Promise((resolve) => {
    try {
      new window.google.maps.Geocoder().geocode({ location: point }, (results, status) => {
        resolve(status === 'OK' && results?.[0] ? results[0].formatted_address : null);
      });
    } catch {
      resolve(null);
    }
  });

const formatPoint = (p) => (p ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : '—');

const GodsEye = () => {
  const navigate = useNavigate();
  const { isLoaded, loadError } = useBaseGoogleMapsLoader();
  const [mapInstance, setMapInstance] = useState(null);

  // Data States
  const [drivers, setDrivers] = useState([]);
  const [rides, setRides] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [dashboardData, setDashboardData] = useState({});
  const [earningsData, setEarningsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    status: 'all', // all, online, offline, busy, idle
    vehicleType: 'all',
    serviceType: 'all',
    city: 'all',
    zone: 'all',
    refreshMode: '30' // seconds, 'manual'
  });

  // Map Controls State
  const [controls, setControls] = useState({
    traffic: false,
    heatmap: false,
    cluster: true,
    autoFollow: false,
    fullscreen: false
  });

  // Selection
  const [selectedDriver, setSelectedDriver] = useState(null);

  // Live tracking: admin's own location -> selected driver
  const [liveTracking, setLiveTracking] = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const [myLocationError, setMyLocationError] = useState('');
  const [route, setRoute] = useState(null); // { path, distanceMeters, durationSeconds, approximate }
  const [addresses, setAddresses] = useState({ me: null, driver: null });
  const routeFittedFor = useRef('');

  // Fetch Logic
  const fetchMapData = useCallback(async () => {
    setLoading(true);
    try {
      const [drvRes, ridesRes, alertsRes, dashRes, earnRes] = await Promise.allSettled([
        adminService.getDrivers(1, 1000, {}).catch(() => ({ data: { results: [] }})),
        adminService.getOngoingRides().catch(() => ({ data: { results: [] }})),
        adminService.getSafetyAlerts().catch(() => ({ data: { results: [] }})),
        adminService.getDashboardData().catch(() => ({ data: {} })),
        adminService.getTodayEarnings().catch(() => ({ data: {} }))
      ]);

      const drvList = drvRes.status === 'fulfilled' ? (drvRes.value?.data?.results || drvRes.value?.data || []) : [];
      const ridesList = ridesRes.status === 'fulfilled' ? (ridesRes.value?.data?.results || ridesRes.value?.data || []) : [];
      const alertsList = alertsRes.status === 'fulfilled' ? (alertsRes.value?.data?.results || alertsRes.value?.data || []) : [];
      
      setDrivers(Array.isArray(drvList) ? drvList : []);
      setRides(Array.isArray(ridesList) ? ridesList : []);
      setAlerts(Array.isArray(alertsList) ? alertsList : []);
      
      if (dashRes.status === 'fulfilled') setDashboardData(dashRes.value?.data || {});
      if (earnRes.status === 'fulfilled') setEarningsData(earnRes.value?.data || {});
      
      setLastSync(new Date());
    } catch (error) {
      console.error('Failed to fetch Gods Eye data', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMapData();
  }, [fetchMapData]);

  useEffect(() => {
    if (filters.refreshMode === 'manual') return;
    const seconds = parseInt(filters.refreshMode, 10);
    if (!isNaN(seconds) && seconds > 0) {
      const interval = setInterval(fetchMapData, seconds * 1000);
      return () => clearInterval(interval);
    }
  }, [filters.refreshMode, fetchMapData]);

  // Handle Fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setControls(prev => ({ ...prev, fullscreen: !!document.fullscreenElement }));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen();
    }
  };

  // Derived Data
  const filteredDrivers = useMemo(() => {
    return drivers.filter(d => {
      if (!hasUsableCoordinates(d.latitude, d.longitude)) return false;
      
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = 
          String(d.name || '').toLowerCase().includes(q) ||
          String(d.phone || '').toLowerCase().includes(q) ||
          String(d.vehicle_number || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      // Status
      if (filters.status !== 'all') {
        const isOnline = Boolean(d.isOnline);
        const isBusy = Boolean(d.isOnRide);
        if (filters.status === 'online' && !isOnline) return false;
        if (filters.status === 'offline' && isOnline) return false;
        if (filters.status === 'busy' && !isBusy) return false;
        if (filters.status === 'idle' && (!isOnline || isBusy)) return false;
      }

      // Vehicle Type
      if (filters.vehicleType !== 'all') {
        const vt = String(d.vehicle_icon_type || d.vehicle_type || d.transport_type || '').toLowerCase();
        if (!vt.includes(filters.vehicleType)) return false;
      }

      // Service Type, City, Zone (Assuming fields exist, simplified matching)
      if (filters.city !== 'all' && d.city !== filters.city) return false;
      if (filters.zone !== 'all' && d.zone_name !== filters.zone) return false;

      return true;
    });
  }, [drivers, filters, searchQuery]);

  // Timelines
  const timelineEvents = useMemo(() => {
    const events = [];
    rides.forEach(r => {
      if (r.createdAt) {
        events.push({ id: `r-${r._id}`, time: new Date(r.createdAt), type: 'Trip Started', desc: `Trip ${r._id?.slice(-4)} started.`, icon: <Activity size={14}/>, color: 'text-yellow-600' });
      }
    });
    alerts.forEach(a => {
      if (a.createdAt) {
        events.push({ id: `a-${a._id}`, time: new Date(a.createdAt), type: 'SOS Alert', desc: `Emergency alert from ${a.user?.name || 'User'}`, icon: <AlertTriangle size={14}/>, color: 'text-red-500' });
      }
    });
    return events.sort((a, b) => b.time - a.time).slice(0, 50); // Most recent 50
  }, [rides, alerts]);

  // Metrics (Derived or from dashboardData)
  const metrics = {
    online: drivers.filter(d => d.isOnline).length,
    offline: drivers.filter(d => !d.isOnline).length,
    busy: drivers.filter(d => d.isOnRide).length,
    idle: drivers.filter(d => d.isOnline && !d.isOnRide).length,
    liveTrips: rides.length,
    sos: alerts.filter(a => a.status === 'active').length,
    revenue: earningsData?.today || 0,
    tripsToday: dashboardData?.totalTripsToday || 0
  };

  // The drawer shows the driver from the latest refresh, not the stale copy
  // captured on click, so position and telemetry keep moving.
  const liveSelectedDriver = useMemo(() => {
    if (!selectedDriver) return null;
    const id = selectedDriver._id || selectedDriver.id;
    return drivers.find(d => (d._id || d.id) === id) || selectedDriver;
  }, [drivers, selectedDriver]);

  const selectedKey = pointKey(driverPoint(liveSelectedDriver));
  const selectedPoint = useMemo(() => driverPoint(liveSelectedDriver), [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const myKey = pointKey(myLocation);
  const selectedId = liveSelectedDriver ? (liveSelectedDriver._id || liveSelectedDriver.id) : null;

  // Watch the admin's browser location while live tracking is on.
  useEffect(() => {
    if (!liveTracking) return undefined;
    if (!navigator.geolocation) {
      setMyLocationError('This browser cannot share its location.');
      setLiveTracking(false);
      return undefined;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        setMyLocationError(err.code === 1
          ? 'Location permission denied. Allow location for this site and try again.'
          : 'Could not get your location.');
        setLiveTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [liveTracking]);

  // Road route (falls back to a straight line) from me to the selected driver.
  useEffect(() => {
    if (!liveTracking || !myLocation || !selectedPoint || !isLoaded) {
      setRoute(null);
      return undefined;
    }
    let cancelled = false;
    const origin = myLocation;
    const destination = selectedPoint;
    (async () => {
      const result = await computeDrivingRoute({ origin, destination, region: 'in' });
      if (cancelled) return;
      if (result.status === 'OK' && result.path.length) {
        let { distanceMeters, durationSeconds } = sumComputedRouteLegs(result.legs);
        if (!distanceMeters) distanceMeters = haversineMeters(origin, destination) * ROAD_FACTOR;
        if (!durationSeconds) durationSeconds = (distanceMeters / 1000 / CITY_SPEED_KMH) * 3600;
        setRoute({ path: result.path, distanceMeters, durationSeconds, approximate: false });
      } else {
        const distanceMeters = haversineMeters(origin, destination);
        setRoute({
          path: [origin, destination],
          distanceMeters,
          durationSeconds: ((distanceMeters * ROAD_FACTOR) / 1000 / CITY_SPEED_KMH) * 3600,
          approximate: true,
        });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTracking, myKey, selectedKey, isLoaded]);

  // Frame both ends once per driver, then leave the map alone so the admin can pan.
  useEffect(() => {
    if (!liveTracking) { routeFittedFor.current = ''; return; }
    if (!mapInstance || !route || !myLocation || !selectedPoint || !selectedId) return;
    if (routeFittedFor.current === selectedId) return;
    routeFittedFor.current = selectedId;
    const bounds = new window.google.maps.LatLngBounds();
    route.path.forEach(p => bounds.extend(p));
    bounds.extend(myLocation);
    bounds.extend(selectedPoint);
    mapInstance.fitBounds(bounds, { top: 90, right: 60, bottom: 90, left: 80 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInstance, route, liveTracking]);

  // Human-readable places for the drawer.
  useEffect(() => {
    if (!liveTracking || !isLoaded || !myLocation) return undefined;
    let cancelled = false;
    reverseGeocode(myLocation).then(a => { if (!cancelled) setAddresses(prev => ({ ...prev, me: a })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTracking, isLoaded, myKey]);

  useEffect(() => {
    setAddresses(prev => ({ ...prev, driver: null }));
    if (!liveTracking || !isLoaded || !selectedPoint) return undefined;
    let cancelled = false;
    reverseGeocode(selectedPoint).then(a => { if (!cancelled) setAddresses(prev => ({ ...prev, driver: a })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTracking, isLoaded, selectedKey]);

  const toggleLiveTracking = () => {
    setMyLocationError('');
    setLiveTracking(v => !v);
  };

  const openNavigation = () => {
    if (!selectedPoint) return;
    const params = new URLSearchParams({ api: '1', destination: `${selectedPoint.lat},${selectedPoint.lng}`, travelmode: 'driving' });
    if (myLocation) params.set('origin', `${myLocation.lat},${myLocation.lng}`);
    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const locateSelected = () => {
    if (!mapInstance || !selectedPoint) return;
    mapInstance.panTo(selectedPoint);
    mapInstance.setZoom(16);
  };

  const handleMarkerClick = useCallback((driver) => {
    setSelectedDriver(driver);
    if (mapInstance && controls.autoFollow) {
      mapInstance.panTo({ lat: Number(driver.latitude), lng: Number(driver.longitude) });
    }
  }, [mapInstance, controls.autoFollow]);

  const recenterMap = () => {
    if (mapInstance && filteredDrivers.length > 0) {
      mapInstance.panTo({ lat: Number(filteredDrivers[0].latitude), lng: Number(filteredDrivers[0].longitude) });
      mapInstance.setZoom(12);
    }
  };

  // GoogleMap re-centres whenever the `center` object changes identity, so it
  // is memoised on its coordinates; otherwise every render (each GPS update)
  // would snap the map back and undo the live-tracking route framing.
  const rawCenter = filteredDrivers.length > 0 && controls.autoFollow && selectedPoint
    ? selectedPoint
    : (filteredDrivers.length > 0 ? { lat: Number(filteredDrivers[0].latitude), lng: Number(filteredDrivers[0].longitude) } : INDIA_CENTER);
  const hasInitialCenter = useRef(false);
  const centerKey = liveTracking && hasInitialCenter.current && !controls.autoFollow ? 'hold' : pointKey(rawCenter);
  const mapCenter = useMemo(() => rawCenter, [centerKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (filteredDrivers.length > 0) hasInitialCenter.current = true;

  return (
    <div className={`flex flex-col h-screen bg-gray-50 font-sans ${controls.fullscreen ? 'fixed inset-0 z-50' : ''}`}>
      
      {/* TOP NAVIGATION / KPI STRIP */}
      <div className="bg-white border-b border-gray-200 px-3 py-1.5 flex items-center justify-between shadow-sm z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
           {!controls.fullscreen && (
             <button onClick={() => navigate('/admin/dashboard')} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                <ArrowLeft size={18} />
             </button>
           )}
           <div>
             <h1 className="text-base font-bold text-gray-900">God's Eye Dashboard</h1>
             <p className="text-xs font-semibold text-gray-500">
                Live Fleet Monitoring {lastSync && ` • Synced ${lastSync.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}`}
             </p>
           </div>
        </div>

        {/* Dynamic Metrics Strip */}
        <div className="hidden lg:flex items-center gap-4">
           <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-gray-500 uppercase">Online</span>
              <span className="text-xs font-black text-black">{metrics.online}</span>
           </div>
           <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-gray-500 uppercase">Busy / Idle</span>
              <span className="text-xs font-black text-black"><span className="text-yellow-600">{metrics.busy}</span> / {metrics.idle}</span>
           </div>
           <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-gray-500 uppercase">Live Trips</span>
              <span className="text-xs font-black text-black">{metrics.liveTrips}</span>
           </div>
           <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-gray-500 uppercase">SOS Alerts</span>
              <span className={`text-xs font-black ${metrics.sos > 0 ? 'text-red-500 animate-pulse' : 'text-black'}`}>{metrics.sos}</span>
           </div>
           <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-gray-500 uppercase">Revenue (Today)</span>
              <span className="text-xs font-black text-black">₹{metrics.revenue.toLocaleString()}</span>
           </div>
        </div>
      </div>

      {/* MAIN CONTENT SPLIT */}
      <div className="flex flex-1 overflow-hidden relative">
         
         {/* LEFT SIDEBAR - FILTERS */}
         <div className="w-56 bg-white border-r border-gray-200 p-3 flex flex-col gap-3 overflow-y-auto z-10 flex-shrink-0">
            {/* Search */}
            <div className="relative">
               <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
               <input 
                 type="text" 
                 placeholder="Search driver..." 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full pl-8 pr-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-all placeholder:text-gray-400 text-black font-medium"
               />
            </div>

            <hr className="border-gray-100" />

            {/* Filter Group */}
            <div className="space-y-3">
               <div>
                  <label className="block text-xs font-semibold capitalize text-gray-500 mb-1">Driver Status</label>
                  <select 
                    value={filters.status} 
                    onChange={e => setFilters(prev => ({...prev, status: e.target.value}))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-black outline-none focus:border-yellow-400"
                  >
                     <option value="all">All Drivers</option>
                     <option value="online">Online Only</option>
                     <option value="offline">Offline Only</option>
                     <option value="busy">Busy (On Trip)</option>
                     <option value="idle">Idle (Waiting)</option>
                  </select>
               </div>
               
               <div>
                  <label className="block text-xs font-semibold capitalize text-gray-500 mb-1">Vehicle Type</label>
                  <select 
                    value={filters.vehicleType} 
                    onChange={e => setFilters(prev => ({...prev, vehicleType: e.target.value}))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-black outline-none focus:border-yellow-400"
                  >
                     <option value="all">All Types</option>
                     <option value="car">Car (Taxi)</option>
                     <option value="bike">Bike</option>
                     <option value="auto">Auto</option>
                  </select>
               </div>

               <div>
                  <label className="block text-xs font-semibold capitalize text-gray-500 mb-1">Refresh Mode</label>
                  <select 
                    value={filters.refreshMode} 
                    onChange={e => setFilters(prev => ({...prev, refreshMode: e.target.value}))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-black outline-none focus:border-yellow-400"
                  >
                     <option value="15">Every 15s</option>
                     <option value="30">Every 30s</option>
                     <option value="60">Every 1m</option>
                     <option value="300">Every 5m</option>
                     <option value="manual">Manual</option>
                  </select>
               </div>
            </div>

            <div className="mt-auto space-y-2 pt-4">
               <button onClick={fetchMapData} className={btnPrimary + " w-full"}>
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  Force Refresh
               </button>
               <button onClick={() => setFilters({ status: 'all', vehicleType: 'all', serviceType: 'all', city: 'all', zone: 'all', refreshMode: '30' })} className={btnSecondary + " w-full"}>
                  Reset Filters
               </button>
            </div>
         </div>

         {/* MAP CANVAS */}
         <div className="flex-1 relative bg-gray-200 flex flex-col">
            
            {/* FLOATING MAP CONTROLS */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
               <button 
                  onClick={() => setControls(c => ({...c, cluster: !c.cluster}))}
                  className={`p-2.5 rounded-lg shadow-md transition-colors ${controls.cluster ? 'bg-yellow-400 text-black' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  title="Toggle Clustering"
               >
                  <Layers size={18} />
               </button>
               <button 
                  onClick={() => setControls(c => ({...c, traffic: !c.traffic}))}
                  className={`p-2.5 rounded-lg shadow-md transition-colors ${controls.traffic ? 'bg-yellow-400 text-black' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  title="Traffic Layer"
               >
                  <Navigation size={18} />
               </button>
               <button 
                  onClick={() => setControls(c => ({...c, heatmap: !c.heatmap}))}
                  className={`p-2.5 rounded-lg shadow-md transition-colors ${controls.heatmap ? 'bg-yellow-400 text-black' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  title="Heatmap Layer"
               >
                  <Flame size={18} />
               </button>
               <button 
                  onClick={() => setControls(c => ({...c, autoFollow: !c.autoFollow}))}
                  className={`p-2.5 rounded-lg shadow-md transition-colors ${controls.autoFollow ? 'bg-yellow-400 text-black' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  title="Auto Follow Selected"
               >
                  <Crosshair size={18} />
               </button>
               <button
                  onClick={toggleLiveTracking}
                  className={`p-2.5 rounded-lg shadow-md transition-colors ${liveTracking ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  title={liveTracking ? 'Stop Live Tracking' : 'Live Tracking from My Location'}
               >
                  <LocateFixed size={18} />
               </button>
            </div>

            {/* LIVE TRACKING BANNER */}
            {(liveTracking || myLocationError) && (
               <div className="absolute top-4 left-20 z-10 bg-slate-900/90 text-white rounded-xl shadow-lg px-3 py-2 flex items-center gap-2 max-w-xs">
                  <Radio size={18} className={myLocationError ? 'text-red-400' : 'text-green-400 animate-pulse'} />
                  <div className="min-w-0">
                     <p className="text-xs font-black">{myLocationError ? 'Live Tracking Off' : 'Live Tracking'}</p>
                     <p className="text-[10px] text-slate-300 font-medium leading-tight">
                        {myLocationError
                           || (!myLocation ? 'Getting your location…'
                           : !liveSelectedDriver ? 'Select a driver on the map'
                           : `Tracking from My Location to ${liveSelectedDriver.name || 'Driver'}`)}
                     </p>
                  </div>
                  {myLocationError && (
                     <button onClick={() => setMyLocationError('')} className="p-0.5 text-slate-400 hover:text-white"><X size={14} /></button>
                  )}
               </div>
            )}

            {/* DISTANCE / ETA CHIP */}
            {liveTracking && route && (
               <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 bg-white border-2 border-blue-500 rounded-xl shadow-lg px-3 py-1.5 flex items-center gap-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 font-semibold">
                     <Car size={14} /> Distance: <span className="font-black text-black">{formatDistance(route.distanceMeters)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 font-semibold">
                     <Clock size={14} /> ETA: <span className="font-black text-black">{route.approximate ? '~' : ''}{formatDuration(route.durationSeconds)}</span>
                  </div>
               </div>
            )}

            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
               <button 
                  onClick={toggleFullscreen}
                  className="p-2.5 bg-white text-gray-600 hover:bg-gray-50 rounded-lg shadow-md transition-colors"
                  title="Toggle Fullscreen"
               >
                  {controls.fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
               </button>
               <button 
                  onClick={recenterMap}
                  className="p-2.5 bg-white text-gray-600 hover:bg-gray-50 rounded-lg shadow-md transition-colors"
                  title="Recenter Map"
               >
                  <MapPin size={18} />
               </button>
            </div>

            {/* Google Map */}
            <div className="flex-1 w-full h-full relative">
               {loadError ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-red-500 font-bold uppercase tracking-widest text-sm">Map Load Error</div>
               ) : HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
                  <GoogleMap
                     mapContainerStyle={{ width: '100%', height: '100%' }} 
                     center={mapCenter} 
                     zoom={12} 
                     options={mapOptions}
                     onLoad={setMapInstance}
                     onClick={() => setSelectedDriver(null)}
                  >
                     {controls.traffic && <TrafficLayer />}
                     
                     {controls.heatmap && (
                        <HeatmapLayerF 
                           data={filteredDrivers.map(d => new window.google.maps.LatLng(Number(d.latitude), Number(d.longitude)))}
                           options={{ radius: 40, opacity: 0.6 }}
                        />
                     )}

                     {!controls.heatmap && controls.cluster ? (
                        <MarkerClustererF options={{ maxZoom: 15, styles: [{ width: 40, height: 40, textColor: 'white', textSize: 14, url: 'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m1.png' }] }}>
                           {(clusterer) => (
                              <>
                                 {filteredDrivers.map(driver => (
                                    <React.Fragment key={driver._id || driver.id}>
                                       <MarkerF
                                             position={{ lat: Number(driver.latitude), lng: Number(driver.longitude) }}
                                             onClick={() => handleMarkerClick(driver)}
                                             clusterer={clusterer}
                                             icon={{
                                                url: getMapIconForVehicle(driver.vehicle_icon_type || driver.vehicle_type),
                                                scaledSize: new window.google.maps.Size(32, 32),
                                                anchor: new window.google.maps.Point(16, 16),
                                             }}
                                       />
                                       {Number.isFinite(Number(driver.heading)) && (
                                          <MarkerF
                                             position={{ lat: Number(driver.latitude), lng: Number(driver.longitude) }}
                                             clickable={false}
                                             icon={headingArrow(driver.heading)}
                                             zIndex={999}
                                          />
                                       )}
                                    </React.Fragment>
                                 ))}
                              </>
                           )}
                        </MarkerClustererF>
                     ) : !controls.heatmap && !controls.cluster ? (
                        filteredDrivers.map(driver => (
                           <MarkerF 
                              key={driver._id || driver.id} 
                              position={{ lat: Number(driver.latitude), lng: Number(driver.longitude) }}
                              onClick={() => handleMarkerClick(driver)}
                              icon={{
                                 url: getMapIconForVehicle(driver.vehicle_icon_type || driver.vehicle_type),
                                 scaledSize: new window.google.maps.Size(32, 32),
                                 anchor: new window.google.maps.Point(16, 16),
                              }}
                           />
                        ))
                     ) : null}

                     {liveTracking && route && (
                        <PolylineF
                           path={route.path}
                           options={{
                              strokeColor: '#2563EB',
                              strokeOpacity: route.approximate ? 0 : 0.9,
                              strokeWeight: 5,
                              zIndex: 50,
                              icons: route.approximate
                                 ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#2563EB', scale: 4 }, offset: '0', repeat: '16px' }]
                                 : [{ icon: { path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.5, strokeColor: '#FFFFFF', fillColor: '#FFFFFF', fillOpacity: 1 }, offset: '10%', repeat: '90px' }],
                           }}
                        />
                     )}

                     {liveTracking && myLocation && (
                        <MarkerF position={myLocation} icon={myLocationIcon()} zIndex={1000} title="My Location" />
                     )}

                     {liveTracking && selectedPoint && (
                        <MarkerF
                           position={selectedPoint}
                           zIndex={1001}
                           title={`Driver Location (${liveSelectedDriver?.name || 'Driver'})`}
                           onClick={() => handleMarkerClick(liveSelectedDriver)}
                        />
                     )}

                  </GoogleMap>
               ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
                     <MapIcon size={48} className="text-gray-300 mb-4" />
                     <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Map Offline</p>
                  </div>
               )}

               {/* Empty State Overlay */}
               {filteredDrivers.length === 0 && !loading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                     <div className="bg-white/90 backdrop-blur-sm px-6 py-4 rounded-2xl shadow-xl border border-gray-200 flex flex-col items-center text-center max-w-sm">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 mb-3">
                           <Car size={24} />
                        </div>
                        <h3 className="text-base font-black text-black mb-1">No live fleet available</h3>
                        <p className="text-xs text-gray-500 font-medium">Waiting for GPS updates or adjust your filters.</p>
                     </div>
                  </div>
               )}
            </div>

            {/* BOTTOM TIMELINE */}
            <div className="h-36 bg-white border-t border-gray-200 flex flex-col flex-shrink-0 z-10">
               <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Real-Time Event Timeline</h3>
                  <span className="text-[10px] font-bold text-gray-400">{timelineEvents.length} Recent Events</span>
               </div>
               <div className="flex-1 overflow-x-auto overflow-y-auto whitespace-nowrap p-3 flex items-start gap-3">
                  {timelineEvents.length === 0 ? (
                     <div className="flex w-full h-full items-center justify-center text-[10px] text-gray-400 font-medium">No recent events logged.</div>
                  ) : (
                     timelineEvents.map(evt => (
                        <div key={evt.id} className="inline-flex flex-col min-w-[180px] bg-gray-50 border border-gray-100 rounded-lg p-2 shadow-sm">
                           <div className="flex items-center gap-2 mb-2">
                              <div className={`p-1.5 bg-white rounded-lg shadow-sm ${evt.color}`}>
                                 {evt.icon}
                              </div>
                              <div>
                                 <p className="text-xs font-black text-black">{evt.type}</p>
                                 <p className="text-[9px] text-gray-500 font-bold">{evt.time.toLocaleTimeString()}</p>
                              </div>
                           </div>
                           <p className="text-[10px] text-gray-600 font-medium whitespace-normal leading-tight">{evt.desc}</p>
                        </div>
                     ))
                  )}
               </div>
            </div>

         </div>

         {/* RIGHT DRAWER - SELECTED MARKER */}
         {liveSelectedDriver && (
            <div className="w-72 bg-white border-l border-gray-200 flex flex-col z-20 shadow-2xl flex-shrink-0 absolute right-0 top-0 bottom-0 lg:relative slide-in-from-right animate-in duration-300">
               {/* Drawer Header */}
               <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between bg-yellow-400 text-black">
                  <h2 className="text-xs font-black uppercase tracking-wider">Driver Telemetry</h2>
                  <button onClick={() => setSelectedDriver(null)} className="p-1 hover:bg-yellow-500 rounded-md transition-colors">
                     <X size={16} />
                  </button>
               </div>

               <div className="flex-1 overflow-y-auto p-3 space-y-4">
                  
                  {/* Driver Profile Summary */}
                  <div className="flex items-center gap-3">
                     <div className="w-14 h-14 bg-gray-100 rounded-full border-2 border-gray-200 overflow-hidden flex items-center justify-center text-gray-400 flex-shrink-0">
                        {liveSelectedDriver.profile_image ? (
                           <img src={liveSelectedDriver.profile_image} alt={liveSelectedDriver.name} className="w-full h-full object-cover" />
                        ) : (
                           <UserIcon size={24} />
                        )}
                     </div>
                     <div>
                        <h3 className="text-base font-black text-black leading-tight">{liveSelectedDriver.name || 'Unknown Driver'}</h3>
                        <p className="text-xs text-gray-500 font-medium">{liveSelectedDriver.phone || 'No Phone'}</p>
                        {compassFromHeading(liveSelectedDriver.heading) && (
                           <p className="text-xs text-gray-600 font-semibold mt-0.5">
                              Heading {compassFromHeading(liveSelectedDriver.heading)} &middot; {Math.round(Number(liveSelectedDriver.heading))}&deg;
                           </p>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                           {liveSelectedDriver.isOnline ? (
                              <><CheckCircle2 size={12} className="text-green-500" /><span className="text-[10px] font-bold text-green-600">ONLINE</span></>
                           ) : (
                              <><XCircle size={12} className="text-gray-400" /><span className="text-[10px] font-bold text-gray-500">OFFLINE</span></>
                           )}
                           {liveSelectedDriver.isOnRide && <span className="text-[10px] font-bold text-yellow-600 ml-1">• ON TRIP</span>}
                        </div>
                     </div>
                  </div>

                  <hr className="border-gray-100" />

                  {/* Vehicle Info */}
                  <div className="space-y-2">
                     <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Vehicle Information</h4>
                     <div className="bg-gray-50 rounded-lg p-2.5 flex flex-col gap-1.5 border border-gray-100">
                        <div className="flex justify-between items-center">
                           <span className="text-xs text-gray-500 font-medium">Model</span>
                           <span className="text-xs font-black text-black">{liveSelectedDriver.vehicle_model || liveSelectedDriver.vehicle_type || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                           <span className="text-xs text-gray-500 font-medium">Number Plate</span>
                           <span className="text-xs font-black text-black bg-yellow-100 px-1.5 py-0.5 rounded">{liveSelectedDriver.vehicle_number || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                           <span className="text-xs text-gray-500 font-medium">City / Zone</span>
                           <span className="text-xs font-bold text-gray-700">{liveSelectedDriver.city || liveSelectedDriver.service_location_name || 'N/A'}</span>
                        </div>
                     </div>
                  </div>

                  {/* Telemetry Stats */}
                  <div className="space-y-2">
                     <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Live Telemetry</h4>
                     <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white border border-gray-200 rounded-lg p-2.5 flex items-center gap-2 shadow-sm">
                           <div className="text-gray-400"><Gauge size={16} /></div>
                           <div>
                              <p className="text-[9px] font-bold text-gray-400 uppercase">Speed</p>
                              <p className="text-sm font-black text-black">{liveSelectedDriver.speed || '0'} <span className="text-[10px]">km/h</span></p>
                           </div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg p-2.5 flex items-center gap-2 shadow-sm">
                           <div className="text-gray-400"><Navigation size={16} /></div>
                           <div>
                              <p className="text-[9px] font-bold text-gray-400 uppercase">Heading</p>
                              <p className="text-sm font-black text-black">{liveSelectedDriver.heading || 'N/A'}°</p>
                           </div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg p-2.5 flex items-center gap-2 shadow-sm">
                           <div className="text-gray-400"><MapPin size={16} /></div>
                           <div>
                              <p className="text-[9px] font-bold text-gray-400 uppercase">Accuracy</p>
                              <p className="text-sm font-black text-black">± {liveSelectedDriver.accuracy || '5'}m</p>
                           </div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg p-2.5 flex items-center gap-2 shadow-sm">
                           <div className="text-gray-400"><Battery size={16} /></div>
                           <div>
                              <p className="text-[9px] font-bold text-gray-400 uppercase">Battery</p>
                              <p className="text-sm font-black text-black">{liveSelectedDriver.battery || 'N/A'}</p>
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Live Tracking: Me -> Driver */}
                  <div className="rounded-xl border-2 border-yellow-400 overflow-hidden">
                     <div className="px-2.5 py-1.5 bg-slate-900 text-white flex items-center justify-between">
                        <h4 className="text-[10px] font-black uppercase tracking-wider">Live Tracking (Me → Driver)</h4>
                        {liveTracking && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
                     </div>
                     {!liveTracking ? (
                        <div className="p-2.5 space-y-2">
                           <p className="text-[11px] text-gray-500 font-medium">See the road route, distance and ETA from where you are to this driver.</p>
                           {myLocationError && <p className="text-[11px] text-red-500 font-semibold">{myLocationError}</p>}
                           <button onClick={toggleLiveTracking} className={btnSecondary + " w-full"}>
                              <LocateFixed size={14} /> Track from My Location
                           </button>
                        </div>
                     ) : (
                        <div className="p-2.5 space-y-2">
                           <div className="relative pl-5 space-y-2">
                              <div className="absolute left-[5px] top-2 bottom-2 border-l-2 border-dashed border-gray-300" />
                              <div className="relative">
                                 <span className="absolute -left-5 top-0.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow" />
                                 <p className="text-xs font-black text-black">My Location</p>
                                 <p className="text-[10px] text-gray-500 font-medium leading-tight">{myLocation ? (addresses.me || formatPoint(myLocation)) : 'Getting your location…'}</p>
                              </div>
                              <div className="relative">
                                 <MapPin size={14} className="absolute -left-[22px] top-0 text-red-500" />
                                 <p className="text-xs font-black text-black">Driver Location ({liveSelectedDriver.name || 'Driver'})</p>
                                 <p className="text-[10px] text-gray-500 font-medium leading-tight">{selectedPoint ? (addresses.driver || formatPoint(selectedPoint)) : 'No GPS fix'}</p>
                              </div>
                           </div>
                           <div className="grid grid-cols-2 gap-2">
                              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 flex items-center gap-2">
                                 <Car size={16} className="text-gray-500" />
                                 <div>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase">Distance</p>
                                    <p className="text-sm font-black text-black">{route ? formatDistance(route.distanceMeters) : '—'}</p>
                                 </div>
                              </div>
                              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 flex items-center gap-2">
                                 <Clock size={16} className="text-gray-500" />
                                 <div>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase">ETA</p>
                                    <p className="text-sm font-black text-black">{route ? `${route.approximate ? '~' : ''}${formatDuration(route.durationSeconds)}` : '—'}</p>
                                 </div>
                              </div>
                           </div>
                           {route?.approximate && <p className="text-[10px] text-gray-400 font-medium">Road route unavailable — showing straight-line estimate.</p>}
                           <div className="flex gap-2">
                              <button onClick={openNavigation} disabled={!selectedPoint} className={btnPrimary + " flex-1 disabled:opacity-50"}>
                                 <Send size={14} /> Navigate Route
                              </button>
                              <button onClick={toggleLiveTracking} className={btnSecondary + " px-2"} title="Stop Live Tracking">
                                 <X size={14} />
                              </button>
                           </div>
                        </div>
                     )}
                  </div>

                  {/* Trip Info if on trip */}
                  {liveSelectedDriver.isOnRide && (
                     <div className="space-y-2">
                        <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest text-yellow-600">Active Trip</h4>
                        <div className="bg-yellow-50 rounded-lg p-2.5 flex flex-col gap-1.5 border border-yellow-100">
                           <div className="flex justify-between items-center">
                              <span className="text-xs text-yellow-700 font-medium">Passenger</span>
                              <span className="text-xs font-black text-black">{liveSelectedDriver.passenger_name || 'N/A'}</span>
                           </div>
                           <div className="flex justify-between items-center">
                              <span className="text-xs text-yellow-700 font-medium">Started</span>
                              <span className="text-xs font-black text-black">Just now</span>
                           </div>
                        </div>
                     </div>
                  )}
               </div>

               {/* Drawer Footer Actions */}
               <div className="p-3 border-t border-gray-100 bg-gray-50 flex flex-col gap-2 mt-auto">
                  <button onClick={locateSelected} className={btnPrimary + " w-full"}>
                     <Search size={14} /> Locate Vehicle
                  </button>
                  <button onClick={() => navigate(`/admin/owner-management/manage-owners/${liveSelectedDriver._id || liveSelectedDriver.id}`)} className={btnSecondary + " w-full"}>
                     <UserIcon size={14} /> View Driver Profile
                  </button>
               </div>
            </div>
         )}
      </div>
    </div>
  );
};

export default GodsEye;
