import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cssestimation.rozanahisaab',
  appName: 'Rozana Hisaab',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0d1424',
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
