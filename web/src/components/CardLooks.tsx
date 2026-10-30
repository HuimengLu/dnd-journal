import { useEffect, useState } from 'react';
import { emptyCharacterInput, type Character } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { CARD_LOOKS, CharacterCard } from './CharacterCard.tsx';

/** The Figma card (58:2109): no portrait upload, no potions. */
const SAMPLE_DESIGN: Character = {
  ...emptyCharacterInput(),
  id: 'sample-design', name: 'Kumara Silverbrook', className: '吟游诗人', level: 3, ac: 13,
  hpCurrent: 18, hpMax: 18, gold: 77, potions: 0,
  attacks: [
    { name: 'Dagger', badge: '+4', icon: 'dagger' },
    { name: 'Mockery', badge: 'DC14', icon: 'mockery' },
    { name: 'Whispers', badge: 'DC14', icon: 'whispers' },
  ],
  createdAt: '', updatedAt: '',
};

/** The other states: potions in stock, low HP with temp HP, an empty attack slot. */
const SAMPLE_STATES: Character = {
  ...emptyCharacterInput(),
  id: 'sample-states', name: 'Brian', className: '野蛮人 · 荒野之心', level: 4, ac: 15,
  hpCurrent: 5, hpMax: 16, hpTemp: 3, gold: 62, potions: 2,
  attacks: [
    { name: '巨斧', badge: '+7', icon: 'axe' },
    { name: '徒手攻击', badge: '+7', icon: 'fist' },
  ],
  createdAt: '', updatedAt: '',
};

/** Side-by-side comparison of every CardLook, opened with /?card-looks. Read-only: nothing here is saved. */
export function CardLooks() {
  const [live, setLive] = useState<Character | null>(null);
  useEffect(() => {
    api.state().then((s) => setLive(s.characters.find((c) => c.portraitAssetId) ?? s.characters[0] ?? null)).catch(() => {});
  }, []);
  const cards = [live ?? SAMPLE_DESIGN, SAMPLE_STATES];

  return (
    <main className="looks">
      <header className="looks-head">
        <h1>角色卡样式对比</h1>
        <p>每种样式两张：左边是{live ? `现有角色「${live.name}」` : '设计稿里的示例'}，右边示范有药水、低血量和临时生命值。这里只是预览，不会改动任何数据。</p>
      </header>
      <div className="looks-grid">
        {CARD_LOOKS.map((l, i) => (
          <section key={l.id} className="looks-item">
            <h2>{i + 1}. {l.label}</h2>
            <p>{l.note}</p>
            <div className="looks-cards">
              {cards.map((c) => <CharacterCard key={c.id} character={c} look={l.id} />)}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
