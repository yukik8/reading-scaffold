// 小さいサイズ用のくまの顔(16・32px)。bear.js と同じ色・セピアの線。細部(リボン・本)は省く
module.exports = (stroke = 7) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><radialGradient id="f" cx="42%" cy="35%" r="70%"><stop offset="0" stop-color="#f7b96b"/><stop offset=".7" stop-color="#e8964a"/><stop offset="1" stop-color="#d77f37"/></radialGradient></defs>
  <g stroke="#4a2f24" stroke-width="${stroke}" stroke-linejoin="round">
    <circle cx="30" cy="34" r="19" fill="#e8964a"/><circle cx="98" cy="34" r="19" fill="#e8964a"/>
    <ellipse cx="64" cy="70" rx="52" ry="46" fill="url(#f)"/>
    <ellipse cx="64" cy="88" rx="22" ry="16" fill="#fbe2bd"/>
  </g>
  <circle cx="30" cy="35" r="9" fill="#f7a8a0"/><circle cx="98" cy="35" r="9" fill="#f7a8a0"/>
  <circle cx="44" cy="66" r="7.5" fill="#4a2f24"/><circle cx="84" cy="66" r="7.5" fill="#4a2f24"/>
  <ellipse cx="64" cy="82" rx="5.5" ry="4" fill="#4a2f24"/>
</svg>`;
