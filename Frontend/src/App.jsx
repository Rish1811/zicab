import React, { useState } from 'react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import BookingModal from './components/BookingModal';
import Home from './pages/Home';
import AboutUs from './pages/AboutUs';
import Services from './pages/Services';
import Corporate from './pages/Corporate';
import Partner from './pages/Partner';
import Driver from './pages/Driver';
import Advertise from './pages/Advertise';
import ContactUs from './pages/ContactUs';
import { waLink } from './siteConfig';

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const openBookingModal = (vehicle = null) => {
    setSelectedVehicle(vehicle);
    setIsBookingOpen(true);
  };

  const closeBookingModal = () => {
    setIsBookingOpen(false);
  };

  return (
    <div className="app-container">
      {/* Reading progress, driven entirely by CSS scroll timeline */}
      <div className="scroll-progress" aria-hidden="true" />

      {/* Navigation Header */}
      <Navbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        openBookingModal={() => openBookingModal()} 
      />

      {/* Main Content Area */}
      <main className="app-main-content">
        {activeTab === 'home' && (
          <Home 
            openBookingModal={() => openBookingModal()} 
            setActiveTab={setActiveTab} 
          />
        )}
        {activeTab === 'about' && (
          <AboutUs 
            openBookingModal={() => openBookingModal()} 
          />
        )}
        {activeTab === 'services' && (
          <Services 
            openBookingModal={() => openBookingModal()} 
          />
        )}
        {activeTab === 'corporate' && (
          <Corporate />
        )}
        {activeTab === 'partner' && (
          <Partner />
        )}
        {activeTab === 'driver' && (
          <Driver />
        )}
        {activeTab === 'advertise' && (
          <Advertise />
        )}
        {activeTab === 'contact' && (
          <ContactUs />
        )}
      </main>

      {/* Floating WhatsApp support button */}
      <a
        className="wa-float"
        href={waLink()}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat with ZI CAB support on WhatsApp"
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
          <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.13-.42-2.15-1.33-.8-.71-1.34-1.59-1.5-1.89-.15-.3-.02-.46.13-.61.15-.15.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47 0 1.46 1.06 2.87 1.21 3.07.15.2 2.09 3.2 5.07 4.37 2.98 1.17 2.98.78 3.52.73.54-.05 1.75-.71 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.82L2 22l5.4-1.42a9.86 9.86 0 004.64 1.18c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2z" />
        </svg>
      </a>

      {/* Footer */}
      <Footer 
        setActiveTab={setActiveTab} 
        openBookingModal={() => openBookingModal()} 
      />

      {/* Interactive Booking Modal */}
      <BookingModal 
        isOpen={isBookingOpen} 
        onClose={closeBookingModal} 
        selectedVehicle={selectedVehicle}
      />
    </div>
  );
}

export default App;
