/**
 * SPERO EV SCMS — Smart Meter Polling Simulation Daemon
 * 
 * This service simulates a physical smart meter (like Shelly Pro 3EM or Eastron SDM630)
 * installed at each charging hub station. It queries the live status of connectors
 * to calculate real-time grid draw, maintaining realistic phase measurements
 * and cumulative energy usage (kWh).
 */

const { createClient } = require('@supabase/supabase-js');
const { loadEnvConfig } = require('@next/env');

// Load environment variables using Next.js native helper
loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[SMART-METER] Configuration missing. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const POLL_INTERVAL_MS = 10000; // Poll every 10 seconds
const POWER_FACTOR = 0.95; // Standard electrical power factor
const STATION_BASE_LOAD_KW = 1.2; // Base power load for lights, servers, screen panels, etc.

// In-memory cache for cumulative energy: stationId -> total_energy_kwh
const cumulativeEnergyCache = new Map();

async function pollSmartMeters() {
  console.log(`[SMART-METER] Polling cycle started: ${new Date().toISOString()}`);

  try {
    // 1. Fetch all stations
    const { data: stations, error: stationsError } = await supabase.from('stations').select('id, name');
    if (stationsError) throw stationsError;

    if (!stations || stations.length === 0) {
      console.log('[SMART-METER] No active stations found. Register stations in the admin dashboard.');
      return;
    }

    // 2. Fetch all active chargers and connectors
    const { data: chargers, error: chargersError } = await supabase.from('chargers').select('id, station_id');
    if (chargersError) throw chargersError;

    const { data: connectors, error: connectorsError } = await supabase.from('connectors').select('*');
    if (connectorsError) throw connectorsError;

    // Map chargers to stations
    const chargerStationMap = new Map();
    chargers.forEach(c => {
      if (c.station_id) chargerStationMap.set(c.id, c.station_id);
    });

    // Aggregate active charging power per station
    const activePowerPerStation = new Map();
    // Initialize with 0
    stations.forEach(s => activePowerPerStation.set(s.id, 0));

    connectors.forEach(conn => {
      const stationId = chargerStationMap.get(conn.charger_id);
      if (stationId && conn.status === 'Charging') {
        const chargingPower = Number(conn.max_power || 22.0); // Draw maximum configured gun power
        const currentPower = activePowerPerStation.get(stationId) || 0;
        activePowerPerStation.set(stationId, currentPower + chargingPower);
      }
    });

    // 3. Process each station
    for (const station of stations) {
      const stationId = station.id;
      const chargingLoad = activePowerPerStation.get(stationId) || 0;
      
      // Total station active power is charging load plus base facility load
      // Add a slight fluctuation (+/- 200W) to make the simulation look realistic
      const randomFluctuation = (Math.random() - 0.5) * 0.4;
      const activePowerKw = Math.max(STATION_BASE_LOAD_KW, STATION_BASE_LOAD_KW + chargingLoad + randomFluctuation);

      // Simulate 3-Phase voltages around 230V with minor variance
      const voltageL1 = Number((230 + (Math.random() - 0.5) * 4).toFixed(1));
      const voltageL2 = Number((230 + (Math.random() - 0.5) * 4).toFixed(1));
      const voltageL3 = Number((230 + (Math.random() - 0.5) * 4).toFixed(1));
      const voltages = [voltageL1, voltageL2, voltageL3];

      // Calculate Current (Amps) per phase based on power draw: Current = (Power / 3) / (Voltage * PF)
      const powerPerPhaseW = (activePowerKw * 1000) / 3;
      const currentL1 = Number((powerPerPhaseW / (voltageL1 * POWER_FACTOR)).toFixed(2));
      const currentL2 = Number((powerPerPhaseW / (voltageL2 * POWER_FACTOR)).toFixed(2));
      const currentL3 = Number((powerPerPhaseW / (voltageL3 * POWER_FACTOR)).toFixed(2));
      const currents = [currentL1, currentL2, currentL3];

      // Retrieve or initialize cumulative kWh
      let totalEnergyKwh = cumulativeEnergyCache.get(stationId);
      if (totalEnergyKwh === undefined) {
        // Query the latest database reading for historical continuity
        const { data: latestMetric, error: metricError } = await supabase
          .from('station_grid_metrics')
          .select('total_energy_kwh')
          .eq('station_id', stationId)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!metricError && latestMetric) {
          totalEnergyKwh = Number(latestMetric.total_energy_kwh);
        } else {
          // Fallback starter value
          totalEnergyKwh = 1250.0 + Math.random() * 5000;
        }
      }

      // Add energy consumed during the polling interval (10 seconds)
      const hoursPassed = POLL_INTERVAL_MS / (3600 * 1000);
      const additionalKwh = activePowerKw * hoursPassed;
      totalEnergyKwh = Number((totalEnergyKwh + additionalKwh).toFixed(5));
      cumulativeEnergyCache.set(stationId, totalEnergyKwh);

      // 4. Log measurements to database
      const { error: insertError } = await supabase.from('station_grid_metrics').insert([{
        station_id: stationId,
        active_power_kw: Number(activePowerKw.toFixed(3)),
        voltage_v: voltages,
        current_a: currents,
        total_energy_kwh: totalEnergyKwh
      }]);

      if (insertError) {
        console.error(`[SMART-METER] Error writing metrics for "${station.name}":`, insertError.message);
      } else {
        console.log(`[SMART-METER] "${station.name}" Metrics -> Power: ${activePowerKw.toFixed(2)} kW | L1: ${currentL1}A, L2: ${currentL2}A, L3: ${currentL3}A | Total: ${totalEnergyKwh.toFixed(1)} kWh`);
      }
    }

  } catch (err) {
    console.error('[SMART-METER] Unexpected error in polling cycle:', err.message);
  }
}

// Start simulation loop
console.log('[SMART-METER] Starting Spero Smart Meter simulation daemon...');
pollSmartMeters();
setInterval(pollSmartMeters, POLL_INTERVAL_MS);
