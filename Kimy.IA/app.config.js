require('dotenv').config();

module.exports = {
  expo: {
    name: "Kimy.IA",
    slug: "Kimy-IA",
    version: "V3.1",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "kimyia",
    userInterfaceStyle: "automatic",
    ios: {
      icon: "./assets/expo.icon",
      buildNumber: "V2.7"
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      },
      package: "com.kimycompany.KimyIA",
      versionCode: 700
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#208AEF",
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 76
        }
      ],
      "expo-image",
      "expo-web-browser"
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      router: {},
      eas: {
        projectId: "93b07d3b-6eb9-4605-916b-81e0abd7f83e"
      },
      EXPO_PUBLIC_GROQ_API_KEY: process.env.EXPO_PUBLIC_GROQ_API_KEY,
      EXPO_PUBLIC_GROQ_MODEL: process.env.EXPO_PUBLIC_GROQ_MODEL || "qwen/qwen3.8-27b"
    }
  }
};