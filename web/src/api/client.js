// Thin API client. Keeps the surface the pages were written against:
//   api.entities.{Player,Match,Challenge}.{list,filter,get,count}
//   api.functions.invoke(name, payload) -> { data }
//   api.auth.{me,login,register,logout,forgotPassword,resetPassword}
//   api.uploadPublicFile(file) -> { file_url }
// The API location is configurable: VITE_API_URL (default "/api", same-origin).
import { createAuthClient } from "better-auth/react";

const BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
const apiUrl = new URL(BASE, window.location.origin);

const authClient = createAuthClient({
  baseURL: apiUrl.origin,
  basePath: `${apiUrl.pathname.replace(/\/$/, "")}/auth`,
});

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.response = { status, data };
  }
}

async function request(path, { method = "GET", params, body, formData } = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    throw new ApiError(data?.error || data?.message || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

function createEntity(name) {
  const base = `/entities/${name}`;
  const query = (filter, { sort, limit, skip } = {}) => ({
    filter: filter && Object.keys(filter).length ? JSON.stringify(filter) : undefined,
    sort,
    limit,
    skip,
  });
  return {
    list: (options = {}) => request(base, { params: query(null, options) }),
    filter: (filter, options = {}) => request(base, { params: query(filter, options) }),
    get: (id) => request(`${base}/${encodeURIComponent(id)}`),
    count: async (filter) => (await request(`${base}/count`, { params: query(filter) })).count,
  };
}

function authError(error, fallback) {
  return new ApiError(error?.message || fallback, error?.status || 400, error);
}

export const api = {
  entities: {
    Player: createEntity("Player"),
    Match: createEntity("Match"),
    Challenge: createEntity("Challenge"),
  },
  functions: {
    // Resolves to { data } like the original SDK; rejects with ApiError (err.response.data.error).
    async invoke(name, payload = {}) {
      const data = await request(`/functions/${name}`, { method: "POST", body: payload });
      return { data };
    },
  },
  auth: {
    async me() {
      const { data, error } = await authClient.getSession();
      if (error || !data?.user) throw new ApiError("Not signed in", 401, error);
      return data.user;
    },
    async login(email, password) {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) throw authError(error, "Invalid email or password");
    },
    async register({ email, password, username }) {
      const { error } = await authClient.signUp.email({ email, password, name: username });
      if (error) throw authError(error, "Registration failed");
    },
    async logout() {
      await authClient.signOut().catch(() => {});
    },
    async forgotPassword(email) {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw authError(error, "Could not send the reset link.");
    },
    async resetPassword({ token, newPassword }) {
      const { error } = await authClient.resetPassword({ token, newPassword });
      if (error) throw authError(error, "Failed to reset password");
    },
  },
  async uploadPublicFile(file) {
    const formData = new FormData();
    const small = await shrinkImage(file);
    formData.append("file", small, small.name);
    return request("/uploads", { method: "POST", formData });
  },
};

// Avatars are resized in the browser (max 256x256, WebP/JPEG) so uploads stay well under the server cap.
async function shrinkImage(file, max = 256) {
  try {
    if (!file.type.startsWith("image/")) return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const [type, ext] of [["image/webp", "webp"], ["image/jpeg", "jpg"]]) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
      if (blob && blob.type === type) return new File([blob], `avatar.${ext}`, { type });
    }
  } catch {
    // fall through to the original file
  }
  return file;
}
