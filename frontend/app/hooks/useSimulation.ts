'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { SimulationData } from '../types/simulation';

const WS_URL = 'ws://localhost:8000/ws/simulation';
const RECONNECT_DELAY_MS = 2500;

interface UseSimulationReturn {
  data: SimulationData | null;
  isConnected: boolean;
  error: string | null;
}

export function useSimulation(): UseSimulationReturn {
  const [data, setData] = useState<SimulationData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  const connect = useCallback(() => {
    if (!isMounted.current) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted.current) return;
        setIsConnected(true);
        setError(null);
        // Send a heartbeat to keep the connection alive
        ws.send('ping');
      };

      ws.onmessage = (event) => {
        if (!isMounted.current) return;
        try {
          const parsed: SimulationData = JSON.parse(event.data);
          setData(parsed);
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        if (!isMounted.current) return;
        setError('WebSocket error — retrying...');
      };

      ws.onclose = () => {
        if (!isMounted.current) return;
        setIsConnected(false);
        // Auto-reconnect
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    } catch (err) {
      setError(`Failed to connect: ${err}`);
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    connect();

    return () => {
      isMounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { data, isConnected, error };
}
