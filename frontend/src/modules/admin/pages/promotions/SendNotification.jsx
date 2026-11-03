import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Car,
  ChevronRight,
  Filter,
  Volume2,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Plus,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { adminService } from '../../services/adminService';

const Motion = motion;
const LIST_PATH = '/admin/promotions/send-notification';
const CREATE_PATH = '/admin/promotions/send-notification/create';
const inputClass =
  'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-[#FFC400] focus:ring-1 focus:ring-[#FFC400] outline-none transition-colors disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed';
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

const createInitialFormData = () => ({
  service_location_id: '',
  send_to: '',
  vehicle_type_ids: [],
  push_title: '',
  message: '',
  image: null,
  voice_enabled: false,
  voice_text: '',
  voice_language: 'en',
});

const VOICE_LANGUAGES = [
  { code: 'en', label: 'English', speech: 'en-IN' },
  { code: 'hi', label: 'Hindi', speech: 'hi-IN' },
  { code: 'kn', label: 'Kannada', speech: 'kn-IN' },
  { code: 'ta', label: 'Tamil', speech: 'ta-IN' },
  { code: 'te', label: 'Telugu', speech: 'te-IN' },
];

/// Vehicle types grouped the way drivers think of them, by the icon each uses.
const vehicleCategory = (vehicle = {}) => {
  const icon = String(vehicle.icon_types || '').toLowerCase();
  if (icon === 'auto') return 'Auto';
  if (icon === 'bike') return 'Bike';
  if (['truck', 'lcv', 'mcv', 'hcv', 'ehcv'].includes(icon)) return 'Truck';
  return 'Cab';
};
const VEHICLE_CATEGORY_ORDER = ['Cab', 'Auto', 'Bike', 'Truck'];
const vehicleIdOf = (vehicle) => String(vehicle._id || vehicle.id);

const createInitialFilters = () => ({
  service_location_id: '',
  send_to: '',
});

const HeaderBlock = ({ isCreateRoute, onBack }) => (
  <div className="mb-6">
    <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
      <span>Promotions</span>
      <ChevronRight size={12} />
      <span className="text-gray-700">{isCreateRoute ? 'Create Push Notification' : 'Push Notifications'}</span>
    </div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-xl text-gray-900 font-bold">{isCreateRoute ? 'Create Push Notification' : 'Push Notifications'}</h1>
      {isCreateRoute ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>
      ) : null}
    </div>
  </div>
);

const SectionCard = ({ icon: Icon, title, description, children }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-6">
    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
      <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-500">
        <Icon size={18} />
      </div>
      <div>
        <h3 className="text-sm text-gray-900 font-bold">{title}</h3>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
    </div>
    {children}
  </div>
);

const FieldLabel = ({ children, required = false }) => (
  <label className={labelClass}>
    {children}
    {required ? ' *' : ''}
  </label>
);

const buildDeliveryAlertMessage = (responseData) => {
  const delivery = responseData?.data?.delivery || {};
  const deliveredCount = Number(delivery.deliveredCount || 0);
  const failedCount = Number(delivery.failedCount || 0);
  const targetCount = Number(delivery.targetCount || 0);
  const invalidTokenCount = Number(delivery.invalidTokenCount || 0);
  const reason = String(delivery.reason || '').trim();

  if (!delivery.attempted) {
    return reason || responseData?.data?.message || 'Notification created, but push delivery is not configured.';
  }

  const parts = [`Notification sent. Delivered to ${deliveredCount} of ${targetCount} device(s).`];

  if (failedCount > 0) {
    parts.push(`${failedCount} failed.`);
  }

  if (invalidTokenCount > 0) {
    parts.push(`${invalidTokenCount} invalid token(s) were cleaned up.`);
  }

  if (reason) {
    parts.push(reason);
  }

  return parts.join(' ');
};

const SendNotification = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isCreateRoute = location.pathname === CREATE_PATH;

  const [notifications, setNotifications] = useState([]);
  const [serviceLocations, setServiceLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(createInitialFormData);
  const [filters, setFilters] = useState(createInitialFilters);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [audience, setAudience] = useState(null);
  const vehicleGroups = useMemo(
    () =>
      VEHICLE_CATEGORY_ORDER.map((category) => ({
        category,
        vehicles: vehicleTypes.filter((vehicle) => vehicleCategory(vehicle) === category),
      })).filter((group) => group.vehicles.length),
    [vehicleTypes],
  );

  const toggleVehicles = (ids, selected) => {
    setFormData((current) => ({
      ...current,
      vehicle_type_ids: selected
        ? [...new Set([...current.vehicle_type_ids, ...ids])]
        : current.vehicle_type_ids.filter((id) => !ids.includes(id)),
    }));
  };

  const previewVoice = () => {
    const text = (formData.voice_text || formData.message).trim();
    if (!text || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = VOICE_LANGUAGES.find((item) => item.code === formData.voice_language)?.speech || 'en-IN';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  // The count updates as the audience changes; it is only a guide, so a failure
  // just hides it.
  const audienceVehicles = formData.vehicle_type_ids.join(',');
  useEffect(() => {
    if (!isCreateRoute || !formData.send_to) {
      setAudience(null);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      adminService
        .getNotificationAudience({
          service_location_id: formData.service_location_id || undefined,
          send_to: formData.send_to,
          vehicle_type_ids: audienceVehicles || undefined,
        })
        .then((res) => {
          if (active) setAudience(res?.data?.data || res?.data || res || null);
        })
        .catch(() => {
          if (active) setAudience(null);
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [audienceVehicles, formData.send_to, formData.service_location_id, isCreateRoute]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const bootstrapData = await adminService.getPromotionsBootstrap();
      setNotifications(Array.isArray(bootstrapData?.data?.notifications) ? bootstrapData.data.notifications : []);
      setServiceLocations(Array.isArray(bootstrapData?.data?.service_locations) ? bootstrapData.data.service_locations : []);
    } catch (error) {
      console.error('Error fetching notifications data:', error);
      setNotifications([]);
      setServiceLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Vehicle types are only needed to narrow a drivers-only push.
  useEffect(() => {
    if (formData.send_to !== 'drivers' || vehicleTypes.length) return;
    adminService
      .getVehicleTypes()
      .then((res) => {
        const results = res?.data?.results || res?.results || [];
        setVehicleTypes(Array.isArray(results) ? results.filter((v) => v.active !== false) : []);
      })
      .catch((error) => console.error('Error fetching vehicle types:', error));
  }, [formData.send_to, vehicleTypes.length]);

  useEffect(() => {
    if (!isCreateRoute) {
      setFormData(createInitialFormData());
      setImagePreview(null);
    }
  }, [isCreateRoute]);

  const rows = useMemo(() => {
    return notifications.filter((item) => {
      const matchesAudience =
        !filters.send_to || String(item.send_to || '').toLowerCase() === String(filters.send_to).toLowerCase();
      const matchesLocation =
        !filters.service_location_id ||
        String(item.service_location_id || item.service_location?._id || '') === String(filters.service_location_id);

      return matchesAudience && matchesLocation;
    });
  }, [filters, notifications]);

  const handleFieldChange = (key, value) => {
    setFormData((current) => ({ ...current, [key]: value }));
  };

  const handleFilterChange = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(createInitialFilters());
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFormData((current) => ({ ...current, image: file }));
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSend = async (event) => {
    event.preventDefault();

    if (!formData.service_location_id || !formData.send_to || !formData.push_title || !formData.message) {
      alert('Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      let imageData = '';
      if (formData.image) {
        imageData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(formData.image);
        });
      }

      const payload = {
        service_location_id: formData.service_location_id,
        send_to: formData.send_to,
        vehicle_type_ids: formData.send_to === 'drivers' ? formData.vehicle_type_ids : [],
        voice_enabled: formData.voice_enabled,
        voice_text: formData.voice_enabled ? formData.voice_text : '',
        voice_language: formData.voice_language,
        push_title: formData.push_title,
        title: formData.push_title,
        message: formData.message,
        image: imageData,
      };

      const data = await adminService.sendNotification(payload);

      if (data.success) {
        const deliveryMessage = buildDeliveryAlertMessage(data);
        setFormData(createInitialFormData());
        setImagePreview(null);
        await fetchData();
        navigate(LIST_PATH);
        alert(deliveryMessage);
      } else {
        alert(data.message || 'Failed to send notification');
      }
    } catch (error) {
      console.error('Send notification error:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this notification?')) return;

    try {
      const data = await adminService.deleteNotification(id);
      if (data.success) {
        await fetchData();
      }
    } catch (error) {
      console.error('Delete notification error:', error);
    }
  };

  return (
    <div className="min-h-full bg-gray-50 text-gray-900">
      <HeaderBlock isCreateRoute={isCreateRoute} onBack={() => navigate(LIST_PATH)} />

      <AnimatePresence mode="wait">
        {!isCreateRoute ? (
          <Motion.div
            key="notification-list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                  <span className="font-medium text-gray-600">Push notifications management</span>
                  <span className="hidden sm:inline text-gray-300">|</span>
                  <span>Total: {rows.length}</span>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen((current) => !current)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Filter size={16} /> {isFilterOpen ? 'Hide Filters' : 'Filters'}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(CREATE_PATH)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold !text-[#0B1220] !bg-[#FFC400] border-none rounded-lg hover:brightness-95 transition-colors"
                  >
                    <Plus size={16} /> Create Push Notification
                  </button>
                </div>
              </div>

              {isFilterOpen ? (
                <div className="mt-5 grid grid-cols-1 gap-4 border-t border-gray-100 pt-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <div>
                    <FieldLabel>Service Location</FieldLabel>
                    <select
                      value={filters.service_location_id}
                      onChange={(event) => handleFilterChange('service_location_id', event.target.value)}
                      className={inputClass}
                    >
                      <option value="">All service locations</option>
                      {serviceLocations.map((loc) => (
                        <option key={loc._id || loc.id} value={loc._id || loc.id}>
                          {loc.service_location_name || loc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <FieldLabel>Send To</FieldLabel>
                    <select
                      value={filters.send_to}
                      onChange={(event) => handleFilterChange('send_to', event.target.value)}
                      className={inputClass}
                    >
                      <option value="">All audiences</option>
                      <option value="all">All</option>
                      <option value="drivers">Drivers</option>
                      <option value="users">Users</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 md:w-auto"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50">
                    <tr className="text-xs font-semibold text-gray-500">
                      <th className="px-6 py-4">Push Title</th>
                      <th className="px-6 py-4">Message</th>
                      <th className="px-6 py-4">Service Location</th>
                      <th className="px-6 py-4">Send To</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-16 text-center text-sm text-gray-400">
                          Loading notifications...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center gap-3 text-gray-400">
                            <Bell size={40} strokeWidth={1.5} />
                            <p className="text-sm font-medium">No notifications found.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      rows.map((item) => (
                        <tr key={item._id || item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-50 text-yellow-500">
                                <Bell size={16} />
                              </span>
                              <span className="text-sm font-semibold text-gray-800">{item.push_title}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 max-w-[340px] truncate">{item.message}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{item.service_location_name || '-'}</td>
                          <td className="px-6 py-4 text-sm text-gray-600 capitalize">
                            {item.send_to || 'all'}
                            {item.voice_enabled ? (
                              <span className="block text-xs text-gray-400 normal-case">Read out loud</span>
                            ) : null}
                            {item.vehicle_type_names?.length ? (
                              <span className="block text-xs text-gray-400 normal-case">{item.vehicle_type_names.join(', ')}</span>
                            ) : null}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleDelete(item._id || item.id)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-rose-600 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Motion.div>
        ) : (
          <Motion.form
            key="notification-create"
            onSubmit={handleSend}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]"
          >
            <div className="space-y-6">
              <SectionCard
                icon={Send}
                title="Notification Configuration"
                description="Choose the audience, write the message, and send the push right away."
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <FieldLabel required>Service Location</FieldLabel>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <select
                        value={formData.service_location_id}
                        onChange={(e) => handleFieldChange('service_location_id', e.target.value)}
                        className={`${inputClass} pl-10`}
                        required
                      >
                        <option value="">Select Service Location</option>
                        {serviceLocations.map((loc) => (
                          <option key={loc._id || loc.id} value={loc._id || loc.id}>
                            {loc.service_location_name || loc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <FieldLabel required>Send To</FieldLabel>
                    <div className="relative">
                      <Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <select
                        value={formData.send_to}
                        onChange={(e) => handleFieldChange('send_to', e.target.value)}
                        className={`${inputClass} pl-10`}
                        required
                      >
                        <option value="">Select</option>
                        <option value="all">All</option>
                        <option value="drivers">Drivers</option>
                        <option value="users">Users</option>
                      </select>
                    </div>
                  </div>

                  {formData.send_to === 'drivers' && (
                    <div className="md:col-span-2">
                      <FieldLabel>Vehicle Category</FieldLabel>
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={formData.vehicle_type_ids.length === 0}
                          onChange={() => handleFieldChange('vehicle_type_ids', [])}
                          className="h-4 w-4 accent-amber-500 [color-scheme:light]"
                        />
                        All vehicles
                      </label>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {vehicleGroups.map(({ category, vehicles }) => {
                          const ids = vehicles.map(vehicleIdOf);
                          const allChosen = ids.every((id) => formData.vehicle_type_ids.includes(id));
                          return (
                            <div key={category} className="rounded-lg border border-gray-200 p-3">
                              <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                <input
                                  type="checkbox"
                                  checked={allChosen}
                                  onChange={() => toggleVehicles(ids, !allChosen)}
                                  className="h-4 w-4 accent-amber-500 [color-scheme:light]"
                                />
                                <Car size={15} className="text-gray-400" />
                                {category}
                              </label>
                              <div className="mt-2 space-y-1.5 pl-6">
                                {vehicles.map((vehicle) => {
                                  const id = vehicleIdOf(vehicle);
                                  const chosen = formData.vehicle_type_ids.includes(id);
                                  return (
                                    <label key={id} className="flex items-center gap-2 text-xs text-gray-600">
                                      <input
                                        type="checkbox"
                                        checked={chosen}
                                        onChange={() => toggleVehicles([id], !chosen)}
                                        className="h-3.5 w-3.5 accent-amber-500 [color-scheme:light]"
                                      />
                                      {vehicle.name}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs text-gray-400">A driver registered for any chosen vehicle gets the push.</p>
                    </div>
                  )}

                  {formData.send_to ? (
                    <div className="md:col-span-2 rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
                      {audience ? (
                        <p className="font-semibold text-gray-800">
                          This will reach about {audience.people} {audience.people === 1 ? 'person' : 'people'} on {audience.devices} {audience.devices === 1 ? 'device' : 'devices'}.
                        </p>
                      ) : (
                        <p>Counting who this will reach...</p>
                      )}
                      {formData.send_to !== 'drivers' ? (
                        <p className="mt-1 text-gray-500">Riders get it in every city: the location above only narrows drivers.</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="md:col-span-2">
                    <FieldLabel required>Push Title</FieldLabel>
                    <input
                      type="text"
                      value={formData.push_title}
                      onChange={(e) => handleFieldChange('push_title', e.target.value)}
                      className={inputClass}
                      placeholder="Enter Push Title"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <FieldLabel required>Message</FieldLabel>
                    <textarea
                      value={formData.message}
                      onChange={(e) => handleFieldChange('message', e.target.value)}
                      className={`${inputClass} min-h-[120px] resize-none`}
                      placeholder="Enter Message"
                      required
                    />
                  </div>

                  <div className="md:col-span-2 rounded-lg border border-gray-200 p-4">
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <input
                        type="checkbox"
                        checked={formData.voice_enabled}
                        onChange={(e) => handleFieldChange('voice_enabled', e.target.checked)}
                        className="h-4 w-4 accent-amber-500 [color-scheme:light]"
                      />
                      <Volume2 size={16} className="text-gray-400" />
                      Read this out loud on the phone
                    </label>
                    {formData.voice_enabled ? (
                      <div className="mt-3 space-y-3">
                        <div>
                          <FieldLabel>Voice language</FieldLabel>
                          <select
                            value={formData.voice_language}
                            onChange={(e) => handleFieldChange('voice_language', e.target.value)}
                            className={inputClass}
                          >
                            {VOICE_LANGUAGES.map((language) => (
                              <option key={language.code} value={language.code}>{language.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <FieldLabel>Words to read (leave blank to read the message)</FieldLabel>
                          <textarea
                            value={formData.voice_text}
                            onChange={(e) => handleFieldChange('voice_text', e.target.value)}
                            maxLength={500}
                            rows={3}
                            className={inputClass}
                            placeholder="Write in the language chosen above"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={previewVoice}
                          disabled={!(formData.voice_text || formData.message).trim()}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Volume2 size={14} />
                          Listen
                        </button>
                        <p className="text-xs text-gray-400">
                          The preview uses this browser's voice, so the phone may sound different. iPhones only read it while the app is open.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="md:col-span-2">
                    <FieldLabel>Notification Banner (320px x 320px)</FieldLabel>
                    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5">
                      {imagePreview ? (
                        <div className="space-y-4">
                          <img
                            src={imagePreview}
                            alt="Notification preview"
                            className="h-48 w-48 rounded-lg object-cover border border-gray-200 bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setImagePreview(null);
                              setFormData((current) => ({ ...current, image: null }));
                            }}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Remove Image
                          </button>
                        </div>
                      ) : (
                        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 py-8 text-center">
                          <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                          <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-white border border-gray-200 text-yellow-500">
                            <ImageIcon size={20} />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">Upload Image</p>
                            <p className="text-xs text-gray-400">Optional banner image for the push notification.</p>
                          </div>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 !bg-[#FFC400] !text-[#0B1220] rounded-lg text-sm font-bold hover:brightness-95 border-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                  Send Notification
                </button>
                <button
                  type="button"
                  onClick={() => navigate(LIST_PATH)}
                  className="w-full py-3 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm text-gray-900 mb-2 font-bold">How It Works</h3>
                <p className="text-xs leading-5 text-gray-500">
                  Service location, send-to audience, push title, message, aur optional notification banner ke saath admin se direct push fire hota hai.
                </p>
              </div>
            </div>
          </Motion.form>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SendNotification;
