import api from './client';

export const login    = (email, password)            => api.post('/v1/auth/login',    { email, password });
export const register = (name, email, password, org) => api.post('/v1/auth/register', { name, email, password, orgName: org });
export const getMe    = ()                           => api.get('/v1/auth/me');
