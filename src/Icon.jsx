// Stroke icon set — single component, dispatched by name.
// Solid: props are reactive — never destructure.
export function Icon(props) {
  const size = () => props.size ?? 16;
  const stroke = () => props.stroke ?? 1.4;
  const common = () => ({
    width: size(),
    height: size(),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": stroke(),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });

  return (
    <>
      {(() => {
        switch (props.name) {
          case "play":
            return <svg {...common()}><polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" /></svg>;
          case "pause":
            return <svg {...common()}><rect x="6" y="5" width="4" height="14" fill="currentColor" stroke="none" /><rect x="14" y="5" width="4" height="14" fill="currentColor" stroke="none" /></svg>;
          case "prev":
            return <svg {...common()}><polygon points="18 5 7 12 18 19 18 5" fill="currentColor" stroke="none" /><line x1="5" y1="5" x2="5" y2="19" /></svg>;
          case "next":
            return <svg {...common()}><polygon points="6 5 17 12 6 19 6 5" fill="currentColor" stroke="none" /><line x1="19" y1="5" x2="19" y2="19" /></svg>;
          case "shuffle":
            return <svg {...common()}><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>;
          case "repeat":
            return <svg {...common()}><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>;
          case "heart":
            return <svg {...common()}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
          case "heart-fill":
            return <svg {...common()}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="currentColor" /></svg>;
          case "plus":
            return <svg {...common()}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
          case "queue":
            return <svg {...common()}><line x1="3" y1="6" x2="14" y2="6" /><line x1="3" y1="12" x2="14" y2="12" /><line x1="3" y1="18" x2="11" y2="18" /><polygon points="16 14 21 17 16 20 16 14" fill="currentColor" stroke="none" /></svg>;
          case "volume":
            return <svg {...common()}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>;
          case "volume-mute":
            return <svg {...common()}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>;
          case "search":
            return <svg {...common()}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
          case "spinner":
            return (
              <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke()} stroke-linecap="round">
                <g>
                  <path d="M12 3a9 9 0 1 1-8.1 5.1" />
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
                </g>
              </svg>
            );
          case "logo":
            return (
              <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none">
                <rect x="3" y="14" width="2.5" height="7" fill="currentColor" />
                <rect x="7.5" y="9" width="2.5" height="12" fill="currentColor" />
                <rect x="12" y="4" width="2.5" height="17" fill="currentColor" />
                <rect x="16.5" y="11" width="2.5" height="10" fill="currentColor" />
              </svg>
            );
          case "wave":
            return (
              <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none">
                <g fill="currentColor">
                  <rect x="3" y="9" width="2" height="6">
                    <animate attributeName="height" values="6;14;6" dur="0.9s" repeatCount="indefinite" />
                    <animate attributeName="y" values="9;5;9" dur="0.9s" repeatCount="indefinite" />
                  </rect>
                  <rect x="8" y="5" width="2" height="14">
                    <animate attributeName="height" values="14;6;14" dur="1.1s" repeatCount="indefinite" />
                    <animate attributeName="y" values="5;9;5" dur="1.1s" repeatCount="indefinite" />
                  </rect>
                  <rect x="13" y="7" width="2" height="10">
                    <animate attributeName="height" values="10;16;10" dur="0.8s" repeatCount="indefinite" />
                    <animate attributeName="y" values="7;4;7" dur="0.8s" repeatCount="indefinite" />
                  </rect>
                  <rect x="18" y="9" width="2" height="6">
                    <animate attributeName="height" values="6;12;6" dur="1.0s" repeatCount="indefinite" />
                    <animate attributeName="y" values="9;6;9" dur="1.0s" repeatCount="indefinite" />
                  </rect>
                </g>
              </svg>
            );
          case "dots":
            return <svg {...common()}><circle cx="5" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="19" cy="12" r="1.5" fill="currentColor" /></svg>;
          case "x":
            return <svg {...common()}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
          case "chevron-down":
            return <svg {...common()}><polyline points="6 9 12 15 18 9" /></svg>;
          case "chevron-left":
            return <svg {...common()}><polyline points="15 18 9 12 15 6" /></svg>;
          case "chevron-right":
            return <svg {...common()}><polyline points="9 18 15 12 9 6" /></svg>;
          case "library":
            return <svg {...common()}><line x1="4" y1="4" x2="4" y2="20" /><line x1="9" y1="4" x2="9" y2="20" /><rect x="13" y="4" width="3" height="16" /><line x1="20" y1="6" x2="20" y2="18" /></svg>;
          case "list":
            return <svg {...common()}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>;
          case "clock":
            return <svg {...common()}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>;
          case "settings":
            return <svg {...common()}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
          case "help":
            return <svg {...common()}><circle cx="12" cy="12" r="9" /><path d="M9.75 9.25a2.5 2.5 0 1 1 3.87 2.1c-.94.58-1.62 1.08-1.62 2.15" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
          case "grip":
            return <svg {...common()}><circle cx="9" cy="6" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="18" r="1" fill="currentColor" /><circle cx="15" cy="6" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="18" r="1" fill="currentColor" /></svg>;
          case "share":
            return <svg {...common()}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>;
          case "lyrics":
            return <svg {...common()}><path d="M7 5h10" /><path d="M7 9h10" /><path d="M7 13h7" /><path d="M5 3h14v18l-3-2-3 2-3-2-3 2-2-1.3V3z" /></svg>;
          default:
            return null;
        }
      })()}
    </>
  );
}
