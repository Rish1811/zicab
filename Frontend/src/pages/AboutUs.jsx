import React from 'react';
import { ShieldCheck, Award, Users, MapPin, HeartHandshake, CheckCircle2, ArrowRight } from 'lucide-react';

const AboutUs = ({ openBookingModal }) => {
  const stats = [
    { label: 'Successful Rides', value: '100,000+' },
    { label: 'Customer Rating', value: '4.9 ★' },
    { label: 'Cities Covered', value: '50+' },
    { label: 'Verified Drivers', value: '5,000+' },
  ];

  const pillars = [
    {
      icon: ShieldCheck,
      title: 'Safety First',
      desc: 'All vehicles are equipped with real-time GPS tracking, dual dash cams, and SOS emergency buttons monitored 24x7 by our command center.'
    },
    {
      icon: Award,
      title: 'Transparent Pricing',
      desc: 'Zero surge pricing surprises. What you see during booking is exact fare you pay—inclusive of fuel, toll, and taxes.'
    },
    {
      icon: HeartHandshake,
      title: 'Dedicated Ride Coordinator',
      desc: 'Every ride is actively monitored by a personal ride coordinator to handle unexpected delays, rerouting, or flight changes.'
    },
    {
      icon: Users,
      title: 'Professional Fleet',
      desc: 'Strict driver background verification, police verification, and quarterly vehicle maintenance checks guarantee a smooth journey.'
    }
  ];

  return (
    <div className="about-page animate-fade-in">
      {/* Page Header */}
      <div className="page-hero">
        <div className="container">
          <span className="page-tag">About Zi CAB</span>
          <h1 className="page-title">Redefining Premium Cab Services Across India</h1>
          <p className="page-subtitle">
            Built on trust, safety, and reliability. Providing seamless outstation, airport, and local rides since 2021.
          </p>
        </div>
      </div>

      {/* Stats Counter Bar */}
      <section className="stats-section">
        <div className="container">
          <div className="stats-grid">
            {stats.map((s, i) => (
              <div key={i} className="stat-card">
                <span className="stat-value">{s.value}</span>
                <span className="stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Story & Mission Section */}
      <section className="section-padding story-section">
        <div className="container story-grid">
          <div className="story-content">
            <h2 className="section-title">Our Story & Mission</h2>
            <p className="body-text">
              Zi CAB was founded with a clear mission: to eliminate ride cancellations, surge pricing shocks, and unverified driver risks for travelers in India.
            </p>
            <p className="body-text">
              Whether you need an early morning 4 AM airport cab in Bengaluru, an executive sedan for corporate travel, or a family SUV for an outstation weekend trip to Coorg, Zi CAB ensures guaranteed on-time pickup with professional drivers.
            </p>
            
            <div className="mission-list">
              <div className="m-item">
                <CheckCircle2 size={18} color="#00BBA9" />
                <span>100% Guaranteed On-Time Pickups</span>
              </div>
              <div className="m-item">
                <CheckCircle2 size={18} color="#00BBA9" />
                <span>Zero Cancellation Fees for Riders</span>
              </div>
              <div className="m-item">
                <CheckCircle2 size={18} color="#00BBA9" />
                <span>Clean, Sanitized & Premium Fleet</span>
              </div>
            </div>

            <button className="btn btn-teal mt-6" onClick={openBookingModal}>
              Book Your Ride Now <ArrowRight size={18} />
            </button>
          </div>

          <div className="story-image-box">
            <img 
              src="https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80" 
              alt="Zi CAB Premium Ride"
              className="story-img"
            />
            <div className="story-badge">
              <span className="badge-num">24x7</span>
              <span className="badge-txt">Live Coordination Support</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars Section */}
      <section className="section-padding pillars-section">
        <div className="container">
          <h2 className="section-title text-center mb-12">The Pillars of Zi CAB</h2>
          
          <div className="pillars-grid">
            {pillars.map((p, idx) => {
              const Icon = p.icon;
              return (
                <div key={idx} className="pillar-card">
                  <div className="p-icon-wrap">
                    <Icon size={28} color="#00BBA9" />
                  </div>
                  <h3 className="p-title">{p.title}</h3>
                  <p className="p-desc">{p.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <style>{`
        .page-hero {
          background: linear-gradient(135deg, #07152B 0%, #0B1F3A 100%);
          padding: 60px 0 80px;
          color: #FFFFFF;
          text-align: center;
        }

        .page-tag {
          font-size: 12px;
          font-weight: 700;
          color: #00BBA9;
          background: rgba(0, 187, 169, 0.12);
          padding: 4px 12px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 1px;
          display: inline-block;
          margin-bottom: 12px;
        }

        .page-title {
          font-size: 38px;
          font-weight: 800;
          margin-bottom: 12px;
        }

        .page-subtitle {
          font-size: 16px;
          color: #94A3B8;
          max-width: 650px;
          margin: 0 auto;
        }

        .stats-section {
          background-color: #07152B;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding: 30px 0;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          text-align: center;
        }

        .stat-value {
          display: block;
          font-size: 36px;
          font-weight: 800;
          color: #00BBA9;
        }

        .stat-label {
          font-size: 13.5px;
          color: #94A3B8;
          font-weight: 500;
        }

        .story-section {
          background-color: #FFFFFF;
        }

        .story-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 50px;
          align-items: center;
        }

        .body-text {
          font-size: 15px;
          color: #475569;
          line-height: 1.7;
          margin-bottom: 16px;
        }

        .mission-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 20px;
        }

        .m-item {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14.5px;
          font-weight: 600;
          color: #0F172A;
        }

        .story-image-box {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(11, 31, 58, 0.15);
        }

        .story-img {
          width: 100%;
          height: 380px;
          object-fit: cover;
          display: block;
        }

        .story-badge {
          position: absolute;
          bottom: 20px;
          left: 20px;
          background: rgba(7, 21, 43, 0.9);
          backdrop-filter: blur(8px);
          border: 1px solid #00BBA9;
          padding: 12px 20px;
          border-radius: 12px;
          color: #FFFFFF;
        }

        .badge-num {
          display: block;
          font-size: 22px;
          font-weight: 800;
          color: #00BBA9;
        }

        .badge-txt {
          font-size: 12px;
          color: #CBD5E1;
        }

        .pillars-section {
          background-color: #F8FAFC;
        }

        .pillars-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }

        .pillar-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          padding: 28px 20px;
          transition: var(--transition);
        }

        .pillar-card:hover {
          transform: translateY(-4px);
          border-color: #00BBA9;
          box-shadow: var(--shadow-md);
        }

        .p-icon-wrap {
          width: 52px;
          height: 52px;
          background: rgba(0, 187, 169, 0.12);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
        }

        .p-title {
          font-size: 17px;
          font-weight: 700;
          color: #0F172A;
          margin-bottom: 10px;
        }

        .p-desc {
          font-size: 13.5px;
          color: #64748B;
          line-height: 1.6;
        }

        @media (max-width: 992px) {
          .story-grid, .stats-grid, .pillars-grid {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 640px) {
          .stats-grid, .pillars-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default AboutUs;
