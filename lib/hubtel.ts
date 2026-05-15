export async function initiateHubtelCharge(data: {
  amount: number;
  phone: string;
  provider: 'mtn' | 'telecel' | 'airteltigo';
  description: string;
  clientReference: string;
}) {
  const clientId = process.env.HUBTEL_CLIENT_ID;
  const clientSecret = process.env.HUBTEL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    const missing = [];
    if (!clientId) missing.push('HUBTEL_CLIENT_ID');
    if (!clientSecret) missing.push('HUBTEL_CLIENT_SECRET');
    throw new Error(`Hubtel configuration error: Missing ${missing.join(' and ')} in .env.local`);
  }

  // Map providers to Hubtel channel codes
  const channelMap = {
    mtn: 'mtn-gh',
    telecel: 'vodafone-gh', // Hubtel still uses vodafone-gh for Telecel
    airteltigo: 'airteltigo-gh',
  };

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const endpoints = [
      'https://api.hubtel.com/v2/pos/receive/momo',
      'https://api-proxy.hubtel.com/v2/pos/receive/momo',
      'https://rmp.hubtel.com/v2/pos/receive/momo'
    ];

    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        console.log(`[HUBTEL] Attempting endpoint: ${endpoint}`);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            CustomerName: 'Spero Driver',
            CustomerMsisdn: data.phone,
            CustomerEmail: '',
            Channel: (channelMap as any)[data.provider],
            Amount: data.amount,
            PrimaryCallbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/hubtel`,
            Description: data.description,
            ClientReference: data.clientReference,
          }),
        });

        if (response.ok || response.status < 500) {
          const result = await response.json();
          console.log(`[HUBTEL] Success via ${endpoint}`);
          return result;
        }
      } catch (err: any) {
        console.error(`[HUBTEL] ${endpoint} failed:`, err.message);
        lastError = err;
      }
    }
    throw lastError || new Error('All Hubtel gateways failed to respond');
}

export async function checkHubtelStatus(clientReference: string) {
  const clientId = process.env.HUBTEL_CLIENT_ID;
  const clientSecret = process.env.HUBTEL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    const missing = [];
    if (!clientId) missing.push('HUBTEL_CLIENT_ID');
    if (!clientSecret) missing.push('HUBTEL_CLIENT_SECRET');
    throw new Error(`Hubtel configuration error: Missing ${missing.join(' and ')} in .env.local`);
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  const endpoints = [
    `https://api.hubtel.com/v2/pos/transaction/status?clientReference=${clientReference}`,
    `https://api-proxy.hubtel.com/v2/pos/transaction/status?clientReference=${clientReference}`,
    `https://rmp.hubtel.com/v2/pos/transaction/status?clientReference=${clientReference}`
  ];

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok || response.status < 500) {
        const result = await response.json();
        return result;
      }
    } catch (err: any) {
      console.error(`[HUBTEL-STATUS] ${endpoint} failed:`, err.message);
      lastError = err;
    }
  }
  throw lastError || new Error('All Hubtel status gateways failed');
}
