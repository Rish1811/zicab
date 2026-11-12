/**
 * Printable ticket and passenger list for the bus vendor panel. Each opens in
 * its own window and prints from there, so the panel itself is untouched.
 */

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const money = (amount = 0, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(Number(amount || 0));

const longDate = (value) => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export const PAYMENT_LABEL = { cash: 'Cash', upi: 'UPI', unpaid: 'Not paid yet' };

export const paymentLabel = (booking) =>
  PAYMENT_LABEL[booking?.counterPayment?.method] || (['user', 'channel'].includes(booking?.bookingSource) ? 'Paid online' : 'Not recorded');

export const boardingState = (booking) =>
  booking?.boarding?.boardedAt ? 'boarded' : booking?.boarding?.noShowAt ? 'no_show' : 'waiting';

const BOARDING_LABEL = { boarded: 'Boarded', no_show: 'No-show', waiting: 'Waiting' };

const PAGE_STYLE = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
  h1 { margin: 0; font-size: 20px; }
  .muted { color: #475569; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; }
  .ticket { max-width: 520px; margin: 0 auto; border: 2px dashed #94a3b8; border-radius: 12px; padding: 20px; }
  .row { display: flex; justify-content: space-between; gap: 16px; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; }
  .value { font-size: 15px; font-weight: 700; margin-top: 2px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; margin-top: 16px; }
  .pnr { font-size: 26px; font-weight: 800; letter-spacing: .12em; }
  @media print { body { padding: 0; } button { display: none; } }
`;

/// Opened straight from the click, so the browser doesn't block it as a pop-up;
/// filled in once the data is ready.
export const openPrintWindow = (title) => {
  const win = window.open('', '_blank', 'width=820,height=900');
  if (win) {
    win.document.write(`<!doctype html><title>${escapeHtml(title)}</title><p style="font-family:Arial;padding:24px">Preparing ${escapeHtml(title.toLowerCase())}...</p>`);
  }
  return win;
};

const fillAndPrint = (win, title, body) => {
  if (!win || win.closed) return false;
  win.document.open();
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head><body>${body}<p style="text-align:center;margin-top:24px"><button onclick="window.print()">Print</button></p></body></html>`);
  win.document.close();
  // Wait for the QR image before printing.
  const images = [...win.document.images];
  Promise.all(images.map((img) => (img.complete ? null : new Promise((done) => { img.onload = done; img.onerror = done; }))))
    .then(() => { win.focus(); win.print(); });
  return true;
};

export const printTicket = (win, ticket) => {
  const seats = (ticket.activeSeats || []).map((seat) => seat.seatLabel).join(', ');
  const route = ticket.routeSnapshot || {};
  const body = `
    <div class="ticket">
      <div class="row">
        <div><h1>ZI Bus ticket</h1><p class="muted" style="margin:4px 0 0">${escapeHtml(route.operatorName || '')} ${escapeHtml(route.busName || '')}</p></div>
        ${ticket.qrDataUrl ? `<img src="${ticket.qrDataUrl}" alt="Ticket QR" width="120" height="120">` : ''}
      </div>
      <div style="margin-top:12px"><div class="label">PNR</div><div class="pnr">${escapeHtml(ticket.pnr || ticket.bookingCode)}</div></div>
      <div class="grid">
        <div><div class="label">Passenger</div><div class="value">${escapeHtml(ticket.passenger?.name || '')}</div></div>
        <div><div class="label">Mobile</div><div class="value">${escapeHtml(ticket.passenger?.phone || '')}</div></div>
        <div><div class="label">From</div><div class="value">${escapeHtml(route.originCity || '')}</div></div>
        <div><div class="label">To</div><div class="value">${escapeHtml(route.destinationCity || '')}</div></div>
        <div><div class="label">Date</div><div class="value">${escapeHtml(longDate(ticket.travelDate))}</div></div>
        <div><div class="label">Departure</div><div class="value">${escapeHtml(route.departureTime || '')}</div></div>
        <div><div class="label">Seats</div><div class="value">${escapeHtml(seats)}</div></div>
        <div><div class="label">Boarding point</div><div class="value">${escapeHtml(ticket.boardingPoint?.pointName || ticket.boardingPoint?.city || route.originCity || '')}</div></div>
        <div><div class="label">Fare</div><div class="value">${escapeHtml(money(ticket.amount, ticket.currency))}</div></div>
        <div><div class="label">Payment</div><div class="value">${escapeHtml(paymentLabel(ticket))}</div></div>
      </div>
      <p class="muted" style="margin:16px 0 0;font-size:12px">Show this ticket or its QR code to the conductor when you board.</p>
    </div>`;
  return fillAndPrint(win, `Ticket ${ticket.pnr || ticket.bookingCode}`, body);
};

export const printManifest = (win, { title, subtitle, bookings }) => {
  const rows = bookings.flatMap((booking) =>
    (booking.activeSeats || []).map((seat) => ({ seat: seat.seatLabel, booking })),
  ).sort((a, b) => String(a.seat).localeCompare(String(b.seat), undefined, { numeric: true }));

  const body = `
    <h1>${escapeHtml(title)}</h1>
    <p class="muted" style="margin:4px 0 0">${escapeHtml(subtitle)} &middot; ${rows.length} seat${rows.length === 1 ? '' : 's'}</p>
    <table>
      <thead><tr><th>Seat</th><th>Passenger</th><th>Mobile</th><th>Age / gender</th><th>PNR</th><th>Payment</th><th>Boarding</th></tr></thead>
      <tbody>
        ${rows.map(({ seat, booking }) => `<tr>
          <td><strong>${escapeHtml(seat)}</strong></td>
          <td>${escapeHtml(booking.passenger?.name || booking.user?.name || '')}</td>
          <td>${escapeHtml(booking.passenger?.phone || booking.user?.phone || '')}</td>
          <td>${escapeHtml([booking.passenger?.age, booking.passenger?.gender].filter(Boolean).join(' / '))}</td>
          <td>${escapeHtml(booking.pnr || booking.bookingCode)}</td>
          <td>${escapeHtml(paymentLabel(booking))}</td>
          <td>${escapeHtml(BOARDING_LABEL[boardingState(booking)])}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  return fillAndPrint(win, title, body);
};
