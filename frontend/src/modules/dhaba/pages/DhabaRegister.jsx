import React, { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Autocomplete, GoogleMap, MarkerF } from '@react-google-maps/api';
import {
  BadgeCheck,
  Bus,
  Camera,
  CheckCircle2,
  IndianRupee,
  Loader2,
  LocateFixed,
  MapPin,
  ShieldCheck,
  Store,
  UserRound,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { HAS_VALID_GOOGLE_MAPS_KEY, INDIA_CENTER, useAppGoogleMapsLoader } from '../../admin/utils/googleMaps';
import { dhabaApi } from '../services/dhabaApi';

const MAX_PHOTOS = 5;
const MAP_STYLE = { width: '100%', height: '100%' };
const PLACE_FIELDS = ['address_components', 'formatted_address', 'geometry', 'name'];

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 placeholder:font-medium placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100';

const Field = ({ label, hint, children }) => (
  <label className="block space-y-1.5">
    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
    {children}
    {hint ? <span className="block text-[11px] font-medium text-slate-400">{hint}</span> : null}
  </label>
);

const Section = ({ step, icon, title, children }) => (
  <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
    <div className="mb-5 flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
        {React.createElement(icon, { size: 18 })}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-500">Step {step}</p>
        <h2 className="text-base font-black text-slate-900">{title}</h2>
      </div>
    </div>
    {children}
  </section>
);

// Phone photos are often 5-10 MB; shrink to a 1600px JPEG before upload.
const compressImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

const cityFromPlace = (place) => {
  const parts = place?.address_components || [];
  const pick = (type) => parts.find((part) => part.types?.includes(type))?.long_name;
  return pick('locality') || pick('administrative_area_level_3') || pick('administrative_area_level_2') || '';
};

const BENEFITS = [
  { icon: Bus, title: 'Bus passengers, pre-ordered', text: 'Riders order your food when they book, and you get an alert about 30 minutes before the bus reaches you.' },
  { icon: IndianRupee, title: 'Paid in advance', text: 'Passengers pay online with their ticket. You get your earnings, less a small commission, in regular payouts.' },
  { icon: ShieldCheck, title: 'Free to join', text: 'No sign-up fee. Our team checks your details and FSSAI licence, then you are live.' },
];

const EMPTY = {
  name: '',
  highway: '',
  city: '',
  address: '',
  ownerName: '',
  phone: '',
  email: '',
  fssaiNumber: '',
  password: '',
  confirmPassword: '',
};

const DhabaRegister = () => {
  const { isLoaded } = useAppGoogleMapsLoader();
  const mapsReady = isLoaded && HAS_VALID_GOOGLE_MAPS_KEY && Boolean(window.google?.maps);
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(() => ({ ...EMPTY, phone: (searchParams.get('phone') || '').replace(/\D/g, '').slice(-10) }));
  const [location, setLocation] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [done, setDone] = useState(null);
  const autocompleteRef = useRef(null);
  const mapRef = useRef(null);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const placePin = (point, { pan = true } = {}) => {
    setLocation(point);
    if (pan && mapRef.current) {
      mapRef.current.panTo(point);
      mapRef.current.setZoom(16);
    }
  };

  const onPlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace?.();
    const geo = place?.geometry?.location;
    if (!geo) return;
    placePin({ lat: geo.lat(), lng: geo.lng() });
    setForm((current) => ({
      ...current,
      name: current.name || place.name || '',
      city: current.city || cityFromPlace(place),
      address: current.address || place.formatted_address || '',
    }));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Location is not available on this device. Search for your dhaba on the map instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        placePin({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
      },
      () => {
        setError('Could not read your location. Allow location access or search on the map.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const addPhotos = async (event) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    event.target.value = '';
    const room = MAX_PHOTOS - photos.length;
    if (!room) return;
    try {
      const compressed = await Promise.all(files.slice(0, room).map(compressImage));
      setPhotos((current) => [...current, ...compressed].slice(0, MAX_PHOTOS));
    } catch {
      setError('One of the photos could not be read. Try a JPG or PNG.');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!location) return setError('Pin your dhaba on the map.');
    if (!photos.length) return setError('Add at least one photo of your dhaba.');
    if (!/^\d{14}$/.test(form.fssaiNumber.replace(/\s/g, ''))) return setError('FSSAI licence number must be 14 digits.');
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.');
    if (!agree) return setError('Please confirm the details are correct.');

    setBusy(true);
    try {
      const fields = { ...form };
      delete fields.confirmPassword;
      const result = await dhabaApi.register({ ...fields, location, photos });
      setDone(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_60%)] px-4">
        <div className="w-full max-w-md rounded-3xl border border-orange-100 bg-white p-8 text-center shadow-xl shadow-orange-100/50">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={34} />
          </div>
          <h1 className="mt-5 text-2xl font-black text-slate-900">Registration received</h1>
          <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600">
            Thanks for registering <span className="font-black text-slate-900">{done.name}</span>. Our team will check your
            details and FSSAI licence, usually within 1-2 working days. Once approved you can sign in with your mobile
            number and password to add your menu.
          </p>
          <Link
            to="/dhaba/login"
            className="mt-7 inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 py-3.5 text-sm font-black text-white"
          >
            Go to partner login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_45%)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <UtensilsCrossed size={18} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">ZI Bus</p>
            <p className="text-sm font-black text-slate-900">Dhaba Partners</p>
          </div>
        </div>
        <Link to="/dhaba/login" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
          Partner login
        </Link>
      </header>

      <div className="mx-auto max-w-5xl px-4 pb-16">
        <div className="py-6 sm:py-10">
          <h1 className="max-w-2xl text-3xl font-black leading-tight text-slate-900 sm:text-4xl">
            Register your dhaba and serve hungry bus passengers
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-slate-600 sm:text-base">
            ZI Bus passengers pre-order meals from dhabas on their route. Fill in the form below and we will review it.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {BENEFITS.map(({ icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-orange-100 bg-white/80 p-4">
                {React.createElement(icon, { size: 18, className: "text-orange-500" })}
                <p className="mt-2 text-sm font-black text-slate-900">{title}</p>
                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <Section step={1} icon={Store} title="Your dhaba">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dhaba name">
                <input className={inputClass} value={form.name} onChange={set('name')} placeholder="e.g. Sher-e-Punjab Dhaba" required maxLength={120} />
              </Field>
              <Field label="Highway (optional)" hint="Helps us match you to bus routes">
                <input className={inputClass} value={form.highway} onChange={set('highway')} placeholder="e.g. NH-46, AB Road" maxLength={80} />
              </Field>
              <Field label="City or town">
                <input className={inputClass} value={form.city} onChange={set('city')} placeholder="e.g. Dewas" required maxLength={80} />
              </Field>
              <Field label="FSSAI licence number" hint="14 digits, printed on your food licence">
                <input
                  className={inputClass}
                  value={form.fssaiNumber}
                  onChange={(event) => setForm((current) => ({ ...current, fssaiNumber: event.target.value.replace(/[^\d\s]/g, '') }))}
                  inputMode="numeric"
                  placeholder="1xxxxxxxxxxxxx"
                  required
                  maxLength={17}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Full address">
                  <textarea className={`${inputClass} min-h-[84px]`} value={form.address} onChange={set('address')} placeholder="Landmark, highway km marker, village / town, district, PIN" required maxLength={300} />
                </Field>
              </div>
            </div>
          </Section>

          <Section step={2} icon={MapPin} title="Pin the location">
            <p className="-mt-2 mb-4 text-xs font-medium text-slate-500">
              Buses use this pin to know when they are 30 minutes away. Search for your dhaba, tap the map, or drag the pin to the exact entrance.
            </p>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              {mapsReady ? (
                <div className="flex-1">
                  <Autocomplete
                    onLoad={(autocomplete) => { autocompleteRef.current = autocomplete; }}
                    onPlaceChanged={onPlaceChanged}
                    options={{ componentRestrictions: { country: 'in' }, fields: PLACE_FIELDS }}
                  >
                    <input className={inputClass} placeholder="Search your dhaba or nearby landmark" />
                  </Autocomplete>
                </div>
              ) : null}
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-black text-orange-700 hover:bg-orange-100 disabled:opacity-60"
              >
                {locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
                I am at the dhaba now
              </button>
            </div>
            <div className="h-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              {mapsReady ? (
                <GoogleMap
                  mapContainerStyle={MAP_STYLE}
                  center={location || INDIA_CENTER}
                  zoom={location ? 16 : 6}
                  onLoad={(map) => { mapRef.current = map; }}
                  onClick={(event) => placePin({ lat: event.latLng.lat(), lng: event.latLng.lng() }, { pan: false })}
                  options={{ streetViewControl: false, mapTypeControl: true, fullscreenControl: false, clickableIcons: false, gestureHandling: 'greedy' }}
                >
                  {location ? (
                    <MarkerF
                      position={location}
                      draggable
                      onDragEnd={(event) => placePin({ lat: event.latLng.lat(), lng: event.latLng.lng() }, { pan: false })}
                    />
                  ) : null}
                </GoogleMap>
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm font-semibold text-slate-500">
                  {HAS_VALID_GOOGLE_MAPS_KEY ? 'Loading map…' : 'Map unavailable. Use "I am at the dhaba now" to share your location.'}
                </div>
              )}
            </div>
            <p className={`mt-2 text-xs font-bold ${location ? 'text-emerald-600' : 'text-slate-400'}`}>
              {location ? `Pinned at ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : 'No pin yet'}
            </p>
          </Section>

          <Section step={3} icon={Camera} title="Photos">
            <p className="-mt-2 mb-4 text-xs font-medium text-slate-500">
              Add up to {MAX_PHOTOS} clear photos: the front with your signboard, the seating area and the kitchen. The first photo is shown to passengers.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {photos.map((src, index) => (
                <div key={src.slice(-40)} className="relative aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                  <img src={src} alt={`Dhaba photo ${index + 1}`} className="h-full w-full object-cover" />
                  {index === 0 ? (
                    <span className="absolute left-2 top-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-black text-white">Cover</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                    className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-slate-700 shadow"
                    aria-label={`Remove photo ${index + 1}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/50 text-orange-600 hover:bg-orange-50">
                  <Camera size={22} />
                  <span className="text-xs font-black">Add photo</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} />
                </label>
              ) : null}
            </div>
          </Section>

          <Section step={4} icon={UserRound} title="Owner and login">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Owner name">
                <input className={inputClass} value={form.ownerName} onChange={set('ownerName')} autoComplete="name" required maxLength={120} />
              </Field>
              <Field label="Mobile number" hint="You will sign in with this number">
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="10-digit mobile"
                  required
                  pattern="[6-9][0-9]{9}"
                  title="10-digit Indian mobile number"
                />
              </Field>
              <Field label="Email (optional)">
                <input className={inputClass} value={form.email} onChange={set('email')} type="email" autoComplete="email" maxLength={120} />
              </Field>
              <div className="hidden sm:block" />
              <Field label="Password" hint="At least 6 characters">
                <input className={inputClass} value={form.password} onChange={set('password')} type="password" autoComplete="new-password" required minLength={6} maxLength={72} />
              </Field>
              <Field label="Confirm password">
                <input className={inputClass} value={form.confirmPassword} onChange={set('confirmPassword')} type="password" autoComplete="new-password" required minLength={6} maxLength={72} />
              </Field>
            </div>
          </Section>

          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
            <label className="flex items-start gap-3 text-sm font-medium text-slate-600">
              <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} className="mt-1 h-4 w-4 accent-orange-500" />
              <span>
                The details above are correct and I am authorised to register this dhaba. I understand ZI Bus will verify the FSSAI licence before approving.
              </span>
            </label>
            {error ? <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-60"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <BadgeCheck size={16} />}
              {busy ? 'Submitting…' : 'Submit for review'}
            </button>
            <p className="mt-3 text-center text-xs font-medium text-slate-500">
              Already a partner? <Link to="/dhaba/login" className="font-black text-orange-600">Sign in</Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DhabaRegister;
