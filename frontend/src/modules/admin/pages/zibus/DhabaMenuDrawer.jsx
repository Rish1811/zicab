import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import FoodMenuEditor from '../../../../shared/food/FoodMenuEditor';
import { zibusAdminService } from '../../services/zibusAdminService';

/// Admin view and edit of one dhaba's menu: the same rules as the partner's
/// own Menu page, for setting a menu up on a dhaba's behalf or fixing prices.
const DhabaMenuDrawer = ({ dhaba, onClose, onCountChange }) => {
  const api = useMemo(
    () => ({
      menu: () => zibusAdminService.dhabaMenu(dhaba.id),
      categories: () => zibusAdminService.foodCategories(),
      add: (payload) => zibusAdminService.addDhabaMenuItem(dhaba.id, payload),
      update: (itemId, payload) => zibusAdminService.updateDhabaMenuItem(dhaba.id, itemId, payload),
      remove: (itemId) => zibusAdminService.deleteDhabaMenuItem(dhaba.id, itemId),
    }),
    [dhaba.id],
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <div className="h-full w-full max-w-2xl space-y-4 overflow-y-auto bg-[#F8F9FA] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">Menu</p>
            <h2 className="text-xl font-black text-slate-900">{dhaba.name}</h2>
            <p className="text-xs font-semibold text-slate-500">Changes show to passengers straight away.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-200" aria-label="Close"><X size={18} /></button>
        </div>

        <FoodMenuEditor
          api={api}
          onCountChange={onCountChange}
          removeConfirmText={(item) => `Remove ${item.name} from ${dhaba.name}'s menu?`}
          emptyText="No dishes yet."
        />
      </div>
    </div>
  );
};

export default DhabaMenuDrawer;
