import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chargePointId = searchParams.get('chargePointId');

  try {
    let query = supabaseAdmin
      .from('ocpp_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (chargePointId) {
      query = query.eq('charge_point_id', chargePointId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
