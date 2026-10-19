import api from '../../../shared/api/axiosInstance';

const data = (response) => response?.data?.__raw ?? response?.data ?? response;

export const zibusAdminService = {
  listDhabas: (search = '') => api.get('/admin/zibus/dhabas', { params: { search } }).then(data),
  createDhaba: (payload) => api.post('/admin/zibus/dhabas', payload).then(data),
  updateDhaba: (id, payload) => api.patch(`/admin/zibus/dhabas/${id}`, payload).then(data),
  deleteDhaba: (id) => api.delete(`/admin/zibus/dhabas/${id}`).then(data),
  listDhabaOrders: (params = {}) => api.get('/admin/zibus/dhaba-orders', { params }).then(data),

  listChannels: () => api.get('/admin/zibus/channels').then(data),
  createChannel: (payload) => api.post('/admin/zibus/channels', payload).then(data),
  updateChannel: (id, payload) => api.patch(`/admin/zibus/channels/${id}`, payload).then(data),
  rotateChannelKey: (id) => api.post(`/admin/zibus/channels/${id}/rotate-key`).then(data),
  listChannelEvents: (id) => api.get(`/admin/zibus/channels/${id}/events`).then(data),

  tripInventory: (params) => api.get('/admin/zibus/inventory', { params }).then(data),

  connectorTypes: () => api.get('/admin/zibus/connector-types').then(data),
  syncChannelNow: (id) => api.post(`/admin/zibus/channels/${id}/sync-now`).then(data),

  listOperators: () => api.get('/admin/zibus/operators').then(data),
  createOperator: (payload) => api.post('/admin/zibus/operators', payload).then(data),
  updateOperator: (id, payload) => api.patch(`/admin/zibus/operators/${id}`, payload).then(data),
  operatorReport: (id, params) => api.get(`/admin/zibus/operators/${id}/report`, { params }).then(data),
  searchOwners: (search) => api.get('/admin/zibus/owners', { params: { search } }).then(data),
};
