export const friendName = (user) => user.first_name || (user.username ? `@${user.username}` : 'друг');

// Что с совместимостью у этого друга — для подписи в списке
export function compatStatus(friend, myPortrait) {
  if (friend.has_compatibility) return { text: 'Совместимость готова', ready: true };
  if (myPortrait && friend.has_portrait) return { text: 'Можно узнать совместимость', ready: true };
  if (!myPortrait) return { text: 'Нужен ваш портрет личности', ready: false };
  return { text: 'Ждем портрет друга', ready: false };
}
