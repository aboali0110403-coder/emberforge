// Capacitor configuration (ready for `npm install @capacitor/core @capacitor/android && npm install -D @capacitor/cli`)
const config = {
  appId: 'com.emberforge.game',
  appName: 'Emberforge',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#120c0a',
    webContentsDebuggingEnabled: false,
  },
};

export default config;
