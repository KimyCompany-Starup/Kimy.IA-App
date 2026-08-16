const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
  // Obtener el último tag de git (ej: v2.6)
    const tagArg = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
  const cleanVersion = tagArg.replace('v', '').trim(); // "2.6"

    if (!cleanVersion) {
    console.log("⚠️ No se encontró ningún tag de Git.");
    process.exit(0);
    }

  // Calcular un versionCode numérico (ej: "2.6" -> 20600)
    const parts = cleanVersion.split('.').map(num => parseInt(num, 10) || 0);
  const versionCode = (parts[0] * 10000) + (parts[1] * 100) + (parts[2] || 0);

    const appJsonPath = path.join(__dirname, '../app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

    appJson.expo.version = cleanVersion;
    if (appJson.expo.android) {
    appJson.expo.android.versionCode = versionCode;
    }
    if (appJson.expo.ios) {
    appJson.expo.ios.buildNumber = cleanVersion;
    }

    fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2), 'utf8');
    console.log(`✅ app.json actualizado automáticamente a la versión ${cleanVersion} (versionCode: ${versionCode})`);
} catch (error) {
    console.error("❌ Error al actualizar la versión desde Git:", error.message);
}