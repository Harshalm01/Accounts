// Dynamic API URL — always uses the current browser's hostname with the backend port.
// This means it works regardless of IP changes, whether accessed from localhost
// or any device on the local network.
export const API_URL = `http://${window.location.hostname}:3000`;
