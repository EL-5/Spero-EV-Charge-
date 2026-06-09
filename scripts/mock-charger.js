const WebSocket = require('ws');
const crypto = require('crypto');

const CHARGE_POINT_ID = process.argv[2] || '3084372503230006';
const SERVER_URL = `ws://localhost:8081/ocpp/${CHARGE_POINT_ID}`;

// Optional Basic Auth if security profile 1 is enabled
const username = CHARGE_POINT_ID;
const password = 'testpassword123'; // Guessing a password, if needed
const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

console.log(`Connecting to ${SERVER_URL}...`);
const ws = new WebSocket(SERVER_URL, {
  // headers: { Authorization: authHeader } // Uncomment if Auth is needed
});

ws.on('open', () => {
  console.log('Connected!');
  
  // Send BootNotification
  const messageId = crypto.randomUUID();
  const bootPacket = [
    2, 
    messageId, 
    'BootNotification', 
    {
      chargePointVendor: 'MockVendor',
      chargePointModel: 'MockModel-1',
      chargePointSerialNumber: 'MOCK-123456'
    }
  ];
  
  console.log('Sending BootNotification:', bootPacket);
  ws.send(JSON.stringify(bootPacket));
  
  // Heartbeat loop
  setInterval(() => {
    const hbPacket = [
      2,
      crypto.randomUUID(),
      'Heartbeat',
      {}
    ];
    console.log('Sending Heartbeat:', hbPacket);
    ws.send(JSON.stringify(hbPacket));
  }, 30000); // 30 seconds
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('close', (code, reason) => {
  console.log(`Disconnected. Code: ${code}, Reason: ${reason}`);
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});
