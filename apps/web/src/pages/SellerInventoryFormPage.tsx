import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { InventoryItem, InventoryImage, ItemCondition } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

const CONDITIONS: { value: ItemCondition; label: string }[] = [
  { value: 'NEW', label: 'Novo' },
  { value: 'USED', label: 'Usado' },
  { value: 'REFURBISHED', label: 'Recondicionado' },
];

interface ItemForm {
  title: string;
  description: string;
  condition: ItemCondition;
  startingPrice: string;
}

export default function SellerInventoryFormPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { getAccessToken, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<ItemForm>({
    title: '',
    description: '',
    condition: 'NEW',
    startingPrice: '',
  });
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [images, setImages] = useState<InventoryImage[]>([]);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || isNew) return;
    loadItem();
  }, [isAuthenticated, id]);

  async function loadItem() {
    setIsLoading(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/inventory/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) return navigate('/seller/inventory');
      if (!res.ok) throw new Error('Erro ao carregar item.');
      const data: InventoryItem = await res.json();
      setItem(data);
      setImages(data.images ?? []);
      setForm({
        title: data.title,
        description: data.description ?? '',
        condition: data.condition,
        startingPrice: String(data.startingPrice),
      });
    } catch {
      setError('Erro ao carregar item.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
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
        condition: form.condition,
        startingPrice: Number(form.startingPrice),
      };

      let res: Response;
      if (isNew) {
        res = await fetch(`${API_URL}/v1/seller/inventory`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_URL}/v1/seller/inventory/${id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao salvar item.');
      }

      const data: InventoryItem = await res.json();
      setItem(data);
      setImages(data.images ?? []);
      setSuccessMessage('Item salvo com sucesso!');
      if (isNew) navigate(`/seller/inventory/${data.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar item.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !item) return;

    const uploadKey = `${file.name}-${Date.now()}`;
    setUploadStatus((prev) => ({ ...prev, [uploadKey]: 'uploading' }));
    setError(null);

    try {
      const token = getAccessToken();

      // Step 1: Get signed upload URL
      const urlRes = await fetch(`${API_URL}/v1/seller/inventory/${item.id}/images/upload-url`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type }),
      });

      if (!urlRes.ok) {
        const body = await urlRes.json();
        throw new Error(body.message ?? 'Erro ao obter URL de upload.');
      }

      const { uploadUrl, s3Key } = await urlRes.json() as { uploadUrl: string; s3Key: string };

      // Step 2: Upload directly to S3
      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      // Step 3: Register image
      const imgRes = await fetch(`${API_URL}/v1/seller/inventory/${item.id}/images`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ s3Key, contentType: file.type, fileName: file.name }),
      });

      if (!imgRes.ok) {
        const body = await imgRes.json();
        throw new Error(body.message ?? 'Erro ao registrar imagem.');
      }

      const newImage: InventoryImage = await imgRes.json();
      setImages((prev) => [...prev, newImage]);
      setUploadStatus((prev) => ({ ...prev, [uploadKey]: 'done' }));
    } catch (err) {
      setUploadStatus((prev) => ({ ...prev, [uploadKey]: 'error' }));
      setError(err instanceof Error ? err.message : 'Erro no upload da imagem.');
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Você precisa estar logado para gerenciar o inventário.</p>
        <Link to="/login" className="text-brand-500 font-medium hover:underline">Fazer login</Link>
      </div>
    );
  }

  if (isLoading) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">Carregando…</div>;
  }

  const isUploading = Object.values(uploadStatus).some((s) => s === 'uploading');

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8 flex items-center gap-4">
        <Link to="/seller/inventory" className="text-gray-400 hover:text-gray-600 text-sm">← Voltar</Link>
        <h1 className="text-2xl font-bold text-gray-900">{isNew ? 'Novo item' : 'Editar item'}</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>
      )}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-6">{successMessage}</div>
      )}

      <form onSubmit={handleSave} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Informações do produto</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Condição</label>
              <select
                name="condition"
                value={form.condition}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {CONDITIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Preço inicial (R$) <span className="text-red-500">*</span>
              </label>
              <input
                name="startingPrice"
                type="number"
                min="0"
                step="0.01"
                value={form.startingPrice}
                onChange={handleChange}
                required
                placeholder="0,00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button
            type="submit"
            disabled={isSaving}
            className="bg-brand-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            {isSaving ? 'Salvando…' : 'Salvar item'}
          </button>
        </div>
      </form>

      {/* Image upload – only after item is created */}
      {!isNew && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Imagens</h2>
          <p className="text-sm text-gray-500 mb-4">
            Formatos aceitos: JPG, PNG, WEBP.
          </p>

          {images.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-4">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="bg-gray-100 rounded-lg px-3 py-2 text-xs text-gray-700 flex items-center gap-2"
                >
                  <span>🖼️</span>
                  <span>{img.fileName}</span>
                </div>
              ))}
            </div>
          )}

          <label className={`inline-flex items-center gap-2 cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-2 rounded-lg text-sm transition-colors ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}>
            {isUploading ? 'Enviando…' : '+ Adicionar imagem'}
            <input
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageUpload}
              disabled={isUploading}
            />
          </label>
        </div>
      )}

      {isNew && (
        <p className="text-sm text-gray-400 text-center">Salve o item primeiro para habilitar o upload de imagens.</p>
      )}
    </div>
  );
}
