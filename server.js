// server.js - Solana Whale Tracker
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Konfiguratsioon
const CONFIG = {
  SOLANA_RPC: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || 'YOUR_BOT_TOKEN',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID',
  CHECK_INTERVAL: 900000, // 15 minutit
  MIN_SOL: 10
};

// Jälgitavad vaalad
const WHALES = [
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
  'GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ'
];

const processedTx = new Set();

// Telegram teavitus
async function sendAlert(whale, type, amount, token) {
  const emoji = type === 'BUY' ? '🟢' : '🔴';
  const message = `
${emoji} <b>${type}</b>

💰 Summa: <b>${amount.toFixed(2)} SOL</b>
🪙 Token: ${token}
👤 Vaal: ${whale.slice(0,8)}...

⏰ ${new Date().toLocaleTimeString('et-EE')}
  `;

  await axios.post(
    `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`,
    {
      chat_id: CONFIG.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    }
  );
}

// Kontrolli vaala tehinguid
async function checkWhale(address) {
  try {
    const response = await axios.post(
      CONFIG.SOLANA_RPC,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [address, { limit: 5 }]
      }
    );

    const signatures = response.data.result || [];
    
    for (const sig of signatures) {
      if (processedTx.has(sig.signature)) continue;
      processedTx.add(sig.signature);
      await new Promise(r => setTimeout(r, 500));

      // Analüüsi tehingut
      const txResponse = await axios.post(
        CONFIG.SOLANA_RPC,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [sig.signature, { encoding: 'jsonParsed' }]
        }
      );

      const tx = txResponse.data.result;
      if (!tx) continue;

      // Lihtsustatud analüüs
      const balanceChange = calculateBalanceChange(tx, address);
      
      if (Math.abs(balanceChange) >= CONFIG.MIN_SOL) {
        const type = balanceChange < 0 ? 'BUY' : 'SELL';
        await sendAlert(address, type, Math.abs(balanceChange), 'Unknown');
      }
    }

    // Puhasta mälu
    if (processedTx.size > 1000) {
      const arr = Array.from(processedTx).slice(-500);
      processedTx.clear();
      arr.forEach(s => processedTx.add(s));
    }
  } catch (error) {
    console.error('Viga:', error.message);
  }
}

function calculateBalanceChange(tx, address) {
  const preBalances = tx.meta.preBalances || [];
  const postBalances = tx.meta.postBalances || [];
  const accounts = tx.transaction.message.accountKeys || [];
  
  const index = accounts.findIndex(k => k.pubkey === address);
  if (index === -1) return 0;
  
  return (postBalances[index] - preBalances[index]) / 1e9;
}

// Peamine loop
async function monitor() {
  console.log('🔍 Kontrollin vaalasid...');
  for (const whale of WHALES) {
    await checkWhale(whale);
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('✅ Kontroll lõpetatud\n');
}

// Health check Railway jaoks
app.get('/', (req, res) => {
  res.json({ status: 'running', uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server pordil ${PORT}`);
  monitor(); // Esimene kontroll
  setInterval(monitor, CONFIG.CHECK_INTERVAL);
});
