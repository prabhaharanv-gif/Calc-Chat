// The same end-of-game screen in every game: result, stats, "new best" badge, Play Again / All Games.
export default function GameOver({ emoji, title, subtitle, stats, newBest, win, onAgain, onHome, extra }) {
  return (
    <div className={`govr ${win ? 'win' : ''}`}>
      {(win || newBest) && (
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 20 }).map((_, i) => <i key={i} style={{ '--i': i }} />)}
        </div>
      )}
      <div className="govcard" role="dialog" aria-label={title}>
        <div className="govemoji">{emoji}</div>
        <h2>{title}</h2>
        {subtitle && <p className="govsub">{subtitle}</p>}
        {newBest && <div className="govbadge">★ New best!</div>}
        {stats?.length > 0 && (
          <div className="govstats">
            {stats.map(([label, value]) => (
              <div key={label}><span>{label}</span><b>{value}</b></div>
            ))}
          </div>
        )}
        <div className="govbtns">
          <button className="govplay" onClick={onAgain}>Play Again</button>
          {extra}
          {onHome && <button className="govhome" onClick={onHome}>All Games</button>}
        </div>
      </div>
    </div>
  );
}
