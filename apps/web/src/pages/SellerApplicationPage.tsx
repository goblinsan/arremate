import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, Check } from 'lucide-react';
import type { SellerApplication, ApplicationStatus, DocumentType } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'IDENTITY', label: 'Documento de identidade (RG / CNH / Passaporte)' },
  { value: 'ADDRESS_PROOF', label: 'Comprovante de endereço' },
  { value: 'BUSINESS_REGISTRATION', label: 'Registro da empresa (CNPJ / MEI)' },
  { value: 'OTHER', label: 'Outro documento' },
];

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Enviada para análise',
  UNDER_REVIEW: 'Em análise',
  APPROVED: 'Aprovada',
  REJECTED: 'Reprovada',
};

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

interface FormData {
  businessName: string;
  businessType: string;
  taxId: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
}

export default function SellerApplicationPage() {
  const { getAccessToken, isAuthenticated } = useAuth();
  const [application, setApplication] = useState<SellerApplication | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    businessName: '',
    businessType: '',
    taxId: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
  });

  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchApplication();
  }, [isAuthenticated]);

  async function fetchApplication() {
    setIsLoading(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller-applications/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        setApplication(null);
      } else if (res.ok) {
        const data: SellerApplication = await res.json();
        setApplication(data);
        setForm({
          businessName: data.businessName ?? '',
          businessType: data.businessType ?? '',
          taxId: data.taxId ?? '',
          phone: data.phone ?? '',
          addressLine1: data.addressLine1 ?? '',
          addressLine2: data.addressLine2 ?? '',
          city: data.city ?? '',
          state: data.state ?? '',
          postalCode: data.postalCode ?? '',
        });
      }
    } catch {
      setError('Erro ao carregar solicitação.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSaveDraft(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSaving(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller-applications`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao salvar rascunho.');
      }
      const data: SellerApplication = await res.json();
      setApplication(data);
      setSuccessMessage('Rascunho salvo com sucesso!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar rascunho.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller-applications/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao enviar solicitação.');
      }
      const data: SellerApplication = await res.json();
      setApplication(data);
      setSuccessMessage('Solicitação enviada para análise! Entraremos em contato em breve.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar solicitação.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>, documentType: DocumentType) {
    const file = e.target.files?.[0];
    if (!file || !application) return;

    const uploadKey = `${documentType}-${file.name}`;
    setUploadStatus((prev) => ({ ...prev, [uploadKey]: 'uploading' }));

    try {
      const token = getAccessToken();

      // Step 1: Get a signed upload URL
      const urlRes = await fetch(`${API_URL}/v1/seller-applications/me/documents/upload-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentType,
          fileName: file.name,
          contentType: file.type,
        }),
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

      // Step 3: Register the document with the API
      const docRes = await fetch(`${API_URL}/v1/seller-applications/me/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentType,
          fileName: file.name,
          s3Key,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });

      if (!docRes.ok) {
        const body = await docRes.json();
        throw new Error(body.message ?? 'Erro ao registrar documento.');
      }

      setUploadStatus((prev) => ({ ...prev, [uploadKey]: 'done' }));
      await fetchApplication();
    } catch (err) {
      setUploadStatus((prev) => ({ ...prev, [uploadKey]: 'error' }));
      setError(err instanceof Error ? err.message : 'Erro no upload do documento.');
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Você precisa estar logado para solicitar conta de vendedor.</p>
        <Link to="/login" className="text-brand-500 font-medium hover:underline">
          Fazer login
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-400">
        Carregando…
      </div>
    );
  }

  const isReadOnly = application !== null && application.status !== 'DRAFT';
  const canSubmit = application !== null && application.status === 'DRAFT';

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solicitação de Conta Vendedor</h1>
          <p className="text-gray-500 text-sm mt-1">
            Preencha os dados abaixo para solicitar sua conta de vendedor no Arremate.
          </p>
        </div>
        {application && (
          <span
            className={`inline-block text-xs font-semibold px-3 py-1 rounded-full ${STATUS_COLORS[application.status]}`}
          >
            {STATUS_LABELS[application.status]}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-6">
          {successMessage}
        </div>
      )}

      {application?.status === 'APPROVED' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-6">
          <p className="text-green-800 font-semibold text-lg flex items-center gap-2"><CheckCircle className="w-5 h-5" /> Solicitação aprovada!</p>
          <p className="text-green-700 text-sm mt-1">
            Sua conta de vendedor foi criada. Você já pode criar leilões.
          </p>
        </div>
      )}

      {application?.status === 'REJECTED' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 mb-6">
          <p className="text-red-800 font-semibold">Solicitação reprovada</p>
          {application.reviewNotes && (
            <p className="text-red-700 text-sm mt-1">
              <span className="font-medium">Motivo:</span> {application.reviewNotes}
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSaveDraft} className="space-y-8">
        {/* Business Info */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Dados da empresa</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome da empresa / razão social <span className="text-red-500">*</span>
              </label>
              <input
                name="businessName"
                value={form.businessName}
                onChange={handleChange}
                disabled={isReadOnly}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de empresa
              </label>
              <input
                name="businessType"
                value={form.businessType}
                onChange={handleChange}
                disabled={isReadOnly}
                placeholder="MEI, Ltda, S.A…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CNPJ / CPF <span className="text-red-500">*</span>
              </label>
              <input
                name="taxId"
                value={form.taxId}
                onChange={handleChange}
                disabled={isReadOnly}
                required
                placeholder="00.000.000/0001-00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefone <span className="text-red-500">*</span>
              </label>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                disabled={isReadOnly}
                required
                placeholder="(11) 99999-9999"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
          </div>
        </section>

        {/* Address */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Endereço</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Logradouro</label>
              <input
                name="addressLine1"
                value={form.addressLine1}
                onChange={handleChange}
                disabled={isReadOnly}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Complemento</label>
              <input
                name="addressLine2"
                value={form.addressLine2}
                onChange={handleChange}
                disabled={isReadOnly}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
              <input
                name="city"
                value={form.city}
                onChange={handleChange}
                disabled={isReadOnly}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <input
                name="state"
                value={form.state}
                onChange={handleChange}
                disabled={isReadOnly}
                placeholder="SP"
                maxLength={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
              <input
                name="postalCode"
                value={form.postalCode}
                onChange={handleChange}
                disabled={isReadOnly}
                placeholder="00000-000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
          </div>
        </section>

        {/* Documents */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Documentos de verificação</h2>
          <p className="text-sm text-gray-500 mb-4">
            Faça o upload dos documentos necessários para verificação da sua identidade e empresa.
            Formatos aceitos: PDF, JPG, PNG.
          </p>
          <div className="space-y-3">
            {DOCUMENT_TYPES.map(({ value, label }) => {
              const uploaded = application?.documents?.filter((d) => d.documentType === value) ?? [];
              const latestFile = uploaded[uploaded.length - 1];
              const pendingKey = Object.keys(uploadStatus).find((k) => k.startsWith(`${value}-`));
              const pendingStatus = pendingKey ? uploadStatus[pendingKey] : null;
              return (
                <div key={value} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{label}</p>
                    {pendingStatus === 'uploading' && (
                      <p className="text-xs text-blue-600 mt-0.5">Enviando…</p>
                    )}
                    {pendingStatus === 'error' && (
                      <p className="text-xs text-red-600 mt-0.5">Erro no upload</p>
                    )}
                    {latestFile && pendingStatus !== 'uploading' && (
                      <p className="text-xs text-green-600 mt-0.5 flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> {latestFile.fileName}
                      </p>
                    )}
                  </div>
                  {!isReadOnly && (
                    <label className="cursor-pointer">
                      <span className="text-xs font-medium text-brand-500 hover:underline">
                        {uploaded.length > 0 ? 'Substituir' : 'Enviar'}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        onChange={(e) => handleFileUpload(e, value)}
                        disabled={!application || pendingStatus === 'uploading'}
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          {!application && (
            <p className="text-xs text-gray-400 mt-3">
              Salve o rascunho primeiro para habilitar o upload de documentos.
            </p>
          )}
        </section>

        {/* Actions */}
        {!isReadOnly && (
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-brand-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              {isSaving ? 'Salvando…' : 'Salvar rascunho'}
            </button>
            {canSubmit && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-brand-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                {isSubmitting ? 'Enviando…' : 'Enviar solicitação'}
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
