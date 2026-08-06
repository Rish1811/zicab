import React, { useState } from 'react';
import { Phone, Mail, MapPin, MessageSquare, ChevronDown, CheckCircle2, Send, Clock } from 'lucide-react';

const ContactUs = () => {
  const [submitted, setSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const faqs = [
    {
      q: 'Does Zi CAB charge any surge pricing during peak hours?',
      a: 'No! Zi CAB follows a strict zero-surge pricing policy. The fare displayed during booking is your final price regardless of weather, traffic, or late night hours.'
    },
    {
      q: 'What is the cancellation policy for cab bookings?',
      a: 'Riders can cancel any booking free of charge up to 1 hour before pickup time. Zero cancellation fees are charged.'
    },
    {
      q: 'How does airport pickup work?',
      a: 'Your dedicated ride coordinator tracks your flight status live. Driver waits at the arrivals pick-up point with a name sign, offering 60 minutes free waiting time.'
    },
    {
      q: 'Which payment methods are accepted?',
      a: 'We accept Cash to Driver, Google Pay, PhonePe, Paytm, Credit/Debit Cards, and Net Banking.'
    },
    {
      q: 'How are Zi CAB drivers verified?',
      a: 'All driver partners undergo strict background checks, commercial license validation, and police character verification before onboarding.'
    }
  ];

  return (
    <div className="contact-page animate-fade-in">
      <div className="page-hero">
        <div className="container">
          <span className="page-tag">24x7 Customer Helpdesk</span>
          <h1 className="page-title">We Are Here To Assist You</h1>
          <p className="page-subtitle">
            Have questions about ride bookings, corporate accounts, or fleet attachment? Connect with our dedicated support team anytime.
          </p>
        </div>
      </div>

      <section className="section-padding">
        <div className="container">
          {/* Top Contact Info Cards */}
          <div className="contact-cards-grid">
            <div className="c-info-card">
              <div className="c-icon-wrap">
                <Phone size={24} color="#00BBA9" />
              </div>
              <h3>24x7 Support Toll-Free</h3>
              <p>1800 200 9999</p>
              <span>Instant Call Assistance</span>
            </div>

            <div className="c-info-card">
              <div className="c-icon-wrap">
                <MessageSquare size={24} color="#00BBA9" />
              </div>
              <h3>WhatsApp Support</h3>
              <p>+91 98765 00000</p>
              <span>Fast Chat & Live Location</span>
            </div>

            <div className="c-info-card">
              <div className="c-icon-wrap">
                <Mail size={24} color="#00BBA9" />
              </div>
              <h3>Official Email</h3>
              <p>support@zicab.in</p>
              <span>Response within 15 mins</span>
            </div>

            <div className="c-info-card">
              <div className="c-icon-wrap">
                <MapPin size={24} color="#00BBA9" />
              </div>
              <h3>Headquarters</h3>
              <p>Indiranagar, Bengaluru</p>
              <span>Karnataka, 560038</span>
            </div>
          </div>

          {/* Form & FAQ split */}
          <div className="contact-main-grid mt-12">
            {/* Form */}
            <div className="contact-form-box">
              <h2 className="section-title">Send Us a Message</h2>
              <p className="body-text mb-6">Fill out the form below and our team will get back to you immediately.</p>

              {submitted ? (
                <div className="form-success py-8 text-center">
                  <CheckCircle2 size={50} color="#00BBA9" className="mx-auto mb-3" />
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Message Sent Successfully!</h3>
                  <p className="text-gray-600 text-sm">
                    Thank you, <strong>{name}</strong>. We have received your query and sent a confirmation to <strong>{email}</strong>.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="c-main-form">
                  <div className="form-row">
                    <div className="input-group">
                      <label>Your Name</label>
                      <input 
                        type="text" 
                        required 
                        placeholder="John Doe"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <label>Email Address</label>
                      <input 
                        type="email" 
                        required 
                        placeholder="john@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Subject</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. Booking Assistance / Receipt Request"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>

                  <div className="input-group">
                    <label>Message</label>
                    <textarea 
                      rows={5} 
                      required 
                      placeholder="Describe your query in detail..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn btn-teal">
                    Send Message <Send size={16} />
                  </button>
                </form>
              )}
            </div>

            {/* FAQ Accordion */}
            <div className="faq-box">
              <h2 className="section-title mb-6">Frequently Asked Questions</h2>
              <div className="faq-accordion">
                {faqs.map((faq, index) => (
                  <div key={index} className={`faq-item ${openFaq === index ? 'open' : ''}`}>
                    <button 
                      className="faq-q-btn"
                      onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                    >
                      <span>{faq.q}</span>
                      <ChevronDown size={18} className="faq-chevron" />
                    </button>
                    {openFaq === index && (
                      <div className="faq-a-body animate-fade-in">
                        <p>{faq.a}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <style>{`
        .contact-cards-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
        }

        .c-info-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 14px;
          padding: 24px 18px;
          text-align: center;
          transition: var(--transition);
        }

        .c-info-card:hover {
          transform: translateY(-4px);
          border-color: #00BBA9;
          box-shadow: var(--shadow-md);
        }

        .c-icon-wrap {
          width: 50px;
          height: 50px;
          background: rgba(0, 187, 169, 0.1);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 14px;
        }

        .c-info-card h3 {
          font-size: 15px;
          font-weight: 700;
          color: #0F172A;
          margin-bottom: 4px;
        }

        .c-info-card p {
          font-size: 15px;
          font-weight: 700;
          color: #00BBA9;
          margin-bottom: 4px;
        }

        .c-info-card span {
          font-size: 12px;
          color: #64748B;
        }

        .mt-12 {
          margin-top: 48px;
        }

        .contact-main-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          align-items: start;
        }

        .contact-form-box {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          padding: 32px;
        }

        .c-main-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .c-main-form label {
          font-size: 13px;
          font-weight: 600;
          color: #0F172A;
        }

        .c-main-form input, .c-main-form textarea {
          background: #F8FAFC;
          border: 1px solid #CBD5E1;
          border-radius: 8px;
          padding: 12px 14px;
          color: #0F172A;
          font-size: 14px;
          outline: none;
        }

        .c-main-form input:focus, .c-main-form textarea:focus {
          border-color: #00BBA9;
          background: #FFFFFF;
        }

        .faq-box {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          padding: 32px;
        }

        .faq-accordion {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .faq-item {
          border: 1px solid #E2E8F0;
          border-radius: 10px;
          overflow: hidden;
          transition: all 0.2s;
        }

        .faq-item.open {
          border-color: #00BBA9;
        }

        .faq-q-btn {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 18px;
          background: #F8FAFC;
          border: none;
          cursor: pointer;
          font-size: 14.5px;
          font-weight: 600;
          color: #0F172A;
          text-align: left;
        }

        .faq-chevron {
          transition: transform 0.2s;
        }

        .faq-item.open .faq-chevron {
          transform: rotate(180deg);
          color: #00BBA9;
        }

        .faq-a-body {
          padding: 16px 18px;
          font-size: 14px;
          color: #475569;
          line-height: 1.6;
          border-top: 1px solid #E2E8F0;
          background: #FFFFFF;
        }

        @media (max-width: 992px) {
          .contact-cards-grid {
            grid-template-columns: 1fr 1fr;
          }
          .contact-main-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 576px) {
          .contact-cards-grid {
            grid-template-columns: 1fr;
          }
          .form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default ContactUs;
