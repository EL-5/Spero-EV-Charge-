const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

export async function chargeMobileMoney(data: {
  email: string;
  amount: number;
  phone: string;
  provider: 'mtn' | 'vod' | 'tgo';
  reference: string;
}) {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('Paystack Secret Key is not configured');
  }

  // Paystack expects amount in Kobo/Pesewas (Amount * 100)
  const amountInPesewas = Math.round(data.amount * 100);

  try {
    const response = await fetch('https://api.paystack.co/charge', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: data.email,
        amount: amountInPesewas,
        currency: 'GHS',
        mobile_money: {
          phone: data.phone,
          provider: data.provider,
        },
        reference: data.reference,
      }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Paystack API Error:', error);
    throw error;
  }
}

export async function verifyTransaction(reference: string) {
  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Paystack Verification Error:', error);
    throw error;
  }
}
