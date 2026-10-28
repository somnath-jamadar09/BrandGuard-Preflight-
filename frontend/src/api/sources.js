import api from './client';

export const getSources = (params) =>
  api.get('/v1/sources', { params });

export const getSource = (id) =>
  api.get(`/v1/sources/${id}`);

export const uploadSource = (formData, onUploadProgress) =>
  api.post('/v1/sources', formData, {
    headers: { 'Content-Type': undefined },
    onUploadProgress,
  });
