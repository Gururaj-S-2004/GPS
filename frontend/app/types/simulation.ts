// Shared TypeScript interfaces for the simulation WebSocket stream

export type TowerStatus = 'CONNECTED' | 'IDLE' | 'SUPPRESSED' | 'BEAMFORMED_ACTIVE';

export interface Tower {
  id: string;
  name: string;
  path: string;
  coordinates: { lat: number; lon: number };
  frequency_band: string;
  status: TowerStatus;
  allocated_power_dbm: number;
}

export interface SimulationData {
  tick: number;
  timestamp: string;
  vehicle: {
    lat: number;
    lon: number;
    heading: number;
    speed_kmh: number;
  };
  prediction: {
    predicted_path: string | null;
    confidence: number;
    distance_to_center_m: number;
  };
  towers: {
    handover_active: boolean;
    active_tower: Tower | null;
    suppressed_towers: Tower[];
    all_towers: Record<string, Tower>;
    stats: {
      total_handovers: number;
      ping_pong_events: number;
      ping_pong_reduction_pct: number;
    };
  };
  network: {
    latency_ms: number;
    handover_latency_ms: number | null;
    throughput_mbps: number;
  };
}
