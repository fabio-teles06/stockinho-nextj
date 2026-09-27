import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Check,
  CircleAlert,
  Leaf,
  Package,
  ScanLine,
  Sparkles,
  Store,
} from "lucide-react";

const features = [
  { icon: Boxes, title: "Estoque sempre em dia", text: "Acompanhe entradas, saídas e saldos por unidade sem depender de planilhas." },
  { icon: CircleAlert, title: "Reposição sem surpresa", text: "Receba alertas quando um produto atingir o estoque mínimo e saiba o que priorizar." },
  { icon: BarChart3, title: "Decisões mais seguras", text: "Visualize movimentações, valor em estoque e os produtos que mais saem." },
];

const steps = [
  ["01", "Cadastre seu negócio", "Organize empresas, lojas e depósitos em poucos minutos."],
  ["02", "Adicione seus produtos", "Informe preços, categorias e o estoque mínimo de cada item."],
  ["03", "Movimente e acompanhe", "Registre cada entrada e saída e deixe o Stockinho cuidar do resto."],
];


function Brand() {
  return (
    <a className="home-brand" href="#inicio" aria-label="Stockinho — início">
      <span><Package size={23} strokeWidth={2} /></span>
      stockinho<i>.</i>
    </a>
  );
}

export default function Home() {
  return (

    
    <main className="home-page" id="inicio">




      <header className="home-header">
        <Brand />
        <nav aria-label="Navegação principal">
          <a href="#recursos">Recursos</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#beneficios">Benefícios</a>
        </nav>

        






        <div className="home-header-actions">
          <a className="home-login" href="/login">Entrar</a>
          <a className="home-button small" href="/login">Começar agora <ArrowUpRight size={15} /></a>
        </div>
      </header>


<nav  id="menu" className="navbar bg-body-tertiary fixed-top">
  <div id="container-fluid" className="container-fluid">
    
    <button className="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#offcanvasNavbar" aria-controls="offcanvasNavbar" aria-label="Toggle navigation">
      <span className="navbar-toggler-icon"></span>
    </button>
    <div    className="offcanvas offcanvas-end" tabIndex={-1} id="offcanvasNavbar" aria-labelledby="offcanvasNavbarLabel"  data-bs-scroll="true">
      <div className="offcanvas-header">
        <h5 className="offcanvas-title" id="offcanvasNavbarLabel"></h5>
        <button type="button" className="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
      </div>
      <div className="offcanvas-body">
        <ul className="navbar-nav justify-content-end flex-grow-1 pe-3">
          <li className="nav-item">
            <a className="nav-link active" aria-current="page" href="/login">Entrar</a>
          </li>
          {/*<li className="nav-item">
            <a className="nav-link"  href="#como-funciona">Veja como funciona <ArrowUpRight size={15} /></a>
          </li>
          <li className="nav-item dropdown">
            <a className="nav-link dropdown-toggle" href="menu" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              Dropdown
            </a>
            <ul className="dropdown-menu">
               *<li><a className="dropdown-item" href="#">Recursos</a></li>
              <li><a className="dropdown-item" href="#">Another action</a></li>
              <li>
                <hr className="dropdown-divider"/>
              </li>
              <li><a className="dropdown-item" href="#">Something else here</a></li>
            </ul>
          </li>*/}
        </ul>
      </div>
    </div>
  </div>
</nav>


      <section className="home-hero">
        <div className="hero-copy">
          <div className="home-kicker"><Leaf size={14} /> Feito para pequenos negócios</div>
          <h1>Seu estoque em ordem.<span>Seu negócio mais leve.</span></h1>
          <p>Controle produtos, movimentações e reposições de um jeito simples, para sobrar mais tempo para cuidar de quem entra pela sua porta.</p>
          <div className="hero-actions">
            <a className="home-button" href="/login">Organizar meu estoque <ArrowRight size={17} /></a>
            <a className="home-text-link" href="#como-funciona">Veja como funciona <ArrowUpRight size={15} /></a>
          </div>
          <div className="hero-trust">
            <span><Check size={14} /> Fácil de começar</span>
            <span><Check size={14} /> Dados protegidos</span>
            <span><Check size={14} /> Acesso de onde estiver</span>
          </div>
        </div>

        <div className="hero-visual" aria-label="Prévia do painel Stockinho">
          <div className="visual-leaf visual-leaf-one" />
          <div className="visual-leaf visual-leaf-two" />
          <div className="dashboard-preview">
            <div className="preview-sidebar">
              <div className="preview-logo"><Package size={18} /> s.</div>
              {[1, 2, 3, 4, 5].map((item) => <i key={item} />)}
            </div>
            <div className="preview-main">
              <div className="preview-top"><span>Visão geral</span><b>FT</b></div>
              <div className="preview-welcome"><small>SEU NEGÓCIO EM DIA</small><strong>Olá, Fabio! <em>☀</em></strong><span>Um olhar para o seu negócio, tudo em um só lugar.</span></div>
              <div className="preview-stats">
                <div><span>Produtos ativos</span><b>124</b><small>12 categorias</small></div>
                <div><span>Valor em estoque</span><b>R$ 18,4 mil</b><small>Preço de custo</small></div>
                <div><span>Itens com atenção</span><b>08</b><small>Precisam de reposição</small></div>
              </div>
              <div className="preview-chart">
                <div><b>Movimentação do estoque</b><span>Últimos 7 dias</span></div>
                <svg viewBox="0 0 500 130" role="img" aria-label="Gráfico de movimentações">
                  <defs><linearGradient id="home-chart" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#72b98b" stopOpacity=".32" /><stop offset="1" stopColor="#72b98b" stopOpacity="0" /></linearGradient></defs>
                  <path d="M0 105 C45 85 68 96 105 70 S165 92 205 55 S270 75 315 38 S385 68 430 30 S475 42 500 18 L500 130 L0 130Z" fill="url(#home-chart)" />
                  <path d="M0 105 C45 85 68 96 105 70 S165 92 205 55 S270 75 315 38 S385 68 430 30 S475 42 500 18" fill="none" stroke="#41966a" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>
          <div className="preview-alert"><CircleAlert size={18} /><span><b>Reposição necessária</b>8 produtos pedem atenção</span></div>
          <div className="preview-scan"><ScanLine size={20} /><span><b>Entrada registrada</b>+ 24 unidades</span></div>
        </div>
      </section>

      <section className="home-features" id="recursos">
        <div className="section-heading"><span>O ESSENCIAL, BEM FEITO</span><h2>Tudo o que você precisa para cuidar do seu estoque.</h2><p>Sem complicação, excesso de telas ou termos difíceis.</p></div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, text }) => (
            <article key={title}><div><Icon size={22} /></div><h3>{title}</h3><p>{text}</p><a href="/login">Conhecer recurso <ArrowRight size={14} /></a></article>
          ))}
        </div>
      </section>

      <section className="home-steps" id="como-funciona">
        <div className="steps-intro"><span>COMECE SEM COMPLICAÇÃO</span><h2>Da primeira prateleira ao estoque completo.</h2><p>O Stockinho acompanha o ritmo do seu negócio desde o primeiro cadastro.</p><div className="steps-illustration"><Store size={56} strokeWidth={1.2} /><Leaf size={30} strokeWidth={1.2} /></div></div>
        <div className="step-list">
          {steps.map(([number, title, text]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}
        </div>
      </section>

      <section className="home-benefit" id="beneficios">
        <div className="benefit-card"><Sparkles size={28} /><span>ASSISTENTE STOCKINHO</span><h2>As respostas do seu estoque, sem perder tempo procurando.</h2><p>Pergunte o que precisa ser reposto, quais produtos mais saíram ou quanto há investido no estoque.</p><a className="home-button light" href="/login">Começar agora <ArrowRight size={17} /></a></div>
        <div className="benefit-chat">
          <div className="chat-question">O que preciso repor esta semana?</div>
          <div className="chat-answer"><Sparkles size={17} /><p>Encontrei <b>8 produtos</b> que precisam de atenção. Café e leite são os mais urgentes.</p></div>
          <div className="chat-products"><Package size={18} /><span><b>Café tradicional 500g</b>0 un. em estoque</span><strong>Urgente</strong></div>
          <div className="chat-products"><Package size={18} /><span><b>Leite integral 1L</b>6 un. em estoque</span><strong>Repor</strong></div>
        </div>
      </section>

      <section className="home-cta"><div><span>PRONTO PARA COMEÇAR?</span><h2>Um estoque organizado muda o dia inteiro.</h2></div><a className="home-button" href="/login">Criar minha conta <ArrowRight size={17} /></a></section>

<footer className="home-footer"><Brand /><p>Controle de estoque simples para negócios que fazem a diferença.</p><div><a href="#recursos">Recursos</a><a href="#como-funciona">Como funciona</a><a href="/login">Entrar</a></div><small>© 2026 Stockinho. Feito com cuidado para pequenos negócios.</small></footer>
   <script  async src="	https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js"></script>
    
    </main>

  );
}
