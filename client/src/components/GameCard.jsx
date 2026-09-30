function GameCard({ game, onPlay }) {
  if (!game) return null

  return (
    <article className="game-card" style={{ '--game-accent': game.accent }}>
      <div className="game-card-visual" style={{ background: game.gradient }}>
        <span aria-hidden="true">{game.visual}</span>
        <small>{game.category}</small>
      </div>
      <div className="game-card-body">
        <div>
          <h3>{game.title}</h3>
          <p>{game.players}</p>
        </div>
        <span className="game-rating" aria-label={`${game.rating} out of 5 stars`}>★ {game.rating}</span>
      </div>
      <button className="button button-primary game-card-button" type="button" onClick={() => onPlay?.(game)}>
        Play now
      </button>
    </article>
  )
}

export default GameCard
