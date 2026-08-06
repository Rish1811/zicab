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
import ContactUs from './pages/ContactUs';

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
        {activeTab === 'contact' && (
          <ContactUs />
        )}
      </main>

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
