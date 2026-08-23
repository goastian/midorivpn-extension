// compress-pngs.js
const fs = require('fs');
const path = require('path');

let sharp = null;
try {
  sharp = require('sharp');
} catch (_e) {
  console.warn('⚠️ sharp module could not be loaded, fallback to copying raw assets');
}

const inputDir = path.resolve(__dirname, 'src/assets');
const outputDir = path.resolve(__dirname, 'compressed-assets/');

// Crea la carpeta de salida si no existe
fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(inputDir)) {
  console.log('No assets directory found, skipping.');
  process.exit(0);
}

// Lee todos los archivos del directorio de entrada
fs.readdirSync(inputDir).forEach(file => {
  const ext = path.extname(file).toLowerCase();
  const inputPath = path.join(inputDir, file);
  const outputPath = path.join(outputDir, file);

  if (fs.statSync(inputPath).isDirectory()) return;

  // Solo procesa archivos PNG si sharp esta disponible
  if (ext === '.png' && sharp) {
    sharp(inputPath)
      .png({ compressionLevel: 9 })
      .toFile(outputPath)
      .then(() => console.log(`✅ Comprimido: ${file}`))
      .catch(err => {
        console.warn(`Fallback copiado sin comprimir ${file}:`, err.message);
        fs.copyFileSync(inputPath, outputPath);
      });
  } else {
    // Copia otros archivos sin procesarlos
    fs.copyFileSync(inputPath, outputPath);
    console.log(`ℹ️ Copiado: ${file}`);
  }
});
