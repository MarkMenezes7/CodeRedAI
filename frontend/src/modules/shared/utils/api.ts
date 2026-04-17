const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

function resolveApiUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiUrl(url), {
    ...init,
    credentials: init?.credentials ?? 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    let message = `Request failed with status ${response.status}`;

    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as { message?: string; detail?: string };
      if (payload.message) {
        message = payload.message;
      } else if (payload.detail) {
        message = payload.detail;
      }
    } else {
      const textPayload = await response.text();
      if (textPayload.trim()) {
        message = textPayload.trim();
      }
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}
