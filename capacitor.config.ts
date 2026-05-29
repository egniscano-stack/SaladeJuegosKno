import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bingokno.app',
  appName: 'Bingo Kno',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
