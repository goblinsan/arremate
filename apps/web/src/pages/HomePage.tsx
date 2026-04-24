import { Link } from 'react-router-dom';

const features = [
  {
    title: 'Live em tempo real',
    description:
      'Assista, faça perguntas e dê lances ao vivo. Transparência total no processo.',
    imageSrc: '/assets/content-creator.png',
    imageAlt: 'Criadora de conteúdo fazendo live',
  },
  {
    title: 'Compra protegida',
    description:
      'Pagamento retido até confirmação da entrega. Seu dinheiro seguro do início ao fim.',
    imageSrc: '/assets/Compra-protegida.png',
    imageAlt: 'Ilustração de compra protegida',
  },
  {
    title: 'Vendedores verificados',
    description:
      'Todos os vendedores passam por verificação de identidade e avaliação da comunidade.',
    imageSrc: '/assets/vendedores-verificados.png',
    imageAlt: 'Vendedores verificados',
  },
] as const;

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 via-orange-50 to-white py-16 sm:py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-4">
            <span className="inline-block bg-brand-500/10 text-brand-500 text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full">
              O marketplace de live shopping do Brasil
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold text-gray-900 leading-tight mb-2">
            Compre ao vivo,
            <br />
            <span className="text-brand-500">com confiança</span>
          </h1>

          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Participe de leilões em tempo real, conheça os vendedores antes de comprar e tenha
            toda a segurança que você merece.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-brand-500 hover:bg-orange-600 text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors shadow-lg shadow-brand-500/30">
              Ver leilões ao vivo
            </button>
            <Link
              to="/seller-application"
              className="border-2 border-gray-200 hover:border-brand-500 text-gray-700 font-semibold px-8 py-4 rounded-xl text-lg transition-colors"
            >
              Quero vender
            </Link>
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
            {features.map((feature) => (
              <div key={feature.title} className="bg-gray-50 rounded-2xl p-5 hover:shadow-md transition-shadow">
                <div className="mb-5 overflow-hidden rounded-2xl bg-white">
                  <img
                    src={feature.imageSrc}
                    alt={feature.imageAlt}
                    className="h-48 w-full object-cover"
                  />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
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
