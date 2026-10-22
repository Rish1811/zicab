import api from '../../../shared/api/axiosInstance';

const data = (response) => response?.data?.__raw ?? response?.data ?? response;

export const zibusAdminService = {
  listDhabas: (search = '') => api.get('/admin/zibus/dhabas', { params: { search } }).then(data),
  createDhaba: (payload) => api.post('/admin/zibus/dhabas', payload).then(data),
  updateDhaba: (id, payload) => api.patch(`/admin/zibus/dhabas/${id}`, payload).then(data),
  deleteDhaba: (id) => api.delete(`/admin/zibus/dhabas/${id}`).then(data),
  listDhabaOrders: (params = {}) => api.get('/admin/zibus/dhaba-orders', { params }).then(data),
  pendingDhabaCount: () => api.get('/admin/zibus/dhabas/pending-count').then(data),
  approveDhaba: (id, payload = {}) => api.post(`/admin/zibus/dhabas/${id}/approve`, payload).then(data),
  rejectDhaba: (id, reason) => api.post(`/admin/zibus/dhabas/${id}/reject`, { reason }).then(data),
  dhabaMenu: (id) => api.get(`/admin/zibus/dhabas/${id}/menu`).then(data),
  addDhabaMenuItem: (id, payload) => api.post(`/admin/zibus/dhabas/${id}/menu`, payload).then(data),
  updateDhabaMenuItem: (id, itemId, payload) => api.patch(`/admin/zibus/dhabas/${id}/menu/${itemId}`, payload).then(data),
  deleteDhabaMenuItem: (id, itemId) => api.delete(`/admin/zibus/dhabas/${id}/menu/${itemId}`).then(data),
  foodCategories: () => api.get('/admin/zibus/food-categories').then(data),
  createFoodCategory: (payload) => api.post('/admin/zibus/food-categories', payload).then(data),
  updateFoodCategory: (id, payload) => api.patch(`/admin/zibus/food-categories/${id}`, payload).then(data),
  deleteFoodCategory: (id) => api.delete(`/admin/zibus/food-categories/${id}`).then(data),
  reorderFoodCategories: (ids) => api.post('/admin/zibus/food-categories/reorder', { ids }).then(data),
  dhabaPayouts: () => api.get('/admin/zibus/dhaba-payouts').then(data),
  dhabaLedger: (id) => api.get(`/admin/zibus/dhabas/${id}/ledger`).then(data),
  recordDhabaPayout: (id, payload) => api.post(`/admin/zibus/dhabas/${id}/payouts`, payload).then(data),
  deleteDhabaPayout: (id, payoutId) => api.delete(`/admin/zibus/dhabas/${id}/payouts/${payoutId}`).then(data),

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
