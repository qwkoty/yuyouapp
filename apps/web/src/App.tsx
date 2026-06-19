import { useState, useCallback } from 'react';

interface Service {
  id: string;
  name: string;
  type: string;
  ownerId?: string;
}

interface Deploy {
  id: string;
  status: string;
  createdAt: string;
  commit?: { id?: string; message?: string };
}

interface LogEntry {
  timestamp?: string;
  message?: string;
  level?: string;
}

type View = 'services' | 'deploys' | 'logs';

async function fetchApi<T>(endpoint: string, apiKey: string): Promise<T> {
  const res = await fetch(`/api${endpoint}`, {
    headers: { 'x-api-key': apiKey },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('services');

  const [services, setServices] = useState<Service[]>([]);
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [logs, setLogs] = useState<LogEntry[] | string | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDeploy, setSelectedDeploy] = useState<Deploy | null>(null);

  const loadServices = useCallback(async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchApi<Service[]>('/services', apiKey.trim());
      setServices(data);
      setView('services');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  const loadDeploys = useCallback(
    async (service: Service) => {
      setSelectedService(service);
      setLoading(true);
      setError('');
      try {
        const data = await fetchApi<Deploy[]>(
          `/services/${service.id}/deploys`,
          apiKey.trim()
        );
        setDeploys(data);
        setView('deploys');
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [apiKey]
  );

  const loadLogs = useCallback(
    async (deploy: Deploy) => {
      setSelectedDeploy(deploy);
      setLoading(true);
      setError('');
      try {
        const data = await fetchApi<LogEntry[] | string>(
          `/services/${selectedService!.id}/deploys/${deploy.id}/logs`,
          apiKey.trim()
        );
        setLogs(data);
        setView('logs');
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [apiKey, selectedService]
  );

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const statusClass = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s === 'live') return 'status-live';
    if (s === 'build_in_progress' || s === 'pre_deploy_in_progress')
      return 'status-building';
    if (s === 'build_failed' || s === 'pre_deploy_failed' || s === 'deactivated')
      return 'status-failed';
    return 'status-deactivating';
  };

  const renderLogs = () => {
    if (!logs) {
      return <div className="empty-state">No logs available</div>;
    }
    if (typeof logs === 'string') {
      return (
        <div className="logs-container">
          {logs.split('\n').map((line, i) => (
            <div key={i} className="log-line">
              {line}
            </div>
          ))}
        </div>
      );
    }
    if (Array.isArray(logs)) {
      if (logs.length === 0) {
        return <div className="empty-state">No log entries found</div>;
      }
      return (
        <div className="logs-container">
          {logs.map((entry, i) => {
            const text =
              typeof entry === 'string'
                ? entry
                : entry.message || JSON.stringify(entry);
            const level = typeof entry === 'object' ? entry.level : undefined;
            let cls = 'log-line';
            if (level === 'error') cls += ' error';
            else if (level === 'warn') cls += ' warn';
            return (
              <div key={i} className={cls}>
                {entry.timestamp && (
                  <span style={{ color: '#64748b', marginRight: 8 }}>
                    {entry.timestamp}
                  </span>
                )}
                {text}
              </div>
            );
          })}
        </div>
      );
    }
    return (
      <div className="logs-container">
        <div className="log-line">{JSON.stringify(logs, null, 2)}</div>
      </div>
    );
  };

  return (
    <div className="app">
      <div className="header">
        <h1>Render Logs Viewer</h1>
        <p>Enter your Render API key to view deployment logs</p>
      </div>

      <div className="api-key-section">
        <label htmlFor="apiKey">Render API Key</label>
        <input
          id="apiKey"
          className="api-key-input"
          type="password"
          placeholder="rnd_xxxxxxxxxxxxxxxx"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadServices()}
        />
        <button
          className="btn btn-primary"
          onClick={loadServices}
          disabled={loading || !apiKey.trim()}
        >
          {loading ? 'Loading...' : 'Fetch Services'}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {view === 'services' && services.length > 0 && (
        <div className="services-section">
          <h2>Services ({services.length})</h2>
          <div className="service-list">
            {services.map((svc) => (
              <div
                key={svc.id}
                className={`service-card ${
                  selectedService?.id === svc.id ? 'active' : ''
                }`}
                onClick={() => loadDeploys(svc)}
              >
                <div className="service-name">{svc.name}</div>
                <div className="service-type">{svc.type}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'deploys' && selectedService && (
        <div className="deploys-section">
          <button className="back-btn" onClick={() => setView('services')}>
            &larr; Back to Services
          </button>
          <h2>
            Deploys &mdash; {selectedService.name}
          </h2>
          {loading ? (
            <div className="loading">Loading deploys...</div>
          ) : deploys.length === 0 ? (
            <div className="empty-state">No deploys found for this service</div>
          ) : (
            <div className="deploy-list">
              {deploys.map((d) => (
                <div
                  key={d.id}
                  className={`deploy-card ${
                    selectedDeploy?.id === d.id ? 'active' : ''
                  }`}
                  onClick={() => loadLogs(d)}
                >
                  <div className="deploy-header">
                    <span className="deploy-id">{d.id}</span>
                    <span className={`deploy-status ${statusClass(d.status)}`}>
                      {d.status}
                    </span>
                  </div>
                  <div className="deploy-time">{formatTime(d.createdAt)}</div>
                  {d.commit?.message && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: '#94a3b8',
                        marginTop: 4,
                      }}
                    >
                      {d.commit.message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'logs' && selectedDeploy && (
        <div className="logs-section">
          <button className="back-btn" onClick={() => setView('deploys')}>
            &larr; Back to Deploys
          </button>
          <h2>
            Logs &mdash; Deploy {selectedDeploy.id}
          </h2>
          {loading ? (
            <div className="loading">Loading logs...</div>
          ) : (
            renderLogs()
          )}
        </div>
      )}
    </div>
  );
}
