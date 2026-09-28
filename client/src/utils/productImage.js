const foodImageByKeyword = [
  { words: ['burger', 'hamburger', 'cheeseburger'], url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80' },
  { words: ['pizza'], url: 'https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=900&q=80' },
  { words: ['fries', 'chips', 'potato'], url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=80' },
  { words: ['chicken', 'wing', 'nugget'], url: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=900&q=80' },
  { words: ['cake', 'cupcake', 'brownie', 'cookie', 'donut', 'doughnut'], url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=900&q=80' },
  { words: ['coffee', 'tea', 'juice', 'water', 'soda', 'cola', 'drink', 'milk'], url: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=80' },
  { words: ['sandwich', 'wrap', 'shawarma', 'roll'], url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=900&q=80' },
  { words: ['popcorn'], url: 'https://images.unsplash.com/photo-1578849278619-e73505e9610f?auto=format&fit=crop&w=900&q=80' }
]

const fallbackFoodImage = 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80'

export function getProductImage(name, category = '') {
  const searchableName = `${name} ${category}`.toLowerCase()
  return foodImageByKeyword.find(({ words }) => words.some((word) => searchableName.includes(word)))?.url || fallbackFoodImage
}
