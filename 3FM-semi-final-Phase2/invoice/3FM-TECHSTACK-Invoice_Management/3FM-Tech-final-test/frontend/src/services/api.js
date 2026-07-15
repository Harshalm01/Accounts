import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add JWT token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle token expiration
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - redirect to login
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Influencers API
export const influencersAPI = {
  getAll: (params) => api.get('/influencers/', { params }),
  getById: (id) => api.get(`/influencers/${id}/`),
  getStats: () => api.get('/influencers/stats/'),
  search: (query) => api.get('/influencers/search/', { params: { q: query } }),
  create: (data) => api.post('/influencers/', data),
  update: (id, data) => api.put(`/influencers/${id}/`, data),
  delete: (id) => api.delete(`/influencers/${id}/`),
};

// Campaigns API
export const campaignsAPI = {
  getAll: (params) => api.get('/campaigns/', { params }),
  getById: (id) => api.get(`/campaigns/${id}/`),
  create: (data) => api.post('/campaigns/', data),
  update: (id, data) => api.put(`/campaigns/${id}/`, data),
  delete: (id) => api.delete(`/campaigns/${id}/`),
};

export default api;
