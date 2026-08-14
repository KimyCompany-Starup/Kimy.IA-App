import { useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';

const GITHUB_USER = "KimyCompany-Starup"; 
const GITHUB_REPO = "Kimy.IA-App";         
const UPDATE_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases/latest`;

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
    const timer = setTimeout(() => {
      checkUpdates();
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);

  const checkUpdates = async () => {
    try {
      const response = await fetch(UPDATE_URL, { 
        headers: { 'Cache-Control': 'no-cache' } 
      });
      const data = await response.json();
      if (!data || !data.tag_name) return;

      const latestVersion = data.tag_name.replace('v', '').trim(); 
      const currentVersion = (Constants.expoConfig?.version || Constants.nativeAppVersion || "0.0.0").trim();

      if (latestVersion !== currentVersion) {
        Alert.alert(
          "🚀 Actualización Disponible",
          `Hay una nueva versión (${latestVersion}) lista para descargar.`,
          [
            { text: "Más tarde", style: "cancel" },
            { 
              text: "Descargar", 
              onPress: () => {
                const apkAsset = data.assets.find((asset: any) => asset.name.endsWith('.apk'));
                Linking.openURL(apkAsset ? apkAsset.browser_download_url : data.html_url);
              } 
            }
          ]
        );
      }
    } catch (error) {
      console.error("Error al verificar actualización:", error);
    }
  };

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}