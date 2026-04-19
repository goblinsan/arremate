const stats = [
  { label: 'Leilões Ativos', value: '12', change: '+3 hoje', color: 'bg-blue-50 text-blue-700' },
  { label: 'Total de Usuários', value: '1.840', change: '+27 esta semana', color: 'bg-green-50 text-green-700' },
  { label: 'Receita (mês)', value: 'R$ 48.320', change: '+12% vs. mês anterior', color: 'bg-brand-50 text-brand-900' },
  { label: 'Revisões Pendentes', value: '5', change: 'Requer atenção', color: 'bg-yellow-50 text-yellow-700' },
];

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500 text-sm mt-1">Visão geral da plataforma em tempo real.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
          >
            <p className="text-sm font-medium text-gray-500 mb-1">{stat.label}</p>
            <p className="text-3xl font-extrabold text-gray-900 mb-2">{stat.value}</p>
            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${stat.color}`}>
              {stat.change}
            </span>
          </div>
        ))}
      </div>

      {/* Recent activity placeholder */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Atividade Recente</h3>
        <div className="divide-y divide-gray-50">
          {[
            { action: 'Novo leilão criado', actor: 'Vendedor João Silva', time: '2 min atrás' },
            { action: 'Pagamento confirmado', actor: 'Comprador Maria Souza', time: '15 min atrás' },
            { action: 'Conta pendente de revisão', actor: 'Vendedor Carlos Pereira', time: '1 hora atrás' },
            { action: 'Leilão encerrado', actor: 'Item: Tênis Nike Air Max', time: '2 horas atrás' },
          ].map((item, i) => (
            <div key={i} className="py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">{item.action}</p>
                <p className="text-xs text-gray-400">{item.actor}</p>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
