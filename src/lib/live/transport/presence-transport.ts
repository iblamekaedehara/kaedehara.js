/**
 * Singleton Lanyard WebSocket transport with authoritative snapshot semantics.
 *
 * Key architectural principles:
 * - Discord/Lanyard payloads are AUTHORITATIVE SNAPSHOTS. Local state is REPLACED, never merged.
 * - Subscribe (op:2) is sent AFTER Hello (op:1) — correct Lanyard protocol order.
 * - No dead-socket heuristic based on message recency — rely on WebSocket close event.
 * - Connection state transition managed by scheduleReconnectLocal, not handleClose.
 * - Multi-stage stale degradation: soft (2 min) → hard (10 min).
 * - Lease-based leader election with immediate heartbeat on becomeLeader.
 */

import { DISCORD_USER_ID, LANYARD_WS_URL } from "../../constants";
import { validatePresencePayload, type ValidatedLanyardPresence } from "../../schemas/lanyard";
import { LeaderElection } from "./leader-election";

// ── Freshness metadata ───────────────────────────────────────────────────

export interface FreshnessMeta {
  lastAuthoritativeAt: number;
  sequenceId: number;
  transportGeneration: number;
  source: "live" | "cached" | "soft-stale" | "hard-stale" | "degraded";
}

export interface PresenceState {
  status: ValidatedLanyardPresence["discord_status"] | "connecting";
  user: ValidatedLanyardPresence["discord_user"] | null;
  activities: ValidatedLanyardPresence["activities"];
  spotify: ValidatedLanyardPresence["spotify"];
  freshness: FreshnessMeta | null;
}

export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting";

type PresenceListener = (state: PresenceState) => void;
type ConnectionListener = (state: ConnectionState) => void;

const SESSION_KEY = "presence-cache";
const STATE_SYNC_CHANNEL = "presence-state";
const SOFT_STALE_MS = 120_000;
const HARD_STALE_MS = 600_000;
const MAX_CACHED_MS = 900_000;
const EMPTY_STATE: PresenceState = {
  status: "connecting", user: null, activities: [], spotify: null, freshness: null,
};

// ── Singleton ─────────────────────────────────────────────────────────────

declare global {
  var __presenceTransport: PresenceTransport | undefined;
}

export function getPresenceTransport(): PresenceTransport {
  if (typeof window === "undefined") return createNoopTransport();
  if (!globalThis.__presenceTransport) {
    globalThis.__presenceTransport = new PresenceTransport();
  }
  return globalThis.__presenceTransport;
}

// ── Transport class ───────────────────────────────────────────────────────

class PresenceTransport {
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = "idle";
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private softStaleTimer: ReturnType<typeof setTimeout> | null = null;
  private hardStaleTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatIntervalMs = 0;
  private paused = false;
  private election: LeaderElection | null = null;
  private leaderTab = false;
  private stateChannel: BroadcastChannel | null = null;
  private transportGeneration = 0;
  private sequenceId = 0;

  private readonly presenceListeners = new Set<PresenceListener>();
  private readonly connectionListeners = new Set<ConnectionListener>();

  private currentState: PresenceState = { ...EMPTY_STATE };

  constructor() {
    this.hydrateFromSession();
    this.initStateChannel();
    this.initLeaderElection();
    this.attachNetworkListeners();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  connect(): void {
    if (!this.leaderTab) return;
    if (this.connectionState === "connecting" || this.connectionState === "connected") return;
    if (!navigator.onLine) return;

    this.setConnectionState("connecting");
    this.cleanupTimers();
    this.transportGeneration++;

    this.ws = new WebSocket(LANYARD_WS_URL);
    this.ws.onopen = () => {};
    this.ws.onmessage = this.handleMessage;
    this.ws.onclose = this.handleClose;
    this.ws.onerror = this.handleError;
  }

  disconnect(): void {
    this.cleanupTimers();
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
    this.setConnectionState("idle");
  }

  getState(): PresenceState { return { ...this.currentState }; }

  onPresence(listener: PresenceListener): () => void {
    this.presenceListeners.add(listener);
    if (this.currentState.freshness) listener({ ...this.currentState });
    return () => this.presenceListeners.delete(listener);
  }

  onConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.connectionState);
    return () => this.connectionListeners.delete(listener);
  }

  // ── Private: Leader election ────────────────────────────────────────────

  private initLeaderElection(): void {
    this.election = new LeaderElection((isLeader) => {
      this.leaderTab = isLeader;
      if (isLeader) { this.connect(); this.broadcastState(); this.broadcastConnection(); }
      else { this.disconnect(); }
    });
  }

  // ── Private: State sync channel ─────────────────────────────────────────

  private initStateChannel(): void {
    if (typeof BroadcastChannel === "undefined") return;
    this.stateChannel = new BroadcastChannel(STATE_SYNC_CHANNEL);
    this.stateChannel.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === "presence" && !this.leaderTab && msg.state) {
        const incoming = msg.state as PresenceState;
        const incomingGen = incoming.freshness?.transportGeneration ?? 0;
        const currentGen = this.currentState.freshness?.transportGeneration ?? 0;
        if (!this.currentState.freshness || incomingGen >= currentGen) {
          this.currentState = { ...incoming };
          this.notifyPresence();
        }
      }
      if (msg.type === "connection" && !this.leaderTab && msg.connectionState) {
        this.setConnectionState(msg.connectionState);
      }
    };
  }

  private broadcastState(): void {
    if (!this.leaderTab || !this.stateChannel) return;
    this.stateChannel.postMessage({ type: "presence", state: { ...this.currentState } });
  }

  private broadcastConnection(): void {
    if (!this.leaderTab || !this.stateChannel) return;
    this.stateChannel.postMessage({ type: "connection", connectionState: this.connectionState });
  }

  // ── Private: Session persistence ────────────────────────────────────────

  private hydrateFromSession(): void {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw) as PresenceState;
      if (!cached.freshness) return;
      if (Date.now() - cached.freshness.lastAuthoritativeAt > MAX_CACHED_MS) return;
      this.currentState = { ...cached, freshness: { ...cached.freshness, source: "cached" } };
      setTimeout(() => this.notifyPresence(), 0);
      this.resumeStaleTimers();
    } catch {}
  }

  private saveToSession(): void {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.currentState)); } catch {}
  }

  // ── Private: Multi-stage stale degradation ──────────────────────────────

  private resumeStaleTimers(): void {
    if (!this.currentState.freshness) return;
    const elapsed = Date.now() - this.currentState.freshness.lastAuthoritativeAt;
    if (elapsed >= HARD_STALE_MS) return;
    if (this.softStaleTimer) clearTimeout(this.softStaleTimer);
    if (this.hardStaleTimer) clearTimeout(this.hardStaleTimer);
    const softRemaining = Math.max(0, SOFT_STALE_MS - elapsed);
    const hardRemaining = Math.max(0, HARD_STALE_MS - elapsed);
    if (softRemaining > 0) this.softStaleTimer = setTimeout(() => this.degradeToSoftStale(), softRemaining);
    else this.degradeToSoftStale();
    if (hardRemaining > 0) this.hardStaleTimer = setTimeout(() => this.degradeToHardStale(), hardRemaining);
  }

  private resetStaleTimers(): void {
    if (this.softStaleTimer) clearTimeout(this.softStaleTimer);
    if (this.hardStaleTimer) clearTimeout(this.hardStaleTimer);
    this.softStaleTimer = setTimeout(() => this.degradeToSoftStale(), SOFT_STALE_MS);
    this.hardStaleTimer = setTimeout(() => this.degradeToHardStale(), HARD_STALE_MS);
  }

  private degradeToSoftStale(): void {
    if (!this.currentState.freshness) return;
    if (Date.now() - this.currentState.freshness.lastAuthoritativeAt < SOFT_STALE_MS) return;
    this.currentState = { ...this.currentState, freshness: { ...this.currentState.freshness, source: "soft-stale" } };
    this.notifyPresence();
    this.saveToSession();
    this.broadcastState();
  }

  private degradeToHardStale(): void {
    if (!this.currentState.freshness) return;
    if (Date.now() - this.currentState.freshness.lastAuthoritativeAt < HARD_STALE_MS) return;
    this.currentState = { ...this.currentState, activities: [], spotify: null, freshness: { ...this.currentState.freshness, source: "hard-stale" } };
    this.notifyPresence();
    this.saveToSession();
    this.broadcastState();
  }

  // ── Private: Network listeners ──────────────────────────────────────────

  private attachNetworkListeners(): void {
    if (typeof window === "undefined") return;
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  private detachNetworkListeners(): void {
    if (typeof window === "undefined") return;
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  private onOnline = (): void => {
    this.paused = false;
    if (this.leaderTab && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) this.connect();
  };

  private onOffline = (): void => { this.paused = true; };

  private onVisibilityChange = (): void => {
    if (!document.hidden && this.leaderTab && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) this.connect();
  };

  // ── Private: WebSocket handlers ────────────────────────────────────────

  private handleMessage = (event: MessageEvent): void => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.op === 1) {
        this.heartbeatIntervalMs = msg.d?.heartbeat_interval ?? 0;
        if (this.heartbeatIntervalMs > 0) {
          this.ws?.send(JSON.stringify({ op: 2, d: { subscribe_to_id: DISCORD_USER_ID } }));
          this.setConnectionState("connected");
          this.broadcastConnection();
          this.reconnectAttempts = 0;
          this.startHeartbeat(this.heartbeatIntervalMs);
        }
        return;
      }
      if (msg.op === 0 && (msg.t === "INIT_STATE" || msg.t === "PRESENCE_UPDATE")) {
        const validated = validatePresencePayload(msg.d);
        if (validated) {
          this.sequenceId++;
          this.currentState = {
            status: validated.discord_status,
            user: validated.discord_user,
            activities: validated.activities,
            spotify: validated.spotify ?? null,
            freshness: { lastAuthoritativeAt: Date.now(), sequenceId: this.sequenceId, transportGeneration: this.transportGeneration, source: "live" },
          };
          this.notifyPresence();
          this.saveToSession();
          this.broadcastState();
          this.resetStaleTimers();
        }
      }
    } catch {}
  };

  private handleClose = (): void => {
    const wasConnected = this.connectionState === "connected" || this.connectionState === "connecting";
    cleanupTimersLocal(this);
    if (wasConnected) {
      this.ws = null;
      // Let scheduler own the state transition — do NOT pre-set "reconnecting"
      scheduleReconnectLocal(this);
    } else {
      this.ws = null;
      this.setConnectionState("idle");
      this.broadcastConnection();
    }
  };

  private handleError = (): void => { this.ws?.close(); };

  private startHeartbeat(interval: number): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Keep the socket alive — no dead-socket heuristic needed.
        // WebSocket close event is sufficient for detecting connection loss.
        this.ws.send(JSON.stringify({ op: 3 }));
      }
    }, interval);
  }

  // ── Private: Reconnection ───────────────────────────────────────────────

  private notifyPresence(): void {
    const snapshot = { ...this.currentState };
    for (const fn of this.presenceListeners) fn(snapshot);
  }

  private setConnectionState(newState: ConnectionState): void {
    if (this.connectionState === newState) return;
    this.connectionState = newState;
    for (const fn of this.connectionListeners) fn(newState);
  }

  private cleanupTimers(): void { cleanupTimersLocal(this); }

  destroy(): void {
    this.detachNetworkListeners();
    this.disconnect();
    this.election?.destroy();
    if (this.stateChannel) { this.stateChannel.close(); this.stateChannel = null; }
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────

function cleanupTimersLocal(t: PresenceTransport): void {
  const self = t as any;
  if (self.heartbeatTimer) { clearInterval(self.heartbeatTimer); self.heartbeatTimer = null; }
  if (self.reconnectTimer) { clearTimeout(self.reconnectTimer); self.reconnectTimer = null; }
  if (self.softStaleTimer) { clearTimeout(self.softStaleTimer); self.softStaleTimer = null; }
  if (self.hardStaleTimer) { clearTimeout(self.hardStaleTimer); self.hardStaleTimer = null; }
}

function scheduleReconnectLocal(t: PresenceTransport): void {
  const self = t as any;
  if (self.connectionState === "reconnecting") return;
  if (!navigator.onLine || self.paused) return;
  self.setConnectionState("reconnecting");
  self.broadcastConnection();
  self.reconnectAttempts++;
  const base = Math.min(1000 * Math.pow(2, self.reconnectAttempts - 1), 30000);
  const delay = Math.floor(base + Math.random() * 1000);
  self.reconnectTimer = setTimeout(() => {
    self.reconnectTimer = null;
    self.setConnectionState("idle");
    self.broadcastConnection();
    self.connect();
  }, delay);
}

function createNoopTransport(): PresenceTransport {
  return {
    connect: () => {}, disconnect: () => {},
    getState: () => ({ ...EMPTY_STATE }),
    onPresence: () => () => {}, onConnection: () => () => {},
    destroy: () => {},
  } as unknown as PresenceTransport;
}