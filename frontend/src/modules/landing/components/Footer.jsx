import React from 'react';
import { Phone, Mail, MapPin, ShieldCheck, Clock, MessageCircle } from 'lucide-react';
import { scrollToTop } from '../hooks/useSmoothScroll';
import { CONTACT, LAUNCH_CITIES, waLink } from '../siteConfig';

const Footer = ({ setActiveTab }) => {
  const handleNavClick = (id) => {
    setActiveTab(id);
    scrollToTop();
  };

  return (
    <footer className="footer-container">
      <div className="container">
        <div className="footer-top-grid">
          {/* Brand Info */}
          <div className="footer-brand">
            <div className="footer-logo">
              <img src="/zicab-logo.jpg" alt="ZI CAB" className="footer-logo-img" />
              <div>
                <div className="footer-logo-text">
                  <span className="logo-zi">ZI</span>
                  <span className="logo-cab">CAB</span>
                </div>
                <p className="footer-tagline">Your Ride. Our Priority.</p>
              </div>
            </div>
            <p className="footer-desc">
              ZI CAB is a premium cab booking platform providing safe, transparent, and 24x7 verified rides — now live in Bengaluru, Mangaluru and Hubballi.
            </p>

            <div className="footer-contacts">
              <div className="contact-item">
                <Phone size={16} color="#00BBA9" />
                <span>
                  24x7 Toll-Free: <strong>{CONTACT.tollFree}</strong>
                </span>
              </div>
              <div className="contact-item">
                <MessageCircle size={16} color="#00BBA9" />
                <span>
                  WhatsApp:{' '}
                  <a href={waLink()} target="_blank" rel="noreferrer" className="footer-inline-link">
                    {CONTACT.whatsappDisplay}
                  </a>
                </span>
              </div>
              <div className="contact-item">
                <Mail size={16} color="#00BBA9" />
                <span>
                  Email:{' '}
                  <a href={`mailto:${CONTACT.email}`} className="footer-inline-link">
                    {CONTACT.email}
                  </a>
                </span>
              </div>
              <div className="contact-item">
                <MapPin size={16} color="#00BBA9" />
                <span>Office: {CONTACT.address}</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="footer-col">
            <h4 className="footer-heading">Quick Links</h4>
            <ul className="footer-links">
              <li><button onClick={() => handleNavClick('home')}>Home</button></li>
              <li><button onClick={() => handleNavClick('about')}>About Us</button></li>
              <li><button onClick={() => handleNavClick('services')}>Our Services</button></li>
              <li><button onClick={() => handleNavClick('corporate')}>Corporate Travel</button></li>
              <li><button onClick={() => handleNavClick('partner')}>Partner With Us</button></li>
              <li><button onClick={() => handleNavClick('driver')}>Attach Driver/Cab</button></li>
              <li><button onClick={() => handleNavClick('advertise')}>Advertise with ZI CAB</button></li>
              <li><button onClick={() => handleNavClick('contact')}>Contact Us</button></li>
            </ul>
          </div>

          {/* Our Services */}
          <div className="footer-col">
            <h4 className="footer-heading">Cab Services</h4>
            <ul className="footer-links">
              <li><button onClick={() => handleNavClick('services')}>Auto Ride</button></li>
              <li><button onClick={() => handleNavClick('services')}>City Ride (Local Cabs)</button></li>
              <li><button onClick={() => handleNavClick('services')}>Airport Pickup & Drop</button></li>
              <li><button onClick={() => handleNavClick('services')}>Outstation One-Way & Roundtrip</button></li>
              <li><button onClick={() => handleNavClick('services')}>Premium Executive Sedans</button></li>
              <li><button onClick={() => handleNavClick('services')}>SUV & Innova Crysta</button></li>
              <li><button onClick={() => handleNavClick('services')}>Hotel & Mall Pickup</button></li>
            </ul>
          </div>

          {/* Mobile App & Safety */}
          <div className="footer-col">
            <h4 className="footer-heading">Download App</h4>
            <p className="footer-text-sm">
              Book rides in seconds, track drivers live, and manage invoices with the ZI CAB app.
            </p>
            <div className="footer-app-badges">
              <div className="app-badge">
                <span className="app-badge-title">GET IT ON</span>
                <span className="app-badge-store">Google Play</span>
              </div>
              <div className="app-badge">
                <span className="app-badge-title">Download on the</span>
                <span className="app-badge-store">App Store</span>
              </div>
            </div>

            <div className="footer-trust-mini">
              <div className="trust-pill">
                <ShieldCheck size={14} color="#00BBA9" />
                <span>Verified Drivers</span>
              </div>
              <div className="trust-pill">
                <Clock size={14} color="#00BBA9" />
                <span>24x7 Live SOS</span>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-cities">
          <span className="footer-cities-label">Now Live In:</span>
          {LAUNCH_CITIES.map((c) => (
            <span key={c.name} className="footer-city-pill">
              <MapPin size={12} color="#00BBA9" /> {c.name}
            </span>
          ))}
        </div>

        <div className="footer-bottom">
          <p>© 2026 ZI CAB Technologies Pvt Ltd. All Rights Reserved.</p>
          <div className="footer-bottom-links">
            <a href="#privacy">Privacy Policy</a>
            <span>•</span>
            <a href="#terms">Terms of Service</a>
            <span>•</span>
            <a href="#refund">Refund & Cancellation</a>
            <span>•</span>
            {/* Required credit for the Creative Commons vehicle photos.
                Safe to delete once they are replaced with ZI CAB's own fleet photos. */}
            <a href="/vehicles/ATTRIBUTION.md" target="_blank" rel="noreferrer">Photo Credits</a>
          </div>
        </div>
      </div>

      <style>{`
        .zicab-landing {
          .footer-container {
            background-color: #07152B;
            color: #94A3B8;
            padding-top: 60px;
            padding-bottom: 24px;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            margin-top: auto;
          }

          .footer-top-grid {
            display: grid;
            grid-template-columns: 1.4fr 1fr 1fr 1.2fr;
            gap: 40px;
            margin-bottom: 50px;
          }

          .footer-logo {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 14px;
          }

          .footer-logo-img {
            width: 54px;
            height: 54px;
            border-radius: 13px;
            object-fit: cover;
          }

          .footer-logo-text {
            display: flex;
            align-items: baseline;
          }

          .footer-inline-link:hover {
            color: #00BBA9;
          }

          .footer-cities {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
            padding-bottom: 24px;
          }

          .footer-cities-label {
            font-size: 13px;
            font-weight: 600;
            color: #FFFFFF;
          }

          .footer-city-pill {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: rgba(0, 187, 169, 0.1);
            border: 1px solid rgba(0, 187, 169, 0.3);
            color: #CBD5E1;
            font-size: 12.5px;
            font-weight: 500;
            padding: 5px 12px;
            border-radius: 20px;
          }

          .footer-logo .logo-zi {
            font-size: 28px;
            font-weight: 800;
            color: #FFFFFF;
            font-style: italic;
          }

          .footer-logo .logo-cab {
            font-size: 24px;
            font-weight: 800;
            color: #00BBA9;
            margin-left: 4px;
          }

          .footer-tagline {
            color: #00BBA9;
            font-size: 12.5px;
            font-weight: 500;
          }

          .footer-desc {
            font-size: 13.5px;
            line-height: 1.6;
            color: #94A3B8;
            margin-bottom: 20px;
          }

          .footer-contacts {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }

          .contact-item {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 13px;
            color: #CBD5E1;
          }

          .contact-item strong {
            color: #FFFFFF;
          }

          .footer-heading {
            color: #FFFFFF;
            font-size: 17px;
            font-weight: 600;
            margin-bottom: 20px;
            position: relative;
          }

          .footer-heading::after {
            content: '';
            position: absolute;
            left: 0;
            bottom: -6px;
            width: 24px;
            height: 2px;
            background-color: #00BBA9;
            border-radius: 2px;
          }

          .footer-links {
            list-style: none;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }

          .footer-links button {
            background: none;
            border: none;
            color: #94A3B8;
            font-size: 14px;
            cursor: pointer;
            padding: 0;
            text-align: left;
            transition: all 0.2s;
          }

          .footer-links button:hover {
            color: #00BBA9;
            padding-left: 4px;
          }

          .footer-text-sm {
            font-size: 13.5px;
            line-height: 1.5;
            margin-bottom: 16px;
          }

          .footer-app-badges {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
          }

          .app-badge {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 8px;
            padding: 8px 12px;
            cursor: pointer;
            transition: var(--transition);
          }

          .app-badge:hover {
            background: rgba(0, 187, 169, 0.15);
            border-color: #00BBA9;
          }

          .app-badge-title {
            display: block;
            font-size: 9px;
            color: #94A3B8;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .app-badge-store {
            display: block;
            font-size: 12.5px;
            font-weight: 600;
            color: #FFFFFF;
          }

          .footer-trust-mini {
            display: flex;
            gap: 12px;
          }

          .trust-pill {
            display: flex;
            align-items: center;
            gap: 6px;
            background: rgba(11, 31, 58, 0.8);
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 11.5px;
            color: #CBD5E1;
          }

          .footer-bottom {
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            padding-top: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
          }

          .footer-bottom-links {
            display: flex;
            gap: 12px;
            align-items: center;
          }

          .footer-bottom-links a {
            color: #94A3B8;
            transition: color 0.2s;
          }

          .footer-bottom-links a:hover {
            color: #00BBA9;
          }

          @media (max-width: 992px) {
            .footer-top-grid {
              grid-template-columns: 1fr 1fr;
            }
          }

          @media (max-width: 768px) {
            .footer-container {
              padding-top: 40px;
            }
            .footer-top-grid {
              gap: 30px;
              margin-bottom: 30px;
            }
          }

          @media (max-width: 576px) {
            .footer-top-grid {
              grid-template-columns: 1fr;
            }
            .footer-bottom {
              flex-direction: column;
              gap: 12px;
              text-align: center;
            }
            .footer-bottom-links {
              flex-wrap: wrap;
              justify-content: center;
            }
            .footer-logo-img {
              width: 46px;
              height: 46px;
            }
            .contact-item {
              align-items: flex-start;
            }
            /* 21px-tall text links are too small to tap reliably */
            .footer-links button {
              padding: 6px 0;
            }
          }
      
        }
      `}</style>
    </footer>
  );
};

export default Footer;
