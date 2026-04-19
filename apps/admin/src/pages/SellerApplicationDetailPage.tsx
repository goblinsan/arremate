import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ApplicationStatus, DocumentType } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Enviada',
  UNDER_REVIEW: 'Em análise',
  APPROVED: 'Aprovada',
  REJECTED: 'Reprovada',
};

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  IDENTITY: 'Documento de identidade',
  ADDRESS_PROOF: 'Comprovante de endereço',
  BUSINESS_REGISTRATION: 'Registro da empresa',
  OTHER: 'Outro documento',
};

interface ApplicationDetail {
  id: string;
  status: ApplicationStatus;
  businessName: string | null;
  businessType: string | null;
  taxId: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string | null };
  documents: {
    id: string;
    documentType: DocumentType;
    fileName: string;
    s3Key: string;
    contentType: string;
    sizeBytes: number | null;
    uploadedAt: string;
  }[];
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value ?? '—'}</p>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function SellerApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getAccessToken } = useAuth();

  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');

  useEffect(() => {
    fetchApplication();
  }, [id]);

  async function fetchApplication() {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/admin/seller-applications/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) throw new Error('Solicitação não encontrada.');
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao carregar solicitação.');
      }
      const data: ApplicationDetail = await res.json();
      setApplication(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar solicitação.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApprove() {
    if (!application) return;
    setActionError(null);
    setIsActing(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/admin/seller-applications/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao aprovar solicitação.');
      }
      await fetchApplication();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao aprovar solicitação.');
    } finally {
      setIsActing(false);
    }
  }

  async function handleReject() {
    if (!application) return;
    setActionError(null);
    setIsActing(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/admin/seller-applications/${id}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: rejectNotes }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao reprovar solicitação.');
      }
      setShowRejectModal(false);
      setRejectNotes('');
      await fetchApplication();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao reprovar solicitação.');
    } finally {
      setIsActing(false);
    }
  }

  if (isLoading) {
    return <div className="text-center py-16 text-gray-400 text-sm">Carregando…</div>;
  }

  if (error || !application) {
    return (
      <div className="text-center py-16">
        <p className="text-red-500 text-sm mb-4">{error ?? 'Solicitação não encontrada.'}</p>
        <button
          onClick={() => navigate('/seller-applications')}
          className="text-brand-500 font-medium text-sm hover:underline"
        >
          ← Voltar para a lista
        </button>
      </div>
    );
  }

  const canReview = ['SUBMITTED', 'UNDER_REVIEW'].includes(application.status);

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <Link
            to="/seller-applications"
            className="text-xs text-gray-400 hover:text-gray-600 mb-2 inline-block"
          >
            ← Voltar para a lista
          </Link>
          <h2 className="text-2xl font-bold text-gray-900">
            {application.businessName ?? 'Solicitação sem nome'}
          </h2>
          <p className="text-gray-500 text-sm mt-1">{application.user.email}</p>
        </div>
        <span
          className={`inline-block text-xs font-semibold px-3 py-1 rounded-full mt-1 ${STATUS_COLORS[application.status]}`}
        >
          {STATUS_LABELS[application.status]}
        </span>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
          {actionError}
        </div>
      )}

      {/* Review result banner */}
      {application.status === 'APPROVED' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 text-green-800 text-sm font-medium">
          ✓ Aprovada em {application.reviewedAt ? new Date(application.reviewedAt).toLocaleDateString('pt-BR') : '—'}
        </div>
      )}
      {application.status === 'REJECTED' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
          <p className="text-red-800 text-sm font-medium">
            ✗ Reprovada em {application.reviewedAt ? new Date(application.reviewedAt).toLocaleDateString('pt-BR') : '—'}
          </p>
          {application.reviewNotes && (
            <p className="text-red-700 text-sm mt-1">
              <span className="font-medium">Notas:</span> {application.reviewNotes}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Business Info */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Dados da empresa</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome / Razão social" value={application.businessName} />
              <Field label="Tipo" value={application.businessType} />
              <Field label="CNPJ / CPF" value={application.taxId} />
              <Field label="Telefone" value={application.phone} />
            </div>
          </section>

          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Endereço</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Field label="Logradouro" value={application.addressLine1} />
              </div>
              {application.addressLine2 && (
                <div className="col-span-2">
                  <Field label="Complemento" value={application.addressLine2} />
                </div>
              )}
              <Field label="Cidade" value={application.city} />
              <Field label="Estado" value={application.state} />
              <Field label="CEP" value={application.postalCode} />
            </div>
          </section>

          {/* Documents */}
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Documentos ({application.documents.length})
            </h3>
            {application.documents.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum documento enviado.</p>
            ) : (
              <div className="space-y-2">
                {application.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                      </p>
                      <p className="text-xs text-gray-400">
                        {doc.fileName}
                        {doc.sizeBytes != null && ` · ${formatFileSize(doc.sizeBytes)}`}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400">
                      {new Date(doc.uploadedAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar: user info & timeline */}
        <div className="space-y-6">
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Solicitante</h3>
            <Field label="Nome" value={application.user.name} />
            <div className="mt-3">
              <Field label="E-mail" value={application.user.email} />
            </div>
          </section>

          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Timeline</h3>
            <div className="space-y-2 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Criada</span>
                <span>{new Date(application.createdAt).toLocaleDateString('pt-BR')}</span>
              </div>
              {application.submittedAt && (
                <div className="flex justify-between">
                  <span>Enviada</span>
                  <span>{new Date(application.submittedAt).toLocaleDateString('pt-BR')}</span>
                </div>
              )}
              {application.reviewedAt && (
                <div className="flex justify-between">
                  <span>Revisada</span>
                  <span>{new Date(application.reviewedAt).toLocaleDateString('pt-BR')}</span>
                </div>
              )}
            </div>
          </section>

          {/* Actions */}
          {canReview && (
            <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Ações</h3>
              <div className="space-y-2">
                <button
                  onClick={handleApprove}
                  disabled={isActing}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
                >
                  {isActing ? 'Processando…' : '✓ Aprovar'}
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  disabled={isActing}
                  className="w-full bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 font-semibold py-2 rounded-lg text-sm transition-colors"
                >
                  ✗ Reprovar
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reprovar solicitação</h3>
            <p className="text-sm text-gray-500 mb-4">
              Opcional: adicione uma nota para o solicitante entender o motivo da reprovação.
            </p>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Motivo da reprovação (opcional)…"
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowRejectModal(false); setRejectNotes(''); }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleReject}
                disabled={isActing}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2 rounded-lg text-sm"
              >
                {isActing ? 'Reprovando…' : 'Confirmar reprovação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
