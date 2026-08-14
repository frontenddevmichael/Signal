/**
 * A stable per-browser device id for the §18 sessions table. Generated once,
 * kept in localStorage, sent with every recordSession call so lastActiveAt
 * tracks the same browser across page loads.
 */
const DEVICE_KEY = "signal.deviceId";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
