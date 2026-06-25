# inD3X Art — Premium Visual Upgrade Master Plan

> Reference-grade UI/UX upgrade. Цель — «Reference Premium»: ультра-чистый, production-ready,
> pixel-perfect desktop-shell с ощущением нативного приложения, а не веб-страницы.

---

## 0. Контекст, стек и принципы

**Стек:** Tauri (Rust) + React 18 + TypeScript + Vite. Рендер 3D — three.js / @react-three/fiber.
Виртуализация — `@tanstack/react-virtual`. Иконки — `lucide-react` (stroke 1.75, размеры 16/20).
Стилизация — **CSS Modules + глобальная токен-система** (`src/styles/tokens.css`,
`global.css`, `shared-ui.css`). Component library отсутствует (кастомные примитивы в
`src/ui/primitives`). Темы: `dark` (default), `light`, `high-contrast`.

**Сильные стороны текущей базы (сохраняем):**

- Зрелая семантическая палитра на CSS-переменных с 3 темами и `color-mix()`-слоями.
- Единая шкала отступов `--space-1…6` (4→24px), радиусы `--radius-sm/md/lg` (6/10/14).
- Единая иконография Lucide через обёртку `Icon.tsx`.
- Reduced-motion guard в `global.css`, фокус-токен `--focus-ring` уже существует.

**Системные дефекты, выявленные аудитом (это и есть фронт работ):**

| # | Дефект | Где |
|---|--------|-----|
| D1 | **Token drift в типографике**: размеры шрифтов захардкожены `9–18px` вместо `--text-*` | почти все feature-CSS |
| D2 | **Фрагментированный фокус**: `--focus-ring` объявлен, но не применяется; кастомные `outline`; CommandPalette/SaveDialog убирают фокус | catalog cells, tabs, editor, dialogs |
| D3 | **Нет системы elevation**: `--shadow-*` не используются во viewer; редакторы плоские | viewer3d/*, editor/* |
| D4 | **Несогласованный glass**: CommandPalette+Settings имеют `backdrop-filter`, SaveDialog — плоский `rgba(0,0,0,.55)`, overlay вьюпорта — только `color-mix` без блюра | dialogs, viewer overlays |
| D5 | **Разреженные hover/active**: press-scale только на глобальном `button`; кастомные кнопки без `:hover`/`:active` | editor, studio toolbar, tabs |
| D6 | **Мёртвый CSS**: дубли компаратора, `CatalogGridToolbar` не подключён, `.presets/.hintBar` в Studio, legacy в `ViewerPanel.module.css` | см. §10 |
| D7 | **Скелетоны**: нет grid-skeleton каталога; `Skeleton`/shimmer без reduced-motion guard; хардкод padding | catalog, Skeleton |
| D8 | **A11y-пробелы**: табы без roving tabindex/arrow-nav/`aria-controls`; tooltips без `aria-describedby`; тулбары не `role="toolbar"`; group-labels не связаны | tabs, toolbars, tooltips |
| D9 | **Light-theme регрессы**: хардкод `rgba(0,0,0,.x)` в палитре/свотчах; неопределённый `--color-surface-1` | PalettePanel, Settings |
| D10 | **Нет motion-системы**: только `--transition-fast/normal`, нет easing-токенов и продуманных переходов | глобально |

**Принципы исполнения (жёсткие правила):**

1. **8px-сетка строго.** Любой отступ/размер кратен 4px и берётся из `--space-*`. Новые
   значения добавляются как токены, не как магические числа.
2. **Типографика только токенами.** Запрещены сырые `px` для `font-size` — добавляем
   недостающие ступени в шкалу.
3. **Один фокус-язык.** Везде `box-shadow: var(--focus-ring)` (или `--focus-ring-inset`
   для плотных гридов). Никаких локальных `outline`.
4. **Нативное ощущение.** Мгновенный отклик (≤120ms на hover/press), органичные, но
   быстрые transitions, аппаратно-ускоренные `transform`/`opacity`, без layout-thrash.
5. **Никаких регрессий перфоманса.** 60/120 FPS в desktop-shell; блюры — только на
   небольших поверхностях (popover/modal/overlay-chips), не на скролл-контейнерах.

---

## 1. Дорожная карта (эпики и порядок)

| Эпик | Название | Зависит от | Риск |
|------|----------|-----------|------|
| **A** | Design System Foundation (токены) | — | низкий |
| **B** | Global Shell (TitleBar/StatusBar/AppShell) | A | низкий |
| **C** | Catalog / Studio (левая панель) | A, B | средний |
| **D** | 3D Viewer (центральный canvas) | A, B | средний |
| **E** | Editor (правая панель) | A | средний |
| **F** | Overlays & Dialogs | A | низкий |
| **G** | Iconography & Visual Accents | A | низкий |
| **H** | Motion & Micro-interactions | A | низкий |
| **I** | Accessibility & Performance | все | средний |
| **J** | Cleanup (мёртвый CSS) | C, D, E | низкий |

Рекомендуемый порядок: **A → B → (C ∥ D ∥ E) → F → G → H → I → J.** Эпик A обязателен
первым — все остальные используют новые токены.

---

# EPIC A — Design System Foundation

#### [A1] Шкала типографики и оптика
- **Область изменений:** Global tokens (`tokens.css`), `global.css`.
- **Текущее состояние & Проблема:** Шкала `--text-xs…xl` есть, но реально используется
  редко: интерфейс усеян сырыми `9px / 10px / 11px / 12px / 13px / 14px / 16px / 18px`
  и весами `650`. Нет токенов для `line-height`, `letter-spacing`, нет ступеней `9px`
  и `10px`, которые де-факто применяются. Это выглядит «дёшево»: нет ритма, трекинг
  случайный, метрики «пляшут» от компонента к компоненту.
- **Концепция «Premium Reference»:** Строгая модульная шкала с **оптической коррекцией
  трекинга** (мелкий текст — шире, заголовки — плотнее) и фиксированными line-height.
  Микро-лейблы (uppercase 10px) получают единый трекинг `0.06em`. Включаем
  `font-optical-sizing: auto` и табличные цифры для всех числовых HUD/счётчиков.
- **Спецификация (Design Tokens):**

```css
:root {
  /* Расширяем шкалу — добавляем недостающие ступени */
  --text-2xs: 0.625rem;   /* 10px — микро-лейблы, бейджи */
  --text-3xs: 0.5625rem;  /*  9px — плотные подписи ячеек */
  --text-2xl: 1.375rem;   /* 22px — заголовки экранов */

  /* Line-heights */
  --leading-tight: 1.15;
  --leading-snug: 1.3;
  --leading-normal: 1.5;

  /* Tracking (оптическая коррекция) */
  --tracking-tight: -0.01em;   /* заголовки */
  --tracking-normal: 0;
  --tracking-wide: 0.03em;     /* бейджи */
  --tracking-caps: 0.06em;     /* uppercase микро-лейблы */

  --font-weight-strong: 650;   /* токенизируем фактический «650» */
}

body { font-optical-sizing: auto; }
.tnum { font-variant-numeric: tabular-nums; }  /* для FPS/координат/счётчиков */
```

  - **Утилитные классы** в `shared-ui.css`: `.label-caps` (`font-size: var(--text-2xs);
    font-weight: var(--font-weight-strong); letter-spacing: var(--tracking-caps);
    text-transform: uppercase; color: var(--color-text-muted)`) — заменит десятки
    локальных `.groupLabel/.section-label` дублей.
- **Логика анимации:** н/д.
- **Ожидаемый результат:** Единый типографический ритм, ощущение «спроектированности».
  Числа в HUD перестают «дёргать» ширину при изменении (tabular-nums).

#### [A2] Система высот (elevation) и глубины поверхностей
- **Область изменений:** Global tokens.
- **Текущее состояние & Проблема:** `--shadow-sm/md/lg` есть, но во `viewer3d/*`
  не используются вовсе, редакторские подпанели плоские (только `1px border`). Глубина
  читается слабо — слои сливаются, нет премиальной «многослойности».
- **Концепция «Premium Reference»:** 4-уровневая лестница elevation. Каждый уровень —
  это **тень + 1px containment-бордер + опциональный inner highlight** (верхняя кромка
  света). Поповеры/тултипы — lvl2, модалки — lvl3, плавающие чипы на canvas — lvl1.
- **Спецификация (Design Tokens):**

```css
[data-theme="dark"] {
  --elevation-0: none;
  --elevation-1: 0 1px 2px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.04);
  --elevation-2: 0 8px 24px rgba(0,0,0,.45), 0 0 0 1px var(--color-border), inset 0 1px 0 rgba(255,255,255,.05);
  --elevation-3: 0 24px 56px rgba(0,0,0,.6), 0 0 0 1px var(--color-border-strong), inset 0 1px 0 rgba(255,255,255,.06);
  --border-hairline: 1px solid rgba(255,255,255,.05);  /* containment в dark */
}
[data-theme="light"] {
  --elevation-1: 0 1px 2px rgba(15,23,42,.06), 0 1px 1px rgba(15,23,42,.04);
  --elevation-2: 0 8px 24px rgba(15,23,42,.10), 0 0 0 1px var(--color-border);
  --elevation-3: 0 24px 56px rgba(15,23,42,.16), 0 0 0 1px var(--color-border-strong);
  --border-hairline: 1px solid rgba(15,23,42,.06);
}
```

- **Логика анимации:** при hover карточек/поповеров — переход elevation-1 → elevation-2
  за `var(--dur-fast)` с `var(--ease-standard)`.
- **Ожидаемый результат:** Чёткая иерархия слоёв, «дорогое» ощущение глубины,
  консистентность между viewer / editor / dialogs.

#### [A3] Glass / blur язык
- **Область изменений:** Global tokens.
- **Текущее состояние & Проблема (D4):** Блюр применён непоследовательно: CommandPalette
  и Settings — `blur(8–16px)`, SaveDialog — плоский тёмный scrim, overlay вьюпорта —
  `color-mix` без блюра, toolbar — 75% tint. Нет единого «стекла».
- **Концепция «Premium Reference»:** Единый набор glass-токенов: **scrim** (фон под
  модалкой), **panel-glass** (полупрозрачная хром-поверхность, titlebar/toolbar/overlay),
  **popover-glass** (плотный блюр для модалок). Блюр всегда с лёгким `saturate` для
  «живости» цвета.
- **Спецификация (Design Tokens):**

```css
:root {
  --scrim: color-mix(in srgb, var(--color-bg-base) 55%, transparent);
  --scrim-blur: blur(8px) saturate(1.1);

  --glass-panel-bg: color-mix(in srgb, var(--color-bg-elevated) 72%, transparent);
  --glass-panel-blur: blur(20px) saturate(1.3);

  --glass-popover-bg: color-mix(in srgb, var(--color-bg-elevated) 90%, transparent);
  --glass-popover-blur: blur(24px) saturate(1.4);

  --glass-chip-bg: color-mix(in srgb, var(--color-bg-elevated) 80%, transparent);
  --glass-chip-blur: blur(10px) saturate(1.2);
}
```

  - **Правило перфоманса:** `backdrop-filter` разрешён только на: titlebar, модалки,
    плавающие chip/overlay на canvas, collapse-кнопки. **Запрещён** на скролл-контейнерах
    (каталог, списки) — там используем непрозрачный `--color-bg-panel`.
- **Логика анимации:** scrim появляется `opacity 0→1` + модалка `scale(.97)→1` за
  `var(--dur-normal)` `var(--ease-emphasized)`.
- **Ожидаемый результат:** Единое «жидкое стекло» по всему shell, премиальная глубина
  без потери читаемости и FPS.

#### [A4] Motion-токены (easing + duration)
- **Область изменений:** Global tokens, `global.css`.
- **Текущее состояние & Проблема (D10):** Только `--transition-fast: 120ms ease` и
  `--transition-normal: 200ms ease`. `ease` (по умолчанию) — «дешёвый», нет
  decelerate/spring, нет шкалы длительностей.
- **Концепция «Premium Reference»:** Material-3-подобная система: `standard` для большинства,
  `decelerate` для входящих элементов, `accelerate` для уходящих, `spring` для
  тактильных микро-взаимодействий (press, toggle).
- **Спецификация (Design Tokens):**

```css
:root {
  --ease-standard: cubic-bezier(.2, 0, 0, 1);
  --ease-decelerate: cubic-bezier(0, 0, 0, 1);
  --ease-accelerate: cubic-bezier(.3, 0, 1, 1);
  --ease-spring: cubic-bezier(.34, 1.56, .64, 1);

  --dur-instant: 80ms;
  --dur-fast: 120ms;
  --dur-normal: 200ms;
  --dur-slow: 320ms;

  /* Обратная совместимость — переводим существующие токены на новую базу */
  --transition-fast: var(--dur-fast) var(--ease-standard);
  --transition-normal: var(--dur-normal) var(--ease-standard);
}
```

- **Ожидаемый результат:** Все анимации «из одной коробки», органичные и быстрые;
  единый «характер» движения продукта.

#### [A5] Единый фокус-язык
- **Область изменений:** Global tokens, `global.css`, все feature-CSS (постепенно).
- **Текущее состояние & Проблема (D2):** `--focus-ring` есть, но каталог-ячейки используют
  `outline: 2px`, CommandPalette/SaveDialog **убирают** фокус, большинство кастомных
  кнопок фокус-стиля не имеют.
- **Концепция «Premium Reference»:** Один кольцевой фокус (двойное кольцо: фон-разрыв +
  акцент). Для плотных гридов (каталог 40px) — компактный inset-вариант, чтобы кольцо
  не «срезалось» соседями.
- **Спецификация (Design Tokens / Code):**

```css
:root {
  --focus-ring: 0 0 0 2px var(--color-bg-base), 0 0 0 4px var(--color-accent);
  --focus-ring-inset: inset 0 0 0 2px var(--color-accent);
}
/* Мандат: каждый интерактив */
.someControl:focus-visible { outline: none; box-shadow: var(--focus-ring); }
/* Плотные гриды */
.catalogCell:focus-visible { outline: none; box-shadow: var(--focus-ring-inset); }
```

- **Логика анимации:** `box-shadow` фокуса — `var(--dur-instant) var(--ease-standard)`.
- **Ожидаемый результат:** Полная keyboard-навигируемость с единым, заметным, но не
  кричащим фокусом. Снятие риска WCAG 2.4.7.

---

# EPIC B — Global Shell

#### [B1] TitleBar — премиальная командная полоса
- **Область изменений:** `src/ui/TitleBar/*`.
- **Текущее состояние & Проблема:** Лучшая по интеракциям зона, но: фокус-стилей нет
  (`:focus-visible` отсутствует на mode/action кнопках), фонты захардкожены (`14/11px`),
  `#fff` и `rgba(99,140,255,…)` в keyframes мимо токенов, mode-toggle дублирует паттерн
  `.segmented` из `shared-ui.css`.
- **Концепция «Premium Reference»:** TitleBar — единственная «парящая» glass-полоса
  (уже есть `backdrop-filter`). Логотип — статичный знак с тонким `inset`-светом
  (idle-pulse оставляем, но мягче, амплитуда `scale(1.025)`). Mode-toggle переводим на
  системный `.segmented` (sliding pill-индикатор за `var(--dur-fast)`). Save-кнопка —
  чёткая иерархия: disabled→ghost, dirty→accent-filled с лёгким glow.
- **Спецификация (Design Tokens / Code):**
  - **CSS:** `font-size: var(--text-md)` (name) / `var(--text-2xs)` (tagline);
    logo gradient → `linear-gradient(135deg, var(--color-accent), var(--color-accent-teal))`;
    keyframe glow → `color-mix(in srgb, var(--color-accent) 25%, transparent)`.
    Все кнопки: `:focus-visible { box-shadow: var(--focus-ring); }`.
  - **Логика анимации:** mode-pill — `transform: translateX()` индикатора
    `var(--dur-fast) var(--ease-standard)`; save-кнопка dirty→clean — кросс-фейд цвета
    `var(--dur-normal)`. `logoIdlePulse` → 4s, `--ease-standard`, guard reduced-motion (есть).
- **Ожидаемый результат:** Полоса ощущается как нативная macOS/Linux-шапка; единый toggle-паттерн.

#### [B2] StatusBar — телеметрия reference-класса
- **Область изменений:** `src/ui/StatusBar/*`.
- **Текущее состояние & Проблема:** Хорошо токенизирован, но числовые сегменты
  «прыгают» по ширине (нет tabular-nums), различие dirty/error только цветом
  (a11y), badge padding `1px 7px` мимо сетки.
- **Концепция «Premium Reference»:** Моноширинная телеметрия с табличными цифрами,
  сегменты с тонкими hairline-разделителями, статус-индикаторы с **иконкой + цветом**
  (не только цвет). Save-flash оставляем (хороший микромомент), но переводим на
  `--dur` токены.
- **Спецификация:**
  - **CSS:** добавить `.tnum` (A1) на FPS/координаты/счётчики; badge padding →
    `2px var(--space-2)`; dirty/error получают лид-иконку (Lucide `Circle`/`AlertTriangle`,
    size 16) рядом с текстом.
  - **Анимация:** save-flash → `600ms var(--ease-decelerate)` (guard есть).
- **Ожидаемый результат:** «Приборная панель» уровня IDE: стабильная, читаемая, доступная.

#### [B3] AppShell — оркестрация панелей, рельсы, ручки ресайза
- **Область изменений:** `src/ui/AppShell/*`.
- **Текущее состояние & Проблема:** Достойный grid-shell с радиальными glow-фонами
  и collapse-кнопками. Но: ручка ресайза `5px` тонкая (трудно попасть), `resizeHandle`
  hover едва заметен, collapse-кнопки появляются только на hover центра (discoverability),
  rail-кнопки без фокус-кольца.
- **Концепция «Premium Reference»:** «Невидимая-но-щедрая» зона ресайза (визуально 1px,
  hit-area 8px через псевдоэлемент), при hover — акцентная линия `2px` с лёгким glow.
  Rail-кнопки — единый стиль с press-scale. Фоновый glow привязать к акценту темы
  (в light он сейчас почти невидим — усилить через `color-mix`).
- **Спецификация (Code):**

```css
.resizeHandle { position: relative; background: transparent; }
.resizeHandle::after {           /* расширенная hit-area */
  content: ""; position: absolute; inset: 0 -4px; cursor: col-resize;
}
.resizeHandle:hover, .resizeHandle:focus-visible {
  background: color-mix(in srgb, var(--color-accent) 60%, transparent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent) 40%, transparent);
}
.railBtn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.railBtn:active { transform: scale(.96); }
```

  - **Light-theme glow:** усилить `.shell` радиалы до `accent 14%` через
    `[data-theme="light"] .shell { ... }`.
- **Логика анимации:** collapse-кнопки fade-in `var(--dur-fast)`; на `<=1200px` остаются
  видимыми (есть). Ручка — цвет/тень `var(--dur-fast)`.
- **Ожидаемый результат:** Панели «дышат», ресайз приятно «ловится», light-тема перестаёт
  выглядеть «пустой».

#### [B4] Кастомный скроллбар
- **Область изменений:** `global.css`.
- **Текущее состояние & Проблема:** Скроллбар есть (10px, pill, border-strong), но
  статичный — на премиум-уровне ожидается reveal-on-hover и более тонкий idle.
- **Концепция «Premium Reference»:** Тонкий (`8px`) idle-трек, thumb `--color-border`,
  при hover контейнера — `--color-border-strong` + чуть толще. Firefox — `scrollbar-width: thin`.
- **Спецификация:**

```css
* { scrollbar-width: thin; scrollbar-color: var(--color-border) transparent; }
::-webkit-scrollbar-thumb { background: var(--color-border); transition: background var(--dur-normal); }
:hover::-webkit-scrollbar-thumb { background: var(--color-border-strong); }
::-webkit-scrollbar-thumb:hover { background: var(--color-text-muted); }
```

- **Ожидаемый результат:** Тихий, ненавязчивый, «дорогой» скролл по всему приложению.

---

# EPIC C — Catalog / Studio (левая панель)

#### [C1] Catalog grid cell — кристальная ячейка инвентаря
- **Область изменений:** `CatalogCell.*`, `CatalogIcon.*`.
- **Текущее состояние & Проблема:** Плотный 9×40px грид (Minecraft-слот). Кастомный
  `outline: 2px` фокус (мимо токена, срезается соседями), нет `:active`,
  reduced-motion ссылается на несуществующий hover-transform, ~12 захардкоженных
  размеров (`8/9/10/12/14px`), tooltip не связан `aria-describedby`.
- **Концепция «Premium Reference»:** Ячейка как «физический слот»: при hover — лёгкий
  lift (`scale(1.04)` + elevation-1), при выборе — акцентная рамка + субтильный
  внутренний glow, при press — `scale(.97)`. Иконка пиксель-перфект (`image-rendering:
  pixelated` уже есть). Фокус — `--focus-ring-inset`. Лейбл 9px → `--text-3xs`.
- **Спецификация (Code):**

```css
.cell {
  border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
  transition: transform var(--dur-fast) var(--ease-spring),
              box-shadow var(--dur-fast) var(--ease-standard),
              background var(--dur-fast), border-color var(--dur-fast);
  will-change: transform;
}
.cell:hover:not(.selected) { transform: scale(1.04); box-shadow: var(--elevation-1); }
.cell:active { transform: scale(.97); }
.cell.selected {
  border-color: color-mix(in srgb, var(--color-accent) 60%, transparent);
  box-shadow: var(--focus-ring-inset),
              0 0 12px color-mix(in srgb, var(--color-accent) 25%, transparent);
}
.cell:focus-visible { outline: none; box-shadow: var(--focus-ring-inset); }
.label { font-size: var(--text-3xs); }
@media (prefers-reduced-motion: reduce) {
  .cell:hover, .cell:active { transform: none; }
}
```

  - **A11y:** связать tooltip через `aria-describedby={tooltipId}`; убрать `title`-дубль,
    когда tooltip открыт; добавить keyboard-эквивалент pin (контекст-меню → `Shift+P`).
- **Логика анимации:** spring-lift на hover (тактильность), мгновенный press.
- **Ожидаемый результат:** Каталог «оживает» под курсором, выбор читается однозначно,
  ощущение точного, дорогого инструмента.

#### [C2] Grid skeleton + плавная загрузка
- **Область изменений:** `CatalogPanel.*`, `CatalogVirtualGrid.tsx`, новый `CatalogGridSkeleton`.
- **Текущее состояние & Проблема (D7):** При загрузке — только нижний spinner-бар;
  сам грид пустой → «провал» контента, ощущение медлительности.
- **Концепция «Premium Reference»:** При первой загрузке/смене запроса — **skeleton-грид**
  из 9×N мерцающих ячеек (точная геометрия 40px/44px-строк), затем кросс-фейд в реальные.
  Shimmer — медленный (1.4s), с reduced-motion guard.
- **Спецификация (Code):**
  - Рендерить `CatalogGridSkeleton` пока `loading && entries.length === 0`.
  - Реальные ячейки: `@keyframes cellFadeIn { from {opacity:0; transform: scale(.96)} }`
    `var(--dur-normal) var(--ease-decelerate)`, **staggered** по индексу строки
    (`animation-delay: calc(var(--row) * 12ms)`, cap 6 строк).
- **Логика анимации:** stagger-fade-in + shimmer-skeleton.
- **Ожидаемый результат:** Перцептивная скорость ↑; нет «белого провала»; ощущение, что
  контент «материализуется».

#### [C3] Category tabs — сегмент с a11y и индикатором
- **Область изменений:** `CatalogCategoryTabs.*`.
- **Текущее состояние & Проблема (D8):** Pill-табы без `:focus-visible`, без
  roving-tabindex, без arrow-навигации, без `aria-controls`; gap/padding/`count` 10px
  захардкожены; активный таб без анимированного индикатора.
- **Концепция «Premium Reference»:** Полноценный ARIA-tablist с roving tabindex и
  ←/→/Home/End навигацией. Активная вкладка — акцентный pill с **анимированным
  подчёркиванием/фоном** (shared layout transition при переключении).
- **Спецификация (Code):**
  - **A11y:** `role="tab"` + `aria-selected` (есть) + `tabIndex` roving + `aria-controls`
    на грид-контейнер (`id` на нём); обработчики стрелок.
  - **CSS:** `gap: var(--space-1)`; `.count { font-size: var(--text-2xs); }`;
    `:focus-visible { box-shadow: var(--focus-ring); }`; активный фон через `::after`
    pill с `transition: transform var(--dur-normal) var(--ease-emphasized)` (или
    React-state + CSS на позицию).
- **Ожидаемый результат:** Доступная, тактильная навигация по категориям; премиальный
  «скользящий» индикатор.

#### [C4] Search & filter strip — фокус и плотность
- **Область изменений:** `CatalogSearch.*`.
- **Текущее состояние & Проблема:** Input имеет корректный `--focus-ring` (хорошо), но
  `langSelect` и чекбоксы без фокус-стилей; `min-height: 34px` мимо сетки; нет
  «ищу…»-состояния кроме disabled; нет leading search-иконки.
- **Концепция «Premium Reference»:** Поисковая строка с leading-иконкой (Lucide `Search`,
  16) и trailing «clear» (`X`) при наличии текста; высота `32px` (сетка); во время
  `searchPending` — тонкий inline-spinner справа. Чекбоксы Fuzzy/Labels → `.chip`-toggle
  из `shared-ui.css` для консистентности.
- **Спецификация:**
  - **CSS:** `.input { min-height: 32px; padding-left: 32px; }` (место под иконку);
    иконка `position:absolute; left: var(--space-3)`; все контролы `:focus-visible {
    box-shadow: var(--focus-ring); }`.
  - **Анимация:** clear-кнопка fade/scale `var(--dur-fast)`.
- **Ожидаемый результат:** Поиск ощущается «умным» и отзывчивым, единый toggle-язык.

#### [C5] Empty / error states каталога
- **Область изменений:** `CatalogPanel.*`.
- **Текущее состояние & Проблема:** 3 варианта empty есть, но `.retryBtn` без фокуса/
  active; пустые блоки — голые `<p>`; не в live-region.
- **Концепция «Premium Reference»:** Привести к глобальному `.empty-state` (есть в
  `shared-ui.css`): иконка-иллюстрация (Lucide в круге с tinted-фоном) + заголовок +
  тело + действие (`Button` primitive). Error → danger-icon + retry с фокусом.
  Обернуть в `role="status"`/`aria-live="polite"`.
- **Спецификация:** использовать `.empty-state/.empty-state-title/.empty-state-body`;
  кнопки — `Button` primitive (фокус/hover/press уже системные).
- **Ожидаемый результат:** Пустые состояния выглядят преднамеренными и дружелюбными,
  а не «сломанными».

#### [C6] Block Studio viewport toolbar — деконгестия
- **Область изменений:** `BlockStudioViewport.*`.
- **Текущее состояние & Проблема:** Один горизонтально-скроллящийся ряд из множества
  9–10px контролов конкурирует с длинным заголовком; масса хардкод-размеров; локальные
  кнопки без `:focus-visible`; мёртвый CSS (`.presets/.hintBar/.paintWorkflowBanner`).
- **Концепция «Premium Reference»:** Сгруппировать контролы в логические кластеры с
  hairline-разделителями (`role="toolbar"`, `aria-label`). Заголовок entry — отдельная
  строка/зона, не конкурирует за ширину. Все кнопки → системный размер + фокус + press.
  Биом-кнопки → цветные swatch-чипы (см. G). Удалить dead CSS (J).
- **Спецификация:** перевести `.biomeBtn/.compareBtn/.modeBtn` на токен-фонты
  (`--text-2xs`), `:focus-visible { box-shadow: var(--focus-ring); }`,
  `:active { transform: scale(.97); }`; разделители `.toolbar > * + * { ... }` или
  `<span class="toolbar-sep">`.
- **Ожидаемый результат:** Тулбар читается как структурированная панель инструментов,
  а не как «свалка» мелких кнопок.

---

# EPIC D — 3D Viewer (центральный canvas)

#### [D1] Canvas-обрамление и глубина сцены
- **Область изменений:** `Scene3D.module.css`, `ViewerPanel.module.css`.
- **Текущее состояние & Проблема (D3):** Нет теней; фон — радиальный glow + градиент
  (хорошо), но canvas «висит» без обрамления; bottom-overlay — только градиент,
  без elevation/blur, `pointer-events: none`.
- **Концепция «Premium Reference»:** Canvas как «витрина»: усиленный центральный
  spotlight-радиал под моделью, мягкая виньетка по краям (есть), тонкая внутренняя
  hairline-рамка stage (`inset 0 0 0 1px`). Bottom-overlay → **glass-чип** (elevation-1
  + `--glass-chip-blur`) с метаданными, выровненный по сетке.
- **Спецификация:**
  - **CSS:** `.stage { box-shadow: inset 0 0 0 1px var(--color-border-panel); }`;
    `.overlay { background: var(--glass-chip-bg); backdrop-filter: var(--glass-chip-blur);
    border-radius: var(--radius-md); box-shadow: var(--elevation-1); margin: var(--space-3); }`
    (превратить из full-width gradient в плавающий чип).
  - Метаданные — `.tnum`, `aria-live="off"` (тех. инфо).
- **Ожидаемый результат:** Модель «представлена» на сцене премиум-класса; метаданные
  читаются как аккуратный HUD-чип.

#### [D2] Floating viewport controls (overlay toolbar)
- **Область изменений:** `ViewerToolbar.module.css`, `MiniSceneControl.*`, `Scene3D` chips.
- **Текущее состояние & Проблема:** Classic-тулбар — плотный multi-row wrap из 10px
  кнопок с 9px uppercase-микролейблами, 75% tint без блюра, без `role="toolbar"`,
  group-labels не связаны с контролами.
- **Концепция «Premium Reference»:** Перевести часть управления (камера-пресеты,
  grid/UV toggles) в **плавающие glass-кластеры** поверх canvas (top-right), как в
  pro-3D-софте (Blender/Spline). Кластер — `--glass-chip-bg` + elevation-1 + radius-md,
  иконочные кнопки 28px с press-scale и tooltip. Реальный `role="toolbar"`.
- **Спецификация:**
  - **CSS:** кластеры `position:absolute; top: var(--space-3); right: var(--space-3);
    display:flex; gap: var(--space-1); padding: var(--space-1); background: var(--glass-chip-bg);
    backdrop-filter: var(--glass-chip-blur); border-radius: var(--radius-md);
    box-shadow: var(--elevation-1);`.
    Кнопки → `IconButton` (фокус/hover системные) + `:active { transform: scale(.94) }`.
  - group-labels: `aria-labelledby` или вынести в tooltip.
- **Логика анимации:** кластеры fade/slide-in `var(--dur-normal) var(--ease-decelerate)`
  при появлении модели; hover-reveal вторичных контролов.
- **Ожидаемый результат:** Canvas чище, управление «парит» как в референс-3D-приложениях.

#### [D3] Viewer empty / loading / error — брендированные состояния
- **Область изменений:** `ViewerEmptyState/LoadingState/ErrorState.module.css`.
- **Текущее состояние & Проблема:** Empty — статичный CSS-куб (ок), но без анимации;
  Loading — абстрактные shimmer-блоки + дубль текста (Spinner + видимый `<p>`);
  Error — наиболее токенизирован, но без card-обрамления; `--radius: 4px` мимо токенов.
- **Концепция «Premium Reference»:** Единый визуальный язык состояний: центрированная
  card (elevation-1, radius-lg, hairline) с иконкой-иллюстрацией. Empty-куб получает
  медленное idle-вращение (`rotateY`, 8s, reduced-motion guard). Loading — **брендовый**
  пульсирующий вокс-куб вместо абстрактных блоков. Error — danger-card с явными actions.
- **Спецификация:**
  - radius `4px → var(--radius-sm)`; шрифты `13/18px → --text-sm/--text-xl`;
    убрать видимый дубль label у Loading (оставить Spinner `aria-label`).
  - Empty-cube: `@keyframes voxelSpin { to { transform: rotateY(360deg) } }` 8s linear,
    guard reduced-motion.
- **Ожидаемый результат:** Состояния выглядят как часть продукта, а не как заглушки;
  загрузка ощущается «живой».

#### [D4] Compare-режим — единый источник стилей
- **Область изменений:** `Compare3DViewport.module.css` (+ удалить дубль в `ViewerPanel`).
- **Текущее состояние & Проблема (D6):** Дубли стилей компаратора в двух файлах; лейблы
  «Before/After» не связаны с панами; divider 2px без курсора/драга; вложенный
  full-loading в half-pane выглядит тяжело.
- **Концепция «Premium Reference»:** Единый модуль компаратора. Лейблы → glass-чипы
  (elevation-1), `aria-labelledby` для панов. Divider — акцентная линия с handle-«пилюлей»
  по центру (даже если не draggable — визуальный акцент). Before-pane loading → лёгкий
  inline-skeleton, не полноэкранный.
- **Спецификация:** перенести все `.comparator*` в `Compare3DViewport.module.css`;
  удалить дубли из `ViewerPanel.module.css` (J); лейблы — `.glass-chip` утилита.
- **Ожидаемый результат:** Чистый, согласованный compare без визуального дублирования.

---

# EPIC E — Editor (правая панель)

#### [E1] Tool icon bar + tool options — тактильные инструменты
- **Область изменений:** `ToolIconBar.module.css`, `ToolOptionsBar.module.css`.
- **Текущее состояние & Проблема (D5):** 28px иконки-кнопки без `:hover/:focus/:active`,
  `font-size: 13px` мимо токена; options-бар: range/select без фокуса, 10px uppercase-лейблы.
- **Концепция «Premium Reference»:** Инструменты как сегментированная палитра: active —
  акцентный fill с inner-highlight; hover — `--color-bg-accent-subtle`; press —
  `scale(.94)`; фокус — `--focus-ring`. Слайдеры — кастомный premium-thumb (акцентный
  круг с тенью) на token-треке.
- **Спецификация (Code):**

```css
.toolButton { transition: background var(--dur-fast), color var(--dur-fast), transform var(--dur-fast) var(--ease-spring); }
.toolButton:hover:not(.active) { background: var(--color-bg-accent-subtle); color: var(--color-text-primary); }
.toolButton:active { transform: scale(.94); }
.toolButton:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.toolButton.active { background: var(--color-bg-accent-subtle); border-color: color-mix(in srgb, var(--color-accent) 50%, transparent); color: var(--color-accent); box-shadow: inset 0 1px 0 rgba(255,255,255,.06); }

input[type="range"] { accent-color: var(--color-accent); }
input[type="range"]:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: 999px; }
```

- **Ожидаемый результат:** Инструменты ощущаются физически-отзывчивыми, как в pro-арт-софте.

#### [E2] Palette panel — light-safe и доступная
- **Область изменений:** `PalettePanel.module.css`.
- **Текущее состояние & Проблема (D9):** Хардкод `rgba(0,0,0,.2/.25/.35)` на свотчах
  ломается в light-теме; свотчи 14–16px (мелкая цель), без hover/focus; ring-swatches
  без фокуса.
- **Концепция «Premium Reference»:** Свотчи на token-бордерах (`--color-border-strong`),
  hover — lift `scale(1.12)` + elevation-1, выбранный — двойное кольцо (`--focus-ring`-like
  через `box-shadow`), цель ≥18px. Hue-ring — плавный drag с tooltip-значением HEX.
- **Спецификация:**

```css
.swatch {
  border: 1px solid var(--color-border-strong);
  transition: transform var(--dur-fast) var(--ease-spring), box-shadow var(--dur-fast);
}
.swatch:hover { transform: scale(1.12); box-shadow: var(--elevation-1); }
.swatch[data-active="true"], .swatch:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--color-bg-panel), 0 0 0 4px var(--color-accent);
}
```

- **Ожидаемый результат:** Палитра корректна в обеих темах, выбор цвета точный и приятный.

#### [E3] Layers panel — премиум-список слоёв
- **Область изменений:** `LayersPanel.module.css`.
- **Текущее состояние & Проблема:** Строки без hover; кнопки 22px (ниже 24px-таргета);
  fallback `var(--color-bg-input, #1e2029)`; drag — только `cursor: grab`, нет
  drop-индикатора-линии; select 10px.
- **Концепция «Premium Reference»:** Строки с hover-подсветкой, активная — акцентный
  left-border (3px) + tinted bg; кнопки 24px с фокусом/press; drag — анимированная
  drop-line индикатор + поднятая «призрак»-строка (elevation-2). Visibility/lock —
  иконки с состоянием.
- **Спецификация:** `.item:hover { background: var(--color-bg-panel-hover); }`;
  `.item.active { border-left: 3px solid var(--color-accent); }`; кнопки `24×24`,
  `:focus-visible` + `:active scale(.92)`; drop-line `2px` accent.
- **Ожидаемый результат:** Управление слоями уровня Photoshop/Procreate.

#### [E4] Animation timeline — кинематографичная лента
- **Область изменений:** `AnimationTimeline.module.css`.
- **Текущее состояние & Проблема:** UI про анимацию, но сам без анимаций; thumbs 24px,
  radius 2px; нет hover; играющий кадр без выделения движения.
- **Концепция «Premium Reference»:** Лента кадров с hover-lift, активный кадр — акцентная
  рамка + playhead-индикатор, который **плавно скользит** во время проигрывания
  (`transform: translateX`, привязка к currentFrame). Кнопки play/loop — тактильные.
- **Спецификация:** thumbs `radius var(--radius-sm)`; `.thumb:hover { transform:
  translateY(-2px); box-shadow: var(--elevation-1); }`; playhead — абсолютный 2px accent
  bar, `transition: transform var(--dur-fast) linear`.
- **Ожидаемый результат:** Тайм-лайн ощущается как медиа-редактор.

#### [E5] Editor panel shell + texture canvas
- **Область изменений:** `EditorPanel.module.css`, `TextureCanvas.module.css`.
- **Текущее состояние & Проблема:** Множество кнопок без hover/focus/active; шахматка
  16px (EditorPanel) vs 12px (TextureCanvas) — несогласованность; шрифты 10–14px хардкод;
  canvas-frame без elevation.
- **Концепция «Premium Reference»:** Унифицировать checkerboard-токен (один размер +
  цвета через токены). Canvas-frame — inset elevation + hairline. Все кнопки на системные
  состояния. Zoom-контрол — premium-slider (E1).
- **Спецификация:** ввести `--checker-size: 12px` и `--checker-c1/--checker-c2` токены;
  `.canvasFrame { box-shadow: var(--elevation-1), inset 0 0 0 1px var(--color-border-panel); }`.
- **Ожидаемый результат:** Рабочая зона рисования выглядит профессионально и согласованно.

---

# EPIC F — Overlays & Dialogs

#### [F1] Унификация модалок (glass + elevation + motion)
- **Область изменений:** `CommandPalette`, `SettingsPanel`, `SaveDialog`,
  `BackupManagerDialog`, `ExportScreenshotDialog`, `SessionRestoreDialog`.
- **Текущее состояние & Проблема (D4):** CommandPalette/Settings — glass (`blur 8–16px`,
  `--shadow-lg`), SaveDialog — плоский `rgba(0,0,0,.55)` + `blur(4px)` + `--shadow-md`,
  разные padding/радиусы, нет анимаций открытия, фокус на input убран.
- **Концепция «Premium Reference»:** Единый модальный «контракт»: scrim
  (`--scrim` + `--scrim-blur`), dialog (`--glass-popover-bg` + `--glass-popover-blur` +
  `--elevation-3` + `--radius-lg`), вход — `scale(.97)→1` + `opacity`, выход — обратный.
  Фокус-ловушка + restore. Заголовки — `--text-xl`.
- **Спецификация (Code):**

```css
.overlay {
  background: var(--scrim); backdrop-filter: var(--scrim-blur);
  display: grid; place-items: center; padding: var(--space-6);
  animation: scrimIn var(--dur-fast) var(--ease-standard);
}
.dialog {
  background: var(--glass-popover-bg); backdrop-filter: var(--glass-popover-blur);
  border-radius: var(--radius-lg); box-shadow: var(--elevation-3);
  animation: dialogIn var(--dur-normal) var(--ease-emphasized);
}
@keyframes dialogIn { from { opacity: 0; transform: scale(.97) translateY(8px); } }
@media (prefers-reduced-motion: reduce) { .overlay, .dialog { animation: none; } }
```

- **Ожидаемый результат:** Все модалки — из одной «семьи», премиальный вход/выход,
  доступность фокуса.

#### [F2] Command palette — флагманский overlay
- **Область изменений:** `CommandPalette.*`.
- **Текущее состояние & Проблема:** Хорошая база (glass, shortcut-chips), но input
  убирает фокус без замены, active==hover (нет отдельного focus-индикатора строки),
  нет анимаций, `padding-top: 12vh` хардкод, shortcut radius `4px`.
- **Концепция «Premium Reference»:** Spotlight-класс: активная строка — акцентный
  left-rail (3px) + tinted bg + лёгкий glow; результаты появляются stagger-fade;
  shortcut-chips — `--radius-sm`, моно-шрифт. Группы — sticky-заголовки с `.label-caps`.
- **Спецификация:** `.itemActive { box-shadow: inset 3px 0 0 var(--color-accent); }`;
  shortcut `border-radius: var(--radius-sm)`; результаты `cellFadeIn` stagger (cap 8).
- **Ожидаемый результат:** Палитра команд ощущается как Raycast/Linear — быстрая и «дорогая».

#### [F3] Toasts — премиальные уведомления
- **Область изменений:** `ToastHost.module.css`.
- **Текущее состояние & Проблема:** Хорошая база (slide-in, reduced-motion guard,
  elevation), но dismiss без `:focus-visible`, body без hover-паузы, варианты — только
  border/bg тинт.
- **Концепция «Premium Reference»:** Лид-иконка по варианту (success/error/info/warning)
  в tinted-круге, прогресс-линия авто-дисмисса (accent, `scaleX` 1→0), hover — пауза +
  elevation-2, dismiss с фокусом. Стек — стэкинг с лёгким параллаксом.
- **Спецификация:** `.dismiss:focus-visible { box-shadow: var(--focus-ring); }`;
  progress `::after { transform-origin: left; animation: toastProgress var(--toast-ttl) linear; }`;
  `:hover { animation-play-state: paused; box-shadow: var(--elevation-2); }`.
- **Ожидаемый результат:** Уведомления информативны, управляемы и визуально премиальны.

#### [F4] Skeleton primitive — корректный и безопасный
- **Область изменений:** `Skeleton.module.css`.
- **Текущее состояние & Проблема (D7):** Хардкод `padding: 12px`/`gap: 8px`, fallback-цвета,
  **нет reduced-motion guard** (риск для вестибулярной чувствительности), shimmer без
  пары `aria-busy`.
- **Концепция «Premium Reference»:** Токенизированный shimmer (gradient из
  `--color-surface-2/3`), `prefers-reduced-motion` → статичный pulse-opacity или без
  анимации, рекомендация по `aria-busy="true"` на контейнере.
- **Спецификация:**

```css
.block { padding: var(--space-3); gap: var(--space-2); }
@media (prefers-reduced-motion: reduce) {
  .shimmer { animation: none; background: var(--color-surface-2); }
}
```

- **Ожидаемый результат:** Универсальный, безопасный, согласованный loading-примитив.

---

# EPIC G — Iconography & Visual Accents

#### [G1] Дисциплина иконографики
- **Область изменений:** `Icon.tsx`, точки использования emoji.
- **Текущее состояние & Проблема:** Lucide-обёртка хорошая (stroke 1.75, размеры 16/20),
  **но** во `ViewerToolbar` есть emoji-дети (`📷`, `⤓`) — несогласованность стиля и
  рендеринга между платформами.
- **Концепция «Premium Reference»:** 100% Lucide, единый stroke (1.75), bounding 16/20,
  опционально размер 24 для пустых состояний. Заменить все emoji на Lucide
  (`Camera`, `Download`, …). Активные иконки — наследуют `currentColor` от состояния кнопки.
- **Спецификация:** добавить `24` в `IconSize`; ревью на emoji (grep), замена на Lucide.
- **Ожидаемый результат:** Идеально консистентная, кроссплатформенная иконография.

#### [G2] Статус-индикаторы и «живые» акценты
- **Область изменений:** StatusBar, catalog badges, biome chips, dirty-indicators.
- **Текущее состояние & Проблема:** Статусы часто различаются только цветом (a11y);
  biome-кнопки — текст без цветовой подсказки; dirty — только цвет.
- **Концепция «Premium Reference»:** Интерактивные индикаторы: dirty — пульсирующая
  точка (accent/warning) + иконка; biome — цветной swatch-чип (цвет биома) + лейбл;
  baking — мягкий «дышащий» индикатор. Цвет всегда дублируется формой/иконкой.
- **Спецификация:** `.statusDot { animation: pulse 2s var(--ease-standard) infinite; }`
  (guard reduced-motion); biome-чип — `::before` swatch 8px round.
- **Ожидаемый результат:** Состояния считываются мгновенно и доступны без опоры на цвет.

#### [G3] Subtle glow / containment-бордеры
- **Область изменений:** глобально (через токены A2/A3).
- **Текущее состояние & Проблема:** Бордеры есть, но «свечение» акцента применяется
  бессистемно (selected-ячейки, кнопки).
- **Концепция «Premium Reference»:** Единое правило: акцентные активные элементы получают
  `0 0 12px color-mix(accent 25%, transparent)` glow; контейнеры в dark — `--border-hairline`
  (1px `rgba(255,255,255,.05)`) для «containment».
- **Ожидаемый результат:** Согласованный «премиум-свет» по всему UI.

---

# EPIC H — Motion & Micro-interactions

#### [H1] Глобальные правила движения
- **Область изменений:** `global.css`, точечно компоненты.
- **Текущее состояние & Проблема:** press-scale только на глобальном `<button>`; кастомные
  div-кнопки/role=button его не получают; переходы на `ease`.
- **Концепция «Premium Reference»:** Единые правила: hover ≤120ms, press 80ms spring,
  входящие элементы — decelerate, layout-сдвиги — emphasized. Press-scale для всех
  интерактивов (включая `[role="button"]`). Только `transform`/`opacity` (GPU).
- **Спецификация:**

```css
button, [role="button"], .interactive {
  transition: transform var(--dur-instant) var(--ease-spring),
              background var(--dur-fast), border-color var(--dur-fast),
              box-shadow var(--dur-fast), color var(--dur-fast);
}
button:active:not(:disabled), [role="button"]:active { transform: scale(.97); }
```

- **Ожидаемый результат:** Каждое нажатие даёт тактильный отклик — ощущение качества.

#### [H2] Переходы между режимами/панелями
- **Область изменений:** AppShell, workspace-transition, panel collapse.
- **Текущее состояние & Проблема:** Сворачивание/режимы — мгновенные (jump-cut).
- **Концепция «Premium Reference»:** Панели сворачиваются/разворачиваются с
  width/opacity-переходом (`var(--dur-normal) var(--ease-emphasized)`); смена Classic↔Studio
  — кросс-фейд контента; collapse-кнопки fade-reveal.
- **Спецификация:** анимировать grid-column width через `transition` (или FLIP);
  контент — `opacity` кросс-фейд. Guard reduced-motion.
- **Ожидаемый результат:** Перестроения layout плавные, не «дёргают» глаз.

#### [H3] Onboarding / tooltips — позиционирование и плавность
- **Область изменений:** `OnboardingTour.*`, `TooltipHints.*`, `Tooltip.tsx`.
- **Текущее состояние & Проблема:** Tooltip-репозиционирование на scroll/resize не всегда
  корректно (из summary — частично адресовано); появление резкое.
- **Концепция «Premium Reference»:** Tooltips — fade+scale из точки якоря
  (`transform-origin`), задержка появления 400ms / скрытия 100ms, корректный reposition
  на scroll/resize/intersection. Onboarding — spotlight с мягким затемнением и
  анимированной рамкой-таргетом.
- **Ожидаемый результат:** Подсказки ощущаются «умными» и отполированными.

---

# EPIC I — Accessibility & Performance

#### [I1] Клавиатурная навигация и ARIA-паттерны
- **Область изменений:** tabs, toolbars, grid, tooltips, dialogs.
- **Текущее состояние & Проблема (D8):** Табы без roving tabindex/arrow-nav/`aria-controls`;
  тулбары не `role="toolbar"`; group-labels не связаны; tooltips без `aria-describedby`;
  компаратор-лейблы не связаны с панами.
- **Концепция «Premium Reference»:** Полные WAI-ARIA APG паттерны: tablist (roving +
  стрелки), toolbar (стрелки + Home/End), grid (есть, дополнить `aria-colcount`),
  tooltip (`aria-describedby`), modal (focus-trap + restore + Esc).
- **Спецификация:** реализовать roving-tabindex хук (переиспользуемый) для tabs/toolbar;
  связать все label↔control через `id`/`aria-labelledby`.
- **Ожидаемый результат:** Полностью управляемое с клавиатуры приложение, прохождение
  axe/WCAG 2.1 AA по навигации.

#### [I2] Контраст и темы
- **Область изменений:** tokens (light/high-contrast), хардкод-rgba (D9).
- **Текущее состояние & Проблема:** Хардкод `rgba(0,0,0,.x)` ломает light-тему;
  `--color-surface-1` используется, но **не определён**; muted-текст местами на грани AA.
- **Концепция «Premium Reference»:** Все полупрозрачные слои — через token-`color-mix`
  на семантических переменных. Определить недостающий `--color-surface-1`. Проверить
  все text/bg пары на ≥4.5:1 (body) и ≥3:1 (крупный/иконки).
- **Спецификация:** добавить `--color-surface-1` во все темы; аудит контраста (axe);
  заменить хардкод rgba в PalettePanel/Settings.
- **Ожидаемый результат:** Безупречные dark/light/high-contrast, без «провалов» цвета.

#### [I3] Перфоманс рендера (60/120 FPS)
- **Область изменений:** анимации, блюры, виртуализация.
- **Текущее состояние & Проблема:** Риск: широкое применение `backdrop-filter` и теней
  на скролл-контейнерах убьёт FPS; shimmer без guard; spring-transform на больших списках.
- **Концепция «Premium Reference»:** `backdrop-filter` — только малые поверхности (A3);
  анимации — только `transform`/`opacity` с `will-change` точечно (снимать после);
  `content-visibility: auto` для off-screen секций; spring-hover на ячейках — через
  `transform` (composited). Профилирование в DevTools (Performance) на 4060+ ассетах.
- **Спецификация:** запретить blur на `.scroll`/виртуал-листах; `will-change: transform`
  на hover-ячейках с снятием; бюджет: главный поток <8ms/frame при скролле каталога.
- **Ожидаемый результат:** Премиум-визуал без единого «дропа» кадров.

---

# EPIC J — Cleanup (мёртвый CSS / дубли)

#### [J1] Удаление legacy/dead-CSS
- **Область изменений:** см. список.
- **Текущее состояние & Проблема (D6):** Мёртвый/дублирующий CSS раздувает бандл и путает.
- **Конкретика к удалению/консолидации:**
  - `ViewerPanel.module.css`: `.toolbar/.toolbarActions/.variantSelect/.cameraPresets/
    .presetBtn/.presetHotkey/.modeBadge/.message/.selected*/.phaseNote/.error/.linked*/
    .comparatorLabel/.comparatorDivider` — не используются TSX.
  - `BlockStudioViewport.module.css`: `.presets/.presetBtn/.hintBar/.paintWorkflowBanner`.
  - `CatalogGridToolbar.*` — не подключён (контролы в `CatalogSearch`); удалить или
    переиспользовать.
  - Компаратор-стили — единый источник в `Compare3DViewport.module.css` (D4).
  - Дубли микро-лейблов (`.groupLabel/.section-label`) → утилита `.label-caps` (A1).
- **Ожидаемый результат:** Чистая, поддерживаемая CSS-база; меньше бандл; нет «ложных следов».

---

## 11. Сводка новых/изменённых токенов (единый дифф для `tokens.css`)

```css
/* Типографика (A1) */
--text-3xs: .5625rem; --text-2xs: .625rem; --text-2xl: 1.375rem;
--leading-tight: 1.15; --leading-snug: 1.3; --leading-normal: 1.5;
--tracking-tight: -.01em; --tracking-wide: .03em; --tracking-caps: .06em;
--font-weight-strong: 650;

/* Elevation (A2) */
--elevation-0 … --elevation-3; --border-hairline;

/* Glass (A3) */
--scrim; --scrim-blur; --glass-panel-bg/-blur; --glass-popover-bg/-blur; --glass-chip-bg/-blur;

/* Motion (A4) */
--ease-standard/-decelerate/-accelerate/-spring;
--dur-instant/-fast/-normal/-slow;
(--transition-fast/normal → переведены на новые)

/* Focus (A5) */
--focus-ring-inset;

/* Surfaces / checker (E5, I2) */
--color-surface-1 (во всех темах); --checker-size; --checker-c1; --checker-c2;
```

> Все три темы (`dark`/`light`/`high-contrast`) обязаны переопределить elevation, glass,
> surface-1 и checker корректно. High-contrast: блюры → off, glow → off, бордеры → сплошные.

---

## 12. Определение «Готово» (Definition of Done)

- [ ] Ноль сырых `font-size` в `px` в feature-CSS (всё на `--text-*`).
- [ ] Каждый интерактив имеет hover, `:focus-visible` (= `--focus-ring`), `:active`.
- [ ] Все модалки используют единый glass+elevation+motion контракт.
- [ ] Tabs/toolbars/grid/tooltips/modals проходят axe без критичных нарушений.
- [ ] `prefers-reduced-motion` отключает все нефункциональные анимации (включая Skeleton/shimmer).
- [ ] dark/light/high-contrast визуально корректны (нет хардкод-rgba, surface-1 определён).
- [ ] Скролл каталога (4060+ ассетов) держит 60 FPS; модалки/overlay — без дропов.
- [ ] Мёртвый CSS из §J удалён; компаратор-стили в одном файле.
- [ ] `npm run typecheck`, `lint`, `format:check`, `test:unit` — зелёные.

---

## 13. Метрики восприятия (что почувствует пользователь)

| Эпик | Ощущение «до» | Ощущение «после» |
|------|---------------|------------------|
| A | «собрано на коленке», метрики пляшут | «спроектировано системно» |
| B | функциональный shell | нативная, «жидкая» оболочка |
| C | плотный, статичный список | живой, тактильный каталог |
| D | модель «висит» в пустоте | референс-3D-витрина |
| E | утилитарные контролы | pro-арт-инструмент |
| F | разнородные окна | единая премиум-семья модалок |
| G–H | статика, цвет-онли статусы | движение, доступные акценты |
| I | частичная доступность | полностью клавиатурно/контрастно корректно |
```
