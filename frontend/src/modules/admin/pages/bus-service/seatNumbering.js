/**
 * Seat numbers: the label people see on a seat, ticket and booking.
 *
 * Only ever the label. A seat's id is what bookings and seat locks refer to, so
 * renumbering can't lose a booking or sell a seat twice.
 *
 * blueprint.seatNumbering records how the numbers were set; no mode means the
 * numbers the layout generated, which may repeat across decks on older buses.
 */

export const SEAT_NUMBER_PATTERN = /^[A-Za-z0-9-]{1,5}$/;
export const SEAT_SHEET_COLUMNS = ['Deck', 'Row', 'Seat ID', 'Type', 'Seat Number'];
export const AUTO_PATTERNS = [
  { key: 'row_letter', label: 'Row and letter', example: '1A, 1B, 1C, 2A' },
  { key: 'running', label: 'Running numbers', example: '1, 2, 3, 4' },
  { key: 'running_per_deck', label: 'Running numbers per deck', example: 'L1, L2, then U1, U2' },
];

const DECKS = [
  { key: 'lowerDeck', name: 'Lower', prefix: 'L' },
  { key: 'upperDeck', name: 'Upper', prefix: 'U' },
];
const LETTERS = 'ABCDEFGHIJ';

const hasSeats = (deck = []) => deck.some((row) => (row || []).some((cell) => cell?.kind === 'seat'));

/// Every seat in order: lower deck first, front row first, across each row.
export const listSeats = (blueprint = {}) =>
  DECKS.flatMap(({ key, name }) =>
    (blueprint[key] || []).flatMap((row, rowIndex) =>
      (row || [])
        .filter((cell) => cell?.kind === 'seat')
        .map((cell) => ({ deck: name, row: rowIndex + 1, cell })),
    ),
  );

const mapSeats = (blueprint, update) => {
  const next = { ...blueprint };
  DECKS.forEach(({ key }) => {
    next[key] = (blueprint[key] || []).map((row) =>
      (row || []).map((cell) => (cell?.kind === 'seat' ? update(cell) : cell)),
    );
  });
  return next;
};

const withLabels = (blueprint, labelOf) => mapSeats(blueprint, (cell) => ({ ...cell, label: labelOf(cell) }));

/// Fills every seat from a pattern. Two decks can't share numbers, so row and
/// letter gets a deck letter when the bus has an upper deck.
export const applyAutoNumbering = (blueprint = {}, { pattern = 'row_letter', start = 1 } = {}) => {
  const first = Math.max(1, Math.floor(Number(start) || 1));
  const twoDecks = hasSeats(blueprint.upperDeck);
  const labels = new Map();
  let running = first;

  DECKS.forEach(({ key, prefix }) => {
    let perDeck = first;
    (blueprint[key] || []).forEach((row, rowIndex) => {
      let letter = 0;
      (row || []).forEach((cell) => {
        if (cell?.kind !== 'seat') return;
        if (pattern === 'running') {
          labels.set(cell.id, String(running));
          running += 1;
        } else if (pattern === 'running_per_deck') {
          labels.set(cell.id, `${prefix}${perDeck}`);
          perDeck += 1;
        } else {
          const rowLabel = `${rowIndex + first}${LETTERS[letter] || letter + 1}`;
          labels.set(cell.id, twoDecks ? `${prefix}${rowLabel}` : rowLabel);
          letter += 1;
        }
      });
    });
  });

  return {
    ...withLabels(blueprint, (cell) => labels.get(cell.id)),
    seatNumbering: { mode: 'auto', pattern, start: first },
  };
};

export const setSeatNumber = (blueprint = {}, seatId, label) => ({
  ...withLabels(blueprint, (cell) => (cell.id === seatId ? String(label ?? '').trim() : cell.label)),
  seatNumbering: { ...(blueprint.seatNumbering || {}), mode: 'manual' },
});

/// What's wrong with each seat's number, by seat id. Empty when all is well.
export const findSeatNumberProblems = (blueprint = {}) => {
  const seats = listSeats(blueprint);
  const counts = new Map();
  seats.forEach(({ cell }) => {
    const key = String(cell.label || '').trim().toLowerCase();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });

  const problems = {};
  seats.forEach(({ cell }) => {
    const label = String(cell.label || '').trim();
    if (!label) problems[cell.id] = 'Needs a number';
    else if (!SEAT_NUMBER_PATTERN.test(label)) problems[cell.id] = 'Use up to 5 letters, numbers or hyphens';
    else if (counts.get(label.toLowerCase()) > 1) problems[cell.id] = `${label} is used more than once`;
  });
  return problems;
};

/// After the rows or decks change: seats that still exist keep what was set on
/// them. Auto numbering just runs again, so new seats get numbers too.
export const carryOverSeatDetails = (previous = {}, next = {}) => {
  const before = new Map(listSeats(previous).map(({ cell }) => [cell.id, cell]));
  const numbering = previous.seatNumbering;
  const customNumbers = Boolean(numbering?.mode);
  const merged = {
    ...mapSeats(next, (cell) => {
      const old = before.get(cell.id);
      if (!old) return cell;
      return {
        ...cell,
        status: old.status === 'blocked' ? 'blocked' : cell.status,
        label: customNumbers ? old.label : cell.label,
      };
    }),
    ...(numbering ? { seatNumbering: numbering } : {}),
  };
  return numbering?.mode === 'auto' ? applyAutoNumbering(merged, numbering) : merged;
};

/// The rows of the sheet an admin downloads for this bus.
export const buildSeatSheetRows = (blueprint = {}) =>
  listSeats(blueprint).map(({ deck, row, cell }) => ({
    Deck: deck,
    Row: row,
    'Seat ID': cell.id,
    Type: cell.variant === 'sleeper' ? 'Sleeper' : 'Seat',
    'Seat Number': cell.label || '',
  }));

/// Reads an edited sheet. Returns { blueprint } when every seat has a good
/// number, otherwise { errors } and nothing changes.
export const applySeatSheetRows = (blueprint = {}, rows = []) => {
  const seats = new Map(listSeats(blueprint).map(({ cell }) => [cell.id, cell]));
  const errors = [];
  const numbers = new Map();

  if (!rows.length || !('Seat ID' in rows[0]) || !('Seat Number' in rows[0])) {
    return { errors: ['This sheet needs the Seat ID and Seat Number columns. Download the sheet for this bus and edit that.'] };
  }

  rows.forEach((row, index) => {
    const line = index + 2; // Line 1 of the sheet is the headings.
    const id = String(row['Seat ID'] ?? '').trim();
    const label = String(row['Seat Number'] ?? '').trim();
    if (!id) errors.push(`Row ${line}: the Seat ID is blank`);
    else if (!seats.has(id)) errors.push(`Row ${line}: ${id} isn't a seat on this bus`);
    else if (numbers.has(id)) errors.push(`Row ${line}: ${id} is listed twice`);
    else if (!label) errors.push(`Row ${line}: ${id} needs a number`);
    else if (!SEAT_NUMBER_PATTERN.test(label)) errors.push(`Row ${line}: "${label}" must be up to 5 letters, numbers or hyphens`);
    else numbers.set(id, { label, line });
  });

  [...seats.keys()]
    .filter((id) => !rows.some((row) => String(row['Seat ID'] ?? '').trim() === id))
    .forEach((id) => errors.push(`${id} is missing from the sheet`));

  const firstLine = new Map();
  numbers.forEach(({ label, line }) => {
    const key = label.toLowerCase();
    if (firstLine.has(key)) errors.push(`Row ${line}: "${label}" is already used on row ${firstLine.get(key)}`);
    else firstLine.set(key, line);
  });

  if (errors.length) return { errors };
  return {
    blueprint: {
      ...withLabels(blueprint, (cell) => numbers.get(cell.id).label),
      seatNumbering: { mode: 'excel' },
    },
  };
};
