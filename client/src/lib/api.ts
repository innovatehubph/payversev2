const API_URL = '/api';

function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

function setAuthToken(token: string) {
  localStorage.setItem('auth_token', token);
}

function clearAuthToken() {
  localStorage.removeItem('auth_token');
}

function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAuthToken();
    window.location.href = '/auth';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || 'Request failed');
  }

  return response.json();
}

export const api = {
  auth: {
    register: (data: { email: string; password: string; fullName: string; username: string; pin: string }) =>
      fetchAPI('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }).then((res) => {
        setAuthToken(res.token);
        return res;
      }),

    login: (data: { email: string; password: string }) =>
      fetchAPI('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }).then((res) => {
        setAuthToken(res.token);
        return res;
      }),

    logout: () =>
      fetchAPI('/auth/logout', { method: 'POST' }).then(() => {
        clearAuthToken();
      }),

    getMe: () => fetchAPI('/auth/me'),
  },

  transactions: {
    getAll: () => fetchAPI('/transactions'),
  },

  transfer: {
    send: (data: { receiverId: number; amount: string; note?: string; pin?: string }) =>
      fetchAPI('/transfer', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  users: {
    search: (query: string) => fetchAPI(`/users/search?q=${encodeURIComponent(query)}`),
  },
};

export { getAuthToken, setAuthToken, clearAuthToken, getAuthHeaders };
