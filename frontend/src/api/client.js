import axios from 'axios';

export function getApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('brandguard_custom_api_url');
    if (custom) return custom.trim().replace(/\/$/, '');
  }
  const envUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  return envUrl.trim().replace(/\/$/, '');
}

export function setApiBaseUrl(url) {
  if (typeof window !== 'undefined') {
    if (!url || !url.trim()) {
      localStorage.removeItem('brandguard_custom_api_url');
    } else {
      localStorage.setItem('brandguard_custom_api_url', url.trim().replace(/\/$/, ''));
    }
  }
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl();
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Automatically purge expired or invalid auth credentials on 401 Unauthorized.
    // Guard against infinite redirect loops by ensuring we only navigate if not already on /login.
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (typeof window !== 'undefined' && window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
