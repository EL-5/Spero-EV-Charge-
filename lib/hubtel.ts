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

  try {
    console.log(`[HUBTEL] Initiating payment for ${data.phone} via ${data.provider} - GHS ${data.amount}`);
    
    // Hubtel Receive Money API (Direct Prompt)
    // Endpoint: https://api.hubtel.com/v2/pos/receive/momo
    const response = await fetch('https://api.hubtel.com/v2/pos/receive/momo', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        CustomerName: 'Spero Driver', // Generic or from data
        CustomerMsisdn: data.phone,
        CustomerEmail: '',
        Channel: (channelMap as any)[data.provider],
        Amount: data.amount,
        PrimaryCallbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/hubtel`,
        Description: data.description,
        ClientReference: data.clientReference,
      }),
    });

    const result = await response.json();
    console.log('[HUBTEL] API Response:', JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error('[HUBTEL] API Error:', error);
    throw error;
  }
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
  
  try {
    // Hubtel Status Check API
    const response = await fetch(`https://api.hubtel.com/v2/pos/transaction/status?clientReference=${clientReference}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('[HUBTEL] Status Check Error:', error);
    throw error;
  }
}
