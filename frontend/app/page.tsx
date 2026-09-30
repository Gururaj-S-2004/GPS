'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Signal, Navigation, Activity, AlertTriangle,
  TrendingUp, Gauge, Radio, Smartphone, Monitor,
  Download, FileJson, FileText, WifiOff, AlertCircle,
} from 'lucide-react';
import { useSimulation } from './hooks/useSimulation';
import { useTelemetry } from './hooks/useTelemetry';
import { SimulationData, Tower, TowerStatus } from './types/simulation';
import SimulatorPanel from './components/SimulatorPanel';

const SimulationMap = dynamic(() => import('./components/SimulationMap'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#0c1424' }}>
      <div style={{ textAlign: 'center', color: '#38bdf8' }}>
        <div style={{ fontSize: 12, fontFamily: 'monospace', marginBottom: 4, opacity: 0.6 }}>INITIALISING MAP</div>
        <div style={{ fontSize: 11, color: '#3d5a78' }}>Loading tile engine…</div>
      </div>
    </div>
  ),
});

// ── Types ────────────────────────────────────────────────────────────────────

type AppMode = 'demo' | 'live';
type LiveSubMode = 'desktop' | 'mobile';

interface LogEntry {
  timestamp: string;
  tick: number;
  event: 'HANDOVER' | 'CLEAR' | 'TICK';
  predicted_path: string | null;
  confidence: number;
  distance_m: number;
  heading: number;
  speed_kmh: number;
  lat: number;
  lon: number;
  active_tower: string | null;
  handover_count: number;
  ping_pong_events: number;
  ping_pong_reduction_pct: number;
  latency_ms: number;
  throughput_mbps: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function towerStatusClass(status: TowerStatus): string {
  if (status === 'BEAMFORMED_ACTIVE') return 'badge-green';
  if (status === 'CONNECTED') return 'badge-cyan';
  if (status === 'SUPPRESSED') return 'badge-red';
  return 'badge-muted';
}

function towerStatusColor(status: TowerStatus): string {
  if (status === 'BEAMFORMED_ACTIVE') return '#00ff88';
  if (status === 'CONNECTED') return '#38bdf8';
  if (status === 'SUPPRESSED') return '#ef4444';
  return '#475569';
}

function headingLabel(deg: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ icon, label, badge }: { icon: React.ReactNode; label: string; badge?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <div style={{ color: '#38bdf8', display: 'flex' }}>{icon}</div>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#7fa8c9', textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace' }}>
        {label}
      </span>
      {badge}
    </div>
  );
}

function MetricRow({ label, value, unit, color }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ fontSize: 11, color: '#475569' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color ?? '#e2e8f0', fontFamily: 'JetBrains Mono, monospace' }}>
        {value}{unit && <span style={{ color: '#475569', fontWeight: 400, marginLeft: 2 }}>{unit}</span>}
      </span>
    </div>
  );
}

function TowerRow({ tower }: { tower: Tower }) {
  const color = towerStatusColor(tower.status);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid rgba(56,189,248,0.06)' }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
        boxShadow: tower.status !== 'SUPPRESSED' ? `0 0 6px ${color}` : 'none',
        opacity: tower.status === 'SUPPRESSED' ? 0.4 : 1,
        transition: 'all 0.4s ease',
      }} />
      <span style={{ fontSize: 10, color: '#94a3b8', flex: 1, fontFamily: 'JetBrains Mono, monospace' }}>
        {tower.id.replace('TOWER_', 'TWR-')} · {tower.frequency_band}
      </span>
      <span className={`badge ${towerStatusClass(tower.status)}`} style={{ fontSize: 9 }}>
        {tower.status === 'BEAMFORMED_ACTIVE' ? 'BEAM' : tower.status.slice(0, 4)}
      </span>
      <span style={{ fontSize: 10, color: '#475569', fontFamily: 'JetBrains Mono, monospace', minWidth: 42, textAlign: 'right' }}>
        {tower.allocated_power_dbm} dBm
      </span>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [appMode, setAppMode] = useState<AppMode>('demo');
  const [liveSubMode, setLiveSubMode] = useState<LiveSubMode>('desktop');
  const [logCount, setLogCount] = useState(0);
  const [isStale, setIsStale] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const logRef = useRef<LogEntry[]>([]);
  const prevHandoverRef = useRef<boolean>(false);
  const lastUpdateRef = useRef<number>(Date.now());

  const { data: simData, isConnected: simConnected, error: simError } = useSimulation();
  const { data: telData, isConnected: telConnected, error: telError, send } = useTelemetry();

  // Active data source
  const data: SimulationData | null = appMode === 'demo' ? simData : telData;
  const isConnected = appMode === 'demo' ? simConnected : telConnected;
  const wsError = appMode === 'demo' ? simError : telError;

  const towers = data ? Object.values(data.towers.all_towers) : [];
  const handoverActive = data?.towers.handover_active ?? false;
  const activeTower = data?.towers.active_tower;
  const stats = data?.towers.stats;
  const vehicle = data?.vehicle;
  const pred = data?.prediction;
  const net = data?.network;
  const dataSource = (data as any)?.source as string | undefined;

  // ── Stale data detection ──────────────────────────────────────────────────

  useEffect(() => {
    if (data) {
      lastUpdateRef.current = Date.now();
      setIsStale(false);
    }
  }, [data]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsStale(isConnected && Date.now() - lastUpdateRef.current > 6000);
    }, 2000);
    return () => clearInterval(interval);
  }, [isConnected]);

  // ── Handover log accumulation ─────────────────────────────────────────────

  useEffect(() => {
    if (!data) return;

    const currentHandover = data.towers.handover_active;
    let event: LogEntry['event'] = 'TICK';
    if (currentHandover && !prevHandoverRef.current) event = 'HANDOVER';
    else if (!currentHandover && prevHandoverRef.current) event = 'CLEAR';
    prevHandoverRef.current = currentHandover;

    // Log every handover event + sample every 4th tick
    if (event !== 'TICK' || data.tick % 4 === 0) {
      const entry: LogEntry = {
        timestamp: data.timestamp,
        tick: data.tick,
        event,
        predicted_path: data.prediction.predicted_path,
        confidence: data.prediction.confidence,
        distance_m: data.prediction.distance_to_center_m,
        heading: data.vehicle.heading,
        speed_kmh: data.vehicle.speed_kmh,
        lat: data.vehicle.lat,
        lon: data.vehicle.lon,
        active_tower: data.towers.active_tower?.id ?? null,
        handover_count: data.towers.stats.total_handovers,
        ping_pong_events: data.towers.stats.ping_pong_events,
        ping_pong_reduction_pct: data.towers.stats.ping_pong_reduction_pct,
        latency_ms: data.network.latency_ms,
        throughput_mbps: data.network.throughput_mbps,
      };
      logRef.current = [...logRef.current.slice(-499), entry];
      setLogCount(logRef.current.length);
    }
  }, [data]);

  // ── Export functions ──────────────────────────────────────────────────────

  const exportJSON = useCallback(() => {
    const payload = {
      exported_at: new Date().toISOString(),
      mode: appMode,
      entry_count: logRef.current.length,
      entries: logRef.current,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `handover_log_${Date.now()}.json`);
    setExportMenuOpen(false);
  }, [appMode]);

  const exportCSV = useCallback(() => {
    const headers = [
      'timestamp', 'tick', 'event', 'predicted_path', 'confidence',
      'distance_m', 'heading', 'speed_kmh', 'lat', 'lon',
      'active_tower', 'handover_count', 'ping_pong_events',
      'ping_pong_reduction_pct', 'latency_ms', 'throughput_mbps',
    ];
    const rows = logRef.current.map((e) =>
      headers.map((h) => {
        const v = (e as any)[h];
        return v === null || v === undefined ? '' : String(v);
      }).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, `handover_log_${Date.now()}.csv`);
    setExportMenuOpen(false);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-deep)', overflow: 'hidden' }}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <header className="glass-panel" style={{
        padding: '0 20px', height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: 'none', borderLeft: 'none', borderRight: 'none',
        borderBottom: '1px solid rgba(56,189,248,0.15)',
        zIndex: 10, flexShrink: 0, gap: 16,
      }}>

        {/* Left — Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
          <Radio size={16} style={{ color: '#38bdf8', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: '#e2e8f0', lineHeight: 1.2 }}>
              PREDICTIVE 5G HANDOVER
            </div>
            <div style={{ fontSize: 8, color: '#3d5a78', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em' }}>
              SPATIAL TRAJECTORY · BEAMFORMING
            </div>
          </div>
        </div>

        {/* Center — Mode toggle */}
        <div className="mode-toggle" id="mode-toggle-bar">
          <button
            id="btn-simulated-demo"
            className={`mode-toggle-btn ${appMode === 'demo' ? 'active' : 'inactive'}`}
            onClick={() => setAppMode('demo')}
            title="Simulated Demo Mode — automatic vehicle simulation"
          >
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: appMode === 'demo' ? '#00ff88' : '#475569',
              boxShadow: appMode === 'demo' ? '0 0 6px #00ff88' : 'none',
              animation: appMode === 'demo' ? 'dot-blink 1.2s ease-in-out infinite' : 'none',
              marginRight: 6, verticalAlign: 'middle',
            }} />
            🖥 SIMULATED DEMO
          </button>
          <button
            id="btn-live-telemetry"
            className={`mode-toggle-btn ${appMode === 'live' ? 'active' : 'inactive'}`}
            onClick={() => setAppMode('live')}
            title="Live Telemetry Mode — real GPS data from device or simulator"
          >
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: appMode === 'live' ? '#facc15' : '#475569',
              boxShadow: appMode === 'live' ? '0 0 6px #facc15' : 'none',
              animation: appMode === 'live' ? 'dot-blink 0.9s ease-in-out infinite' : 'none',
              marginRight: 6, verticalAlign: 'middle',
            }} />
            📡 LIVE TELEMETRY
          </button>
        </div>

        {/* Right — Status + Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200, justifyContent: 'flex-end' }}>
          {data && (
            <span style={{ fontSize: 9, color: '#3d5a78', fontFamily: 'JetBrains Mono, monospace' }}>
              #{data.tick.toString().padStart(4, '0')}
            </span>
          )}
          {dataSource && (
            <span className={`badge ${dataSource === 'mobile' ? 'badge-amber' : 'badge-cyan'}`} style={{ fontSize: 9 }}>
              {dataSource === 'mobile' ? '📱 GPS' : '🖥 SIM'}
            </span>
          )}

          {/* Export dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              className="export-btn"
              onClick={() => setExportMenuOpen((v) => !v)}
              title="Export Handover Logs"
            >
              <Download size={11} />
              EXPORT
              {logCount > 0 && (
                <span className="log-pill">{logCount}</span>
              )}
            </button>

            {exportMenuOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6,
                background: 'rgba(8,16,32,0.98)', border: '1px solid rgba(56,189,248,0.25)',
                borderRadius: 10, overflow: 'hidden', zIndex: 100,
                boxShadow: '0 8px 32px rgba(0,0,0,0.7)', minWidth: 180,
              }}>
                <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid rgba(56,189,248,0.1)' }}>
                  <span style={{ fontSize: 9, color: '#475569', fontFamily: 'JetBrains Mono, monospace' }}>
                    {logCount} entries recorded
                  </span>
                </div>
                <button
                  onClick={exportJSON}
                  disabled={logCount === 0}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', background: 'transparent',
                    border: 'none', borderBottom: '1px solid rgba(56,189,248,0.08)',
                    color: logCount > 0 ? '#e2e8f0' : '#3d5a78',
                    cursor: logCount > 0 ? 'pointer' : 'not-allowed',
                    fontSize: 12, textAlign: 'left',
                  }}
                >
                  <FileJson size={14} style={{ color: '#facc15' }} />
                  Export as JSON
                </button>
                <button
                  onClick={exportCSV}
                  disabled={logCount === 0}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', background: 'transparent',
                    border: 'none',
                    color: logCount > 0 ? '#e2e8f0' : '#3d5a78',
                    cursor: logCount > 0 ? 'pointer' : 'not-allowed',
                    fontSize: 12, textAlign: 'left',
                  }}
                >
                  <FileText size={14} style={{ color: '#00ff88' }} />
                  Export as CSV
                </button>
              </div>
            )}
          </div>

          {/* Connection status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div className="live-dot" style={{ background: isConnected ? '#00ff88' : '#ef4444' }} />
            <span style={{ fontSize: 10, color: isConnected ? '#00ff88' : '#ef4444', fontFamily: 'JetBrains Mono, monospace' }}>
              {isConnected ? 'LIVE' : 'RECONNECT'}
            </span>
          </div>
        </div>
      </header>

      {/* ══ BODY ════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Map ──────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <SimulationMap data={data} />

          {/* 50m zone label */}
          <div style={{
            position: 'absolute', bottom: 16, left: 16, zIndex: 800,
            padding: '6px 12px', borderRadius: 8,
            background: 'rgba(5,9,15,0.85)', border: '1px solid rgba(245,158,11,0.3)',
            backdropFilter: 'blur(8px)',
          }}>
            <span style={{ fontSize: 9, color: '#f59e0b', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace' }}>
              ◎  50 m HANDOVER ZONE
            </span>
          </div>

          {/* Distance readout */}
          {pred && (
            <div style={{
              position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
              zIndex: 800, padding: '6px 16px', borderRadius: 8,
              background: 'rgba(5,9,15,0.85)', border: '1px solid var(--border)',
              backdropFilter: 'blur(8px)',
            }}>
              <span style={{ fontSize: 10, color: '#7fa8c9', fontFamily: 'JetBrains Mono, monospace' }}>
                Δ <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{pred.distance_to_center_m.toFixed(1)}</span> m to intersection
              </span>
            </div>
          )}

          {/* Mobile wait overlay */}
          {appMode === 'live' && liveSubMode === 'mobile' && !data && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(5,9,15,0.65)', backdropFilter: 'blur(6px)',
            }}>
              <div style={{
                textAlign: 'center', padding: '28px 36px', borderRadius: 16,
                background: 'rgba(8,16,32,0.92)', border: '1px solid rgba(56,189,248,0.25)',
                boxShadow: '0 8px 48px rgba(0,0,0,0.6)', maxWidth: 340,
              }}>
                <Smartphone size={32} style={{ color: '#38bdf8', marginBottom: 12 }} />
                <p style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Waiting for mobile GPS</p>
                <p style={{ fontSize: 11, color: '#7fa8c9', marginBottom: 14, lineHeight: 1.5 }}>
                  Open this URL on your phone, grant location permission, and tap <strong style={{ color: '#00ff88' }}>START TRANSMITTING</strong>:
                </p>
                <code style={{ display: 'block', fontSize: 12, color: '#facc15', padding: '8px 12px', background: 'rgba(250,204,21,0.08)', borderRadius: 8, fontFamily: 'JetBrains Mono, monospace', border: '1px solid rgba(250,204,21,0.2)' }}>
                  http://localhost:3000/mobile
                </code>
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#475569', animation: 'dot-blink 1.5s ease-in-out infinite' }} />
                  <p style={{ fontSize: 10, color: '#475569', fontFamily: 'JetBrains Mono, monospace' }}>Dashboard streams live as you walk</p>
                </div>
              </div>
            </div>
          )}

          {/* Click outside export menu */}
          {exportMenuOpen && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setExportMenuOpen(false)} />
          )}
        </div>

        {/* ── Side Panel ──────────────────────────────────────────────────── */}
        <aside className="glass-panel" style={{
          width: 300, overflowY: 'auto', overflowX: 'hidden',
          padding: '14px', display: 'flex', flexDirection: 'column', gap: 12,
          borderTop: 'none', borderBottom: 'none', borderRight: 'none',
          borderLeft: '1px solid rgba(56,189,248,0.12)', flexShrink: 0,
        }}>

          {/* ── Error / Stale banners ─────────────────────────────────────── */}
          {!isConnected && (
            <div className="error-banner">
              <WifiOff size={13} />
              <span>WebSocket disconnected — reconnecting…</span>
            </div>
          )}
          {isConnected && isStale && (
            <div className="warn-banner">
              <AlertCircle size={13} />
              <span>No data received for &gt;6 s</span>
            </div>
          )}
          {wsError && !isStale && (
            <div className="warn-banner">
              <AlertCircle size={13} />
              <span>{wsError}</span>
            </div>
          )}

          {/* ── Live sub-mode tabs (only in live mode) ────────────────────── */}
          {appMode === 'live' && (
            <div>
              <SectionTitle icon={<Radio size={13} />} label="Telemetry Source" />
              <div style={{
                display: 'flex', borderRadius: 8,
                background: 'rgba(8,16,32,0.6)', border: '1px solid rgba(56,189,248,0.12)',
                overflow: 'hidden',
              }}>
                {(['desktop', 'mobile'] as const).map((m) => (
                  <button key={m} onClick={() => setLiveSubMode(m)} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    padding: '7px 4px', border: 'none', cursor: 'pointer', fontSize: 10,
                    fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.05em',
                    transition: 'all 0.2s',
                    background: liveSubMode === m ? 'rgba(56,189,248,0.15)' : 'transparent',
                    color: liveSubMode === m ? '#38bdf8' : '#475569',
                    borderBottom: liveSubMode === m ? '2px solid #38bdf8' : '2px solid transparent',
                  }}>
                    {m === 'desktop' ? <Monitor size={11} /> : <Smartphone size={11} />}
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Simulator panel (live + desktop) ─────────────────────────── */}
          {appMode === 'live' && liveSubMode === 'desktop' && (
            <div>
              <SectionTitle icon={<Monitor size={13} />} label="Simulator Controls" />
              <div className="metric-card">
                <SimulatorPanel send={send} isConnected={telConnected} />
              </div>
            </div>
          )}

          {/* ── Mobile info (live + mobile) ───────────────────────────────── */}
          {appMode === 'live' && liveSubMode === 'mobile' && (
            <div className="metric-card" style={{ textAlign: 'center', padding: '14px' }}>
              <Smartphone size={20} style={{ color: '#38bdf8', margin: '0 auto 6px' }} />
              <p style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>Open on your phone:</p>
              <code style={{ display: 'block', fontSize: 11, color: '#facc15', background: 'rgba(250,204,21,0.08)', padding: '6px', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-all' }}>
                http://localhost:3000/mobile
              </code>
              <p style={{ fontSize: 10, color: '#475569', marginTop: 6 }}>
                Requires HTTPS for deviceorientation on iOS.
              </p>
            </div>
          )}

          {/* ── Handover alert ────────────────────────────────────────────── */}
          {handoverActive && activeTower ? (
            <div className="handover-alert" style={{
              background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.45)',
              padding: '12px 14px', borderRadius: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <AlertTriangle size={14} style={{ color: '#facc15' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#facc15', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace' }}>
                  HANDOVER TRIGGERED
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#fde68a', fontWeight: 600, marginBottom: 4, fontFamily: 'JetBrains Mono, monospace' }}>
                ↪ {activeTower.id} BEAMFORMED_ACTIVE
              </div>
              <div style={{ fontSize: 10, color: '#92400e' }}>
                Confidence:&nbsp;<span style={{ color: '#fcd34d' }}>{((pred?.confidence ?? 0) * 100).toFixed(0)}%</span>
                &nbsp;·&nbsp;Power:&nbsp;<span style={{ color: '#fcd34d' }}>{activeTower.allocated_power_dbm} dBm</span>
              </div>
            </div>
          ) : (
            <div className="metric-card" style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 6px #38bdf8' }} />
                <span style={{ fontSize: 10, color: '#38bdf8', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em' }}>
                  ALL TOWERS · DEFAULT STATE
                </span>
              </div>
            </div>
          )}

          {/* ── Vehicle Telemetry ─────────────────────────────────────────── */}
          <div>
            <SectionTitle icon={<Navigation size={13} />} label="Vehicle Telemetry" />
            <div className="metric-card">
              <MetricRow label="Speed" value={vehicle?.speed_kmh.toFixed(1) ?? '—'} unit="km/h" color="#facc15" />
              <MetricRow label="Heading" value={vehicle ? `${vehicle.heading.toFixed(0)}° ${headingLabel(vehicle.heading)}` : '—'} />
              <MetricRow label="Latitude" value={vehicle?.lat.toFixed(6) ?? '—'} color="#94a3b8" />
              <MetricRow label="Longitude" value={vehicle?.lon.toFixed(6) ?? '—'} color="#94a3b8" />
              <MetricRow label="Pred. Path" value={pred?.predicted_path ?? 'NONE'} color={pred?.predicted_path ? '#00ff88' : '#475569'} />
              <MetricRow label="Confidence" value={pred ? `${(pred.confidence * 100).toFixed(0)}%` : '—'} color="#38bdf8" />
            </div>
          </div>

          {/* ── Network Metrics ───────────────────────────────────────────── */}
          <div>
            <SectionTitle icon={<Activity size={13} />} label="Network Metrics" />
            <div className="metric-card">
              <MetricRow label="E2E Latency" value={net?.latency_ms.toFixed(1) ?? '—'} unit="ms" color="#38bdf8" />
              <MetricRow
                label="H/O Latency"
                value={net?.handover_latency_ms != null ? net.handover_latency_ms.toFixed(1) : '—'}
                unit={net?.handover_latency_ms != null ? 'ms' : undefined}
                color="#f59e0b"
              />
              <MetricRow label="Throughput" value={net?.throughput_mbps.toFixed(0) ?? '—'} unit="Mbps" color="#00ff88" />
              {net && (
                <div className="progress-bar" style={{ marginTop: 8 }}>
                  <div className="progress-fill" style={{ width: `${Math.min((net.throughput_mbps / 1200) * 100, 100)}%` }} />
                </div>
              )}
            </div>
          </div>

          {/* ── Tower Status ──────────────────────────────────────────────── */}
          <div>
            <SectionTitle icon={<Signal size={13} />} label="Tower Status" />
            <div className="metric-card" style={{ padding: '8px 12px' }}>
              {towers.length > 0
                ? towers.map((t) => <TowerRow key={t.id} tower={t} />)
                : [0, 1, 2, 3].map((i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, padding: '6px 0' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1e293b', flexShrink: 0 }} />
                    <div style={{ flex: 1, height: 10, borderRadius: 4, background: '#0f172a' }} />
                  </div>
                ))}
            </div>
          </div>

          {/* ── Efficiency Stats ──────────────────────────────────────────── */}
          <div>
            <SectionTitle
              icon={<TrendingUp size={13} />}
              label="Efficiency Gains"
              badge={logCount > 0 && (
                <span className="log-pill">{logCount} logs</span>
              )}
            />
            <div className="metric-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 10, color: '#475569' }}>Ping-Pong Reduction</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#00ff88', fontFamily: 'JetBrains Mono, monospace' }}>
                  {stats?.ping_pong_reduction_pct.toFixed(0) ?? '—'}<span style={{ fontSize: 12, color: '#00a855' }}>%</span>
                </span>
              </div>
              <div className="progress-bar" style={{ marginBottom: 10 }}>
                <div className="progress-fill" style={{ width: `${stats?.ping_pong_reduction_pct ?? 0}%`, background: 'linear-gradient(90deg, #00ff88, #38bdf8)' }} />
              </div>
              <MetricRow label="Total Handovers" value={stats?.total_handovers ?? '—'} />
              <MetricRow label="Ping-Pong Events" value={stats?.ping_pong_events ?? '—'} color="#f59e0b" />
            </div>
          </div>

          {/* ── System Info ───────────────────────────────────────────────── */}
          <div>
            <SectionTitle icon={<Gauge size={13} />} label="System" />
            <div className="metric-card">
              <MetricRow label="Intersection" value="13.0827, 80.2707" color="#475569" />
              <MetricRow label="H/O Zone" value="50 m radius" color="#f59e0b" />
              <MetricRow label="Alignment Tol." value="±25°" color="#38bdf8" />
              <MetricRow label="Consec. Thresh." value="> 2 ticks" color="#38bdf8" />
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 9, color: '#1e3a5f', textAlign: 'center', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace' }}>
              5G NR · GeoPy · FastAPI · WebSocket
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
