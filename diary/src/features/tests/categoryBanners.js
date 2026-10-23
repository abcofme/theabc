import temperament from '../../assets/tests/temperament-handmade.webp';
import sociability from '../../assets/tests/sociability-handmade.webp';
import selfEsteem from '../../assets/tests/self-esteem-handmade.webp';
import personality from '../../assets/tests/personality-handmade.webp';
import career from '../../assets/tests/career-handmade.webp';
import frameInsets from '../../assets/tests/frames/frame-insets.json';

const edgeImages = import.meta.glob('../../assets/tests/frames/*.webp', { eager: true, query: '?url', import: 'default' });
const frameFor = (theme) => {
  const top = edgeImages[`../../assets/tests/frames/${theme}-top.webp`];
  const bottom = edgeImages[`../../assets/tests/frames/${theme}-bottom.webp`];
  return top && bottom ? { top, bottom, ...frameInsets[theme] } : undefined;
};

export const categoryBanners = {
  'Темперамент': { image: temperament, theme: 'temperament', frame: frameFor('temperament') },
  'Личность': { image: personality, theme: 'personality', frame: frameFor('personality') },
  'Самооценка': { image: selfEsteem, theme: 'self-esteem', frame: frameFor('self-esteem') },
  'Общительность': { image: sociability, theme: 'sociability', frame: frameFor('sociability') },
  'Профориентация': { image: career, theme: 'career', frame: frameFor('career') },
};
