import { useState, useEffect, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FileSpreadsheet, Package, Upload } from 'lucide-react';
import type { InventoryItem, ItemCondition } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

const CONDITION_LABELS: Record<ItemCondition, string> = {
  NEW: 'Novo',
  USED: 'Usado',
  REFURBISHED: 'Recondicionado',
};

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export default function SellerInventoryPage() {
  const { getAccessToken, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [bulkRowsText, setBulkRowsText] = useState('');
  const [isBulkImporting, setIsBulkImporting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchItems();
  }, [isAuthenticated]);

  async function fetchItems() {
    setIsLoading(true);
    setError(null);

    async function requestItems(): Promise<InventoryItem[]> {
      const token = getAccessToken();
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch(`${API_URL}/v1/seller/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erro ao carregar inventário.');
      const body = await res.json() as { data: InventoryItem[] };
      return body.data;
    }

    try {
      let loaded = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const data = await requestItems();
          setItems(data);
          loaded = true;
          break;
        } catch {
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
          }
        }
      }

      if (!loaded) {
        throw new Error('Erro ao carregar inventário.');
      }
    } catch {
      setError('Erro ao carregar inventário.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Confirma a exclusão deste item?')) return;
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/inventory/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao excluir item.');
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir item.');
    }
  }

  async function handleBulkFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setBulkRowsText(text);
      setError(null);
    } catch {
      setError('Não foi possível ler o arquivo selecionado.');
    } finally {
      event.target.value = '';
    }
  }

  async function handleBulkImport() {
    if (!bulkRowsText.trim()) return;
    setError(null);
    setSuccessMessage(null);
    setIsBulkImporting(true);

    try {
      const token = getAccessToken();
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch(`${API_URL}/v1/seller/inventory/bulk-import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rowsText: bulkRowsText }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? 'Erro ao importar itens.');
      }

      const body = await res.json() as { createdCount: number; items: InventoryItem[] };
      setItems((current) => [...body.items, ...current]);
      setBulkRowsText('');
      setSuccessMessage(`${body.createdCount} item(ns) importado(s) para o inventário.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar itens.');
    } finally {
      setIsBulkImporting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Você precisa estar logado para acessar o inventário.</p>
        <Link to="/login" className="text-brand-500 font-medium hover:underline">Fazer login</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meu Inventário</h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie os produtos que você vende nas suas transmissões.</p>
        </div>
        <button
          onClick={() => navigate('/seller/inventory/new')}
          className="bg-brand-500 hover:bg-orange-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Novo item
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            onClick={fetchItems}
            className="text-sm font-semibold text-red-700 hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-6">
          {successMessage}
        </div>
      )}

      <div className="mb-8 rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-brand-500" />
              Importar vários itens para o inventário
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Cole CSV ou TSV com colunas <code>title</code>, <code>startingPrice</code>, <code>condition</code>, <code>description</code>.
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Depois você pode adicionar esses itens a qualquer show.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:border-brand-200 hover:text-brand-600">
            <Upload className="w-3.5 h-3.5" />
            Carregar arquivo
            <input
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain"
              className="hidden"
              onChange={handleBulkFileChange}
            />
          </label>
        </div>

        <textarea
          value={bulkRowsText}
          onChange={(e) => setBulkRowsText(e.target.value)}
          rows={8}
          placeholder={`title,startingPrice,condition,description\nAnel de prata,49.90,USED,Aro 19\nCamisa vintage,79.00,USED,Algodão`}
          className="mt-4 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 font-mono text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            Até 200 linhas por importação. Itens importados ficam disponíveis para qualquer show.
          </p>
          <button
            type="button"
            onClick={handleBulkImport}
            disabled={isBulkImporting || !bulkRowsText.trim()}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
          >
            {isBulkImporting ? 'Importando…' : 'Importar para o inventário'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 py-16">Carregando…</div>
      ) : error ? null : items.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl">
          <p className="text-gray-500 mb-4">Seu inventário está vazio.</p>
          <button
            onClick={() => navigate('/seller/inventory/new')}
            className="bg-brand-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            Cadastrar primeiro item
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const firstImage = item.images?.[0];
            return (
              <div
                key={item.id}
                className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {firstImage ? (
                  <div className="h-40 bg-gray-100 flex items-center justify-center text-gray-300 text-sm">
                    <span>Imagem: {firstImage.fileName}</span>
                  </div>
                ) : (
                  <div className="h-40 bg-gray-50 flex items-center justify-center">
                    <Package className="w-12 h-12 text-gray-300" />
                  </div>
                )}
                <div className="p-4">
                  <h2 className="font-semibold text-gray-900 truncate mb-1">{item.title}</h2>
                  <p className="text-xs text-gray-400 mb-2">{CONDITION_LABELS[item.condition]}</p>
                  <p className="text-sm font-bold text-brand-500">
                    {brlFormatter.format(Number(item.startingPrice))}
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    <Link
                      to={`/seller/inventory/${item.id}`}
                      className="text-sm font-medium text-brand-500 hover:underline"
                    >
                      Editar
                    </Link>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-sm font-medium text-red-500 hover:underline"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
