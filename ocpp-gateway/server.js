/**
 * SPERO EV SCMS — Decoupled OCPP 1.6-J Central System (CSMS) WebSocket Server
 * 
 * This server maintains persistent, bi-directional connections with physical charging
 * stations over WebSockets and communicates with the Supabase database in real-time.
 */

const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[OCPP-CSMS] Critical configuration missing. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
  process.exit(1);
}

// Administrative Supabase client (RLS bypassed for hardware operations)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ 
  port: PORT,
  handleProtocols: (protocols, request) => {
    // Echo back the requested OCPP subprotocol so strict chargers don't abort the handshake
    for (const protocol of protocols) {
      if (protocol.toLowerCase().startsWith('ocpp')) {
        return protocol;
      }
    }
    // Default fallback
    return 'ocpp1.6';
  }
});

const GATEWAY_INSTANCE_ID = process.env.GATEWAY_INSTANCE_ID || `instance-${Math.random().toString(36).substring(2, 8)}`;
console.log(`[OCPP-CSMS] Gateway instance ID: ${GATEWAY_INSTANCE_ID}`);

// Active WebSocket connections map: chargePointId -> ws
const activeConnections = new Map();

// Active charging transactions: transactionId -> { sessionId, chargePointId, connectorId, targetUnits, prepaidAmount, rateAtTime, startWh }
const activeTransactions = new Map();

// Load active transactions from database on startup
async function restoreActiveTransactions() {
  try {
    const { data, error } = await supabase.from('live_transactions').select('*');
    if (error) {
      console.error('[OCPP-CSMS] Failed to restore active transactions from database:', error.message);
      return;
    }
    if (data && data.length > 0) {
      console.log(`[OCPP-CSMS] Restoring ${data.length} active transactions from database...`);
      for (const tx of data) {
        activeTransactions.set(tx.transaction_id, {
          sessionId: tx.session_id,
          chargePointId: tx.charge_point_id,
          connectorId: tx.connector_id,
          targetUnits: Number(tx.target_units || 0),
          prepaidAmount: Number(tx.prepaid_amount || 0),
          rateAtTime: Number(tx.rate_at_time || 5.50),
          startWh: Number(tx.start_wh || 0),
          transactionId: tx.transaction_id
        });
        console.log(`  Restored Tx: ${tx.transaction_id} | Session: ${tx.session_id}`);
      }
    }
  } catch (err) {
    console.error('[OCPP-CSMS] Unexpected error restoring active transactions:', err.message);
  }
}

restoreActiveTransactions();

console.log(`[OCPP-CSMS] Standalone OCPP Central System listening on port ${PORT}...`);

// =============================================================================
// WebSocket Server Connections Manager
// =============================================================================
wss.on('connection', async (ws, req) => {
  // Extract Charge Point ID from URL path (e.g. /ocpp/SPERO-EV-001 -> SPERO-EV-001)
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const pathParts = pathname.split('/').filter(Boolean);
  let chargePointId = pathParts[pathParts.length - 1];

  if (!chargePointId || chargePointId.toLowerCase() === 'ocpp') {
    // Chinese firmware workaround: The screen restricts the domain input and prevents adding the ID or path.
    // Default to the known charger ID if it connects to the root domain.
    chargePointId = '3084372503230006';
    console.warn(`[OCPP-CSMS] Missing ChargePointId in URL. Auto-assigning ID: ${chargePointId}`);
  }

  console.log(`[OCPP-CSMS] Charger "${chargePointId}" attempting to connect...`);

  let isVerifying = true;
  let isRejected = false;
  const pendingMessages = [];

  const handleIncomingMessage = async (message) => {
    try {
      const packet = JSON.parse(message.toString());
      if (!Array.isArray(packet) || packet.length < 3) {
        console.warn(`[OCPP-CSMS] Invalid OCPP packet structure received from "${chargePointId}":`, packet);
        return;
      }

      const [messageType, messageId, action, payload] = packet;

      // 1. OCPP Call (Client to Server)
      if (messageType === 2) {
        console.log(`[OCPP-CSMS] [IN] "${chargePointId}" -> Action: ${action} | MessageId: ${messageId}`);
        await logOcppPacket(chargePointId, 'IN', action, payload);
        await handleOcppCall(chargePointId, ws, messageId, action, payload);
      } 
      // 2. OCPP CallResult (Client response to our Remote Command)
      else if (messageType === 3) {
        console.log(`[OCPP-CSMS] [IN-RESPONSE] "${chargePointId}" -> Response | MessageId: ${messageId}`);
        await logOcppPacket(chargePointId, 'IN', 'CallResult', payload);
        await handleOcppResponse(messageId, payload);
      }
      // 3. OCPP CallError
      else if (messageType === 4) {
        console.error(`[OCPP-CSMS] [IN-ERROR] "${chargePointId}" -> Error | MessageId: ${messageId}`, payload);
        await logOcppPacket(chargePointId, 'IN', 'CallError', payload);
      }

    } catch (err) {
      console.error(`[OCPP-CSMS] Error parsing incoming socket packet from "${chargePointId}":`, err.message);
    }
  };

  ws.on('message', async (message) => {
    if (isRejected) return;
    if (isVerifying) {
      pendingMessages.push(message);
      return;
    }
    await handleIncomingMessage(message);
  });

  // Fetch charger configurations for verification
  const { data: chargerData, error: dbError } = await supabase
    .from('chargers')
    .select('security_profile, auth_password')
    .eq('charge_point_id', chargePointId)
    .maybeSingle();

  if (dbError || !chargerData) {
    console.warn(`[OCPP-CSMS] Rejected connection for "${chargePointId}": Charger is not pre-registered in the database.`);
    isRejected = true;
    ws.close(4404, 'Not Found: Charger not registered');
    return;
  }

  // If Security Profile 1, verify credentials
  if (chargerData.security_profile === 1) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      console.warn(`[OCPP-CSMS] Rejected connection for "${chargePointId}": Missing or invalid Authorization header.`);
      isRejected = true;
      ws.close(4401, 'Unauthorized: Basic Auth Required');
      return;
    }
    const token = authHeader.substring(6);
    const credentials = Buffer.from(token, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');

    if (username !== chargePointId || password !== chargerData.auth_password) {
      console.warn(`[OCPP-CSMS] Rejected connection for "${chargePointId}": Invalid auth credentials.`);
      isRejected = true;
      ws.close(4401, 'Unauthorized: Invalid credentials');
      return;
    }
  }

  activeConnections.set(chargePointId, ws);
  
  // Update charger state to online in database
  updateChargerOnlineStatus(chargePointId, 'online');

  // Authentication complete, process any pending messages
  isVerifying = false;
  for (const msg of pendingMessages) {
    await handleIncomingMessage(msg);
  }

  ws.on('close', (code, reason) => {
    console.log(`[OCPP-CSMS] Connection closed for "${chargePointId}". Code: ${code} | Reason: ${reason}`);
    activeConnections.delete(chargePointId);
    updateChargerOnlineStatus(chargePointId, 'offline');
  });

  ws.on('error', (err) => {
    console.error(`[OCPP-CSMS] Socket error on "${chargePointId}":`, err.message);
  });
});

// =============================================================================
// OCPP Incoming Messages Controller (Calls)
// =============================================================================
async function handleOcppCall(chargePointId, ws, messageId, action, payload) {
  try {
    switch (action) {
      case 'BootNotification': {
        // Update database inventory metadata
        await supabase.from('chargers').upsert({
          charge_point_id: chargePointId,
          status: 'online',
          vendor: payload.chargePointVendor,
          model: payload.chargePointModel,
          serial_number: payload.chargePointSerialNumber,
          last_heartbeat: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'charge_point_id' });

        // Acknowledge Boot
        sendCallResult(ws, messageId, {
          status: 'Accepted',
          currentTime: new Date().toISOString(),
          interval: 60 // Heartbeat interval in seconds
        });
        break;
      }

      case 'Heartbeat': {
        await supabase.from('chargers').update({
          status: 'online',
          last_heartbeat: new Date().toISOString()
        }).eq('charge_point_id', chargePointId);

        sendCallResult(ws, messageId, {
          currentTime: new Date().toISOString()
        });
        break;
      }

      case 'StatusNotification': {
        const connectorId = payload.connectorId || 1;
        const status = payload.status || 'Available';

        // Find charger ID
        const { data: charger } = await supabase
          .from('chargers')
          .select('id')
          .eq('charge_point_id', chargePointId)
          .single();

        if (charger) {
          // Upsert connector record
          await supabase.from('connectors').upsert({
            charger_id: charger.id,
            connector_number: connectorId,
            status: status,
            last_status_notification: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'charger_id,connector_number' });
        }

        sendCallResult(ws, messageId, {});
        break;
      }

      case 'Authorize': {
        const idTag = payload.idTag;
        
        // Find RFID card mapped to driver
        const { data: tag, error } = await supabase
          .from('ocpp_tags')
          .select('is_active, drivers(id, wallet_balance, type)')
          .eq('id', idTag)
          .maybeSingle();

        if (error || !tag) {
          console.warn(`[OCPP-CSMS] Auth rejected: Tag "${idTag}" not found in database.`);
          sendCallResult(ws, messageId, { idTagInfo: { status: 'Invalid' } });
          return;
        }

        if (!tag.is_active) {
          sendCallResult(ws, messageId, { idTagInfo: { status: 'Blocked' } });
          return;
        }

        const driver = tag.drivers;
        if (!driver) {
          sendCallResult(ws, messageId, { idTagInfo: { status: 'Invalid' } });
          return;
        }

        // Validate billing: Personal drivers must have wallet funds; Corporate accounts are postpaid
        const balance = Number(driver.wallet_balance || 0);
        const isCorporate = driver.type === 'corporate';

        if (isCorporate || balance > 0.50) {
          console.log(`[OCPP-CSMS] Auth Accepted: RFID: ${idTag} | Driver: ${driver.id} | Balance: GHS ${balance}`);
          sendCallResult(ws, messageId, { idTagInfo: { status: 'Accepted' } });
        } else {
          console.warn(`[OCPP-CSMS] Auth Blocked: Insufficient balance (GHS ${balance}) for RFID: ${idTag}`);
          sendCallResult(ws, messageId, { idTagInfo: { status: 'Blocked' } });
        }
        break;
      }

      case 'StartTransaction': {
        const idTag = payload.idTag;
        const connectorId = payload.connectorId || 1;
        const startWh = Number(payload.meterStart || 0);
        const transactionId = Math.floor(100000 + Math.random() * 900000);

        let activeSession = null;

        // 1. App-Driven Flow: The idTag is the session's receipt_number injected via RemoteStartTransaction
        const { data: sessionByReceipt } = await supabase
          .from('sessions')
          .select('*')
          .eq('receipt_number', idTag)
          .single();

        if (sessionByReceipt) {
          activeSession = sessionByReceipt;
        } else {
          // 2. Fallback Admin RFID Flow (if master cards are used)
          const { data: tag } = await supabase
            .from('ocpp_tags')
            .select('driver_id')
            .eq('id', idTag)
            .single();

          if (tag) {
            // Find an active session for this driver
            const { data: active } = await supabase
              .from('sessions')
              .select('*')
              .eq('driver_id', tag.driver_id)
              .eq('status', 'active')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (active) activeSession = active;
          }
        }

        if (activeSession) {
          // Ensure we have a helper to get charger internal UUID
          const { data: charger } = await supabase.from('chargers').select('id').eq('charge_point_id', chargePointId).single();
          const chargerUuid = charger ? charger.id : null;

          // Link charger details and activate session
          await supabase.from('sessions').update({
            status: 'active',
            start_time: new Date().toISOString(),
            charger_id: chargerUuid,
            connector_number: connectorId
          }).eq('id', activeSession.id);

          // Update active connector record
          await updateConnectorSessionLink(chargePointId, connectorId, activeSession.id, 'Charging');

          // Keep active transaction mapped in memory for real-time metering comparison
          activeTransactions.set(transactionId, {
            sessionId: activeSession.id,
            chargePointId,
            connectorId,
            targetUnits: Number(activeSession.target_units || 0),
            prepaidAmount: Number(activeSession.prepaid_amount || 0),
            rateAtTime: Number(activeSession.rate_at_time || 5.50),
            startWh: startWh,
            transactionId: transactionId
          });

          // Persist transaction to DB to survive gateway restarts
          try {
            await supabase.from('live_transactions').insert([{
              transaction_id: transactionId,
              session_id: activeSession.id,
              charge_point_id: chargePointId,
              connector_id: connectorId,
              target_units: Number(activeSession.target_units || 0),
              prepaid_amount: Number(activeSession.prepaid_amount || 0),
              rate_at_time: Number(activeSession.rate_at_time || 5.50),
              start_wh: startWh
            }]);
          } catch (dbErr) {
            console.error('[OCPP-CSMS] Failed to insert live_transaction:', dbErr.message);
          }

          console.log(`[OCPP-CSMS] StartTransaction Approved: TxId: ${transactionId} | Session: ${activeSession.receipt_number} | Target: ${activeSession.target_units} kWh`);
          sendCallResult(ws, messageId, {
            transactionId: transactionId,
            idTagInfo: { status: 'Accepted' }
          });
        } else {
          console.warn(`[OCPP-CSMS] StartTransaction Rejected: No session found for idTag (receipt): ${idTag}`);
          sendCallResult(ws, messageId, {
            transactionId: 0,
            idTagInfo: { status: 'Blocked' }
          });
        }
        break;
      }

      case 'MeterValues': {
        const transactionId = Number(payload.transactionId);
        const activeTx = activeTransactions.get(transactionId);

        if (activeTx) {
          // Extract Wh energy imported
          let currentWh = 0;
          if (payload.meterValue && Array.isArray(payload.meterValue)) {
            for (const valueEntry of payload.meterValue) {
              if (valueEntry.sampledValue && Array.isArray(valueEntry.sampledValue)) {
                for (const sample of valueEntry.sampledValue) {
                  if (!sample.measurand || sample.measurand === 'Energy.Active.Import.Register') {
                    currentWh = Number(sample.value);
                  }
                }
              }
            }
          }

          if (currentWh > 0) {
            const consumedKwh = Math.max(0, (currentWh - activeTx.startWh) / 1000);
            
            // Stream consumption update in database in real-time
            await supabase.from('sessions').update({
              units_consumed: consumedKwh,
              total_amount: consumedKwh * activeTx.rateAtTime
            }).eq('id', activeTx.sessionId);

            console.log(`[OCPP-CSMS] [METER] Tx: ${transactionId} | Consumed: ${consumedKwh.toFixed(4)} kWh / Limit: ${activeTx.targetUnits || 'Unlimited'} kWh`);

            // AUTOMATIC SHUTDOWN GUARD: If target kWh threshold is hit, remotely stop the charger!
            if (activeTx.targetUnits > 0 && consumedKwh >= activeTx.targetUnits) {
              console.log(`[OCPP-CSMS] [LIMIT REACHED] Limit reached: ${consumedKwh.toFixed(2)} >= ${activeTx.targetUnits}. Remote stopping transaction: ${transactionId}`);
              
              // Remove mapping to avoid double remote stop triggers
              activeTransactions.delete(transactionId);
              try {
                await supabase.from('live_transactions').delete().eq('transaction_id', transactionId);
              } catch (dbErr) {
                console.error('[OCPP-CSMS] Failed to delete live_transaction on limit stop:', dbErr.message);
              }

              // Push stop command directly down the active socket
              const uniqueMsgId = `CMD-${Math.floor(100000 + Math.random() * 900000)}`;
              const stopPacket = [2, uniqueMsgId, 'RemoteStopTransaction', {
                transactionId: transactionId
              }];
              
              ws.send(JSON.stringify(stopPacket));
              await logOcppPacket(chargePointId, 'OUT', 'RemoteStopTransaction', stopPacket[3]);
            }
          }
        }

        sendCallResult(ws, messageId, {});
        break;
      }

      case 'StopTransaction': {
        const transactionId = Number(payload.transactionId);
        const stopWh = Number(payload.meterStop || 0);
        const activeTx = activeTransactions.get(transactionId);

        if (activeTx) {
          const finalKwh = Math.max(0, (stopWh - activeTx.startWh) / 1000);
          console.log(`[OCPP-CSMS] StopTransaction received: Tx: ${transactionId} | Final: ${finalKwh} kWh`);

          // Remove connection link from connector
          await updateConnectorSessionLink(chargePointId, activeTx.connectorId, null, 'Available');
          activeTransactions.delete(transactionId);
          try {
            await supabase.from('live_transactions').delete().eq('transaction_id', transactionId);
          } catch (dbErr) {
            console.error('[OCPP-CSMS] Failed to delete live_transaction on StopTransaction:', dbErr.message);
          }

          // Triggers our server-side completion action, which calculates premature-stop credit refunds atomically
          await completeChargingSessionRecord(activeTx.sessionId, finalKwh);
        }

        sendCallResult(ws, messageId, {
          idTagInfo: { status: 'Accepted' }
        });
        break;
      }

      default: {
        console.warn(`[OCPP-CSMS] Unhandled OCPP action received: "${action}"`);
        sendCallResult(ws, messageId, {});
      }
    }
  } catch (err) {
    console.error(`[OCPP-CSMS] Error executing action handler for "${action}":`, err.message);
    sendCallError(ws, messageId, 'InternalError', err.message);
  }
}

// =============================================================================
// Next.js Admin UI Commands Forwarder (Supabase Realtime Command Queue)
// =============================================================================
supabase
  .channel('ocpp_command_queue')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ocpp_commands' }, async (payload) => {
    const cmd = payload.new;
    if (cmd.status !== 'pending') return;

    const chargePointId = cmd.charge_point_id;

    // Check if we should handle this command on this instance
    const hasConnection = activeConnections.has(chargePointId);
    const targetMatchesThisInstance = cmd.instance_id === GATEWAY_INSTANCE_ID;
    const isTargetedToAnotherInstance = cmd.instance_id && cmd.instance_id !== GATEWAY_INSTANCE_ID;

    // We only process if it's explicitly targeted to us, OR if it has no target instance but we hold the WebSocket connection
    const shouldProcess = targetMatchesThisInstance || (!cmd.instance_id && hasConnection);

    if (!shouldProcess) {
      if (isTargetedToAnotherInstance) {
        console.log(`[OCPP-CSMS] [QUEUE] Command ${cmd.id} is targeted to instance "${cmd.instance_id}", ignoring (I am "${GATEWAY_INSTANCE_ID}").`);
      } else {
        console.log(`[OCPP-CSMS] [QUEUE] Charger "${chargePointId}" is not connected to this instance ("${GATEWAY_INSTANCE_ID}"), ignoring.`);
      }
      return;
    }

    console.log(`[OCPP-CSMS] [QUEUE] Captured pending command for "${chargePointId}": ${cmd.command}`);

    const ws = activeConnections.get(chargePointId);
    if (!ws) {
      console.warn(`[OCPP-CSMS] Remote execution failed: Charger "${chargePointId}" is currently offline on this instance.`);
      await updateCommandStatus(cmd.id, 'failed', { error: 'Charging station is currently offline' });
      return;
    }

    try {
      const ocppAction = cmd.command;
      const messageId = Math.floor(Math.random() * 100000000).toString(); // Strict numeric Message ID to prevent C++ parser crashes on cheap chargers
      
      let ocppPayload = {};
      if (ocppAction === 'RemoteStartTransaction') {
        ocppPayload = {
          connectorId: cmd.payload?.connectorId || 1,
          idTag: cmd.payload?.idTag || 'SYSTEM_REMOTE'
        };
      } else if (ocppAction === 'RemoteStopTransaction') {
        // Find active transactionId mapped for this charger/connector
        let txId = cmd.payload?.transactionId;
        if (!txId) {
          for (const [tId, tx] of activeTransactions.entries()) {
            if (tx.chargePointId === chargePointId && tx.connectorId === (cmd.payload?.connectorId || 1)) {
              txId = Number(tId);
              break;
            }
          }
        }
        ocppPayload = { transactionId: txId || 99999 };
      } else if (ocppAction === 'Reset') {
        ocppPayload = { type: cmd.payload?.type || 'Soft' };
      } else if (ocppAction === 'UnlockConnector') {
        ocppPayload = { connectorId: cmd.payload?.connectorId || 1 };
      }

      // Map pending commands to messageId responses
      activeCommandsInProgress.set(messageId, cmd.id);

      const packet = [2, messageId, ocppAction, ocppPayload];
      ws.send(JSON.stringify(packet));
      
      await updateCommandStatus(cmd.id, 'sent');
      await logOcppPacket(chargePointId, 'OUT', ocppAction, ocppPayload);

      console.log(`[OCPP-CSMS] [OUT] Command packet sent to "${chargePointId}":`, packet);

    } catch (err) {
      console.error(`[OCPP-CSMS] Error serializing command for "${chargePointId}":`, err.message);
      await updateCommandStatus(cmd.id, 'failed', { error: err.message });
    }
  })
  .subscribe();

// Commands waiting for responses: messageId -> commandDatabaseUuid
const activeCommandsInProgress = new Map();

async function handleOcppResponse(messageId, responsePayload) {
  const dbCommandId = activeCommandsInProgress.get(messageId);
  if (dbCommandId) {
    activeCommandsInProgress.delete(messageId);
    
    const isSuccess = responsePayload.status === 'Accepted' || responsePayload.status === 'UnlockSuccessful' || responsePayload.status === 'Rebooting' || !responsePayload.status;
    const finalStatus = isSuccess ? 'success' : 'failed';

    await updateCommandStatus(dbCommandId, finalStatus, responsePayload);
    console.log(`[OCPP-CSMS] Command response mapped to DB record: ${dbCommandId} | Result: ${finalStatus}`);
  }
}

// =============================================================================
// Helper Functions & Database Wrappers
// =============================================================================
function sendCallResult(ws, messageId, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify([3, messageId, payload]));
  }
}

function sendCallError(ws, messageId, errorCode, errorDescription) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify([4, messageId, errorCode, errorDescription, {}]));
  }
}

async function updateChargerOnlineStatus(chargePointId, status) {
  try {
    const updateData = {
      status: status,
      last_heartbeat: new Date().toISOString(),
      gateway_instance_id: status === 'online' ? GATEWAY_INSTANCE_ID : null
    };
    await supabase.from('chargers').update(updateData).eq('charge_point_id', chargePointId);
    console.log(`[OCPP-CSMS] Database updated online status: Charger "${chargePointId}" is now: ${status.toUpperCase()} (Instance: ${status === 'online' ? GATEWAY_INSTANCE_ID : 'NULL'})`);
  } catch (err) {
    console.error(`[OCPP-CSMS] Failed to update charger online status:`, err.message);
  }
}

async function updateConnectorSessionLink(chargePointId, connectorNumber, sessionId, status) {
  try {
    const { data: charger } = await supabase
      .from('chargers')
      .select('id')
      .eq('charge_point_id', chargePointId)
      .single();

    if (charger) {
      await supabase.from('connectors').update({
        current_session_id: sessionId,
        status: status,
        updated_at: new Date().toISOString()
      }).eq('charger_id', charger.id).eq('connector_number', connectorNumber);
    }
  } catch (err) {
    console.error(`[OCPP-CSMS] Failed to update connector status link:`, err.message);
  }
}

async function getChargerUuid(chargePointId) {
  const { data } = await supabase.from('chargers').select('id').eq('charge_point_id', chargePointId).single();
  return data ? data.id : null;
}

async function updateCommandStatus(id, status, response = {}) {
  await supabase.from('ocpp_commands').update({
    status: status,
    response_payload: response,
    updated_at: new Date().toISOString()
  }).eq('id', id);
}

async function logOcppPacket(chargePointId, direction, type, payload) {
  try {
    await supabase.from('ocpp_logs').insert([{
      charge_point_id: chargePointId,
      direction: direction,
      message_type: type,
      payload: payload
    }]);
  } catch (err) {
    console.error(`[OCPP-CSMS] Failed to log OCPP packet to database:`, err.message);
  }
}

async function completeChargingSessionRecord(sessionId, unitsConsumed) {
  try {
    // We execute the standard stopSessionWithRefund server action or invoke the db refund procedure.
    // Calling the endpoint directly or performing equivalent queries.
    // Fetch pricing rate to calculate refund
    const { data: session } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
    if (!session) return;

    const rateAtTime = Number(session.rate_at_time || 5.50);
    const prepaidAmount = Number(session.prepaid_amount || 0);
    const actualCost = unitsConsumed * rateAtTime;
    const refundAmount = prepaidAmount - actualCost;

    const updatePayload = {
      status: 'completed',
      units_consumed: unitsConsumed,
      total_amount: actualCost,
      end_time: new Date().toISOString()
    };

    if (session.payment_status === 'paid' && refundAmount > 0.01 && session.driver_id) {
      const { data: driver } = await supabase.from('drivers').select('wallet_balance').eq('id', session.driver_id).single();
      if (driver) {
        const currentBalance = Number(driver.wallet_balance || 0);
        const newBalance = currentBalance + refundAmount;
        
        await supabase.from('drivers').update({ wallet_balance: newBalance }).eq('id', session.driver_id);
        
        await supabase.from('wallet_transactions').insert([{
          driver_id: session.driver_id,
          type: 'credit',
          amount: refundAmount,
          balance_before: currentBalance,
          balance_after: newBalance,
          description: `Refund of unused charging balance from Session ${session.receipt_number}`,
          session_id: session.id,
          created_by: session.attendant_id
        }]);

        updatePayload.payment_status = 'refunded';
      }
    }

    await supabase.from('sessions').update(updatePayload).eq('id', sessionId);
    console.log(`[OCPP-CSMS] Successfully finalized session ${session.receipt_number}. Final consumption: ${unitsConsumed} kWh. Refunded: GHS ${Math.max(0, refundAmount)}`);
  } catch (err) {
    console.error(`[OCPP-CSMS] Error completing charging session records:`, err.message);
  }
}
