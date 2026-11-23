import React, { useCallback, useEffect, useState } from 'react';
import { Check, Gift, Loader2, PackageCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const unwrap = (response) => response?.data?.data ?? response?.data ?? response ?? {};

const TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
];

const STATUS_STYLE = {
  pending: 'bg-yellow-50 text-yellow-700',
  approved: 'bg-blue-50 text-blue-700',
  delivered: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
};

const RewardClaims = () => {
  const [status, setStatus] = useState('pending');
  const [audience, setAudience] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 20, counts: {} });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getRewardClaims({ status: status || undefined, audience: audience || undefined, page, limit: 20 });
      setData(unwrap(res));
    } catch (err) {
      toast.error('Failed to load claims');
    } finally {
      setLoading(false);
    }
  }, [status, audience, page]);

  useEffect(() => { load(); }, [load]);

  const update = async (claim, nextStatus) => {
    let adminNote;
    if (nextStatus === 'rejected') {
      adminNote = window.prompt('Reason for rejection (shown to rider):', '');
      if (adminNote === null) return;
    }
    setBusyId(claim.id);
    try {
      await adminService.updateRewardClaim(claim.id, { status: nextStatus, adminNote });
      toast.success(`Claim ${nextStatus}`);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update claim');
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / (data.limit || 20)));

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 lg:p-6 font-sans">
      <div className="max-w-6xl bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600"><Gift size={20} /></div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Reward Claims</h3>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">Riders' requests for unlocked ride rewards. Approving a wallet coupon credits it as ride-only cashback.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <select value={audience} onChange={(e) => { setAudience(e.target.value); setPage(1); }}
              className="mr-2 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 bg-white text-gray-700">
              <option value="">Riders &amp; Drivers</option>
              <option value="user">Riders</option>
              <option value="driver">Drivers</option>
            </select>
            {TABS.map((tab) => (
              <button key={tab.label} onClick={() => { setStatus(tab.value); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${status === tab.value ? 'bg-yellow-400 text-black' : 'bg-white border border-gray-200 text-gray-600'}`}>
                {tab.label}{tab.value && data.counts?.[tab.value] ? ` (${data.counts[tab.value]})` : ''}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-yellow-500" size={28} /></div>
        ) : data.items?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left p-3">Claimed by</th>
                  <th className="text-left p-3">Reward</th>
                  <th className="text-left p-3">Rides</th>
                  <th className="text-left p-3">Delivery details</th>
                  <th className="text-left p-3">Requested</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.items.map((claim) => (
                  <tr key={claim.id}>
                    <td className="p-3">
                      <div className="font-semibold text-gray-900">{claim.user?.name || '—'}</div>
                      <div className="text-xs text-gray-500">{claim.user?.phone || ''}</div>
                      <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${claim.audience === 'driver' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                        {claim.audience === 'driver' ? 'Driver' : 'Rider'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {claim.rewardImage && <img src={claim.rewardImage} alt="" className="w-10 h-10 object-contain rounded" />}
                        <div>
                          <div className="font-semibold text-gray-900">{claim.rewardTitle}</div>
                          <div className="text-xs text-gray-500">{claim.rewardType === 'coupon' ? `₹${claim.walletAmount} wallet coupon` : 'Gift'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-gray-700">{claim.completedRidesAtClaim} / {claim.rideCount}</td>
                    <td className="p-3 text-xs text-gray-600 max-w-[220px]">
                      {claim.address || '—'}{claim.size ? ` · Size ${claim.size}` : ''}
                    </td>
                    <td className="p-3 text-xs text-gray-500">{new Date(claim.createdAt).toLocaleString()}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold capitalize ${STATUS_STYLE[claim.status] || ''}`}>{claim.status}</span>
                      {claim.adminNote && <div className="text-[11px] text-gray-500 mt-1">{claim.adminNote}</div>}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        {busyId === claim.id ? <Loader2 size={16} className="animate-spin text-gray-400" /> : (
                          <>
                            {claim.status === 'pending' && (
                              <button title="Approve" onClick={() => update(claim, 'approved')} className="p-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100"><Check size={14} /></button>
                            )}
                            {['pending', 'approved'].includes(claim.status) && (
                              <button title="Mark delivered" onClick={() => update(claim, 'delivered')} className="p-2 rounded-lg bg-green-50 text-green-700 hover:bg-green-100"><PackageCheck size={14} /></button>
                            )}
                            {['pending', 'approved'].includes(claim.status) && (
                              <button title="Reject" onClick={() => update(claim, 'rejected')} className="p-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100"><X size={14} /></button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-8 text-sm text-gray-500">No claims here.</p>
        )}

        {totalPages > 1 && (
          <div className="p-3 border-t border-gray-100 flex items-center justify-end gap-2 text-xs">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">Prev</button>
            <span>{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">Next</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RewardClaims;
