import { useEffect, useRef, useState } from 'react';
import type { Dhikr } from './data';
import './app.css';

type Props = { dhikr: Dhikr; onBack: () => void };

export default function DhikrPage({ dhikr, onBack }: Props) {
  const [count, setCount] = useState(0);
  const [cycles, setCycles] = useState(0);
  const [pulse, setPulse] = useState(false);
  const pulseTimer = useRef<number | null>(null);

  const target = dhikr.target;
  const progress = Math.min(count / target, 1);
  const complete = count >= target;

  function increment() {
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    setPulse(true);
    pulseTimer.current = window.setTimeout(() => setPulse(false), 220);

    setCount((c) => {
      const next = c + 1;
      if (next >= target) {
        setCycles((n) => n + 1);
        return 0;
      }
      return next;
    });
  }

  function reset() {
    setCount(0);
    setCycles(0);
  }

  useEffect(() => {
    return () => {
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    };
  }, []);

  const circumference = 2 * Math.PI * 130;
  const dash = circumference * progress;

  return (
    <div className="dhikr">
      <header className="dhikr__bar">
        <button className="dhikr__back" onClick={onBack} aria-label="رجوع">
          ›
        </button>
        <h1 className="dhikr__title arabic">{dhikr.arabic}</h1>
        <button className="dhikr__reset" onClick={reset} aria-label="إعادة">
          ↺
        </button>
      </header>

      <section className="dhikr__info">
        <p className="dhikr__translit">{dhikr.transliteration}</p>
        <p className="dhikr__translation">{dhikr.translation}</p>
      </section>

      <section className="dhikr__counter">
        <div className={`ring ${pulse ? 'ring--pulse' : ''} ${complete ? 'ring--done' : ''}`}>
          <svg viewBox="0 0 300 300" className="ring__svg">
            <circle className="ring__track" cx="150" cy="150" r="130" />
            <circle
              className="ring__fill"
              cx="150"
              cy="150"
              r="130"
              strokeDasharray={`${dash} ${circumference}`}
            />
          </svg>

          <button className="ring__tap" onClick={increment} aria-label="عدّ">
            <span className="ring__count">{count}</span>
            <span className="ring__label">من {target}</span>
            {complete && <span className="ring__done-flag">تمّ الذكر ✓</span>}
          </button>
        </div>

        <div className="dhikr__stats">
          <div className="stat">
            <span className="stat__num">{cycles}</span>
            <span className="stat__label">دورات مكتملة</span>
          </div>
          <div className="stat">
            <span className="stat__num">{cycles * target + count}</span>
            <span className="stat__label">إجمالي العدّ</span>
          </div>
        </div>
      </section>

      <section className="dhikr__virtue">
        <div className="virtue__row">
          <span className="virtue__tag">الفضل</span>
          <p className="virtue__text">{dhikr.virtue}</p>
        </div>
        <div className="virtue__row">
          <span className="virtue__tag virtue__tag--gold">الأجر</span>
          <p className="virtue__text">{dhikr.reward}</p>
        </div>
      </section>

      <p className="dhikr__hint">اضغط الدائرة لِلتسبيح</p>
    </div>
  );
}
