export const featuredGames = [
  {
    id: 'neon-rivals',
    title: 'Neon Rivals',
    category: 'Action',
    rating: 4.9,
    players: '1-4 players',
    accent: '#c8f45d',
    visual: '⚡',
    gradient: 'linear-gradient(135deg, #163b3b 0%, #10181e 58%, #c8f45d 160%)'
  },
  {
    id: 'velocity-x',
    title: 'Velocity X',
    category: 'Racing',
    rating: 4.8,
    players: '1-8 players',
    accent: '#64dce8',
    visual: '◉',
    gradient: 'linear-gradient(135deg, #12304a 0%, #111820 55%, #64dce8 165%)'
  },
  {
    id: 'shadow-strike',
    title: 'Shadow Strike',
    category: 'Adventure',
    rating: 4.7,
    players: 'Single player',
    accent: '#b692ff',
    visual: '✦',
    gradient: 'linear-gradient(135deg, #292044 0%, #121620 56%, #b692ff 170%)'
  },
  {
    id: 'street-kings',
    title: 'Street Kings',
    category: 'Sports',
    rating: 4.6,
    players: '1-4 players',
    accent: '#ffad66',
    visual: '★',
    gradient: 'linear-gradient(135deg, #4a281e 0%, #1a1718 55%, #ffad66 165%)'
  },
  {
    id: 'mind-grid',
    title: 'Mind Grid',
    category: 'Puzzle',
    rating: 4.8,
    players: 'Single player',
    accent: '#ec82b7',
    visual: '◇',
    gradient: 'linear-gradient(135deg, #48203f 0%, #181521 56%, #ec82b7 165%)'
  },
  {
    id: 'tactical-front',
    title: 'Tactical Front',
    category: 'Strategy',
    rating: 4.5,
    players: '1-2 players',
    accent: '#9de68b',
    visual: '▦',
    gradient: 'linear-gradient(135deg, #243e2a 0%, #121a18 56%, #9de68b 165%)'
  }
]

export const popularGames = [
  featuredGames[0],
  featuredGames[1],
  featuredGames[3],
  featuredGames[5]
]

export const gameCategories = [
  { id: 'action', name: 'Action', icon: '⚡', count: 24 },
  { id: 'adventure', name: 'Adventure', icon: '✦', count: 18 },
  { id: 'racing', name: 'Racing', icon: '◉', count: 16 },
  { id: 'sports', name: 'Sports', icon: '★', count: 12 },
  { id: 'puzzle', name: 'Puzzle', icon: '◇', count: 21 },
  { id: 'strategy', name: 'Strategy', icon: '▦', count: 14 }
]