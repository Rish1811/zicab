import React from 'react';
import { useSettings } from '../../../shared/context/SettingsContext';
import heroImage from '../../../assets/images/yellow_taxi_login_bg.png';

const DRIVER_PORTALS = ['Taxi and parcel drivers', 'Bus drivers and conductors', 'Fleet and bus owners', 'Pooling drivers', 'Service centers'];
const BUS_PORTALS = ['Book seats for passengers', 'See and cancel bookings', 'Register your bus'];
const OWNER_PORTALS = ['Your vehicles and drivers', 'Bus services and bookings', 'Fleet earnings and payouts'];

/// The frame around the driver and owner login screens: the photo beside the
/// form on a laptop, a short band above it on a phone.
const DriverAuthShell = ({ isOwnerPortal = false, isBusPortal = false, children }) => {
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'ZI CAB';
  const appLogo = settings.general?.logo || settings.customization?.logo || settings.general?.favicon || '';
  const brandName = appName.split(' - ')[0];
  const portals = isBusPortal ? BUS_PORTALS : isOwnerPortal ? OWNER_PORTALS : DRIVER_PORTALS;
  const headline = isBusPortal
    ? 'Your bus, all in one place.'
    : isOwnerPortal
      ? 'Your fleet, all in one place.'
      : 'One login for everyone who keeps us moving.';

  return (
    <div className="grid min-h-[100dvh] w-full content-start bg-white text-slate-900 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:content-stretch">
      <aside className="relative h-44 overflow-hidden bg-slate-900 sm:h-56 lg:sticky lg:top-0 lg:h-[100dvh]">
        <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover object-[60%_70%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-slate-950/50" />

        <div className="relative flex h-full flex-col justify-between p-5 sm:p-7 lg:p-12">
          <div className="flex items-center gap-3">
            {appLogo ? (
              <img src={appLogo} alt="" className="h-10 w-10 rounded-xl bg-white object-cover p-1 lg:h-12 lg:w-12" />
            ) : null}
            <span className="text-lg font-bold tracking-tight text-white lg:text-xl">{brandName}</span>
          </div>

          <div className="hidden max-w-lg lg:block">
            <h2 className="text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl">
              {headline}
            </h2>
            <ul className="mt-8 flex flex-wrap gap-2">
              {portals.map((label) => (
                <li key={label} className="rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      <section className="relative z-10 -mt-5 flex min-w-0 justify-center rounded-t-3xl bg-white px-5 pb-10 pt-8 sm:px-8 lg:mt-0 lg:items-center lg:rounded-none lg:px-12 lg:py-12">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </div>
  );
};

export default DriverAuthShell;
