import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { GripVertical, Loader2, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { uploadService } from '../../../../shared/services/uploadService';

/**
 * Editor for the public marketing site (zicab.in).
 *
 * Mirrors the backend's section whitelist in landingContentService.js — adding a
 * section means updating the model, that whitelist, defaultLandingContent.js and
 * the frontend's landingFallback.js, then adding a SECTION entry here.
 *
 * Saves send only the sections that changed, because the API treats the body as
 * a partial and an accidental empty array would blank a section on the site.
 */

// Must stay in step with the ICONS map in modules/landing/useLandingContent.js —
// a name that is not in that map silently renders as a generic sparkle.
const ICON_OPTIONS = [
  'Bike', 'Briefcase', 'Building2', 'Car', 'Compass', 'Headphones',
  'Navigation', 'PhoneCall', 'Plane', 'ShieldCheck', 'ShoppingBag', 'Wallet',
];

const SECTIONS = [
  {
    key: 'services',
    title: 'Our Services',
    help: 'Cards in the "Our Services" grid on the home page.',
    itemLabel: 'service',
    fields: [
      { name: 'title', label: 'Title', placeholder: 'Airport Ride' },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'desc', label: 'Description', placeholder: 'On-time pickup & drop guaranteed', wide: true },
      { name: 'id', label: 'Slug', placeholder: 'airport', help: 'Lowercase, no spaces.' },
    ],
  },
  {
    key: 'valueProps',
    title: 'Why Choose Us',
    help: 'The "Why Choose ZI CAB?" cards.',
    itemLabel: 'point',
    fields: [
      { name: 'title', label: 'Title', placeholder: 'Verified & Trained Drivers' },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'desc', label: 'Description', placeholder: 'Professional drivers for your safe journey.', wide: true },
    ],
  },
  {
    key: 'drivers',
    title: 'Meet Our Drivers',
    help: 'Driver spotlight cards. Without a photo the card shows the initials instead.',
    itemLabel: 'driver',
    fields: [
      { name: 'name', label: 'Name', placeholder: 'Ramesh Kumar' },
      { name: 'photo', label: 'Photo', type: 'image' },
      { name: 'rating', label: 'Rating', placeholder: '4.9' },
      { name: 'trips', label: 'Trips', placeholder: '3,200+ trips' },
      { name: 'experience', label: 'Experience', placeholder: '8 years experience' },
      { name: 'vehicle', label: 'Vehicle', placeholder: 'Maruti Suzuki Dzire · KA 01 AB 1234', wide: true },
      { name: 'badge', label: 'Badge', placeholder: 'Top Driver', help: '"Top Driver" is highlighted.' },
      { name: 'city', label: 'City', placeholder: 'Bengaluru' },
    ],
  },
  {
    key: 'partners',
    title: 'Trusted By',
    help: 'Names in the scrolling partner strip.',
    itemLabel: 'partner',
    fields: [
      { name: 'name', label: 'Name', placeholder: 'TAJ Hotels' },
      { name: 'subtitle', label: 'Subtitle', placeholder: 'HOTELS' },
    ],
  },
  {
    key: 'launchCities',
    title: 'Launch Cities',
    help: 'Shown under "Where You\'ll Find Us" and in the footer.',
    itemLabel: 'city',
    fields: [
      { name: 'name', label: 'City', placeholder: 'Mysuru' },
      { name: 'note', label: 'Note', placeholder: 'South Karnataka Operations', wide: true },
    ],
  },
];

const CONTACT_FIELDS = [
  { name: 'tollFree', label: 'Toll-Free Number', placeholder: '1800 200 9999' },
  { name: 'whatsappDisplay', label: 'WhatsApp (displayed)', placeholder: '+91 98765 00000' },
  { name: 'whatsapp', label: 'WhatsApp (dial format)', placeholder: '919876500000', help: 'Country code, digits only — used to build the wa.me link.' },
  { name: 'email', label: 'Email', placeholder: 'support@zicab.in' },
  { name: 'addressShort', label: 'Short Address', placeholder: 'Grand Majestic Mall, Gandhinagar, Bengaluru', wide: true },
  { name: 'address', label: 'Full Address', placeholder: 'Grand Majestic Mall, Gandhinagar, Bengaluru, Karnataka 560009', wide: true },
  { name: 'mapsUrl', label: 'Google Maps URL', placeholder: 'https://www.google.com/maps/search/?api=1&query=...', wide: true },
];

const BRAND_FIELDS = [
  { name: 'logo', label: 'Logo', type: 'image', wide: true, help: 'Shown in the header, footer and intro screen.' },
  { name: 'wordmarkPrimary', label: 'Wordmark (first part)', placeholder: 'ZI' },
  { name: 'wordmarkSecondary', label: 'Wordmark (second part)', placeholder: 'CAB' },
  { name: 'tagline', label: 'Tagline', placeholder: 'Your Ride. Our Priority.', wide: true },
  { name: 'appBlurb', label: 'App blurb', placeholder: 'Book rides in seconds...', wide: true },
  { name: 'playStoreUrl', label: 'Google Play URL', placeholder: 'https://play.google.com/store/apps/details?id=...', wide: true, help: 'Leave blank and the badge stays unclickable.' },
  { name: 'appStoreUrl', label: 'App Store URL', placeholder: 'https://apps.apple.com/app/...', wide: true },
  { name: 'playStoreQr', label: 'Play Store QR', type: 'image' },
  { name: 'appStoreQr', label: 'App Store QR', type: 'image' },
];

const LEGAL_DOCS = [
  { key: 'terms', title: 'Terms & Conditions', path: '/terms' },
  { key: 'privacy', title: 'Privacy Policy', path: '/privacy' },
  { key: 'refund', title: 'Refund & Cancellation', path: '/refund' },
];

const inputClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors shadow-sm';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

const SectionCard = ({ title, help, children, action }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-1 h-5 bg-yellow-400 rounded-full" />
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          {help && <p className="text-xs text-gray-500 mt-0.5">{help}</p>}
        </div>
      </div>
      {action}
    </div>
    <div className="p-6">{children}</div>
  </div>
);

const ImageField = ({ value, onChange }) => {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl.startsWith('data:image/')) {
        toast.error('Please choose an image file.');
        return;
      }
      setUploading(true);
      try {
        const result = await uploadService.uploadImage(dataUrl, 'landing');
        const url = result?.secureUrl || result?.url || result?.data?.url;
        if (!url) throw new Error('Upload did not return a URL');
        onChange(url);
        toast.success('Image uploaded');
      } catch (error) {
        toast.error(error?.response?.data?.message || 'Upload failed');
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="w-14 h-14 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden shrink-0 flex items-center justify-center">
        {value ? (
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] text-gray-400">None</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder="/uploads/landing/... or paste a URL"
          className={inputClass}
        />
        <div className="flex items-center gap-2 mt-1.5">
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer hover:text-gray-900">
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading ? 'Uploading…' : 'Upload'}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
          </label>
          {value && (
            <button type="button" onClick={() => onChange('')} className="text-xs text-gray-400 hover:text-rose-500">
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const Field = ({ field, value, onChange }) => (
  <div className={field.wide ? 'sm:col-span-2' : ''}>
    <label className={labelClass}>{field.label}</label>
    {field.type === 'icon' ? (
      <select value={value || ''} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        <option value="">Default</option>
        {ICON_OPTIONS.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
    ) : field.type === 'image' ? (
      <ImageField value={value} onChange={onChange} />
    ) : (
      <input
        type="text"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        className={inputClass}
      />
    )}
    {field.help && <p className="text-xs text-gray-500 mt-1">{field.help}</p>}
  </div>
);

const RepeatableSection = ({ section, items, onChange }) => {
  const list = Array.isArray(items) ? items : [];

  const updateItem = (index, name, value) => {
    const next = list.map((item, i) => (i === index ? { ...item, [name]: value } : item));
    onChange(next);
  };

  const removeItem = (index) => onChange(list.filter((_, i) => i !== index));

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const addItem = () => onChange([...list, Object.fromEntries(section.fields.map((f) => [f.name, '']))]);

  return (
    <SectionCard
      title={section.title}
      help={section.help}
      action={
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 bg-yellow-400 hover:bg-yellow-500 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Plus size={14} /> Add
        </button>
      }
    >
      {list.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          Nothing here yet. The website falls back to its built-in copy until you add {section.itemLabel} entries.
        </p>
      ) : (
        <div className="space-y-4">
          {list.map((item, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4 relative bg-gray-50/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <GripVertical size={14} className="text-gray-300" />
                  {section.itemLabel} {index + 1}
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0}
                    className="text-xs px-2 py-1 text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">↑</button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === list.length - 1}
                    className="text-xs px-2 py-1 text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">↓</button>
                  <button type="button" onClick={() => removeItem(index)}
                    className="text-gray-400 hover:text-rose-500 p-1" aria-label={`Remove ${section.itemLabel} ${index + 1}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {section.fields.map((field) => (
                  <Field
                    key={field.name}
                    field={field}
                    value={item?.[field.name]}
                    onChange={(value) => updateItem(index, field.name, value)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
};

export default function LandingContent() {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminService.getLandingContent();
      const data = response?.data?.data || response?.data || {};
      setContent({
        services: data.services || [],
        valueProps: data.valueProps || [],
        drivers: data.drivers || [],
        partners: data.partners || [],
        launchCities: data.launchCities || [],
        contact: data.contact || {},
        legal: data.legal || {},
        brand: data.brand || {},
      });
      setDirty(false);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not load website content');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Warn before losing edits — a full page of copy is expensive to retype.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const setSection = (key, value) => {
    setContent((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
  };

  const emptySections = useMemo(
    () => SECTIONS.filter((section) => !(content?.[section.key] || []).length).map((section) => section.title),
    [content],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminService.updateLandingContent(content);
      toast.success('Website content saved');
      setDirty(false);
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500 gap-2">
        <Loader2 size={18} className="animate-spin" /> Loading website content…
      </div>
    );
  }

  if (!content) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-600">Could not load website content.</p>
        <button type="button" onClick={load} className="mt-3 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg px-3 py-1.5">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Website Content</h1>
          <p className="text-sm text-gray-500 mt-1">
            Controls the public site at zicab.in. Changes appear within about a minute.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-4 py-2 transition-colors shrink-0"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
        </button>
      </div>

      {emptySections.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
          <X size={15} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            <strong>{emptySections.join(', ')}</strong> {emptySections.length === 1 ? 'is' : 'are'} empty, so the
            website is showing built-in default copy there. Add entries to take control of {emptySections.length === 1 ? 'it' : 'them'}.
          </p>
        </div>
      )}

      {SECTIONS.map((section) => (
        <RepeatableSection
          key={section.key}
          section={section}
          items={content[section.key]}
          onChange={(value) => setSection(section.key, value)}
        />
      ))}

      <SectionCard title="Brand & App" help="Logo, wordmark and the app-store links behind the download badges.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {BRAND_FIELDS.map((field) => (
            <Field
              key={field.name}
              field={field}
              value={content.brand?.[field.name]}
              onChange={(value) => setSection('brand', { ...content.brand, [field.name]: value })}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Legal Documents"
        help="Terms, Privacy and Refund pages. Leave a field blank to keep the copy currently built into the site."
      >
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs text-amber-800">
            These are the documents your customers are held to. Have them reviewed before saving — whatever
            you put here replaces what the site shows today.
          </p>
        </div>
        <div className="space-y-6">
          {LEGAL_DOCS.map((doc) => {
            const value = content.legal?.[doc.key] || {};
            const update = (field, next) =>
              setSection('legal', { ...content.legal, [doc.key]: { ...value, [field]: next } });

            return (
              <div key={doc.key} className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-900">{doc.title}</h4>
                  <a
                    href={doc.path}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-gray-500 hover:text-gray-900 underline"
                  >
                    View page
                  </a>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>Intro</label>
                    <textarea
                      rows={2}
                      value={value.intro || ''}
                      onChange={(event) => update('intro', event.target.value)}
                      placeholder="Short line shown under the heading"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Document text</label>
                    <textarea
                      rows={12}
                      value={value.body || ''}
                      onChange={(event) => update('body', event.target.value)}
                      placeholder="Paste the full document. Separate paragraphs with a blank line."
                      className={`${inputClass} font-mono text-xs leading-relaxed`}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {value.body
                        ? `${value.body.length.toLocaleString()} characters — this replaces the built-in text.`
                        : 'Empty — the site is showing its built-in copy for this page.'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Contact Details" help="Used across the website — footer, contact page and the WhatsApp button.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CONTACT_FIELDS.map((field) => (
            <Field
              key={field.name}
              field={field}
              value={content.contact?.[field.name]}
              onChange={(value) => setSection('contact', { ...content.contact, [field.name]: value })}
            />
          ))}
          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(content.contact?.tollFreeLive)}
                onChange={(event) => setSection('contact', { ...content.contact, tollFreeLive: event.target.checked })}
                className="rounded border-gray-300 text-yellow-400 focus:ring-yellow-400"
              />
              <span className="text-sm text-gray-700">Toll-free number is live</span>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              When off, the contact page shows “Number activation in progress” instead of “Free from any Indian number”.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
