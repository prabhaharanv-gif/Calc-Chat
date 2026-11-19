import { useContext } from 'react';
import Icon from './Icon.jsx';
import { useLongPress } from './PinPad.jsx';
import { OnlineContext } from './OnlineContext.js';

// Same header in every game: back to the hub + the title. Holding the title ~2 seconds opens the hidden PIN pad.
// The title is maroon normally and turns green when a message is waiting (`signal`).
export default function GameHeader({ title, signal, onBack, onPin, right }) {
  const longPress = useLongPress(onPin);
  const online = useContext(OnlineContext);
  return (
    <div className="ghead">
      <div className="gleft">
        {onBack && (
          <button className="gback" onClick={onBack} aria-label="All games"><Icon name="grid" size={20} /></button>
        )}
        <h1 className={`gtitle ${signal ? 'sig' : ''}`} {...longPress}>{title}</h1>
        <span className={`odot ${online ? 'on' : ''}`} aria-hidden="true" />
      </div>
      {right}
    </div>
  );
}

export function Scores({ items }) {
  return (
    <div className="gscores">
      {items.map(([label, value]) => (
        <div className="gscore" key={label}><span>{label}</span><b>{value}</b></div>
      ))}
    </div>
  );
}
