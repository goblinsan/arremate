export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 via-orange-50 to-white py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block bg-brand-500/10 text-brand-500 text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-6">
            🇧🇷 O marketplace de live shopping do Brasil
          </span>
          <h1 className="text-5xl sm:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
            Compre ao vivo,{' '}
            <span className="text-brand-500">com confiança</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            Participe de leilões em tempo real, conheça os vendedores antes de comprar e tenha
            toda a segurança que você merece.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-brand-500 hover:bg-orange-600 text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors shadow-lg shadow-brand-500/30">
              Ver leilões ao vivo
            </button>
            <button className="border-2 border-gray-200 hover:border-brand-500 text-gray-700 font-semibold px-8 py-4 rounded-xl text-lg transition-colors">
              Quero vender
            </button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Por que escolher o Arremate?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                emoji: '🔴',
                title: 'Live em tempo real',
                desc: 'Assista, faça perguntas e dê lances ao vivo. Transparência total no processo.',
              },
              {
                emoji: '🛡️',
                title: 'Compra protegida',
                desc: 'Pagamento retido até confirmação da entrega. Seu dinheiro seguro do início ao fim.',
              },
              {
                emoji: '⭐',
                title: 'Vendedores verificados',
                desc: 'Todos os vendedores passam por verificação de identidade e avaliação da comunidade.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-gray-50 rounded-2xl p-8 hover:shadow-md transition-shadow"
              >
                <div className="text-4xl mb-4">{f.emoji}</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-900 py-20 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-4">
            Pronto para começar?
          </h2>
          <p className="text-orange-200 mb-8">
            Crie sua conta grátis e participe do próximo leilão ao vivo.
          </p>
          <button className="bg-brand-500 hover:bg-orange-400 text-white font-bold px-10 py-4 rounded-xl text-lg transition-colors">
            Criar conta grátis
          </button>
        </div>
      </section>
    </div>
  );
}
