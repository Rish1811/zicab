import React, { useState } from 'react';
import {
  MapPin, Users, ArrowRight, ShieldCheck, Navigation,
  Headphones, Wallet, PhoneCall, Car, Plane, Compass,
  Briefcase, Building2, ShoppingBag, Smartphone, QrCode, ChevronRight,
  Star, BadgeCheck, Megaphone
} from 'lucide-react';
import { LAUNCH_CITIES, CONTACT } from '../siteConfig';

const Home = ({ openBookingModal, setActiveTab }) => {
  const [tab, setTab] = useState('city');
  const [pickup, setPickup] = useState('');
  const [drop, setDrop] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [passengers, setPassengers] = useState('1 Passenger');

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    openBookingModal();
  };

  const services = [
    { id: 'city', title: 'City Ride', icon: Car, desc: 'Local hourly & point-to-point rides' },
    { id: 'airport', title: 'Airport Transfer', icon: Plane, desc: 'On-time pickup & drop guaranteed' },
    { id: 'outstation', title: 'Outstation', icon: Compass, desc: 'Intercity one-way & roundtrips' },
    { id: 'sedan', title: 'Premium Sedan', icon: Car, desc: 'Comfortable Dzire & Etios sedans' },
    { id: 'suv', title: 'SUV', icon: Car, desc: 'Spacious Ertiga & Innova Crysta' },
    { id: 'corporate', title: 'Corporate Travel', icon: Briefcase, desc: 'B2B billing & employee cabs' },
    { id: 'hotel', title: 'Hotel Pickup', icon: Building2, desc: 'Luxury airport to hotel transfers' },
    { id: 'mall', title: 'Mall Pickup', icon: ShoppingBag, desc: 'Convenient shopping luggage rides' },
  ];

  const valueProps = [
    {
      icon: Headphones,
      title: 'Dedicated Ride Coordinator',
      desc: 'Our team stays connected with you, every step.'
    },
    {
      icon: ShieldCheck,
      title: 'Verified & Trained Drivers',
      desc: 'Professional drivers for your safe journey.'
    },
    {
      icon: Navigation,
      title: 'Live Tracking & Safety',
      desc: 'Real-time tracking and SOS button for safety.'
    },
    {
      icon: Wallet,
      title: 'Transparent Pricing',
      desc: 'No hidden charges, what you see is what you pay.'
    },
    {
      icon: PhoneCall,
      title: '24x7 Customer Support',
      desc: 'Call, WhatsApp or Chat - we are always here.'
    }
  ];

  // Model-specific photos. Drop the real fleet photos into
  // Frontend/public/vehicles/ using exactly these filenames (16:9, ~800x450).
  // If a file is missing the card falls back to `fallback` so nothing breaks.
  const vehicles = [
    {
      name: 'Maruti Suzuki Dzire',
      type: 'Sedan',
      seats: '4 Seats',
      bags: '2 Bags',
      price: '₹12',
      unit: '/km',
      image: '/vehicles/dzire.jpg',
      fallback: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Maruti Suzuki Ertiga',
      type: 'MUV',
      seats: '6 Seats',
      bags: '4 Bags',
      price: '₹16',
      unit: '/km',
      image: '/vehicles/ertiga.jpg',
      fallback: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Toyota Innova Crysta',
      type: 'Premium SUV',
      seats: '6 Seats',
      bags: '4 Bags',
      price: '₹20',
      unit: '/km',
      image: '/vehicles/innova-crysta.jpg',
      fallback: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Toyota Fortuner',
      type: 'Luxury SUV',
      seats: '7 Seats',
      bags: '4 Bags',
      price: '₹30',
      unit: '/km',
      image: '/vehicles/fortuner.jpg',
      fallback: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80'
    }
  ];

  // TODO(client): replace with real driver photos + details from the onboarding sheet.
  // Photos go in Frontend/public/drivers/ (square crop, 400x400 or larger).
  const drivers = [
    {
      name: 'Ramesh Kumar',
      photo: '/drivers/driver-1.jpg',
      rating: 4.9,
      trips: '3,200+ trips',
      experience: '8 years experience',
      vehicle: 'Maruti Suzuki Dzire · KA 01 AB 1234',
      badge: 'Top Driver',
      city: 'Bengaluru'
    },
    {
      name: 'Suresh Naik',
      photo: '/drivers/driver-2.jpg',
      rating: 4.8,
      trips: '2,100+ trips',
      experience: '6 years experience',
      vehicle: 'Toyota Innova Crysta · KA 19 CD 5678',
      badge: 'Verified',
      city: 'Mangaluru'
    },
    {
      name: 'Mahesh Patil',
      photo: '/drivers/driver-3.jpg',
      rating: 5.0,
      trips: '1,450+ trips',
      experience: '5 years experience',
      vehicle: 'Maruti Suzuki Ertiga · KA 25 EF 9012',
      badge: 'Top Driver',
      city: 'Hubballi'
    },
    {
      name: 'Imran Shaikh',
      photo: '/drivers/driver-4.jpg',
      rating: 4.9,
      trips: '2,800+ trips',
      experience: '10 years experience',
      vehicle: 'Toyota Fortuner · KA 03 GH 3456',
      badge: 'Verified',
      city: 'Bengaluru'
    }
  ];

  const partners = [
    { name: 'TAJ Hotels', subtitle: 'HOTELS' },
    { name: 'THE LEELA', subtitle: 'PALACES HOTELS RESORTS' },
    { name: 'NOVOTEL', subtitle: 'HOTELS & RESORTS' },
    { name: 'HYATT REGENCY', subtitle: '' },
    { name: 'LuLu MALL', subtitle: 'World of Happiness' },
    { name: 'Kempegowda Int. Airport', subtitle: 'BENGALURU' },
  ];

  return (
    <div className="home-page animate-fade-in">
      {/* HERO SECTION */}
      <section className="hero-section">
        <div className="hero-backdrop-glow" />
        <div className="container hero-container">
          {/* Left Content */}
          <div className="hero-left">
            <h1 className="hero-title">
              Your Ride. <br />
              <span className="teal-text">Our Priority.</span>
            </h1>
            <p className="hero-subtitle">
              Premium rides, verified drivers and 24x7 support with our dedicated ride coordinators.
            </p>

            <div className="hero-cta-group">
              <button className="btn btn-teal hero-btn-main" onClick={openBookingModal}>
                Book a Ride <ArrowRight size={18} />
              </button>
              <button className="btn btn-outline-light hero-btn-app" onClick={() => setActiveTab('contact')}>
                <Smartphone size={18} /> Download App
              </button>
            </div>

            {/* Trust Badges */}
            <div className="hero-trust-badges">
              <div className="badge-item">
                <ShieldCheck size={16} color="#00BBA9" />
                <span>Verified Drivers</span>
              </div>
              <div className="badge-item">
                <Navigation size={16} color="#00BBA9" />
                <span>Live Tracking</span>
              </div>
              <div className="badge-item">
                <Headphones size={16} color="#00BBA9" />
                <span>24x7 Support</span>
              </div>
              <div className="badge-item">
                <Wallet size={16} color="#00BBA9" />
                <span>Secure Payments</span>
              </div>
            </div>
          </div>

          {/* Right Ride Booking Card */}
          <div className="hero-right">
            <div className="booking-card">
              {/* Tabs */}
              <div className="booking-tabs">
                {[
                  { id: 'city', label: 'City Ride' },
                  { id: 'outstation', label: 'Outstation' },
                  { id: 'airport', label: 'Airport Transfer' },
                ].map((t) => (
                  <button
                    key={t.id}
                    className={`b-tab ${tab === t.id ? 'active' : ''}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSearchSubmit} className="booking-form">
                <div className="field-group">
                  <label>Pickup Location</label>
                  <div className="field-input-wrap">
                    <input 
                      type="text" 
                      placeholder="Enter pickup location" 
                      value={pickup}
                      onChange={(e) => setPickup(e.target.value)}
                    />
                    <MapPin className="field-icon" size={16} color="#00BBA9" />
                  </div>
                </div>

                <div className="field-group">
                  <label>Drop Location</label>
                  <div className="field-input-wrap">
                    <input 
                      type="text" 
                      placeholder="Enter drop location" 
                      value={drop}
                      onChange={(e) => setDrop(e.target.value)}
                    />
                    <MapPin className="field-icon" size={16} color="#00BBA9" />
                  </div>
                </div>

                <div className="field-row">
                  <div className="field-group">
                    <label>Date & Time</label>
                    <div className="field-input-wrap">
                      <input 
                        type="text" 
                        placeholder="Select Date & Time" 
                        value={dateTime}
                        onFocus={(e) => e.target.type = 'datetime-local'}
                        onChange={(e) => setDateTime(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="field-group">
                    <label>Passengers</label>
                    <div className="field-input-wrap">
                      <select value={passengers} onChange={(e) => setPassengers(e.target.value)}>
                        <option value="1 Passenger">1 Passenger</option>
                        <option value="2 Passengers">2 Passengers</option>
                        <option value="4 Passengers">4 Passengers</option>
                        <option value="6 Passengers">6 Passengers</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button type="submit" className="btn btn-teal w-full booking-submit-btn">
                  Find My Ride
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* OUR SERVICES SECTION */}
      <section className="section-padding services-section">
        <div className="container">
          <div className="section-title-group">
            <div>
              <h2 className="section-title">Our Services</h2>
            </div>
            <button className="section-link" onClick={() => setActiveTab('services')}>
              View All Services <ChevronRight size={16} />
            </button>
          </div>

          <div className="services-grid">
            {services.map((s) => {
              const IconComp = s.icon;
              return (
                <div 
                  key={s.id} 
                  className="service-card"
                  onClick={() => setActiveTab('services')}
                >
                  <div className="service-icon-wrapper">
                    <IconComp size={22} color="#0B1F3A" />
                  </div>
                  <h3 className="service-card-title">{s.title}</h3>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* WHY CHOOSE ZI CAB? SECTION */}
      <section className="why-us-section">
        <div className="container">
          <h2 className="section-title light mb-10">Why Choose ZI CAB?</h2>

          <div className="why-us-grid">
            {valueProps.map((v, idx) => {
              const IconComponent = v.icon;
              return (
                <div key={idx} className="why-us-card">
                  <div className="why-icon-box">
                    <IconComponent size={20} color="#00BBA9" />
                  </div>
                  <div className="why-content">
                    <h4 className="why-title">{v.title}</h4>
                    <p className="why-desc">{v.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* POPULAR VEHICLES SECTION */}
      <section className="section-padding vehicles-section">
        <div className="container">
          <div className="section-title-group">
            <div>
              <h2 className="section-title">Popular Vehicles</h2>
            </div>
            <button className="section-link" onClick={() => setActiveTab('services')}>
              View All Vehicles <ChevronRight size={16} />
            </button>
          </div>

          <div className="vehicles-grid">
            {vehicles.map((v, i) => (
              <div key={i} className="vehicle-card">
                <div className="vehicle-img-container">
                  <img
                    src={v.image}
                    alt={v.name}
                    className="vehicle-img"
                    onError={(e) => {
                      if (e.currentTarget.src !== v.fallback) e.currentTarget.src = v.fallback;
                    }}
                  />
                  <span className="vehicle-type-badge">{v.type}</span>
                </div>
                <div className="vehicle-card-body">
                  <h3 className="vehicle-name">{v.name}</h3>
                  <div className="vehicle-specs">
                    <span><Users size={14} /> {v.seats}</span>
                    <span><Briefcase size={14} /> {v.bags}</span>
                  </div>

                  <div className="vehicle-price-row">
                    <div className="price-tag">
                      <span className="price-num">{v.price}</span>
                      <span className="price-unit">{v.unit}</span>
                    </div>
                    <button 
                      className="btn btn-outline-teal btn-sm"
                      onClick={openBookingModal}
                    >
                      Book Now
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MEET OUR DRIVERS SECTION */}
      <section className="section-padding drivers-section">
        <div className="container">
          <div className="section-title-group">
            <div>
              <h2 className="section-title light">Meet Our Drivers</h2>
              <p className="section-sub">Every ZI CAB captain is background-verified, police-checked and rated by real riders.</p>
            </div>
            <button className="section-link" onClick={() => setActiveTab('driver')}>
              Become a Driver <ChevronRight size={16} />
            </button>
          </div>

          <div className="drivers-grid">
            {drivers.map((d, i) => (
              <div key={i} className="driver-card">
                <div className="driver-top">
                  <img
                    src={d.photo}
                    alt={d.name}
                    className="driver-photo"
                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                  />
                  <span className={`driver-badge ${d.badge === 'Top Driver' ? 'top' : ''}`}>
                    <BadgeCheck size={12} /> {d.badge}
                  </span>
                </div>

                <h3 className="driver-name">{d.name}</h3>

                <div className="driver-rating">
                  <Star size={14} color="#FBBF24" fill="#FBBF24" />
                  <strong>{d.rating}</strong>
                  <span>· {d.trips}</span>
                </div>

                <div className="driver-meta">
                  <div className="dm-row"><ShieldCheck size={14} color="#00BBA9" /> {d.experience}</div>
                  <div className="dm-row"><Car size={14} color="#00BBA9" /> {d.vehicle}</div>
                  <div className="dm-row"><MapPin size={14} color="#00BBA9" /> {d.city}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* OFFICE & LAUNCH CITIES */}
      <section className="section-padding cities-section">
        <div className="container">
          <div className="section-title-group">
            <div>
              <h2 className="section-title">Where You'll Find Us</h2>
              <p className="section-sub-dark">{CONTACT.addressShort}</p>
            </div>
            <a className="section-link" href={CONTACT.mapsUrl} target="_blank" rel="noreferrer">
              Get Directions <ChevronRight size={16} />
            </a>
          </div>

          <div className="cities-grid">
            {LAUNCH_CITIES.map((c) => (
              <div key={c.name} className="city-card">
                <div className="city-icon"><MapPin size={20} color="#00BBA9" /></div>
                <h3>{c.name}</h3>
                <span>{c.note}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ADVERTISE TEASER */}
      <section className="advertise-teaser">
        <div className="container advertise-teaser-inner">
          <div>
            <span className="at-tag"><Megaphone size={14} /> For Businesses</span>
            <h2 className="at-title">Advertise with ZI CAB</h2>
            <p className="at-desc">
              Put your brand in front of thousands of daily riders — across our mobile app, website,
              driver app, home banners, booking screens and push notifications.
            </p>
          </div>
          <button className="btn btn-teal at-btn" onClick={() => setActiveTab('advertise')}>
            Explore Ad Options <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* TRUSTED BY & APP DOWNLOAD SECTION */}
      <section className="trusted-app-section">
        <div className="container">
          {/* Trusted Logos */}
          <div className="trusted-block">
            <h3 className="trusted-heading">Trusted by Hotels, Airports & Malls</h3>
            <div className="partners-flex">
              {partners.map((p, index) => (
                <div key={index} className="partner-logo-item">
                  <span className="p-title">{p.name}</span>
                  {p.subtitle && <span className="p-sub">{p.subtitle}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* App Download Banner */}
          <div className="app-download-banner">
            <div className="app-banner-left">
              <h2 className="app-banner-title">Download ZI CAB App</h2>
              <p className="app-banner-desc">Book rides on the go, anytime, anywhere.</p>

              <div className="app-store-btns flex gap-4 mt-6">
                <div className="qr-box">
                  <QrCode size={40} color="#0B1F3A" />
                </div>
                <div className="store-btns-column">
                  <div className="store-btn">
                    <span className="st-sub">GET IT ON</span>
                    <span className="st-name">Google Play</span>
                  </div>
                  <div className="store-btn">
                    <span className="st-sub">Download on the</span>
                    <span className="st-name">App Store</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="app-banner-right">
              <div className="mockup-phone">
                <div className="mockup-screen">
                  <div className="m-header">
                    <span className="m-logo">ZI CAB</span>
                  </div>
                  <div className="m-body">
                    <p className="m-tag">Your Ride. Our Priority.</p>
                    <div className="m-btn">Book a Ride</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <style>{`
        /* HERO STYLES */
        .hero-section {
          background: #07152B url('/carbackground.png') no-repeat 88% center;
          background-size: cover;
          position: relative;
          padding: 60px 0 80px;
          overflow: hidden;
          color: #FFFFFF;
        }

        .hero-backdrop-glow {
          position: absolute;
          top: -20%;
          left: 30%;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(0, 187, 169, 0.15) 0%, rgba(0, 0, 0, 0) 70%);
          pointer-events: none;
          z-index: 1;
        }

        .hero-container {
          display: grid;
          grid-template-columns: 1.25fr 0.75fr;
          gap: 20px;
          align-items: center;
          position: relative;
          z-index: 2;
        }

        .hero-title {
          font-size: 52px;
          font-weight: 800;
          line-height: 1.1;
          margin-bottom: 18px;
          letter-spacing: -1px;
        }

        .teal-text {
          color: #00BBA9;
        }

        .hero-subtitle {
          font-size: 16.5px;
          color: #CBD5E1;
          line-height: 1.6;
          max-width: 500px;
          margin-bottom: 30px;
        }

        .hero-cta-group {
          display: flex;
          gap: 16px;
          margin-bottom: 40px;
        }

        .hero-btn-main {
          padding: 14px 30px;
          font-size: 16px;
          border-radius: 30px;
        }

        .hero-btn-app {
          padding: 14px 24px;
          font-size: 15px;
          border-radius: 30px;
        }

        .hero-trust-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 24px;
        }

        .badge-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13.5px;
          color: #E2E8F0;
          font-weight: 500;
        }

        .hero-right {
          display: flex;
          justify-content: flex-end;
          margin-right: -15px;
        }

        /* BOOKING CARD */
        .booking-card {
          background-color: #0C1B30;
          border: 1px solid rgba(0, 187, 169, 0.25);
          border-radius: 14px;
          padding: 18px 20px;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
          max-width: 420px;
          width: 100%;
        }

        .booking-tabs {
          display: flex;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 3px;
          gap: 3px;
          margin-bottom: 14px;
        }

        .b-tab {
          flex: 1;
          background: none;
          border: none;
          color: #94A3B8;
          padding: 7px 4px;
          font-size: 12.5px;
          font-weight: 500;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .b-tab.active {
          background-color: #00BBA9;
          color: #FFFFFF;
          font-weight: 600;
        }

        .booking-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .field-group label {
          font-size: 11.5px;
          color: #94A3B8;
          font-weight: 500;
        }

        .field-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .field-input-wrap input, .field-input-wrap select {
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 7px;
          padding: 9px 12px;
          color: #FFFFFF;
          font-size: 13px;
          outline: none;
        }

        .field-input-wrap input:focus, .field-input-wrap select:focus {
          border-color: #00BBA9;
        }

        .field-icon {
          position: absolute;
          right: 12px;
          pointer-events: none;
        }

        .field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .booking-submit-btn {
          margin-top: 4px;
          padding: 11px;
          font-size: 14.5px;
          border-radius: 7px;
        }

        /* SERVICES GRID */
        .services-section {
          background-color: #FFFFFF;
        }

        .services-grid {
          display: grid;
          grid-template-columns: repeat(8, 1fr);
          gap: 12px;
        }

        .service-card {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 10px;
          padding: 16px 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          cursor: pointer;
          transition: var(--transition);
        }

        .service-card:hover {
          background: #FFFFFF;
          border-color: #00BBA9;
          transform: translateY(-3px);
          box-shadow: 0 10px 20px rgba(0, 187, 169, 0.12);
        }

        .service-icon-wrapper {
          width: 46px;
          height: 46px;
          background: #E6F8F6;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
        }

        .service-card-title {
          font-size: 13px;
          font-weight: 600;
          color: #0F172A;
          line-height: 1.25;
        }

        /* WHY US SECTION */
        .why-us-section {
          background-color: #0B1F3A;
          color: #FFFFFF;
          padding: 50px 0 60px;
        }

        .mb-10 {
          margin-bottom: 30px;
        }

        .why-us-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 20px;
        }

        .why-us-card {
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          gap: 12px;
        }

        .why-icon-box {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(0, 187, 169, 0.12);
          border: 1px solid rgba(0, 187, 169, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .why-title {
          font-size: 14px;
          font-weight: 700;
          color: #FFFFFF;
          line-height: 1.3;
          margin-bottom: 4px;
        }

        .why-desc {
          font-size: 12px;
          color: #94A3B8;
          line-height: 1.45;
        }

        /* VEHICLES GRID */
        .vehicles-section {
          background-color: #F5F7FA;
        }

        .vehicles-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }

        .vehicle-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          overflow: hidden;
          transition: var(--transition);
          box-shadow: var(--shadow-sm);
        }

        .vehicle-card:hover {
          transform: translateY(-5px);
          box-shadow: var(--shadow-md);
          border-color: #00BBA9;
        }

        .vehicle-img-container {
          height: 160px;
          background: #F1F5F9;
          overflow: hidden;
        }

        .vehicle-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .vehicle-card-body {
          padding: 18px;
        }

        .vehicle-name {
          font-size: 18px;
          font-weight: 700;
          color: #0F172A;
          margin-bottom: 8px;
        }

        .vehicle-specs {
          display: flex;
          gap: 16px;
          font-size: 12.5px;
          color: #64748B;
          margin-bottom: 16px;
        }

        .vehicle-specs span {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .vehicle-price-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid #F1F5F9;
          padding-top: 14px;
        }

        .price-num {
          font-size: 20px;
          font-weight: 800;
          color: #0F172A;
        }

        .price-unit {
          font-size: 12px;
          color: #64748B;
        }

        .btn-outline-teal {
          background: #E6F8F6;
          color: #00BBA9;
          border: 1px solid #00BBA9;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          padding: 6px 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-outline-teal:hover {
          background: #00BBA9;
          color: #FFFFFF;
        }

        .vehicle-img-container {
          position: relative;
        }

        .vehicle-type-badge {
          position: absolute;
          top: 12px;
          left: 12px;
          background: rgba(7, 21, 43, 0.85);
          color: #00BBA9;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 20px;
          border: 1px solid rgba(0, 187, 169, 0.4);
        }

        /* DRIVER PROFILES */
        .drivers-section {
          background: linear-gradient(135deg, #07152B 0%, #0B1F3A 100%);
        }

        .section-sub {
          font-size: 14px;
          color: #94A3B8;
          margin-top: 6px;
          max-width: 560px;
        }

        .section-sub-dark {
          font-size: 14px;
          color: #64748B;
          margin-top: 6px;
        }

        .drivers-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 22px;
        }

        .driver-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 16px;
          padding: 22px;
          color: #FFFFFF;
          transition: var(--transition);
        }

        .driver-card:hover {
          border-color: #00BBA9;
          transform: translateY(-5px);
          box-shadow: 0 16px 32px rgba(0, 0, 0, 0.35);
        }

        .driver-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 14px;
        }

        .driver-photo {
          width: 68px;
          height: 68px;
          border-radius: 50%;
          object-fit: cover;
          background: rgba(255, 255, 255, 0.12);
          border: 2px solid #00BBA9;
        }

        .driver-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10.5px;
          font-weight: 700;
          padding: 4px 9px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.1);
          color: #CBD5E1;
          border: 1px solid rgba(255, 255, 255, 0.18);
        }

        .driver-badge.top {
          background: rgba(0, 187, 169, 0.15);
          color: #00BBA9;
          border-color: rgba(0, 187, 169, 0.45);
        }

        .driver-name {
          font-size: 16.5px;
          font-weight: 700;
          margin-bottom: 5px;
        }

        .driver-rating {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 13px;
          color: #94A3B8;
          margin-bottom: 14px;
        }

        .driver-rating strong {
          color: #FFFFFF;
        }

        .driver-meta {
          display: flex;
          flex-direction: column;
          gap: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 14px;
        }

        .dm-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #CBD5E1;
          line-height: 1.4;
        }

        /* LAUNCH CITIES */
        .cities-section {
          background: #FFFFFF;
        }

        .cities-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 22px;
        }

        .city-card {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          padding: 26px 22px;
          transition: var(--transition);
        }

        .city-card:hover {
          border-color: #00BBA9;
          transform: translateY(-4px);
          box-shadow: 0 10px 24px rgba(0, 187, 169, 0.12);
        }

        .city-icon {
          width: 44px;
          height: 44px;
          background: #E6F8F6;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
        }

        .city-card h3 {
          font-size: 19px;
          font-weight: 700;
          color: #0F172A;
          margin-bottom: 4px;
        }

        .city-card span {
          font-size: 13px;
          color: #64748B;
        }

        /* ADVERTISE TEASER */
        .advertise-teaser {
          background: #0B1F3A;
          padding: 44px 0;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .advertise-teaser-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 30px;
          color: #FFFFFF;
        }

        .at-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #00BBA9;
          background: rgba(0, 187, 169, 0.12);
          padding: 4px 12px;
          border-radius: 20px;
          margin-bottom: 10px;
        }

        .at-title {
          font-size: 28px;
          font-weight: 800;
          margin-bottom: 6px;
        }

        .at-desc {
          font-size: 14.5px;
          color: #94A3B8;
          line-height: 1.6;
          max-width: 640px;
        }

        .at-btn {
          flex-shrink: 0;
          padding: 14px 28px;
          border-radius: 30px;
        }

        /* TRUSTED & APP SECTION */
        .trusted-app-section {
          padding: 60px 0;
          background: #FFFFFF;
        }

        .trusted-block {
          margin-bottom: 50px;
        }

        .trusted-heading {
          font-size: 20px;
          font-weight: 700;
          color: #0F172A;
          margin-bottom: 24px;
        }

        .partners-flex {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          justify-content: space-between;
        }

        .partner-logo-item {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          padding: 14px 20px;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-width: 150px;
        }

        .partner-logo-item .p-title {
          font-size: 15px;
          font-weight: 800;
          color: #0B1F3A;
          letter-spacing: 0.5px;
        }

        .partner-logo-item .p-sub {
          font-size: 8.5px;
          color: #64748B;
          letter-spacing: 0.8px;
        }

        .app-download-banner {
          background: linear-gradient(135deg, #00BBA9 0%, #009688 100%);
          border-radius: 20px;
          padding: 40px 50px;
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          align-items: center;
          color: #FFFFFF;
          box-shadow: 0 16px 36px rgba(0, 187, 169, 0.25);
        }

        .app-banner-title {
          font-size: 32px;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .app-banner-desc {
          font-size: 16px;
          opacity: 0.95;
        }

        .qr-box {
          background: #FFFFFF;
          padding: 10px;
          border-radius: 12px;
        }

        .store-btns-column {
          display: flex;
          gap: 10px;
        }

        .store-btn {
          background: #0B1F3A;
          padding: 8px 16px;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          cursor: pointer;
        }

        .st-sub {
          font-size: 9px;
          opacity: 0.7;
        }

        .st-name {
          font-size: 13px;
          font-weight: 600;
        }

        .mockup-phone {
          width: 220px;
          height: 320px;
          background: #0B1F3A;
          border: 6px solid #FFFFFF;
          border-radius: 30px;
          margin: 0 auto;
          padding: 10px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }

        .mockup-screen {
          background: #07152B;
          height: 100%;
          border-radius: 20px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
        }

        .m-logo {
          font-weight: 800;
          font-size: 20px;
          color: #00BBA9;
        }

        .m-tag {
          font-size: 11px;
          color: #FFFFFF;
          margin: 10px 0;
        }

        .m-btn {
          background: #00BBA9;
          color: #FFFFFF;
          font-size: 12px;
          font-weight: 600;
          padding: 8px 16px;
          border-radius: 20px;
        }

        /* RESPONSIVE MEDIA QUERIES */
        @media (max-width: 1024px) {
          .hero-container {
            grid-template-columns: 1fr;
          }
          .services-grid {
            grid-template-columns: repeat(4, 1fr);
          }
          .vehicles-grid, .why-us-grid, .drivers-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .advertise-teaser-inner {
            flex-direction: column;
            align-items: flex-start;
          }
          .app-download-banner {
            grid-template-columns: 1fr;
            gap: 30px;
            padding: 30px;
          }
        }

        @media (max-width: 640px) {
          .hero-title {
            font-size: 36px;
          }
          .services-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .vehicles-grid, .why-us-grid, .drivers-grid, .cities-grid {
            grid-template-columns: 1fr;
          }
          .section-title-group {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
          .partners-flex {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
};

export default Home;
