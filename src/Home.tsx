import { adhkar } from './data';
import './app.css';

export default function Home({ onSelect }: { onSelect: (id: string) => void }) {
  const now = new Date();
  const hijriMonth = 'محرم';
  const greeting = greetingFor(now.getHours());

  return (
    <div className="home">
      <header className="home__header">
        <div className="home__brand">
          <div className="home__logo">۞</div>
          <div>
            <h1 className="home__title">المسبحة</h1>
            <p className="home__subtitle">تسبيح ودعاء وذكر</p>
          </div>
        </div>
        <div className="home__date">
          <span className="home__date-hijri">{hijriMonth} ١٤٤٧</span>
          <span className="home__date-greg">{now.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}</span>
        </div>
      </header>

      <section className="home__hero">
        <p className="home__greeting">{greeting}</p>
        <p className="home__ayah arabic">
          «أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ»
        </p>
      </section>

      <section className="home__section">
        <h2 className="home__section-title">أذكاري</h2>
        <div className="home__grid">
          {adhkar.map((d) => (
            <button key={d.id} className="card" onClick={() => onSelect(d.id)}>
              <div className="card__top">
                <span className="card__arabic arabic">{d.arabic}</span>
                <span className="card__target">{d.target}</span>
              </div>
              <div className="card__bottom">
                <span className="card__title">{d.title}</span>
                <span className="card__cta">ابدأ الذكر ›</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <footer className="home__footer">
        <p>اللهم تقبل منا</p>
      </footer>
    </div>
  );
}

function greetingFor(hour: number): string {
  if (hour < 5) return 'وقت السحر — أدعية مستجابة إن شاء الله';
  if (hour < 12) return 'صباح النور، يا طالب الأجر';
  if (hour < 17) return 'نهارك طاعة وذكر';
  if (hour < 20) return 'مساء الخير، اجمع لك الحسنات';
  return 'وقت النوم — اقرأ أذكارك قبل النوم';
}
