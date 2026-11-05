import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowRight,
  Armchair,
  Bus,
  CalendarDays,
  Clock,
  MapPin,
  MapPinned,
  Search,
  Ticket,
  Users,
} from 'lucide-react';
import { LANDING_TABS } from '../../../landing/landingTabs';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { formatRupees } from '../../components/bus/zibusFormat';
import heroBus from '../../../../assets/zibus/hero-bus.webp';
import routeMysuru from '../../../../assets/zibus/route-mysuru.webp';
import routeHyderabad from '../../../../assets/zibus/route-hyderabad.webp';
import routeChennai from '../../../../assets/zibus/route-chennai.webp';
import '../../components/bus/zibus-desktop.css';

const NAV_LABELS = {
  home: 'Home',
  about: 'About Us',
  services: 'Services',
  corporate: 'Corporate',
  partner: 'Partner',
  driver: 'Driver',
  advertise: 'Advertise',
  contact: 'Contact Us',
};

const FEATURES = [
  { icon: MapPinned, title: 'Live Bus Tracking', text: 'Track your bus in real time from departure to arrival.' },
  { icon: Armchair, title: 'Secure Seat Booking', text: 'Choose your preferred seat on a live seat map.' },
  { icon: Ticket, title: 'Boarding Pass & Updates', text: 'Get your e-ticket with PNR and QR straight away.' },
];

const CITY_PICTURES = [
  [/mys(u|o)r/i, routeMysuru],
  [/hyderabad/i, routeHyderabad],
  [/chennai/i, routeChennai],
];

const pictureFor = (toCity = '') => CITY_PICTURES.find(([pattern]) => pattern.test(toCity))?.[1] || null;

const ROUTES_SHOWN = 3;

/// The ZI Bus search page on a computer. It sits above the app's phone shell so
/// it can use the full width; below 1024px BusHome shows the phone layout.
const BusHomeDesktop = ({
  busEnabled,
  cities,
  routes,
  routesLoading,
  fromCity,
  toCity,
  date,
  returnDate,
  passengers,
  today,
  error,
  matchingRoute,
  maxPassengers,
  routePrefix,
  nextTrip,
  onFromChange,
  onToChange,
  onDateChange,
  onReturnDateChange,
  onPassengersChange,
  onSwap,
  onSearch,
  onRouteSearch,
}) => {
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const visibleRoutes = showAllRoutes ? routes : routes.slice(0, ROUTES_SHOWN);
  const { settings } = useSettings();
  const logo = settings.general?.logo || '/zicab-logo.jpg';

  const citySelect = (value, onChange, label) => (
    <select className="zbd-input" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
      <option value="">Select city</option>
      {cities.map((city) => <option key={city} value={city}>{city}</option>)}
    </select>
  );

  return createPortal(
    <div className="zbd">
      <header className="zbd-nav">
        <div className="zbd-wrap zbd-nav-inner">
          <Link to="/" className="zbd-brand">
            <img src={logo} alt="" />
            <span>
              <strong>ZI <em>CAB</em></strong>
              <small>Your Ride. Our Priority.</small>
            </span>
          </Link>
          <nav className="zbd-links" aria-label="Main">
            {LANDING_TABS.map((tab) => (
              <Link key={tab.id} to={tab.path} className={tab.id === 'services' ? 'is-active' : ''}>{NAV_LABELS[tab.id]}</Link>
            ))}
            <Link to={`${routePrefix}/profile/bus-bookings`}>My Trips</Link>
          </nav>
          <a href="#zbd-search" className="zbd-cta"><Bus size={18} /> Book a Bus</a>
        </div>
      </header>

      <section className="zbd-hero">
        <img className="zbd-hero-bus" src={heroBus} alt="A ZI Bus coach on the highway" />
        <div className="zbd-wrap zbd-hero-text">
          <span className="zbd-pill"><Bus size={18} /> ZI BUS</span>
          <h1>Your Journey, Your Way.</h1>
          <p>Book comfortable buses for every journey.</p>
        </div>
      </section>

      <div className="zbd-wrap">
        <form
          id="zbd-search"
          className="zbd-search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="zbd-field">
            <span><MapPin size={16} /> From</span>
            {citySelect(fromCity, onFromChange, 'From')}
          </label>
          <button type="button" className="zbd-swap" onClick={onSwap} aria-label="Swap cities"><ArrowLeftRight size={18} /></button>
          <label className="zbd-field">
            <span><MapPin size={16} /> To</span>
            {citySelect(toCity, onToChange, 'To')}
          </label>
          <i className="zbd-divider" />
          <label className="zbd-field">
            <span><CalendarDays size={16} /> Journey Date</span>
            <input className="zbd-input" type="date" min={today} value={date} onChange={(event) => onDateChange(event.target.value)} />
          </label>
          <label className="zbd-field">
            <span><CalendarDays size={16} /> Return Date <small>(Optional)</small></span>
            <input className="zbd-input" type="date" min={date} value={returnDate} onChange={(event) => onReturnDateChange(event.target.value)} />
          </label>
          <i className="zbd-divider" />
          <label className="zbd-field">
            <span><Users size={16} /> Passengers</span>
            <select className="zbd-input" value={passengers} onChange={(event) => onPassengersChange(Number(event.target.value))}>
              {Array.from({ length: maxPassengers }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>{count} Passenger{count > 1 ? 's' : ''}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="zbd-search-btn"><Search size={20} /> Search Buses</button>
          {error || !busEnabled || matchingRoute ? (
            <p className={`zbd-search-note ${error || !busEnabled ? 'is-error' : ''}`}>
              {error || (!busEnabled
                ? 'Bus booking is paused right now.'
                : `${matchingRoute.busCount || 1} bus${(matchingRoute.busCount || 1) > 1 ? 'es' : ''} on this route, from ${formatRupees(matchingRoute.startingPrice)}`)}
            </p>
          ) : null}
        </form>

        <section className="zbd-features">
          {FEATURES.map((feature) => {
            const FeatureIcon = feature.icon;
            return (
              <div key={feature.title} className="zbd-feature">
                <span className="zbd-feature-icon"><FeatureIcon size={26} /></span>
                <div>
                  <strong>{feature.title}</strong>
                  <p>{feature.text}</p>
                </div>
              </div>
            );
          })}
        </section>

        {nextTrip ? (
          <Link to={`${routePrefix}/profile/bus-bookings/${nextTrip.id}`} className="zbd-next-trip">
            <Ticket size={20} />
            <span>
              <strong>Your next trip: {nextTrip.bus?.fromCity} to {nextTrip.bus?.toCity}</strong>
              <small>PNR {nextTrip.pnr || nextTrip.bookingCode}</small>
            </span>
            <ArrowRight size={18} />
          </Link>
        ) : null}

        <section className="zbd-routes">
          <div className="zbd-routes-head">
            <h2>Popular Routes</h2>
            {routes.length > ROUTES_SHOWN ? (
              <button type="button" onClick={() => setShowAllRoutes((current) => !current)}>
                {showAllRoutes ? 'Show Fewer Routes' : 'View All Routes'} <ArrowRight size={18} />
              </button>
            ) : null}
          </div>
          {routesLoading ? (
            <p className="zbd-empty">Loading routes...</p>
          ) : routes.length ? (
            <div className="zbd-route-grid">
              {visibleRoutes.map((route) => {
                const picture = pictureFor(route.toCity);
                return (
                  <article key={`${route.fromCity}-${route.toCity}`} className="zbd-route">
                    <div className={`zbd-route-picture ${picture ? '' : 'is-plain'}`}>
                      <img src={picture || heroBus} alt="" />
                    </div>
                    <div className="zbd-route-body">
                      <div>
                        <h3><Bus size={20} /> {route.fromCity} <ArrowRight size={18} /> {route.toCity}</h3>
                        {route.duration ? <p><Clock size={15} /> Approx. {route.duration}</p> : null}
                        <p><Armchair size={15} /> {route.busCount || 1} bus{(route.busCount || 1) > 1 ? 'es' : ''} on this route</p>
                      </div>
                      <div className="zbd-route-price">
                        <small>Starting from</small>
                        <strong>{formatRupees(route.startingPrice)}</strong>
                        <button type="button" onClick={() => onRouteSearch(route)}>Book Now <ArrowRight size={16} /></button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="zbd-empty">No routes are live yet.</p>
          )}
        </section>
      </div>
    </div>,
    document.body,
  );
};

export default BusHomeDesktop;
