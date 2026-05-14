/**
 * Lease-based leader election for BroadcastChannel.
 *
 * Instead of a fragile timestamp comparison:
 *   - Leader writes { id, heartbeatTs } to the channel periodically
 *   - Other tabs monitor — if no heartbeat for > timeout, take over
 *   - Only one leader can exist at a time
 */

const LEADER_SYNC_CHANNEL = "presence-leader";
const HEARTBEAT_INTERVAL = 5000; // Leader broadcasts heartbeat every 5s
const LEADER_TIMEOUT = 12000; // Take over if no heartbeat for 12s

type LeaderCallback = (isLeader: boolean) => void;

export class LeaderElection {
  private tabId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  private channel: BroadcastChannel | null = null;
  private isLeader = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private checkTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLeaderHeartbeat = 0;
  private callback: LeaderCallback | null = null;

  constructor(onChange: LeaderCallback) {
    this.callback = onChange;
    this.init();
  }

  get leader(): boolean {
    return this.isLeader;
  }

  private init(): void {
    if (typeof BroadcastChannel === "undefined") {
      this.isLeader = true;
      this.callback?.(true);
      return;
    }

    this.channel = new BroadcastChannel(LEADER_SYNC_CHANNEL);

    this.channel.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === "leader-heartbeat") {
        this.lastLeaderHeartbeat = Date.now();
        if (this.isLeader && msg.tabId !== this.tabId) {
          // Another leader exists — step down
          this.stepDown();
        }
      }
    };

    // Initial election — wait briefly then try to claim leadership
    this.checkTimer = setTimeout(() => this.tryTakeLeadership(), 200 + Math.random() * 300);
  }

  private tryTakeLeadership(): void {
    if (this.isLeader) return;

    const timeSinceLastHeartbeat = Date.now() - this.lastLeaderHeartbeat;
    if (timeSinceLastHeartbeat > LEADER_TIMEOUT || this.lastLeaderHeartbeat === 0) {
      this.becomeLeader();
    } else {
      // Wait and check again
      this.checkTimer = setTimeout(() => this.tryTakeLeadership(), 1000);
    }
  }

  private becomeLeader(): void {
    this.isLeader = true;
    this.callback?.(true);
    // Emit heartbeat immediately to prevent dual-leader window on fast tab opens
    this.channel?.postMessage({
      type: "leader-heartbeat",
      tabId: this.tabId,
      ts: Date.now(),
    });
    this.lastLeaderHeartbeat = Date.now();
    this.startHeartbeat();
  }

  private stepDown(): void {
    this.isLeader = false;
    this.callback?.(false);
    this.stopHeartbeat();
    // Monitor for leader timeout
    this.checkTimer = setTimeout(() => this.tryTakeLeadership(), 2000);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.channel?.postMessage({
        type: "leader-heartbeat",
        tabId: this.tabId,
        ts: Date.now(),
      });
      this.lastLeaderHeartbeat = Date.now();
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  destroy(): void {
    this.stopHeartbeat();
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}