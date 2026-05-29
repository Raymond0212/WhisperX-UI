const configuredApiBase = import.meta.env.VITE_API_BASE_URL;

export const API_BASE =
  configuredApiBase === undefined
    ? import.meta.env.DEV
      ? "http://127.0.0.1:8000"
      : ""
    : configuredApiBase;

export async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || response.statusText);
  }
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response.text();
}
