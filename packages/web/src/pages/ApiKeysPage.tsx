import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ApiKey } from '../types';

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<ApiKey | null>(null);

  function reload() {
    void api.listApiKeys().then(setKeys);
  }
  useEffect(reload, []);

  async function create() {
    const key = await api.createApiKey(name || undefined);
    setCreated(key); // contains the one-time secret
    setName('');
    reload();
  }

  async function remove(id: string) {
    await api.deleteApiKey(id);
    reload();
  }

  return (
    <div className="panel api-keys">
      <h3>🔑 API keys (for MCP)</h3>
      <p className="muted">
        Use a key as a Bearer token with the MCP server (HTTP header or{' '}
        <code>MINDLOG_API_KEY</code> for stdio). Keys act only on your own tasks.
      </p>

      <div className="create-row">
        <input placeholder="Key name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={create}>Generate key</button>
      </div>

      {created?.secret && (
        <div className="secret">
          <strong>Copy now — shown only once:</strong>
          <code>{created.secret}</code>
        </div>
      )}

      <ul className="key-list">
        {keys.map((k) => (
          <li key={k.id}>
            <span>
              <code>{k.prefix}…</code> {k.name && <em>{k.name}</em>}
            </span>
            <span className="muted">
              {k.lastUsedAt ? `used ${new Date(k.lastUsedAt).toLocaleString()}` : 'never used'}
            </span>
            <button className="link danger" onClick={() => remove(k.id)}>
              Revoke
            </button>
          </li>
        ))}
        {keys.length === 0 && <li className="muted">No keys yet.</li>}
      </ul>
    </div>
  );
}
