import React, { useRef, useState } from 'react';
import { UserCheck, Shield, Clock, Award, CheckCircle2, FileText, Smartphone } from 'lucide-react';
import useReveal from '../hooks/useReveal';

const Driver = () => {
  const pageRef = useRef(null);
  useReveal(pageRef);

  const [submitted, setSubmitted] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Bengaluru');
  const [experience, setExperience] = useState('3-5 Years');

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const requiredDocs = [
    'Commercial Driving License (Yellow Badge / DL)',
    'Aadhaar Card & PAN Card',
    'Current Police Verification Certificate',
    'Vehicle RC Book & Active Fitness Certificate',
    'Commercial Vehicle Insurance & All-India Permit'
  ];

  return (
    <div className="driver-page animate-fade-in" ref={pageRef}>
      <div className="page-hero">
        <div className="container">
          <span className="page-tag">Join ZI CAB Captains</span>
          <h1 className="page-title">Drive With Dignity, Security & Higher Income</h1>
          <p className="page-subtitle">
            Become a ZI CAB Driver Partner. Enjoy daily/weekly settlements, zero arbitrary account blocks, and dedicated support for captains.
          </p>
        </div>
      </div>

      <section className="section-padding">
        <div className="container driver-grid">
          {/* Left Details */}
          <div className="driver-info">
            <h2 className="section-title">Captain Benefits at ZI CAB</h2>
            
            <div className="driver-perks" data-reveal-stagger>
              <div className="d-perk">
                <Clock size={24} color="#00BBA9" />
                <div>
                  <h4>Flexible Shift Timings</h4>
                  <p>Choose your own operating hours. Drive outstation long trips or local airport runs whenever you wish.</p>
                </div>
              </div>

              <div className="d-perk">
                <Shield size={24} color="#00BBA9" />
                <div>
                  <h4>₹5 Lakh Insurance Cover</h4>
                  <p>Free accidental insurance and medical assistance for every active ZI CAB driver partner.</p>
                </div>
              </div>

              <div className="d-perk">
                <Award size={24} color="#00BBA9" />
                <div>
                  <h4>Zero Dry-Run Guarantee</h4>
                  <p>Outstation trips are optimized with return bookings to save fuel and maximize profit per trip.</p>
                </div>
              </div>
            </div>

            <div className="docs-box mt-8">
              <h3 className="docs-title"><FileText size={18} color="#00BBA9" /> Documents Required for Verification</h3>
              <div className="docs-list">
                {requiredDocs.map((doc, idx) => (
                  <div key={idx} className="doc-item">
                    <CheckCircle2 size={16} color="#00BBA9" />
                    <span>{doc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Driver Onboarding Form */}
          <div className="driver-form-card" data-reveal>
            <h3 className="form-card-title">Driver Onboarding Form</h3>
            <p className="form-card-sub">Start driving with ZI CAB within 24 hours.</p>

            {submitted ? (
              <div className="form-success text-center py-6">
                <CheckCircle2 size={50} color="#00BBA9" className="mx-auto mb-4" />
                <h4 className="text-xl font-bold text-white mb-2">Registration Submitted!</h4>
                <p className="text-gray-300 text-sm">
                  Our Driver Onboarding Center will call <strong>{phone}</strong> to schedule document verification.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="c-form">
                <div className="input-group">
                  <label>Full Driver Name</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Enter full name as per DL"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                  />
                </div>

                <div className="input-group">
                  <label>Mobile Number</label>
                  <input 
                    type="tel" 
                    required 
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="input-group">
                  <label>Current Operating City</label>
                  <select value={city} onChange={(e) => setCity(e.target.value)}>
                    <option value="Bengaluru">Bengaluru</option>
                    <option value="Mangaluru">Mangaluru</option>
                    <option value="Hubballi">Hubballi</option>
                  </select>
                </div>

                <div className="input-group">
                  <label>Driving Experience</label>
                  <select value={experience} onChange={(e) => setExperience(e.target.value)}>
                    <option value="1-3 Years">1 - 3 Years</option>
                    <option value="3-5 Years">3 - 5 Years</option>
                    <option value="5+ Years">5+ Years</option>
                  </select>
                </div>

                <button type="submit" className="btn btn-teal w-full mt-4">
                  Register as Driver Captain
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <style>{`
        .zicab-landing {
          .driver-grid {
            display: grid;
            grid-template-columns: 1.1fr 0.9fr;
            gap: 50px;
            align-items: start;
          }

          .driver-perks {
            display: flex;
            flex-direction: column;
            gap: 20px;
            margin-top: 20px;
          }

          .d-perk {
            display: flex;
            gap: 16px;
            background: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-radius: 12px;
            padding: 20px;
          }

          .d-perk h4 {
            font-size: 16px;
            font-weight: 700;
            color: #0F172A;
            margin-bottom: 4px;
          }

          .d-perk p {
            font-size: 13.5px;
            color: #64748B;
            line-height: 1.5;
          }

          .docs-box {
            background: #07152B;
            border: 1px solid rgba(0, 187, 169, 0.3);
            border-radius: 12px;
            padding: 20px;
            color: #FFFFFF;
          }

          .docs-title {
            font-size: 16px;
            font-weight: 700;
            color: #00BBA9;
            margin-bottom: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .docs-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }

          .doc-item {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 13.5px;
            color: #CBD5E1;
          }

          .driver-form-card {
            background: #0C1B30;
            border: 1px solid rgba(0, 187, 169, 0.3);
            border-radius: 16px;
            padding: 32px;
            color: #FFFFFF;
            box-shadow: 0 16px 36px rgba(0, 0, 0, 0.3);
          }

          @media (max-width: 992px) {
            .driver-grid {
              grid-template-columns: 1fr;
              gap: 34px;
            }
          }

          @media (max-width: 640px) {
            .driver-form-card, .d-perk, .docs-box {
              padding: 20px 18px;
            }
            .d-perk {
              flex-direction: column;
              gap: 10px;
            }
          }
      
        }
      `}</style>
    </div>
  );
};

export default Driver;
