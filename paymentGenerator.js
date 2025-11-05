const { createCanvas } = require('canvas');

// Fonction pour appliquer un vrai effet de flou gaussien
function applyBlurEffect(ctx, x, y, width, height) {
  x = Math.floor(x);
  y = Math.floor(y);
  width = Math.ceil(width);
  height = Math.ceil(height);
  
  // Extraire les données de l'image
  const imageData = ctx.getImageData(x, y, width, height);
  const pixels = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  
  // Créer une copie pour le flou
  const output = new Uint8ClampedArray(pixels);
  
  // Appliquer un box blur multiple fois pour simuler un flou gaussien
  const radius = 8;
  for (let pass = 0; pass < 3; pass++) {
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        
        // Moyenne des pixels environnants
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = px + dx;
            const ny = py + dy;
            
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const idx = (ny * w + nx) * 4;
              r += pixels[idx];
              g += pixels[idx + 1];
              b += pixels[idx + 2];
              a += pixels[idx + 3];
              count++;
            }
          }
        }
        
        const idx = (py * w + px) * 4;
        output[idx] = r / count;
        output[idx + 1] = g / count;
        output[idx + 2] = b / count;
        output[idx + 3] = a / count;
      }
    }
    // Copier le résultat pour le prochain passage
    pixels.set(output);
  }
  
  imageData.data.set(output);
  ctx.putImageData(imageData, x, y);
}

// Générer un numéro de téléphone aléatoire
function generatePhoneNumber() {
  const randomDigits = Math.floor(1000000 + Math.random() * 9000000);
  return `77${randomDigits}`;
}

// Générer une référence de transaction aléatoire
function generateReference() {
  const date = new Date();
  const dateStr = date.toISOString().replace(/[-:T.]/g, '').substring(0, 14);
  const random = Math.floor(10000 + Math.random() * 90000);
  return `PP${dateStr.substring(6, 10)}.${dateStr.substring(10, 14)}.C${random}`;
}

// Générer un montant aléatoire entre 10000 et 25000
function generateAmount() {
  return Math.floor(10000 + Math.random() * 15000);
}

// Créer le reçu de paiement
function generatePaymentReceipt() {
  const canvas = createCanvas(700, 1200);
  const ctx = canvas.getContext('2d');

  // Background blanc
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 700, 1200);

  // Bouton fermer (X) en haut à droite
  ctx.fillStyle = '#FF6B35';
  ctx.font = 'bold 40px Arial';
  ctx.fillText('✕', 650, 50);

  // Icône de validation (cercle vert avec checkmark)
  ctx.fillStyle = '#4CAF50';
  ctx.beginPath();
  ctx.arc(350, 120, 60, 0, 2 * Math.PI);
  ctx.fill();

  // Checkmark blanc
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(315, 120);
  ctx.lineTo(340, 145);
  ctx.lineTo(385, 95);
  ctx.stroke();

  // Titre principal
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Votre transfert a réussi', 350, 240);

  // Date et heure
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  ctx.font = '28px Arial';
  ctx.fillStyle = '#666666';
  ctx.fillText(`${dateStr} à ${timeStr}`, 350, 290);

  // Zone grise de détails
  ctx.fillStyle = '#F5F5F5';
  ctx.fillRect(40, 320, 620, 200);

  // Montant
  const amount = generateAmount();
  ctx.fillStyle = '#000000';
  ctx.font = '26px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Montant transfert', 60, 370);
  ctx.textAlign = 'right';
  ctx.font = 'bold 26px Arial';
  ctx.fillText(`${amount.toLocaleString()} FCFA`, 640, 370);

  // Frais de retrait
  ctx.font = '26px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Frais de retrait', 60, 430);
  ctx.textAlign = 'right';
  ctx.fillText('0 FCFA', 640, 430);

  // Total à payer
  ctx.fillStyle = '#000000';
  ctx.font = '26px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Total à payer', 60, 490);
  ctx.textAlign = 'right';
  ctx.font = 'bold 28px Arial';
  ctx.fillStyle = '#FF9800';
  ctx.fillText(`${amount.toLocaleString()} FCFA`, 640, 490);

  // Envoyé à (numéro flouté)
  const phoneNumber = generatePhoneNumber();
  ctx.fillStyle = '#000000';
  ctx.font = '26px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Envoyé à', 60, 600);
  ctx.textAlign = 'right';
  ctx.font = 'bold 32px Arial';
  ctx.fillText(phoneNumber, 640, 600);
  
  // Appliquer le flou sur la partie du numéro (sauf les 2 premiers chiffres)
  const phoneTextWidth = ctx.measureText(phoneNumber).width;
  const visibleWidth = ctx.measureText(phoneNumber.substring(0, 2)).width;
  applyBlurEffect(ctx, 640 - phoneTextWidth + visibleWidth, 575, phoneTextWidth - visibleWidth, 35);

  // Référence transaction (floutée)
  const reference = generateReference();
  ctx.font = '24px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Référence', 60, 680);
  ctx.fillText('transaction', 60, 710);
  ctx.textAlign = 'right';
  ctx.font = 'bold 26px Arial';
  ctx.fillText(reference, 640, 695);
  
  // Appliquer le flou sur la partie de la référence (sauf les 8 premiers caractères)
  const refTextWidth = ctx.measureText(reference).width;
  const visibleRefWidth = ctx.measureText(reference.substring(0, 8)).width;
  applyBlurEffect(ctx, 640 - refTextWidth + visibleRefWidth, 670, refTextWidth - visibleRefWidth, 35);

  // Bouton "Faire un autre transfert"
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CCCCCC';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(40, 780, 620, 70, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#000000';
  ctx.font = '26px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Faire un autre transfert', 350, 825);

  // Bouton "Activer un transfert automatique"
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CCCCCC';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(40, 870, 620, 70, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#000000';
  ctx.font = '26px Arial';
  ctx.fillText('⟲  Activer un transfert automatique', 350, 915);

  // Boutons du bas
  // Annuler transfert (rouge)
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CCCCCC';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(40, 970, 300, 70, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#D32F2F';
  ctx.font = 'bold 24px Arial';
  ctx.fillText('Annuler transfert', 190, 1015);

  // Imprimer le reçu (gris)
  ctx.fillStyle = '#F5F5F5';
  ctx.strokeStyle = '#CCCCCC';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(360, 970, 300, 70, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 24px Arial';
  ctx.fillText('Imprimer le reçu', 510, 1015);

  return {
    buffer: canvas.toBuffer('image/png'),
    amount: amount,
    phoneNumber: phoneNumber,
    reference: reference
  };
}

module.exports = { generatePaymentReceipt };
