import React, { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, ListOrdered, MousePointerClick, TriangleAlert, Upload, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AUTO_PATTERNS,
  SEAT_SHEET_COLUMNS,
  applyAutoNumbering,
  applySeatSheetRows,
  buildSeatSheetRows,
  findSeatNumberProblems,
  listSeats,
  setSeatNumber,
} from './seatNumbering';

const MAX_SHEET_BYTES = 1024 * 1024;

const METHODS = [
  { key: 'auto', label: 'Auto', hint: 'Fill every seat from a pattern', icon: Wand2 },
  { key: 'manual', label: 'Manual', hint: 'Click a seat and type', icon: MousePointerClick },
  { key: 'excel', label: 'Excel', hint: 'Edit a sheet and upload it', icon: FileSpreadsheet },
];

/// Choosing how a bus's seats are numbered. Manual picks its seat from the map
/// beside this, through selectedSeatId.
const SeatNumberingPanel = ({ blueprint, onChange, method, onMethodChange, selectedSeatId, onSelectSeat, upcomingBookings = 0 }) => {
  const numbering = blueprint?.seatNumbering || {};
  const [pattern, setPattern] = useState(numbering.pattern || 'row_letter');
  const [start, setStart] = useState(numbering.start || 1);
  const [sheetErrors, setSheetErrors] = useState([]);
  const [sheetName, setSheetName] = useState('');
  const fileRef = useRef(null);
  const inputRef = useRef(null);

  const seats = listSeats(blueprint);
  const selected = seats.find(({ cell }) => cell.id === selectedSeatId);
  const problems = findSeatNumberProblems(blueprint);
  const problemList = Object.entries(problems);
  const checkNumbers = Boolean(numbering.mode);

  useEffect(() => {
    if (method === 'manual' && selectedSeatId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [method, selectedSeatId]);

  const fillAuto = (nextPattern, nextStart) => {
    onChange(applyAutoNumbering(blueprint, { pattern: nextPattern, start: nextStart }));
  };

  const chooseMethod = (key) => {
    onMethodChange(key);
    setSheetErrors([]);
    if (key === 'auto') fillAuto(pattern, start);
  };

  const moveToNextSeat = () => {
    const index = seats.findIndex(({ cell }) => cell.id === selectedSeatId);
    const next = seats[index + 1];
    if (next) onSelectSeat(next.cell.id);
  };

  const downloadSheet = async () => {
    try {
      const XLSX = await import('xlsx');
      const sheet = XLSX.utils.json_to_sheet(buildSeatSheetRows(blueprint), { header: SEAT_SHEET_COLUMNS });
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Seats');
      XLSX.writeFile(book, 'seat-numbers.xlsx');
    } catch {
      toast.error('Could not create the sheet');
    }
  };

  const uploadSheet = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSheetName(file.name);
    setSheetErrors([]);

    if (!/\.xlsx$/i.test(file.name) || file.size > MAX_SHEET_BYTES) {
      setSheetErrors(['Upload the .xlsx sheet you downloaded for this bus (1 MB at most).']);
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
      const result = applySeatSheetRows(blueprint, rows);
      if (result.errors) {
        setSheetErrors(result.errors);
        return;
      }
      onChange(result.blueprint);
      toast.success('Seat numbers updated. Save the bus to keep them.');
    } catch {
      setSheetErrors(['That file could not be read. Download the sheet for this bus and edit that.']);
    }
  };

  return (
    <div className="mb-5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <ListOrdered size={16} className="text-slate-500" />
        Seat numbers
      </p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-500">What passengers see on the seat map and their ticket.</p>

      {upcomingBookings > 0 ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          This bus has {upcomingBookings} upcoming {upcomingBookings === 1 ? 'booking' : 'bookings'}. They stay safe, but tickets already issued keep their old seat numbers.
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {METHODS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={method === item.key}
            onClick={() => chooseMethod(item.key)}
            className={`rounded-2xl border px-4 py-3 text-left transition-all ${
              method === item.key ? 'border-amber-200 bg-amber-50 text-slate-900 shadow-md shadow-amber-100' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
            }`}
          >
            <item.icon size={16} />
            <p className="mt-1 text-sm font-bold">{item.label}</p>
            <p className={`mt-0.5 text-[10px] font-medium ${method === item.key ? 'text-amber-900/70' : 'text-slate-400'}`}>{item.hint}</p>
          </button>
        ))}
      </div>

      {method === 'auto' ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px]">
          <label className="block text-xs font-semibold text-slate-600">
            Pattern
            <select
              value={pattern}
              onChange={(event) => {
                setPattern(event.target.value);
                fillAuto(event.target.value, start);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
            >
              {AUTO_PATTERNS.map((item) => (
                <option key={item.key} value={item.key}>{item.label} ({item.example})</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Start at
            <input
              type="number"
              min="1"
              value={start}
              onChange={(event) => {
                setStart(event.target.value);
                if (Number(event.target.value) >= 1) fillAuto(pattern, event.target.value);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
            />
          </label>
        </div>
      ) : null}

      {method === 'manual' ? (
        <div className="mt-4">
          {selected ? (
            <label className="block text-xs font-semibold text-slate-600">
              Number for this seat ({selected.deck} deck, row {selected.row})
              <input
                ref={inputRef}
                aria-label="Seat number"
                value={selected.cell.label || ''}
                maxLength={5}
                onChange={(event) => onChange(setSeatNumber(blueprint, selected.cell.id, event.target.value))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    moveToNextSeat();
                  }
                }}
                className="mt-1 w-40 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900"
              />
              <span className="mt-1 block text-[11px] font-medium text-slate-400">Press Enter for the next seat.</span>
            </label>
          ) : (
            <p className="text-xs font-medium text-slate-500">Click a seat on the map below, then type its number.</p>
          )}
        </div>
      ) : null}

      {method === 'excel' ? (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadSheet} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50">
              <Download size={14} />
              Download sheet for this bus
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50">
              <Upload size={14} />
              Upload edited sheet
            </button>
            <input ref={fileRef} type="file" accept=".xlsx" onChange={uploadSheet} aria-label="Seat numbers sheet" className="hidden" />
          </div>
          <p className="mt-2 text-[11px] font-medium text-slate-500">Change only the Seat Number column. Nothing changes unless the whole sheet is correct.</p>
          {sheetErrors.length ? (
            <div role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              <p className="font-bold">{sheetName ? `${sheetName} wasn't applied:` : "The sheet wasn't applied:"}</p>
              <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-4">
                {sheetErrors.slice(0, 50).map((error) => <li key={error}>{error}</li>)}
              </ul>
              {sheetErrors.length > 50 ? <p className="mt-1">and {sheetErrors.length - 50} more</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {checkNumbers && problemList.length ? (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {problemList.length} {problemList.length === 1 ? 'seat needs' : 'seats need'} fixing, shown in red. {problemList[0][1]}.
        </p>
      ) : null}
    </div>
  );
};

export default SeatNumberingPanel;
