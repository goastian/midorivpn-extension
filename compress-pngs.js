// compress-pngs.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const inputDir = path.resolve(__dirname, 'src/assets');
const outputDir = path.resolve(__dirname, 'compressed-assets/');

// Crea la carpeta de salida si no existe
fs.mkdirSync(outputDir, { recursive: true });

// Lee todos los archivos del directorio de entrada
fs.readdirSync(inputDir).forEach(file => {
  const ext = path.extname(file).toLowerCase();
  const inputPath = path.join(inputDir, file);
  const outputPath = path.join(outputDir, file);

  // Solo procesa archivos PNG
  if (ext === '.png') {
    sharp(inputPath)
      .png({ compressionLevel: 9 }) // nivel de compresión (0-9)
      .toFile(outputPath)
      .then(() => console.log(`✅ Comprimido: ${file}`))
      .catch(err => console.error(`❌ Error con ${file}:`, err));
  } else {
    // Copia otros archivos sin procesarlos
    fs.copyFileSync(inputPath, outputPath);
    console.log(`ℹ️ Copiado sin cambios: ${file}`);
  }
});
