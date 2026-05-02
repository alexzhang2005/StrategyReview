/**
 * test-review.js — trigger first daily review
 */
const https = require('https');

function post(path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'strategy-review.pages.dev',
      path,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let b = '';
      res.on('data', d => { b += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Triggering daily review for 20260502...');
  const r = await post(
    '/api/cron/daily-update?date=20260502',
    { 'X-Admin-Key': 'sr_admin_92411_20260502', 'Content-Type': 'application/json' },
    { date: '20260502' }
  );
  console.log('Status:', r.status);
  try {
    const parsed = JSON.parse(r.body);
    console.log('Response:', JSON.stringify(parsed, null, 2).substring(0, 1000));
  } catch {
    console.log('Raw body:', r.body.substring(0, 500));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
