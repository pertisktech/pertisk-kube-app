const AUTH_TOKEN_KEY = 'pertisk_auth_token';
const AUTH_USER_KEY = 'pertisk_auth_user';

export const encodeBasicAuth = (username: string, password: string) => {
  return `Basic ${btoa(`${username}:${password}`)}`;
};

export const setAuth = (username: string, password: string) => {
  localStorage.setItem(AUTH_TOKEN_KEY, encodeBasicAuth(username, password));
  localStorage.setItem(AUTH_USER_KEY, username);
};

export const clearAuth = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
};

export const getAuthToken = () => {
  return localStorage.getItem(AUTH_TOKEN_KEY);
};

export const getAuthUser = () => {
  return localStorage.getItem(AUTH_USER_KEY);
};

export const isAuthenticated = () => {
  return Boolean(getAuthToken());
};
