import React, { useRef } from 'react';
import {
  Car, Plane, Compass, Briefcase, Building2, ShoppingBag,
  CheckCircle, ArrowRight, Bike
} from 'lucide-react';
import useReveal from '../hooks/useReveal';

const Services = ({ openBookingModal }) => {
  const pageRef = useRef(null);
  useReveal(pageRef);


  const allServices = [
    {
      id: 'auto',
      title: 'Auto Ride',
      tag: 'Short Distance & Metered',
      icon: Bike,
      image: '/vehicles/auto.jpg',
      description: 'The quickest way across town for short hops — metered auto rickshaws with verified drivers and no haggling over fare.',
      features: ['Lowest fare per km', 'Ideal for 1-5 km trips', 'Beats peak-hour traffic', '3 passenger seating']
    },
    {
      id: 'city',
      title: 'City Ride (Local Cabs)',
      tag: 'Point-to-Point & Hourly',
      icon: Car,
      image: '/vehicles/dzire.jpg',
      description: 'Hassle-free daily city travel with instant driver allocation, clean sedans, and transparent fixed fare per km.',
      features: ['Zero surge pricing', '4hr, 8hr, 12hr package rentals', 'Instant driver tracking', 'AC always enabled']
    },
    {
      id: 'airport',
      title: 'Airport Transfer',
      tag: 'Pickup & Drop Guarantee',
      icon: Plane,
      image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=700&q=80',
      description: 'Never miss a flight again. Punctual 24x7 pickups from your doorstep directly to airport terminals with flight tracking.',
      features: ['60 mins free waiting time at airport', 'Flight delay tracking', 'Luggage assistance', 'Toll taxes included']
    },
    {
      id: 'outstation',
      title: 'Outstation Travel',
      tag: 'One-Way & Round Trips',
      icon: Compass,
      image: '/vehicles/ertiga.jpg',
      description: 'Comfortable long-distance travel between cities. Pay only for one-way drop or book a round trip for weekend getaways.',
      features: ['Experienced highway drivers', 'No hidden driver allowance fees', 'Night charge free', 'All India Tourist Permit']
    },
    {
      id: 'sedan',
      title: 'Premium Sedan',
      tag: 'Comfort & Style',
      icon: Car,
      image: '/vehicles/dzire.jpg',
      description: 'Elegant Dzire, Etios, and Honda Amaze sedans featuring spacious legroom and premium upholstery.',
      features: ['4 Passenger seating', '2 Large Suitcase capacity', 'Water bottles & chargers', 'Smooth quiet ride']
    },
    {
      id: 'suv',
      title: 'SUV & Innova Crysta',
      tag: 'Group & Family Travel',
      icon: Car,
      image: '/vehicles/innova-crysta.jpg',
      description: 'Luxury MUVs and SUVs designed for family vacations, wedding delegates, and heavy luggage travel.',
      features: ['6 to 7 Seats capacity', 'Rear AC vents', 'Ample luggage space', 'Reclining leather seats']
    },
    {
      id: 'corporate',
      title: 'Corporate Travel',
      tag: 'B2B Mobility Solutions',
      icon: Briefcase,
      image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=700&q=80',
      description: 'Tailored executive travel for business travelers, client hospitality, and monthly corporate employee commutes.',
      features: ['Centralized monthly invoicing', 'GST compliant bills', 'Dedicated Account Manager', 'Priority cab dispatch']
    },
    {
      id: 'hotel',
      title: 'Hotel Pickup & Transfers',
      tag: 'Hospitality Partner Cabs',
      icon: Building2,
      image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=700&q=80',
      description: 'Seamless transfers between luxury hotels, convention centers, and tourist landmarks with chauffeur protocol.',
      features: ['Chauffeur uniform protocol', 'Punctual lobby pickup', 'Multi-stop city tours', 'VIP guest welcome']
    },
    {
      id: 'mall',
      title: 'Mall Pickup & Shopping Rides',
      tag: 'Convenient & Easy',
      icon: ShoppingBag,
      image: 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?auto=format&fit=crop&w=700&q=80',
      description: 'Avoid parking hassles at busy shopping centers. Call a cab right to the mall exit gate after your shopping trip.',
      features: ['Dedicated pickup bay guidance', 'Luggage loading assistance', 'Quick response time', 'Clean trunk space']
    }
  ];

  return (
    <div className="services-page animate-fade-in" ref={pageRef}>
      <div className="page-hero">
        <div className="container">
          <span className="page-tag">ZI CAB Offerings</span>
          <h1 className="page-title">Comprehensive Mobility Services</h1>
          <p className="page-subtitle">
            Whether for daily city commute, airport runs, or outstation family road trips, we have the ideal vehicle and service for you.
          </p>
        </div>
      </div>

      <section className="section-padding">
        <div className="container">
          <div className="services-list-grid" data-reveal-stagger>
            {allServices.map((s) => {
              const IconComp = s.icon;
              return (
                <div key={s.id} className="service-detail-card">
                  <div className="s-card-img-box">
                    <img src={s.image} alt={s.title} className="s-card-img" />
                    <span className="s-badge">{s.tag}</span>
                  </div>

                  <div className="s-card-content">
                    <div className="s-title-row">
                      <div className="s-icon-bg">
                        <IconComp size={22} color="#00BBA9" />
                      </div>
                      <h3 className="s-title">{s.title}</h3>
                    </div>

                    <p className="s-desc">{s.description}</p>

                    <div className="s-features-list">
                      {s.features.map((feat, i) => (
                        <div key={i} className="sf-item">
                          <CheckCircle size={15} color="#00BBA9" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>

                    <button className="btn btn-teal w-full mt-4" onClick={openBookingModal}>
                      Book This Service <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <style>{`
        .zicab-landing {
          .services-list-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 30px;
          }

          .service-detail-card {
            background: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: var(--shadow-sm);
            transition: var(--transition);
            display: flex;
            flex-direction: column;
          }

          .service-detail-card:hover {
            transform: translateY(-5px);
            box-shadow: var(--shadow-lg);
            border-color: #00BBA9;
          }

          .s-card-img-box {
            position: relative;
            height: 200px;
            overflow: hidden;
          }

          .s-card-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .s-badge {
            position: absolute;
            top: 14px;
            right: 14px;
            background: rgba(7, 21, 43, 0.85);
            backdrop-filter: blur(6px);
            color: #00BBA9;
            font-size: 11.5px;
            font-weight: 600;
            padding: 4px 12px;
            border-radius: 20px;
            border: 1px solid rgba(0, 187, 169, 0.4);
          }

          .s-card-content {
            padding: 24px;
            display: flex;
            flex-direction: column;
            flex: 1;
          }

          .s-title-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
          }

          .s-icon-bg {
            width: 40px;
            height: 40px;
            background: rgba(0, 187, 169, 0.1);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .s-title {
            font-size: 19px;
            font-weight: 700;
            color: #0F172A;
          }

          .s-desc {
            font-size: 14px;
            color: #64748B;
            line-height: 1.6;
            margin-bottom: 16px;
          }

          .s-features-list {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 16px;
            background: #F8FAFC;
            padding: 12px;
            border-radius: 10px;
          }

          .sf-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12.5px;
            color: #334155;
            font-weight: 500;
          }

          .mt-4 {
            margin-top: auto;
          }

          @media (max-width: 992px) {
            .services-list-grid {
              grid-template-columns: 1fr;
            }
          }

          /* Nine full-bleed cards is a very long phone page — shrink the hero
             image and keep the feature list two-up so each card stays compact. */
          @media (max-width: 640px) {
            .services-list-grid {
              gap: 18px;
            }
            .s-card-img-box {
              height: 140px;
            }
            .s-card-content {
              padding: 18px 16px;
            }
            .s-title {
              font-size: 17px;
            }
            .s-desc {
              font-size: 13px;
              margin-bottom: 12px;
            }
            .s-features-list {
              gap: 7px;
              padding: 10px;
              margin-bottom: 14px;
            }
            .sf-item {
              font-size: 11.5px;
            }
          }
      
        }
      `}</style>
    </div>
  );
};

export default Services;
