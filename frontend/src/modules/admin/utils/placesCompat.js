/**
 * Google no longer offers the old Places classes to new projects: on this key
 * they return REQUEST_DENIED, and the Autocomplete widget shows "This page can't
 * load Google Maps correctly". The pages still call those classes, so they are
 * replaced here with versions that answer from the new Places service, in the
 * shape the pages already read.
 */

const OK = 'OK';
const ZERO_RESULTS = 'ZERO_RESULTS';
const REQUEST_DENIED = 'REQUEST_DENIED';
const MIN_SEARCH_LENGTH = 2;
const SEARCH_DELAY_MS = 200;
const PLACE_FIELDS = ['displayName', 'formattedAddress', 'location', 'viewport', 'addressComponents', 'types'];

// Fetching a place from its suggestion keeps it in the same billing session.
const recentPredictions = new Map();

const toRegionCodes = (componentRestrictions) => {
  const country = componentRestrictions?.country;
  if (!country) return undefined;
  return (Array.isArray(country) ? country : [country]).map((code) => String(code).toLowerCase());
};

// The new service only takes these type groups. Other old types just narrowed
// the list, so leaving them out shows more suggestions, not wrong ones.
const toPrimaryTypes = (types) => {
  const groups = (types || []).filter((type) => type === '(cities)' || type === '(regions)');
  return groups.length ? groups.slice(0, 1) : undefined;
};

const toLocationBias = ({ bounds, location, radius }) => {
  if (bounds) return bounds;
  if (location) return { center: location, radius: Math.min(50000, Number(radius) || 50000) };
  return undefined;
};

const fetchPredictions = async (request = {}) => {
  const { suggestions } = await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: request.input,
    includedRegionCodes: toRegionCodes(request.componentRestrictions),
    includedPrimaryTypes: toPrimaryTypes(request.types),
    locationBias: toLocationBias(request),
    sessionToken: request.sessionToken,
  });

  return suggestions
    .map((suggestion) => suggestion.placePrediction)
    .filter(Boolean)
    .map((prediction) => {
      recentPredictions.set(prediction.placeId, prediction);
      return {
        description: prediction.text?.text || '',
        place_id: prediction.placeId,
        types: prediction.types || [],
        structured_formatting: {
          main_text: prediction.mainText?.text || prediction.text?.text || '',
          secondary_text: prediction.secondaryText?.text || '',
        },
      };
    });
};

const fetchPlace = async (placeId) => {
  const { Place } = window.google.maps.places;
  const place = recentPredictions.get(placeId)?.toPlace() || new Place({ id: placeId });
  await place.fetchFields({ fields: PLACE_FIELDS });

  return {
    place_id: place.id || placeId,
    name: place.displayName || '',
    formatted_address: place.formattedAddress || '',
    types: place.types || [],
    geometry: { location: place.location, viewport: place.viewport },
    address_components: (place.addressComponents || []).map((component) => ({
      long_name: component.longText || '',
      short_name: component.shortText || '',
      types: component.types || [],
    })),
  };
};

class AutocompleteService {
  async getPlacePredictions(request, callback) {
    let predictions = [];
    let status = OK;
    try {
      predictions = await fetchPredictions(request);
      if (predictions.length === 0) status = ZERO_RESULTS;
    } catch (error) {
      console.error('Place search failed:', error);
      status = REQUEST_DENIED;
    }
    callback?.(predictions, status);
    return { predictions };
  }
}

class PlacesService {
  async getDetails(request, callback) {
    try {
      callback(await fetchPlace(request.placeId), OK);
    } catch (error) {
      console.error('Place details failed:', error);
      callback(null, REQUEST_DENIED);
    }
  }
}

const LIST_STYLE = 'position:fixed;z-index:100000;margin:0;padding:4px;list-style:none;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,.18);max-height:280px;overflow-y:auto;';
const ROW_STYLE = 'padding:9px 10px;border-radius:8px;cursor:pointer;font:500 13px/1.3 system-ui,sans-serif;color:#0f172a;';
const ACTIVE_BACKGROUND = '#f1f5f9';

/// The search box: a suggestion list under the page's own input, firing
/// place_changed when one is picked, like the old widget.
class Autocomplete {
  constructor(input, options = {}) {
    this.input = input;
    this.options = options;
    this.place = undefined;
    this.predictions = [];
    this.activeIndex = -1;
    this.searchId = 0;
    this.list = document.createElement('ul');
    this.list.setAttribute('role', 'listbox');
    this.list.className = 'zi-place-suggestions';
    this.list.style.cssText = `${LIST_STYLE}display:none;`;
    // Keep focus in the input while a suggestion is clicked.
    this.list.addEventListener('mousedown', (event) => event.preventDefault());
    document.body.appendChild(this.list);

    this.onInput = () => {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.search(), SEARCH_DELAY_MS);
    };
    this.onKeyDown = (event) => this.handleKey(event);
    this.onBlur = () => this.hide();
    this.onReposition = () => this.position();
    input.addEventListener('input', this.onInput);
    input.addEventListener('keydown', this.onKeyDown);
    input.addEventListener('blur', this.onBlur);
    window.addEventListener('scroll', this.onReposition, true);
    window.addEventListener('resize', this.onReposition);

    // The list is on body, so it has to go when the input leaves the page.
    this.removalWatcher = new MutationObserver(() => {
      if (!this.input.isConnected) this.destroy();
    });
    this.removalWatcher.observe(document.body, { childList: true, subtree: true });
  }

  destroy() {
    window.clearTimeout(this.timer);
    this.removalWatcher.disconnect();
    this.input.removeEventListener('input', this.onInput);
    this.input.removeEventListener('keydown', this.onKeyDown);
    this.input.removeEventListener('blur', this.onBlur);
    window.removeEventListener('scroll', this.onReposition, true);
    window.removeEventListener('resize', this.onReposition);
    this.list.remove();
  }

  async search() {
    const query = this.input.value.trim();
    const searchId = ++this.searchId;
    if (query.length < MIN_SEARCH_LENGTH) {
      this.hide();
      return;
    }

    try {
      if (!this.sessionToken) this.sessionToken = new window.google.maps.places.AutocompleteSessionToken();
      const predictions = await fetchPredictions({
        ...this.options,
        input: query,
        sessionToken: this.sessionToken,
      });
      if (searchId !== this.searchId || document.activeElement !== this.input) return;
      this.predictions = predictions;
      this.activeIndex = -1;
      this.render();
    } catch (error) {
      console.error('Place search failed:', error);
      this.hide();
    }
  }

  render() {
    this.list.replaceChildren(...this.predictions.map((prediction, index) => {
      const row = document.createElement('li');
      row.setAttribute('role', 'option');
      row.textContent = prediction.description;
      row.style.cssText = ROW_STYLE;
      row.style.background = index === this.activeIndex ? ACTIVE_BACKGROUND : 'transparent';
      row.addEventListener('mouseenter', () => this.setActive(index));
      row.addEventListener('click', () => this.select(index));
      return row;
    }));
    this.list.style.display = this.predictions.length ? 'block' : 'none';
    this.position();
  }

  setActive(index) {
    this.activeIndex = index;
    [...this.list.children].forEach((row, rowIndex) => {
      row.style.background = rowIndex === index ? ACTIVE_BACKGROUND : 'transparent';
    });
    this.list.children[index]?.scrollIntoView({ block: 'nearest' });
  }

  position() {
    if (this.list.style.display === 'none') return;
    const box = this.input.getBoundingClientRect();
    this.list.style.top = `${box.bottom + 4}px`;
    this.list.style.left = `${box.left}px`;
    this.list.style.width = `${Math.max(box.width, 240)}px`;
  }

  hide() {
    this.searchId += 1;
    this.predictions = [];
    this.list.style.display = 'none';
  }

  handleKey(event) {
    if (!this.predictions.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.setActive((this.activeIndex + step + this.predictions.length) % this.predictions.length);
    } else if (event.key === 'Enter') {
      // Don't submit the surrounding form while choosing a place.
      event.preventDefault();
      this.select(Math.max(0, this.activeIndex));
    } else if (event.key === 'Escape') {
      this.hide();
    }
  }

  async select(index) {
    const prediction = this.predictions[index];
    if (!prediction) return;
    this.hide();
    this.setInputValue(prediction.description);

    try {
      this.place = await fetchPlace(prediction.place_id);
    } catch (error) {
      console.error('Place details failed:', error);
      // No geometry: the pages treat this as an unconfirmed place.
      this.place = { name: prediction.description };
    }
    this.sessionToken = null;
    window.google.maps.event.trigger(this, 'place_changed');
  }

  // Through the native setter, so React sees the change on a controlled input.
  setInputValue(value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(this.input, value);
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
    window.clearTimeout(this.timer);
  }

  getPlace() { return this.place; }
  getBounds() { return this.options.bounds; }
  getFields() { return this.options.fields; }
  setBounds(bounds) { this.options = { ...this.options, bounds }; }
  setComponentRestrictions(componentRestrictions) { this.options = { ...this.options, componentRestrictions }; }
  setFields(fields) { this.options = { ...this.options, fields }; }
  setOptions(options) { this.options = { ...this.options, ...options }; }
  setTypes(types) { this.options = { ...this.options, types }; }
}

let installed = false;

export const installPlacesCompat = () => {
  const places = window.google?.maps?.places;
  if (installed || !places?.AutocompleteSuggestion) return;
  installed = true;
  places.AutocompleteService = AutocompleteService;
  places.PlacesService = PlacesService;
  places.Autocomplete = Autocomplete;
};
