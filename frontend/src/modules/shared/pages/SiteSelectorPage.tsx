import './SiteSelectorPage.css';

export default function SiteSelectorPage() {
  return (
    <main className="site-selector-page">
      <section className="site-selector-panel">
        <p className="site-selector-eyebrow">Choose Website Mode</p>
        <h1>Open Car Site or Original Site</h1>
        <p>
          Both experiences now run from the same frontend. Use Car Site for crash alert simulation and
          Original Site for your main CodeRed workflow.
        </p>

        <div className="site-selector-actions">
          <a className="selector-link selector-link-primary" href="#/car">
            Open Car Site
          </a>
          <a className="selector-link selector-link-secondary" href="#/original">
            Open Original Site
          </a>
        </div>
      </section>
    </main>
  );
}
