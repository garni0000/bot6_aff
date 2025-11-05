const { generatePaymentReceipt } = require('./paymentGenerator');
const fs = require('fs');

console.log('🧪 Test du générateur de reçu de paiement...\n');

try {
  const receipt = generatePaymentReceipt();
  
  console.log('✅ Reçu généré avec succès!');
  console.log(`💰 Montant: ${receipt.amount.toLocaleString()} FCFA`);
  console.log(`📱 Numéro: ${receipt.phoneNumber}`);
  console.log(`📄 Référence: ${receipt.reference}`);
  console.log(`📊 Nombre de partages: ${Math.floor(receipt.amount / 400)}`);
  
  fs.writeFileSync('test-receipt.png', receipt.buffer);
  console.log('\n✅ Image sauvegardée dans test-receipt.png');
  console.log('✅ Test réussi!');
} catch (error) {
  console.error('❌ Erreur lors du test:', error);
  process.exit(1);
}
