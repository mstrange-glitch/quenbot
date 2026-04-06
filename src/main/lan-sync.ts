import { createSocket, Socket } from 'dgram';
import { WebSocketServer, WebSocket } from 'ws';
import { networkInterfaces } from 'os';
import type { Note, SyncPeer } from '../shared/types';

const DISCOVERY_PORT = 41234;
const DEFAULT_WS_PORT = 8765;
const BEACON_INTERVAL = 5000;
const PEER_TTL = 15000;

interface SyncMessage {
  type: 'share-note' | 'ack';
  note?: Note;
  noteId?: string;
  from: string;
}

interface DiscoveryBeacon {
  app: 'quenbot';
  name: string;
  port: number;
  id: string;
}

type NoteReceivedCallback = (note: Note, fromName: string) => void;
type PeersChangedCallback = (peers: SyncPeer[]) => void;
type LogFn = (msg: string) => void;

// Generate a stable-ish instance ID
const instanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let udpSocket: Socket | null = null;
let wsServer: WebSocketServer | null = null;
let beaconTimer: ReturnType<typeof setInterval> | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;
let peers: Map<string, SyncPeer & { id: string }> = new Map();
let deviceName = '';
let wsPort = DEFAULT_WS_PORT;
let onNoteReceived: NoteReceivedCallback | null = null;
let onPeersChanged: PeersChangedCallback | null = null;
let log: LogFn = console.log;

function getLocalAddresses(): string[] {
  const addrs: string[] = [];
  const ifaces = networkInterfaces();
  for (const name in ifaces) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addrs.push(iface.address);
      }
    }
  }
  return addrs;
}

function getBroadcastAddress(ip: string): string {
  // Simple /24 broadcast — covers most home/office LANs
  const parts = ip.split('.');
  parts[3] = '255';
  return parts.join('.');
}

function getPeerList(): SyncPeer[] {
  return Array.from(peers.values()).map(({ id: _id, ...p }) => p);
}

function handleSyncMessage(data: string, fromName?: string): void {
  try {
    const msg: SyncMessage = JSON.parse(data);
    if (msg.type === 'share-note' && msg.note) {
      // Assign a new ID to avoid collisions with local notes
      const incoming: Note = {
        ...msg.note,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        order: 9999, // will be reordered
      };
      if (onNoteReceived) {
        onNoteReceived(incoming, msg.from || fromName || 'Unknown');
      }
    }
  } catch { /* ignore malformed */ }
}

export function start(opts: {
  name: string;
  port?: number;
  onNote: NoteReceivedCallback;
  onPeers: PeersChangedCallback;
  log?: LogFn;
}): void {
  deviceName = opts.name;
  wsPort = opts.port || DEFAULT_WS_PORT;
  onNoteReceived = opts.onNote;
  onPeersChanged = opts.onPeers;
  if (opts.log) log = opts.log;

  peers.clear();

  // --- UDP Discovery ---
  udpSocket = createSocket({ type: 'udp4', reuseAddr: true });

  udpSocket.on('message', (msg, rinfo) => {
    try {
      const beacon: DiscoveryBeacon = JSON.parse(msg.toString());
      if (beacon.app !== 'quenbot' || beacon.id === instanceId) return;

      const key = `${rinfo.address}:${beacon.port}`;
      const isNew = !peers.has(key);
      peers.set(key, {
        id: beacon.id,
        name: beacon.name,
        address: rinfo.address,
        port: beacon.port,
        lastSeen: Date.now(),
      });
      if (isNew && onPeersChanged) {
        onPeersChanged(getPeerList());
      }
    } catch { /* ignore */ }
  });

  udpSocket.on('error', (err) => {
    log(`UDP error: ${err.message}`);
  });

  udpSocket.bind(DISCOVERY_PORT, () => {
    udpSocket!.setBroadcast(true);
    log(`LAN discovery listening on UDP :${DISCOVERY_PORT}`);
  });

  // Send beacon
  const sendBeacon = (): void => {
    if (!udpSocket) return;
    const beacon: DiscoveryBeacon = {
      app: 'quenbot',
      name: deviceName,
      port: wsPort,
      id: instanceId,
    };
    const buf = Buffer.from(JSON.stringify(beacon));
    const localAddrs = getLocalAddresses();
    for (const addr of localAddrs) {
      const broadcast = getBroadcastAddress(addr);
      try {
        udpSocket.send(buf, 0, buf.length, DISCOVERY_PORT, broadcast);
      } catch { /* ignore */ }
    }
  };

  beaconTimer = setInterval(sendBeacon, BEACON_INTERVAL);
  // Send initial beacon after a short delay to let socket bind
  setTimeout(sendBeacon, 500);

  // Prune stale peers
  pruneTimer = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [key, peer] of peers) {
      if (now - peer.lastSeen > PEER_TTL) {
        peers.delete(key);
        changed = true;
      }
    }
    if (changed && onPeersChanged) {
      onPeersChanged(getPeerList());
    }
  }, 5000);

  // --- WebSocket Server ---
  wsServer = new WebSocketServer({ port: wsPort });

  wsServer.on('connection', (ws) => {
    ws.on('message', (data) => {
      handleSyncMessage(data.toString());
    });
  });

  wsServer.on('error', (err) => {
    log(`WebSocket server error: ${err.message}`);
  });

  log(`LAN sync started: name="${deviceName}", ws=:${wsPort}`);
}

export function stop(): void {
  if (beaconTimer) { clearInterval(beaconTimer); beaconTimer = null; }
  if (pruneTimer) { clearInterval(pruneTimer); pruneTimer = null; }
  if (udpSocket) {
    try { udpSocket.close(); } catch { /* ignore */ }
    udpSocket = null;
  }
  if (wsServer) {
    try { wsServer.close(); } catch { /* ignore */ }
    wsServer = null;
  }
  peers.clear();
  log('LAN sync stopped');
}

export function isRunning(): boolean {
  return wsServer !== null;
}

export function getPeers(): SyncPeer[] {
  return getPeerList();
}

export function updateName(name: string): void {
  deviceName = name;
}

export function sendNoteToPeer(peer: SyncPeer, note: Note): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${peer.address}:${peer.port}`);
    const timeout = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      resolve(false);
    }, 5000);

    ws.on('open', () => {
      const msg: SyncMessage = {
        type: 'share-note',
        note,
        from: deviceName,
      };
      ws.send(JSON.stringify(msg));
      clearTimeout(timeout);
      setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        resolve(true);
      }, 500);
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}
