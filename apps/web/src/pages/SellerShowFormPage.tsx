import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Show, ShowInventoryItem, InventoryItem } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

interface ShowForm {
  title: string;
  description: string;
  scheduledAt: string;
}

export default function SellerShowFormPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { getAccessToken, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<ShowForm>({ title: '', description: '', scheduledAt: '' });
  const [show, setShow] = useState<Show | null>(null);
  const [queue, setQueue] = useState<ShowInventoryItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [addItemId, setAddItemId] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!isNew) loadShow();
    loadInventory();
  }, [isAuthenticated, id]);

  async function loadShow() {
    setIsLoading(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/shows/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) return navigate('/seller/shows');
      if (!res.ok) throw new Error('Erro ao carregar show.');
      const data: Show = await res.json();
      setShow(data);
      setForm({
        title: data.title,
        description: data.description ?? '',
        scheduledAt: data.scheduledAt
          ? new Date(data.scheduledAt).toISOString().slice(0, 16)
          : '',
      });
      setQueue((data.queueItems ?? []) as ShowInventoryItem[]);
    } catch {
      setError('Erro ao carregar show.');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadInventory() {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/inventory?perPage=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const body = await res.json() as { data: InventoryItem[] };
        setInventory(body.data);
      }
    } catch {
      // non-critical
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const token = getAccessToken();
      const payload = {
        title: form.title,
        description: form.description || undefined,
        scheduledAt: form.scheduledAt || undefined,
      };

      let res: Response;
      if (isNew) {
        res = await fetch(`${API_URL}/v1/seller/shows`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_URL}/v1/seller/shows/${id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao salvar show.');
      }

      const data: Show = await res.json();
      setShow(data);
      setSuccessMessage('Show salvo com sucesso!');
      if (isNew) navigate(`/seller/shows/${data.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar show.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSchedule() {
    if (!show) return;
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/shows/${show.id}/schedule`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao agendar show.');
      }
      const data: Show = await res.json();
      setShow(data);
      setSuccessMessage('Show agendado com sucesso!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao agendar show.');
    }
  }

  async function handleAddToQueue() {
    if (!show || !addItemId) return;
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/shows/${show.id}/queue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryItemId: addItemId }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao adicionar item.');
      }
      const entry = await res.json() as ShowInventoryItem;
      setQueue((prev) => [...prev, entry]);
      setAddItemId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar item.');
    }
  }

  async function handleRemoveFromQueue(entryId: string) {
    if (!show) return;
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/shows/${show.id}/queue/${entryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao remover item.');
      }
      setQueue((prev) => prev.filter((q) => q.id !== entryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover item.');
    }
  }

  async function moveItem(index: number, direction: 'up' | 'down') {
    if (!show) return;
    const newQueue = [...queue];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newQueue.length) return;
    [newQueue[index], newQueue[swapIndex]] = [newQueue[swapIndex], newQueue[index]];
    setQueue(newQueue);

    try {
      const token = getAccessToken();
      await fetch(`${API_URL}/v1/seller/shows/${show.id}/queue/reorder`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newQueue.map((q) => q.id) }),
      });
    } catch {
      // revert on error
      await loadShow();
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Você precisa estar logado para gerenciar shows.</p>
        <Link to="/login" className="text-brand-500 font-medium hover:underline">Fazer login</Link>
      </div>
    );
  }

  if (isLoading) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">Carregando…</div>;
  }

  const isReadOnly = show !== null && (show.status === 'CANCELLED' || show.status === 'ENDED');
  const canSchedule = show !== null && show.status === 'DRAFT' && !!show.scheduledAt;

  // Items not yet in queue
  const queuedItemIds = new Set(queue.map((q) => q.inventoryItemId));
  const availableItems = inventory.filter((item) => !queuedItemIds.has(item.id));

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8 flex items-center gap-4">
        <Link to="/seller/shows" className="text-gray-400 hover:text-gray-600 text-sm">← Voltar</Link>
        <h1 className="text-2xl font-bold text-gray-900">{isNew ? 'Novo Show' : 'Editar Show'}</h1>
        {show && (
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-600">
            {show.status}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>
      )}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-6">{successMessage}</div>
      )}

      {/* Show details form */}
      <form onSubmit={handleSave} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Detalhes do show</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              disabled={isReadOnly}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              disabled={isReadOnly}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data e hora de início</label>
            <input
              name="scheduledAt"
              type="datetime-local"
              value={form.scheduledAt}
              onChange={handleChange}
              disabled={isReadOnly}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-3 mt-6">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-gray-700 font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              {isSaving ? 'Salvando…' : 'Salvar'}
            </button>
            {canSchedule && (
              <button
                type="button"
                onClick={handleSchedule}
                className="bg-brand-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                Agendar show
              </button>
            )}
          </div>
        )}
      </form>

      {/* Queue management – only visible for existing shows */}
      {!isNew && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Fila de itens</h2>

          {queue.length === 0 ? (
            <p className="text-sm text-gray-400 mb-4">Nenhum item na fila ainda.</p>
          ) : (
            <ol className="space-y-2 mb-4">
              {queue.map((entry, index) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2"
                >
                  <span className="text-xs font-bold text-gray-400 w-5 text-center">{index + 1}</span>
                  <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                    {(entry.inventoryItem as InventoryItem | undefined)?.title ?? entry.inventoryItemId}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveItem(index, 'up')}
                      disabled={index === 0}
                      className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                      title="Mover para cima"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveItem(index, 'down')}
                      disabled={index === queue.length - 1}
                      className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                      title="Mover para baixo"
                    >
                      ↓
                    </button>
                    {!isReadOnly && (
                      <button
                        onClick={() => handleRemoveFromQueue(entry.id)}
                        className="p-1 text-red-400 hover:text-red-600"
                        title="Remover"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {!isReadOnly && availableItems.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={addItemId}
                onChange={(e) => setAddItemId(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Selecione um item…</option>
                {availableItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
              <button
                onClick={handleAddToQueue}
                disabled={!addItemId}
                className="bg-brand-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Adicionar
              </button>
            </div>
          )}

          {!isReadOnly && inventory.length === 0 && (
            <p className="text-sm text-gray-400">
              <Link to="/seller/inventory" className="text-brand-500 hover:underline">Cadastre itens no inventário</Link>{' '}
              para adicioná-los à fila.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
