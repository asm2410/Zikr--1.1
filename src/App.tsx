import { useState } from 'react';
import { adhkar } from './data';
import Home from './Home';
import DhikrPage from './DhikrPage';

export default function App() {
  const [route, setRoute] = useState<{ name: 'home' } | { name: 'dhikr'; id: string }>({
    name: 'home',
  });

  if (route.name === 'home') {
    return <Home onSelect={(id) => setRoute({ name: 'dhikr', id })} />;
  }
  const dhikr = adhkar.find((d) => d.id === route.id);
  if (!dhikr) {
    setRoute({ name: 'home' });
    return null;
  }
  return <DhikrPage dhikr={dhikr} onBack={() => setRoute({ name: 'home' })} />;
}
