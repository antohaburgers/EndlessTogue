# Endless Touge — Pages prototype v0.0.2

Статическая версия для GitHub Pages. Никакой сборки Vite/npm для публикации не требуется.

## Публикация

1. Загрузить все файлы из этого архива в корень ветки `main`, заменив старые одноимённые файлы.
2. GitHub → Settings → Pages.
3. Source: `Deploy from a branch`.
4. Branch: `main`, folder: `/ (root)`.
5. Сохранить и подождать публикацию.

`package.json` для Pages не нужен. Если он уже лежит в репозитории, можно оставить — он не мешает.

## Как работает

- Phaser 4.2.1 загружается напрямую с jsDelivr.
- Phaser Box2D 1.1.0 загружается как ESM-модуль с jsDelivr.
- Наши `main.js`, `DriftCar.js`, `RoadGenerator.js`, `TouchControls.js` и `style.css` лежат рядом в корне репозитория.
- Никаких `/src/...` путей и build-step нет.

Для запуска игре нужен интернет, чтобы один раз загрузить Phaser и Box2D с CDN. Позже можем положить библиотеки локально и сделать полностью автономную PWA.
