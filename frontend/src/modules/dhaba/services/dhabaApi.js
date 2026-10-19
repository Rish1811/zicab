import { io } from 'socket.io-client';
import api from '../../../shared/api/axiosInstance';
import { BACKEND_ORIGIN } from '../../../shared/api/runtimeConfig';

const TOKEN_KEY = 'dhabaToken';

export const getDhabaToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};

export const setDhabaToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the session just won't survive a reload.
  }
};

// The shared axios instance picks a token from the URL; dhaba pages always
// send their own explicitly.
const auth = () => ({ headers: { Authorization: `Bearer ${getDhabaToken()}` } });
const data = (response) => response?.data?.__raw ?? response?.data ?? response;

export const dhabaApi = {
  login: (phone, password) => api.post('/dhaba/login', { phone, password }).then(data),
  me: () => api.get('/dhaba/me', auth()).then(data),
  updateMe: (payload) => api.patch('/dhaba/me', payload, auth()).then(data),
  menu: () => api.get('/dhaba/menu', auth()).then(data),
  addMenuItem: (payload) => api.post('/dhaba/menu', payload, auth()).then(data),
  updateMenuItem: (id, payload) => api.patch(`/dhaba/menu/${id}`, payload, auth()).then(data),
  deleteMenuItem: (id) => api.delete(`/dhaba/menu/${id}`, auth()).then(data),
  orders: (scope) => api.get('/dhaba/orders', { ...auth(), params: { scope } }).then(data),
  summary: () => api.get('/dhaba/orders/summary', auth()).then(data),
  setOrderStatus: (id, status, note = '') =>
    api.patch(`/dhaba/orders/${id}/status`, { status, note }, auth()).then(data),
};

export const DHABA_SOCKET_EVENTS = Object.freeze({
  ORDER_NEW: 'dhaba:order:new',
  ORDER_ALERT: 'dhaba:order:alert',
  ORDER_UPDATED: 'dhaba:order:updated',
});

export const connectDhabaSocket = () =>
  io(import.meta.env.VITE_SOCKET_URL || BACKEND_ORIGIN, {
    auth: { token: getDhabaToken() },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

/// A short two-tone chime, made in the browser so no audio file is needed.
export const playOrderChime = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    [880, 1175, 880, 1175].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      gain.connect(context.destination);
      const start = context.currentTime + index * 0.22;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      oscillator.start(start);
      oscillator.stop(start + 0.21);
    });
  } catch {
    // Audio blocked until the user interacts with the page; the card still shows.
  }
};
