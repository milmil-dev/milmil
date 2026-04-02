import { api } from '../api-client';

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'error';
  read: number; // 0 or 1
  metadata: string | null; // JSON string
  created_at: string;
}

export const notificationApi = {
  list: (params?: { limit?: number; offset?: number; filter?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.filter) qs.set('filter', params.filter);
    return api.get<Notification[]>(`/api/v1/notifications?${qs}`);
  },
  unreadCount: () => api.get<{ count: number }>('/api/v1/notifications/unread-count'),
  markRead: (id: string) => api.patch<void>(`/api/v1/notifications/${id}/read`),
  markAllRead: () => api.post<void>('/api/v1/notifications/mark-all-read'),
  clear: () => api.delete<void>('/api/v1/notifications'),
};

export const notificationKeys = {
  list: (filter?: string) => ['notifications', filter ?? 'all'] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
};
