import React, { useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, MapPin, Phone, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { zibusAdminService } from '../../services/zibusAdminService';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-400 focus:outline-none';
const formatDate = (value) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

// Approve asks for the commission; reject asks for a reason the applicant will see.
const DecisionDialog = ({ dhaba, mode, onClose, onDone }) => {
  const [commission, setCommission] = useState(dhaba.commissionPercent ?? 10);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const approving = mode === 'approve';

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = approving
        ? await zibusAdminService.approveDhaba(dhaba.id, { commissionPercent: Number(commission) })
        : await zibusAdminService.rejectDhaba(dhaba.id, reason);
      toast.success(approving ? `${dhaba.name} approved and live for linking` : `${dhaba.name} rejected`);
      onDone(saved);
    } catch (error) {
      toast.error(error?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-black text-slate-900">{approving ? `Approve ${dhaba.name}?` : `Reject ${dhaba.name}?`}</h3>
        {approving ? (
          <>
            <p className="text-sm font-medium text-slate-600">
              The owner can sign in straight away. Link the dhaba to bus runs (Edit, then Link bus) so passengers can order.
            </p>
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Commission %</span>
              <input className={inputClass} type="number" min="0" max="100" step="0.5" value={commission} onChange={(event) => setCommission(event.target.value)} required />
            </label>
          </>
        ) : (
          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reason (shown to the applicant)</span>
            <textarea className={`${inputClass} min-h-[96px]`} value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={300} placeholder="e.g. FSSAI licence number could not be verified" />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Cancel</button>
          <button type="submit" disabled={busy} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black text-white disabled:opacity-50 ${approving ? 'bg-emerald-600' : 'bg-rose-600'}`}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : null} {approving ? 'Approve' : 'Reject'}
          </button>
        </div>
      </form>
    </div>
  );
};

const ApplicationCard = ({ dhaba, onDecide }) => {
  const [photo, setPhoto] = useState(0);
  const photos = dhaba.photos || [];
  const mapUrl = dhaba.location ? `https://www.google.com/maps?q=${dhaba.location.lat},${dhaba.location.lng}` : '';

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
      <div className="grid gap-0 md:grid-cols-[280px_1fr]">
        <div className="bg-slate-100">
          {photos.length ? (
            <>
              <a href={photos[photo]} target="_blank" rel="noreferrer">
                <img src={photos[photo]} alt={`${dhaba.name} photo ${photo + 1}`} className="aspect-[4/3] w-full object-cover" />
              </a>
              {photos.length > 1 ? (
                <div className="flex gap-1.5 p-2">
                  {photos.map((src, index) => (
                    <button key={src} type="button" onClick={() => setPhoto(index)} className={`h-12 w-12 overflow-hidden rounded-lg border-2 ${index === photo ? 'border-blue-500' : 'border-transparent'}`} aria-label={`Show photo ${index + 1}`}>
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center text-xs font-bold text-slate-400">No photos</div>
          )}
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-900">{dhaba.name}</h3>
              <p className="text-xs font-semibold text-slate-500">{[dhaba.highway, dhaba.city].filter(Boolean).join(' · ')}</p>
            </div>
            <p className="text-[11px] font-bold text-slate-400">Applied {formatDate(dhaba.createdAt)}</p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">Owner</dt><dd className="font-bold text-slate-800">{dhaba.ownerName || '-'}</dd></div>
            <div>
              <dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mobile</dt>
              <dd className="font-bold text-slate-800"><a href={`tel:+91${dhaba.phone}`} className="inline-flex items-center gap-1 hover:text-blue-600"><Phone size={12} /> {dhaba.phone}</a></dd>
            </div>
            <div><dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</dt><dd className="font-bold text-slate-800">{dhaba.email || '-'}</dd></div>
            <div>
              <dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">FSSAI licence</dt>
              <dd className="flex items-center gap-2 font-mono font-bold text-slate-800">
                {dhaba.fssaiNumber || '-'}
                <a href="https://foscos.fssai.gov.in/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-sans text-[11px] font-black text-blue-600">Verify <ExternalLink size={11} /></a>
              </dd>
            </div>
            <div className="sm:col-span-2"><dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">Address</dt><dd className="font-semibold text-slate-700">{dhaba.address || '-'}</dd></div>
          </dl>
          {mapUrl ? (
            <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100">
              <MapPin size={13} /> View pin on Google Maps
            </a>
          ) : null}
          {dhaba.approvalStatus === 'rejected' ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
              Rejected {formatDate(dhaba.reviewedAt)}: {dhaba.rejectionReason || 'no reason given'}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => onDecide(dhaba, 'approve')} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-700">
              <CheckCircle2 size={14} /> Approve
            </button>
            {dhaba.approvalStatus === 'pending' ? (
              <button type="button" onClick={() => onDecide(dhaba, 'reject')} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-black text-rose-600 hover:bg-rose-50">
                <XCircle size={14} /> Reject
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
};

/// Self-registered dhabas waiting for review (or rejected), newest first.
const DhabaApplications = ({ applications, emptyText, onUpdated }) => {
  const [decision, setDecision] = useState(null);

  if (!applications.length) {
    return <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm font-bold text-slate-500">{emptyText}</div>;
  }

  return (
    <div className="space-y-4">
      {applications.map((dhaba) => (
        <ApplicationCard key={dhaba.id} dhaba={dhaba} onDecide={(target, mode) => setDecision({ dhaba: target, mode })} />
      ))}
      {decision ? (
        <DecisionDialog
          dhaba={decision.dhaba}
          mode={decision.mode}
          onClose={() => setDecision(null)}
          onDone={(saved) => {
            setDecision(null);
            onUpdated(saved);
          }}
        />
      ) : null}
    </div>
  );
};

export default DhabaApplications;
