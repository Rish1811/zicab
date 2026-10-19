import { genericRestConnector } from './genericRestConnector.js';

// Connectors we can run against an operator's own reservation system. To
// support a specific vendor (Bitla, Vaagai, ...), add a file exporting the
// same shape as genericRestConnector, built from that vendor's API docs, and
// register it here; the reconciler and admin panel pick it up automatically.
//
// Shape: { type, label, validate(channel), fetchTripBookings({ channel, mapping, travelDate }) }
const CONNECTORS = [genericRestConnector];

const registry = new Map(CONNECTORS.map((connector) => [connector.type, connector]));

export const getConnector = (type) => registry.get(String(type || '')) || null;

export const listConnectorTypes = () => [
  { type: 'push_api', label: 'They call the ZI Bus channel API' },
  ...CONNECTORS.map((connector) => ({ type: connector.type, label: connector.label })),
];
