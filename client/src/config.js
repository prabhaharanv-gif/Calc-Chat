// Empty = same origin (dev proxy / server hosts the app). For the Android app,
// build with VITE_SERVER_URL=https://your-server.example.com
export const SERVER = import.meta.env.VITE_SERVER_URL || '';
