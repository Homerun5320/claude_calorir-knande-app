# Lagom – API-översikt (komponenter, bibliotek, hooks)

Genererad översikt över exporterade namn. Läs källfilen för detaljer (JSDoc på svenska).


## UI-primitiver

### `src/components/ui/Badge.tsx`
- type `AccentTone`
- type `SemanticTone`
- type `Tone`
- `toneColor(tone: Tone): string`
- `toneSoftColor(tone: Tone): string`
- `toneTextColor(tone: Tone): string` – tonen som textfärg (`--lg-*-text`, minst 4,5:1 mot alla ytor och -soft i båda temana)
- `toneInkColor(tone: Tone): string`
- `toneVars(tone: Tone, style?: CSSProperties): CSSProperties`
- type `BadgeVariant`
- interface `BadgeProps`
- `Badge({ tone = 'neutral', variant = 'soft', size = 'sm', icon, dot, className, title, children }: BadgeProps)`

### `src/components/ui/Button.tsx`
- `cx(...parts: Array<string | false | null | undefined | 0>): string`
- type `IconLike`
- `renderIcon(icon: IconLike | undefined, className = 'size-5', strokeWidth?: number): ReactNode`
- type `ButtonVariant`
- type `ButtonSize`
- const `BUTTON_VARIANTS : Record<ButtonVariant, string>`
- const `BUTTON_BASE`
- `Spinner({ className = 'size-[1.125rem]' }: { className?: string })`
- type `ButtonAsButtonProps`
- type `ButtonAsLinkProps`
- type `ButtonProps`
- `Button(props: ButtonProps)`

### `src/components/ui/Card.tsx`
- type `CardPadding`
- type `CardVariant`
- interface `CardProps`
- `Card(`

### `src/components/ui/Chip.tsx`
- interface `ChipProps`
- `Chip({ selected, icon, count, tone = 'gran', size = 'md', className, children, type = 'button', style, ...rest }: ChipProps)`

### `src/components/ui/Dialog.tsx`
- interface `DialogProps` – `returnFocus`, `closeOnBack` (standard: ja för `dialog`; `alertdialog` bara ovanpå ett ark)
- `Dialog(props: DialogProps)`
- interface `ConfirmOptions`
- interface `ConfirmDialogProps`
- `ConfirmDialog(`
- const `useDialogStore`
- `confirmDialog(options: ConfirmOptions): Promise<boolean>`
- `DialogHost()`

### `src/components/ui/EmptyState.tsx`
- type `EmptyIllustration`
- interface `EmptyStateProps`
- `EmptyState({ title, text, action, illustration = 'plate', compact, titleAs, className }: EmptyStateProps)` – rubriknivån väljs automatiskt efter föregående rubrik (h2 under sidans h1, h3 i kort/ark) om `titleAs` saknas

### `src/components/ui/headingLevel.ts`
- `levelAfterPrecedingHeading(el)`, `useHeadingLevel(ref, explicit?, fallback = 3)`, `headingTag(level)`

### `src/components/ui/IconButton.tsx`
- type `IconButtonSize`
- interface `IconButtonProps`
- `IconButton(`

### `src/components/ui/ListRow.tsx`
- interface `ListRowProps`
- `ListRow(`
- interface `ListGroupProps`
- `ListGroup({ title, footer, children, plain, className }: ListGroupProps)`

### `src/components/ui/NumberField.tsx`
- interface `NumberFieldProps` – `autoComplete` (standard "off")
- `NumberField(` – min/max kläms inte medan man skriver: värden utanför ger ett meddelande ("Ange ett värde mellan 20 och 400 kg.") och skickas som `undefined`, Enter skickar inte formuläret; värdet kläms när fältet lämnas och vid stegning
- `rangeMessage(min, max, unit?, decimals?)`

### `src/components/ui/PageHeader.tsx`
- interface `PageHeaderProps`
- `PageHeader(`

### `src/components/ui/ProgressBar.tsx`
- interface `ProgressBarProps`
- `ProgressBar(`

### `src/components/ui/ProgressRing.tsx`
- interface `ProgressRingProps`
- `ProgressRing(`

### `src/components/ui/SectionTitle.tsx`
- interface `SectionTitleProps`
- `SectionTitle(`

### `src/components/ui/SegmentedControl.tsx`
- interface `SegmentOption`
- interface `SegmentedControlProps` – tar `aria-describedby`, `aria-invalid`, `aria-required`, `id`; minst 44 px tryckyta
- `SegmentedControl<T extends string | number>(`

### `src/components/ui/Select.tsx`
- interface `SelectOption`
- interface `SelectOptionGroup`
- interface `SelectProps`
- `Select<T extends string = string>(`

### `src/components/ui/Sheet.tsx`
- `getFocusable(root: HTMLElement): HTMLElement[]`
- interface `UseModalOptions`
- type `ReturnFocus`
- `useModal(ref: RefObject<HTMLElement | null>, { active, onDismiss, initialFocusRef, closeOnBack = false, returnFocus = true }: UseModalOptions)`
- `Sheet` tar `returnFocus` (öppnaren som standard, `false` eller ett eget element) och `closeOnBack` (standard = `dismissible`): bakåtknappen stänger arket

### `src/components/ui/modalHistory.ts`
- `registerModalEntry(onBack): () => void` – egen historikpost per öppen modal (samma URL och router-state + markören `__lagomModal`). Bakåt stänger modalen utan att routern ser något; stängning i gränssnittet tar bort posten om den fortfarande är aktuell; push/replace/`navigate(-1)` inifrån en modal fungerar som vanligt
- `hasModalEntries(): boolean`
- `useMediaQuery(query: string): boolean`
- `ModalBackdrop({ onClick }: { onClick?: () => void })`
- interface `SheetProps`
- `Sheet(props: SheetProps)`

### `src/components/ui/Skeleton.tsx`
- interface `SkeletonProps`
- `Skeleton({ className, circle, style }: SkeletonProps)`
- `SkeletonText({ lines = 3, className }: { lines?: number; className?: string })`
- `SkeletonRow({ className }: { className?: string })`

### `src/components/ui/Slider.tsx`
- interface `SliderMark`
- interface `SliderProps`
- `Slider(`

### `src/components/ui/Stat.tsx`
- interface `StatTrend`
- interface `StatProps`
- `Stat({ label, value, unit, sublabel, trend, size = 'md', align = 'start', tone, icon, className }: StatProps)`

### `src/components/ui/Stepper.tsx`
- `stepDecimals(step: number): number`
- `clampNumber(value: number, min?: number, max?: number): number`
- `stepNumber(value: number | undefined, direction: 1 | -1, step = 1, min?: number, max?: number, multiplier = 1): number`
- `usePressRepeat(action: () => void, disabled = false)`
- interface `StepButtonProps`
- `StepButton({ direction, onStep, label, disabled, size = 'md', variant = 'raised', className }: StepButtonProps)`
- interface `StepperProps`
- `Stepper({ value, onChange, label, min, max, step = 1, format, unit, size = 'md', disabled, className }: StepperProps)`

### `src/components/ui/Switch.tsx`
- interface `SwitchProps`
- `Switch(`

### `src/components/ui/Tabs.tsx`
- interface `TabItem`
- interface `TabsProps`
- `tabId(base: string, value: string): string`
- `tabPanelId(base: string, value: string): string`
- `tabPanelProps(base: string, value: string)`
- `Tabs<T extends string>({ value, onChange, tabs, id, variant = 'underline', controls = 'auto', className, ...aria }: TabsProps<T>)` – `controls`: `'auto'` (aria-controls bara mot paneler som finns), `'none'` eller en funktion; fokusramen ritas innanför fliken

### `src/components/ui/TextField.tsx`
- `mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T>`
- const `FIELD_SHELL`
- const `FIELD_INPUT`
- `fieldDescribedBy(id: string, hint: ReactNode, error: ReactNode, extra?: string): string | undefined`
- interface `FieldProps`
- `Field({ id, label, hint, error, labelHidden, optional, labelAction, className, children }: FieldProps)`
- type `TextFieldInputProps`
- type `TextFieldAreaProps`
- type `TextFieldProps`
- `TextField(props: TextFieldProps)`

### `src/components/ui/toast.tsx`
- interface `ToastItem`
- const `useToastStore`
- `toast(message: string, opts: Omit<ToastItem, 'id' | 'message'> = {}): string` – med `action` visas notisen 8 s och pausas vid hovring/fokus
- `toastDuration(t): number`, `pauseToast(id)`, `resumeToast(id)`
- Varje notis har en stängknapp ("Stäng notisen"); Escape stänger den. Stängs en notis med fokus (Ångra, ✕) går fokus tillbaka dit det var innan – annars till öppet ark eller sidans h1
- `ToastViewport()` – portal till `<body>`; fel läses upp med `role="alert"`, övrigt artigt


## Diagram

### `src/components/charts/BarChart.tsx`
- interface `BarDatum`
- interface `BarStackKey`
- type `BarLabelMode`
- interface `BarChartProps`
- `BarChart(`
- `targetLabelFor(value, ticks): string` – mållinjens etikett med egen precision (1,6 blir "1,6", inte "2")

### `src/components/charts/CalendarHeatmap.tsx`
- interface `CalendarHeatmapProps`
- `CalendarHeatmap(`

### `src/components/charts/DonutChart.tsx`
- interface `DonutSegment`
- interface `DonutChartProps`
- `DonutChart(`

### `src/components/charts/LineChart.tsx`
- interface `LinePoint`
- interface `LineSeries`
- interface `LineBand`
- interface `LineGoal`
- interface `LineChartProps`
- `LineChart(`

### `src/components/charts/Sparkline.tsx`
- interface `SparklineProps`
- `Sparkline(`

### `src/components/charts/chartUtils.ts`
- interface `Point`
- `clamp(value: number, min: number, max: number): number`
- `extent(values: Iterable<number | null | undefined>): [number, number] | null`
- `tickStep(min: number, max: number, count = 5): number`
- `niceDomain(min: number, max: number, count = 5): [number, number]`
- `niceTicks(min: number, max: number, count = 5): number[]`
- `decimalsForStep(step: number): number`
- `formatTicks(ticks: readonly number[]): string[]`
- interface `LinearScale`
- `linearScale(domain: readonly [number, number], range: readonly [number, number]): LinearScale`
- interface `BandLayout`
- `bandLayout(`
- `nearestIndex(sorted: readonly number[], x: number): number`
- `monotoneTangents(points: readonly Point[]): number[]`
- `monotonePath(points: readonly Point[]): string`
- `linearPath(points: readonly Point[]): string`
- `stepPath(points: readonly Point[]): string`
- type `CurveType`
- `curvePath(points: readonly Point[], curve: CurveType = 'monotone'): string`
- `areaPath(points: readonly Point[], baselineY: number, curve: CurveType = 'monotone'): string`
- `bandPath(upper: readonly Point[], lower: readonly Point[], curve: CurveType = 'monotone'): string`
- `roundedBarPath(x: number, y: number, width: number, height: number, radius: number): string`
- `polarToCartesian(cx: number, cy: number, r: number, angle: number): Point`
- `arcPath(cx: number, cy: number, r: number, start: number, end: number): string`
- `heatLevel(value: number, max: number, steps = 5): number`
- `tint(color: string, percent: number, base = 'var(--lg-surface-2)'): string`
- `heatScale(color = 'var(--lg-gran)', steps = 5, base = 'var(--lg-surface-2)'): string[]`
- interface `TimeTick`
- `timeTicks(start: ISODate, end: ISODate, maxTicks = 6, opts: { weekNumbers?: boolean } = {}): TimeTick[]`
- const `TOOLTIP_CLASS`
- `tooltipPlacement(anchorX: number, containerWidth: number, edge = 64): { left: number; translate: string }`
- `approxTextWidth(text: string, fontSize = 11): number`
- const `SERIES_COLORS`
- `useElementWidth<T extends HTMLElement = HTMLDivElement>(fallback = 320): [RefObject<T | null>, number]`
- `useMeasuredSize<T extends HTMLElement = HTMLDivElement>(): [`


## Domänkomponenter

### `src/components/domain/CategoryIcon.tsx`
- type `Tint`
- const `TINT_CLASSES : Record<Tint, { soft: string; text: string; solid: string }>`
- const `TINT_VAR : Record<Tint, string>`
- interface `CategoryMeta`
- const `CATEGORY_META : Record<FoodCategory, CategoryMeta>`
- type `IconSize`
- const `ICON_SIZE_CLASSES : Record<IconSize, string>`
- interface `CategoryIconProps`
- `foodEmoji(name, category): string` – emoji efter namnets huvudord ("Smörgås, …" → 🥪), annars kategorins
- const `EMOJI_CLASS`
- `CategoryIcon({ category, size = 'md', emoji, name, labelled = false, className = '' }: CategoryIconProps)` – skicka gärna `name`

### `src/components/domain/DateNavigator.tsx`
- interface `SwipeOptions`
- interface `SwipeHandlers`
- `useSwipe({ onSwipeLeft, onSwipeRight, threshold = 56, maxDuration = 800 }: SwipeOptions): SwipeHandlers`
- interface `DateNavigatorProps`
- `DateNavigator(`

### `src/components/domain/EnergyValue.tsx`
- type `EnergyUnit`
- `useEnergyUnit(): EnergyUnit`
- `useEnergyFormatter(): (kcal: number | undefined, withUnit?: boolean) => string`
- interface `EnergyValueProps`
- `EnergyValue(`

### `src/components/domain/FoodRow.tsx`
- interface `FoodRowMacros`
- interface `FoodRowData`
- interface `FoodRowProps`
- `describeAmount(food: Pick<Food, 'portions' | 'density' | 'liquid'>, amount: number, unit: UnitKey): string`
- `entryToRow(entry: DiaryEntry): FoodRowData`
- `foodToRow(food: Food, opts: { amount?: number; unit?: UnitKey; emoji?: string } = {}): FoodRowData`
- `FoodRow(` – `nameLines` (2 eller 3); makron visas som P/K/F + tal (färgen är extra stöd)

### `src/components/domain/MacroBars.tsx`
- type `MacroKey`
- interface `MacroTargets`
- interface `MacroMeta`
- const `MACRO_META : Record<MacroKey, MacroMeta>`
- `remainingText(eaten: number, target: number): string`
- interface `MacroBarsProps`
- `MacroBars({ totals, targets, showFiber, variant = 'compact', hideNumbers = false, className = '' }: MacroBarsProps)`

### `src/components/domain/MealIcon.tsx`
- interface `MealMeta`
- const `MEAL_META : Record<MealId, MealMeta>`
- interface `MealIconProps`
- `MealIcon({ meal, size = 'sm', variant = 'icon', label, className = '' }: MealIconProps)`

### `src/components/domain/NutrientTable.tsx`
- interface `NutrientReference`
- type `NutrientTableGroupId`
- const `NUTRIENT_GROUP_LABELS : Record<NutrientTableGroupId, string>`
- `referenceStatus(value: number | undefined, ref: NutrientReference | undefined): NutrientStatus`
- `referencePercent(value: number | undefined, ref: NutrientReference | undefined): number | undefined`
- interface `NutrientTableProps` – `caption: ReactNode` (visas utan versaler), `coverage` (andel känd per ämne → "minst 48,7 g"), `headingLevel` (standard: efter föregående rubrik)
- `NutrientTable(`

### `src/components/domain/PortionPicker.tsx` (importera direkt, inte via `domain/index`)
- interface `PortionSelection` – `{ amount, unit, grams }`
- interface `PortionPickerProps` – `food`, `initialAmount`, `initialUnit`, `onConfirm(amount, unit, grams)`, `confirmLabel`, `showNutrients`, `onChange`, `hideActions`, `secondaryLabel`/`onSecondary`, `busy`, `autoFocus`
- `PortionPicker(` – sätter startvärdet en gång; ge `key={food.id}` om livsmedlet kan bytas

### `src/components/domain/WaterGlasses.tsx`
- interface `WaterGlassesProps`
- `formatLiters(ml)` ("1,25 l"), `formatLitersLong(ml)` ("1,25 liter") – sammanfattningen visar siffran och "liter" var för sig
- `formatLiters(ml: number): string`
- `WaterGlasses(`


## Signaturkomponenter

### `src/components/signature/CalorieRing.tsx`
- interface `CalorieRingMacros`
- interface `CalorieRingProps`
- type `RingStatus`
- interface `RingSummary`
- const `LAGOM_TOLERANCE`
- `summarizeRing(eatenKcal: number, budgetKcal: number, exerciseKcal = 0): RingSummary`
- `macroEnergyShares(macros?: CalorieRingMacros): CalorieRingMacros | null`
- `mindfulLabel(ratio: number): { title: string; hint: string }`
- `describeRing(summary: RingSummary, opts: { shares?: CalorieRingMacros | null; exerciseKcal?: number; mindful?: boolean; unit?: 'kcal' | 'kJ' } = {}): string`
- `arcPath(r: number, a0: number, a1: number): string`
- `CalorieRing(`

### `src/components/signature/Confetti.tsx`
- interface `ConfettiProps`
- interface `ConfettiPiece`
- `makeConfetti(count: number, seed: number): ConfettiPiece[]`
- `Confetti({ fire, count, origin = { x: 0.5, y: 0.4 }, fullscreen = false, onComplete, className = '' }: ConfettiProps)`

### `src/components/signature/PlateModel.tsx`
- interface `PlateModelProps`
- `wedgePath(a0: number, a1: number, r = R_FOOD, gap = GAP, corner = CORNER): string`
- `normalizeFractions(f: PlateSplit): PlateSplit`
- `fractionWords(v: number): string`
- `describePlate(fractions: PlateSplit, ideal: PlateSplit, empty: boolean): string`
- `PlateModel(`

### `src/components/signature/SeasonalHeader.tsx`
- interface `SeasonalHeaderProps`
- `sceneLabel(season: Season, phase: SkyPhase): string`
- `moonPhase(date: Date): number`
- `moonLitPath(cx: number, cy: number, r: number, phase: number): string`
- `buildPalette(season: Season, phase: SkyPhase, dark = false): Palette`
- `SeasonalHeader({ date, now: nowProp, season: seasonProp, phase: phaseProp, height = 176, children, className = '', contentClassName }: SeasonalHeaderProps)`


## Layout

### `src/components/layout/AppShell.tsx`
- `PageFallback()` – `role="status"` med dold text "Laddar …"
- `AppShell()` – sätter dokumenttitel per sida, flyttar fokus till sidans `h1` efter navigering, visar varning när data inte kan sparas
- `routeTitle(pathname: string): string` – "Vikt & mått – Lagom"
- `navMatch(item, pathname, exclude?): 'page' | 'section' | null` – "Mer" markeras även på sidor man når därifrån

### `src/components/layout/RouteError.tsx`
- `RouteError({ inShell }: { inShell?: boolean })` – `errorElement` för routern: svensk felsida med Ladda om / Till Idag / säkerhetskopia; laddar om en gång vid chunkfel efter uppdatering
- `isChunkLoadError(error: unknown): boolean`

### `src/components/layout/Logo.tsx`
- `LogoMark({ size = 32, className = '' }: { size?: number; className?: string })`
- `Wordmark({ className = '' }: { className?: string })`


## Bibliotek

### `src/lib/backup.ts`
- const `BACKUP_FORMAT`
- const `BACKUP_VERSION`
- interface `BackupFile`
- `createBackup(): BackupFile`
- class `BackupError`
- `parseBackup(text: string): BackupFile`
- interface `ImportSummary`
- `summarizeBackup(b: BackupFile): ImportSummary`
- `restoreBackup(b: BackupFile, mode: 'replace' | 'merge'): void`
- `wipeAllData(): void`
- `diaryToCsv(entries: Record<ISODate, DiaryEntry[]>, meals: MealConfig[] = profilens måltider): string` – måltidsnamn (inte id:n), skydd mot formelinjektion
- `downloadFile(filename: string, content: string, mime = 'application/json'): void`
- `backupFilename(): string`
- `downloadBackup(): boolean` – skapa och ladda ned en säkerhetskopia direkt
- `requestPersistentStorage(): Promise<boolean>`
- `storageEstimate(): Promise<{ usage: number; quota: number } | null>`

### `src/lib/climate.ts`
- interface `ClimateFactor`
- const `CATEGORY_CO2E : Record<FoodCategory, ClimateFactor>`
- const `NAME_CO2E_RULES : ReadonlyArray<{ pattern: RegExp; categories?: readonly FoodCategory[]; kgPerKg: number; source: string }>`
- `foodClimateFactor(food: Food): ClimateFactor`
- `foodCo2e(food: Food): number`
- `entryCo2e(entry: DiaryEntry): number`
- `dayCo2e(entries: readonly DiaryEntry[]): number`
- interface `DayClimate`
- `dayClimate(entries: readonly DiaryEntry[]): DayClimate`
- const `CLIMATE_REFERENCE`
- const `CAR_KG_CO2E_PER_KM`
- interface `Co2eEquivalents`
- `co2eEquivalents(kg: number): Co2eEquivalents`
- type `ClimateLevel`
- interface `ClimateRating`
- const `CLIMATE_THRESHOLDS`
- `climateRating(kgPerDay: number): ClimateRating`
- interface `SwapSuggestion`
- const `MIN_SWAP_SAVING_KG`
- `swapSuggestions(entries: readonly DiaryEntry[], limit = 3): SwapSuggestion[]`

### `src/lib/dates.ts`
- `toISODate(d: Date): ISODate`
- `fromISODate(s: ISODate): Date`
- `isValidISODate(value: string | null | undefined): value is ISODate` – giltig kalenderdag (t.ex. från adressen)
- `todayISO(now: Date = new Date()): ISODate`
- `addDays(date: ISODate, days: number): ISODate`
- `diffDays(a: ISODate, b: ISODate): number`
- `dateRange(start: ISODate, end: ISODate): ISODate[]`
- `lastNDays(n: number, end: ISODate = todayISO()): ISODate[]`
- `isoWeek(date: ISODate): number`
- `startOfWeek(date: ISODate): ISODate`
- `weekdayIndex(date: ISODate): number`
- const `WEEKDAYS`
- const `WEEKDAYS_SHORT`
- const `MONTHS`
- const `MONTHS_SHORT`
- `relativeDayLabel(date: ISODate, today: ISODate = todayISO()): string`
- `formatDayLong(date: ISODate, today: ISODate = todayISO()): string`
- `formatDayShort(date: ISODate): string`
- `formatDayNumeric(date: ISODate): string`
- `capitalize(s: string): string`
- `greeting(now: Date = new Date()): string`
- `nowTime(now: Date = new Date()): string`
- `ageFromBirthYear(birthYear: number, today: ISODate = todayISO()): number`

### `src/lib/dayMeta.ts`
- type `ScaleKey` – `'mood' | 'energy' | 'hunger'`
- interface `ScaleDef`
- const `DAY_SCALES` – humör, energi och hunger (1–5 med emoji och ord), delas av Idag och Dagbok

### `src/lib/diary.ts`
- `entryNutrients(e: DiaryEntry): Nutrients`
- `entryKcal(e: DiaryEntry): number`
- `totals(entries: readonly DiaryEntry[]): Nutrients`
- `entriesByMeal(entries: readonly DiaryEntry[]): Record<MealId, DiaryEntry[]>`
- `exerciseKcal(list: readonly ExerciseEntry[] | undefined): number`
- `dailyBudget(targetKcal: number, exercise: readonly ExerciseEntry[] | undefined, addBackPct: number): number`
- `makeFoodEntry(`

### `src/lib/energy.ts`
- const `KCAL_PER_KG`
- const `MIN_KCAL : Record<Sex, number>`
- const `MAX_DAILY_DEFICIT`
- `bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number`
- interface `EnergyBreakdown`
- `computeEnergy(`
- const `MACRO_PRESETS : Record<Exclude<MacroPreset, 'anpassad'>, { label: string; description: string; protein: number; carbs: number; fat: number }>`
- `macroPercents(profile: Pick<Profile, 'macroPreset' | 'customMacroPct'>): { protein: number; carbs: number; fat: number }`
- const `FIBER_TARGET : Record<Sex, number>`
- `proteinMinG(weightKg: number, age: number): number`
- `waterTargetMl(sex: Sex, lifeStage: Profile['lifeStage']): number`
- `computeTargets(`
- interface `TrendPoint`
- `weightTrend(weights: readonly WeightEntry[], alpha = 0.1, until?: ISODate): TrendPoint[]`
- `slopePerDay(points: ReadonlyArray<{ x: number; y: number }>): number`
- interface `AdaptiveEstimate`
- `estimateAdaptiveTdee(`
- `adaptiveIntake(intakeByDay, isComplete: (date) => boolean, today?, windowDays = 28): Record<ISODate, number>` – bara klarmarkerade dagar när de räcker (≥ 14)
- `projectGoalDate(currentTrendKg: number, weeklyChangeKg: number, targetKg: number, today: ISODate = todayISO()): ISODate | null`
- `bmi(weightKg: number, heightCm: number): number`
- `bmiCategory(v: number): { label: string; tone: 'good' | 'warn' | 'bad' }`

### `src/lib/exercise.ts`
- const `KCAL_PER_KG_PER_MET_HOUR`
- `exerciseKcal(met: number, weightKg: number, minutes: number, restingKcalPerDay?: number): number`
- `minutesForKcal(kcal: number, met: number, weightKg: number, restingKcalPerDay?: number): number`
- type `Intensity`
- `metIntensity(met: number): Intensity`
- const `WEEKLY_ACTIVE_MINUTES_GOAL`
- `moderateEquivalentMinutes(entries: ReadonlyArray<Pick<ExerciseEntry, 'minutes' | 'met' | 'activityId'>>): number`
- const `NET_WALKING_KCAL_PER_KG_KM`
- const `DEFAULT_STRIDE_M`
- `strideLengthM(heightCm?: number): number`
- `stepsToKm(steps: number, heightCm?: number): number`
- `stepsToKcal(steps: number, weightKg: number, heightCm?: number): number`
- const `STEP_BASELINE : Record<ActivityLevel, number>`
- `stepsKcalAboveBaseline(steps: number, weightKg: number, level: ActivityLevel, heightCm?: number): number`
- type `SpeedActivity`
- `metForSpeed(kind: SpeedActivity, kmh: number): number`
- `speedKmh(distanceKm: number, minutes: number): number`
- `paceMinPerKm(distanceKm: number, minutes: number): string | null`
- `searchActivities(query: string, limit = 50): Activity[]`
- const `DEFAULT_EQUIVALENT_ACTIVITY_IDS : readonly string[]`
- interface `ActivityEquivalent`
- `activityEquivalents(`

### `src/lib/foodRepo.ts`
- type `UserFoodSources`
- `recipeFood(recipe: Recipe): Food`
- `findRecipe(recipes: Record<string, Recipe>, id: string): Recipe | undefined`
- interface `UserFoodCatalog`
- `userFoodCatalog(`
- `userFoodsFrom(`
- `allUserFoods(state: UserFoodSources = useFoodStore.getState()): Food[]`
- `findUserFood(state: UserFoodSources, id: string): Food | undefined`
- `rememberFoods(foods: readonly Food[]): void`
- `getRememberedFood(id: string): Food | undefined`
- interface `LmvDatasetMeta`
- interface `BuiltinCatalog`
- const `LMV_DATA_PATH`
- `getBuiltinCatalog(): BuiltinCatalog | null`
- `subscribeBuiltinCatalog(listener: () => void): () => void`
- `parseLmvDataset(json: unknown): { foods: Food[]; meta: LmvDatasetMeta | null }`
- `loadBuiltinCatalog(): Promise<BuiltinCatalog>`
- `loadBuiltinFoods(): Promise<Food[]>`
- `resolveFoodSync(id: string): Food | undefined`
- `getFoodById(id: string, opts: { online?: boolean; signal?: AbortSignal } = {}): Promise<Food | undefined>`
- `findFoodByBarcode(code: string): Promise<Food | undefined>`
- `lookupBarcode(code: string, signal?: AbortSignal): Promise<Food | null>`
- `searchOnlineFoods(query: string, opts: SearchProductsOptions = {}): Promise<Food[]>`

### `src/lib/format.ts`
- `formatNumber(value: number | undefined | null, decimals = 0): string`
- `formatNutrient(key: NutrientKey, value: number | undefined, withUnit = true): string`
- `formatEnergy(kcal: number | undefined, unit: 'kcal' | 'kJ' = 'kcal', withUnit = true): string`
- `formatGrams(g: number | undefined, decimals = 0): string`
- `formatKg(kg: number | undefined, decimals = 1): string`
- `formatPercent(v: number | undefined, decimals = 0): string`
- `parseSwedishNumber(input: string): number` – "1,5", "1 234,5", "½", "1½", "1/2", "1 1/2", "-2"; NaN för ofullständig inmatning
- `formatDuration(minutes: number): string`
- `plural(n: number, one: string, many: string): string`

### `src/lib/id.ts`
- `uid(prefix = ''): string`
- `slugify(s: string): string`

### `src/lib/kostrad.ts`
- type `KostradContribFull` (= `KostradContrib`, som nu har `baljvaxter` och `mejeri`)
- const `CATEGORY_KOSTRAD : Partial<Record<FoodCategory, KostradContribFull>>`
- const `RAW_TO_COOKED_MEAT`
- `foodKostrad(food: Food): KostradContribFull`
- type `KostradId`
- type `KostradStatus`
- interface `KostradResult`
- interface `KostradInput`
- const `KOSTRAD_TARGETS`
- const `VIGOROUS_MET`
- `evaluateKostrad(input: KostradInput): KostradResult[]`
- `kostradScore(results: readonly KostradResult[]): number`

### `src/lib/livsmedelsverket.ts`
- const `LMV_API_BASE`
- const `LMV_ATTRIBUTION`
- interface `LmvListItem`
- interface `LmvListResponse`
- interface `LmvNutrientRow`
- type `LmvClassification`
- type `LmvUnit`
- `parseLmvValue(v: unknown): number | undefined`
- `parseLmvUnit(enhet: unknown): LmvUnit | undefined`
- `roundNutrient(v: number): number`
- `mapLmvNutrients(rows: readonly LmvNutrientRow[]): Nutrients`
- const `LMV_CATEGORY_RULES : ReadonlyArray<readonly [FoodCategory, readonly string[]]>`
- const `LMV_DENSITY_RULES : ReadonlyArray<readonly [string, number]>`
- const `LMV_MAPPING_TABLES`
- interface `LmvCategoryInfo`
- `categorizeLmv(name: string, classes?: readonly LmvClassification[], nutrients: Nutrients = {}): LmvCategoryInfo`
- `tidyLmvName(name: string): string`
- `mapLmvFood(item: LmvListItem, rows: readonly LmvNutrientRow[], classes?: readonly LmvClassification[]): Food`
- type `LmvErrorCode`
- class `LivsmedelsverketError`
- `fetchLmvFoodList(`
- `fetchLmvNutrients(nummer: number, signal?: AbortSignal): Promise<LmvNutrientRow[]>`
- `fetchLmvClassifications(nummer: number, signal?: AbortSignal): Promise<LmvClassification[]>`
- `fetchLmvFood(item: LmvListItem, opts: { signal?: AbortSignal; includeClassifications?: boolean } = {}): Promise<Food>`
- interface `LmvImportProgress`
- interface `LmvImportOptions`

### `src/lib/meals.ts`
- const `MEAL_HOURS : Record<MealId, [number, number]>`
- const `MEAL_EMOJI : Record<MealId, string>`
- `mealForTime(meals: MealConfig[], now: Date = new Date()): MealId`
- const `DEFAULT_MEAL_NAMES : Record<MealId, string>`
- `mealName(meals: MealConfig[], id: MealId): string` – faller tillbaka på standardnamnet, aldrig id:t

### `src/lib/nnr.ts`
- type `ReferenceKind`
- interface `ReferenceValue`
- type `ReferenceMap`
- interface `ReferenceProfile`
- type `AgeBand`
- const `REFERENCE_KCAL : Record<Sex, number>`
- const `AGE_BANDS : readonly AgeBand[]`
- `ageBand(age: number): AgeBand`
- `isAdultReference(age: number): boolean`
- `referenceIntakes(p: ReferenceProfile): ReferenceMap`
- type `NutrientStatus`
- type `StatusTone`
- const `STATUS_LABELS : Record<NutrientStatus, { label: string; short: string; tone: StatusTone; description: string }>`
- const `LOW_THRESHOLD`
- `nutrientStatus(value: number | undefined, ref: ReferenceValue | undefined): NutrientStatus`
- `percentOfReference(value: number | undefined, ref: ReferenceValue | undefined): number | undefined`
- interface `PeriodAverages`
- `periodAverages(entriesByDate: Record<ISODate, readonly DiaryEntry[] | undefined>, dates: readonly ISODate[]): PeriodAverages`
- interface `WatchItem`
- interface `WatchInput`
- const `MIN_COVERAGE`
- `nutrientsToWatch(input: WatchInput): WatchItem[]`

### `src/lib/nutrients.ts`
- const `NUTRIENT_KEYS`
- type `NutrientKey`
- type `NutrientGroup`
- interface `NutrientMeta`
- const `NUTRIENTS : Record<NutrientKey, NutrientMeta>`
- const `MACRO_KEYS`
- const `VITAMIN_KEYS`
- const `MINERAL_KEYS`
- const `KCAL_PER_G`
- const `KJ_PER_KCAL`
- const `STANDARD_DRINK_G`
- `scaleNutrients(n: Nutrients, factor: number): Nutrients`
- `nutrientsForGrams(per100: Nutrients, grams: number): Nutrients`
- `sumNutrients(list: Nutrients[]): Nutrients`
- `kcalFromMacros(n: Nutrients): number`
- `energyDistribution(n: Nutrients): { protein: number; carbs: number; fat: number; alcohol: number }`
- const `saltFromSodiumMg`
- const `sodiumMgFromSalt`
- `completeNutrients(n: Nutrients): Nutrients`
- `completeness(n: Nutrients, keys: readonly NutrientKey[] = NUTRIENT_KEYS): number`
- `standardDrinks(n: Nutrients): number`

### `src/lib/openFoodFacts.ts`
- const `OFF_PRODUCT_URL`
- const `OFF_SEARCH_URL`
- const `OFF_TIMEOUT_MS`
- const `OFF_ATTRIBUTION`
- const `OFF_FIELDS`
- type `OffErrorCode`
- const `OFF_MESSAGES : Record<OffErrorCode, string>`
- class `OpenFoodFactsError`
- `isAbortError(err: unknown): boolean`
- `normalizeBarcode(code: string): string`
- `isValidEan(code: string): boolean`
- interface `OffProduct`
- `mapOffNutriments(nutriments: Record<string, unknown> | undefined): Nutrients`
- `hasUsableNutrition(food: Pick<Food, 'nutrients'>): boolean`
- `offCategory(tags: readonly string[] | undefined, nutrients: Nutrients = {}): FoodCategory`
- `offAllergens(tags: readonly string[] | undefined): string[]`
- `offLabels(tags: readonly string[] | undefined): { labels: string[]; tags: FoodTag[] }`
- `parseQuantity(text: string | undefined): ParsedQuantity | undefined`
- `mapOffProduct(p: OffProduct, fallbackCode?: string): Food | null`
- `fetchProductByBarcode(code: string, signal?: AbortSignal): Promise<Food | null>`
- interface `SearchProductsOptions`
- `searchProducts(query: string, opts: SearchProductsOptions = {}): Promise<Food[]>`

### `src/lib/plate.ts`
- type `PlateVariant`
- type `PlatePart`
- const `PLATE_IDEAL : Record<PlateVariant, PlateSplit>`
- const `PLATE_VARIANT_LABELS : Record<PlateVariant, { label: string; description: string }>`
- const `PLATE_PART_LABELS : Record<PlatePart, { label: string; examples: string }>`
- const `CATEGORY_PLATE : Record<FoodCategory, Split>`
- `foodPlate(food: Food): Split`
- interface `MealPlate`
- `plateScore(fractions: PlateSplit, ideal: PlateSplit): number`
- const `PLATE_GOOD_SCORE`
- `mealPlate(entries: readonly DiaryEntry[], variant: PlateVariant = 'vanlig'): MealPlate`

### `src/lib/recipes.ts`
- const `RECIPE_ID_PREFIX`
- `recipeFoodId(recipeId: string): string`
- `ingredientGrams(ingredient: RecipeIngredient): number`
- `recipeServings(recipe: Pick<Recipe, 'servings'>): number`
- `recipeTotals(recipe: Pick<Recipe, 'ingredients'>): Nutrients`
- `recipeRawWeight(recipe: Pick<Recipe, 'ingredients'>): number`
- `recipeFinalWeight(recipe: Pick<Recipe, 'ingredients' | 'cookedWeightG'>): number`
- `recipeNutrientsPer100(recipe: Pick<Recipe, 'ingredients' | 'cookedWeightG'>): Nutrients`
- `recipePerServing(recipe: Pick<Recipe, 'ingredients' | 'servings'>): Nutrients`
- `recipeServingWeight(recipe: Pick<Recipe, 'ingredients' | 'cookedWeightG' | 'servings'>): number`
- `recipeNutrientCoverage(recipe: Pick<Recipe, 'ingredients'>): Record<NutrientKey, number>`
- `recipePlate(recipe: Pick<Recipe, 'ingredients'>): PlateSplit | undefined`
- `recipeKostrad(recipe: Pick<Recipe, 'ingredients' | 'cookedWeightG'>): KostradContribFull`
- `recipeCo2e(recipe: Pick<Recipe, 'ingredients' | 'cookedWeightG'>): number | undefined`
- `recipeTags(recipe: Pick<Recipe, 'ingredients' | 'tags'>): FoodTag[]`
- `recipeToFood(recipe: Recipe): Food`

### `src/lib/search.ts`
- type `MatchKind`
- interface `SearchResult`
- interface `SearchOptions`
- interface `SearchIndex`
- const `SEARCH_TIERS`
- `normalizeSv(input: string): string`
- `foldSv(input: string): string`
- `stemSv(token: string): string`
- `createSearchIndex(foods: readonly Food[]): SearchIndex`
- `searchFoods(`
- interface `HighlightPart`
- `highlightSv(text: string, query: string): HighlightPart[]`

### `src/lib/season.ts`
- type `Season`
- interface `SeasonInfo`
- const `SEASONS : Record<Season, SeasonInfo>`
- const `SEASON_ORDER : readonly Season[]`
- `swedishSeason(date: Date | ISODate = new Date()): Season`
- `seasonLabel(season: Season): string`
- interface `City`
- const `SWEDISH_CITIES : readonly City[]`
- const `DEFAULT_LAT`
- const `DEFAULT_LON`
- `cityById(id: string): City | undefined`
- type `PolarState`
- interface `SunTimes`
- `sunTimes(date: Date | ISODate = new Date(), lat: number = DEFAULT_LAT, lon: number = DEFAULT_LON): SunTimes`
- `sunAltitude(time: Date = new Date(), lat: number = DEFAULT_LAT, lon: number = DEFAULT_LON): number`
- type `SkyPhase`
- const `SKY_PHASE_LABELS : Record<SkyPhase, string>`
- const `NIGHT_ALTITUDE`
- const `DAY_ALTITUDE`
- `skyPhase(now: Date = new Date(), lat: number = DEFAULT_LAT, lon: number = DEFAULT_LON): SkyPhase`
- type `ProduceKind`
- interface `Produce`
- `seasonalProduce(month: number): Produce[]`
- `seasonalProduceFor(date: Date | ISODate = new Date()): Produce[]`

### `src/lib/swedishCalendar.ts`
- type `FoodDayKind`
- interface `FoodDay`
- const `FOOD_DAY_KIND_LABELS : Record<FoodDayKind, string>`
- const `WEEKDAY`
- `weekdayOnOrAfter(date: ISODate, weekday: number): ISODate`
- `nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): ISODate`
- `lastWeekdayOfMonth(year: number, month: number, weekday: number): ISODate`
- `easterSunday(year: number): ISODate`
- `fatTuesday(year: number): ISODate`
- `midsummerEve(year: number): ISODate`
- `allSaintsDay(year: number): ISODate`
- `firstAdvent(year: number): ISODate`
- `mothersDay(year: number): ISODate`
- `fathersDay(year: number): ISODate`
- `surstrommingPremiere(year: number): ISODate`
- `lobsterPremiere(year: number): ISODate`
- `vasaloppet(year: number): ISODate`
- `worldEggDay(year: number): ISODate`
- `princessCakeWeek(year: number): { start: ISODate; end: ISODate }`
- interface `WeeklyFoodTradition`
- const `WEEKLY_FOOD_TRADITIONS : readonly WeeklyFoodTradition[]`
- `foodDaysForYear(year: number): FoodDay[]`
- `weeklyFoodDayFor(date: ISODate): FoodDay | undefined`
- `foodDayFor(date: ISODate): FoodDay[]`
- `upcomingFoodDays(from: ISODate, count = 5): FoodDay[]`
- `foodDaysInMonth(year: number, month: number): FoodDay[]`
- `nextFoodDay(key: string, from: ISODate): FoodDay | undefined`
- `foodDayCountdown(day: Pick<FoodDay, 'date' | 'endDate'>, today: ISODate): string`

### `src/lib/units.ts`
- const `VOLUME_ML : Record<VolumeUnit, number>`
- const `UNIT_LABELS : Record<Exclude<UnitKey, `portion:${string}`>, { short: string; long: string }>`
- `isVolumeUnit(unit: UnitKey): unit is VolumeUnit`
- `isPortionUnit(unit: UnitKey): unit is `portion:${string}``
- `densityOf(food: Pick<Food, 'density' | 'liquid'>): number | undefined`
- `availableUnits(food: Pick<Food, 'portions' | 'density' | 'liquid'>): UnitKey[]`
- `defaultUnit(food: Pick<Food, 'portions' | 'density' | 'liquid'>): UnitKey`
- `defaultAmount(unit: UnitKey): number`
- `gramsFor(food: Pick<Food, 'portions' | 'density' | 'liquid'>, amount: number, unit: UnitKey): number`
- `unitLabel(food: Pick<Food, 'portions'>, unit: UnitKey): string`
- `formatAmount(food, amount, unit, withGrams = false): string` – "2 dl (76 g)", "1 glas (2 dl, 206 g)", "2 smörgåsar (124 g)"; upprepar aldrig gramvikten
- `formatPortionAmount(label: string, amount: number, grams?: number): string`
- const `PORTION_PLURALS : Record<string, string>` – pluralformer för portionsord


## Hooks

### `src/hooks/useDay.ts`
- interface `DayData`
- `useDay(date: ISODate): DayData`

### `src/hooks/useFood.ts`
- `useBuiltinCatalog(enabled = true): BuiltinCatalog | null`
- `useBuiltinFoods(): Food[] | null`
- interface `UseFoodResult`
- `useFood(id: string | null | undefined): UseFoodResult`
- `useFoodResolver(): (id: string) => Food | undefined`

### `src/hooks/useFoodSearch.ts`
- const `SEARCH_DEBOUNCE_MS`
- `createUsageBoost(`
- interface `UseFoodSearchOptions`
- interface `UseFoodSearchResult`
- `useFoodSearch(query: string, opts: UseFoodSearchOptions = {}): UseFoodSearchResult`
- `useRecentFoods(limit = 12, meal?: MealId): Food[]`
- `useFavoriteFoods(): Food[]`

### `src/hooks/useTargets.ts`
- interface `TargetsInfo`
- `useTargets(today: ISODate = todayISO()): TargetsInfo`

### `src/hooks/useTheme.ts`
- `useTheme()`

### `src/hooks/useDocumentTitle.ts`
- `useDocumentTitle(title: string | undefined): void` – förfina sidans titel ("Havregrynsgröt – Lagom")

### `src/hooks/useStorageStatus.ts`
- `useMemoryOnlyStorage(): boolean` – true när ändringar inte sparas på enheten

### `src/hooks/useToday.ts`
- `useToday(): string`


## Butiker

### `src/stores/bodyStore.ts`
- const `useBodyStore`
- `latestWeight(weights: WeightEntry[]): WeightEntry | undefined`

### `src/stores/diaryStore.ts`
- type `NewDiaryEntry`
- type `NewExerciseEntry`
- const `useDiaryStore` – bl.a. `removeEntry`/`restoreEntry` och `removeExercise`/`restoreExercise` för ångra

### `src/stores/fastingStore.ts`
- interface `FastRecord`
- const `useFastingStore`

### `src/stores/foodStore.ts`
- interface `FoodUsage`
- `usageFromEntries(entries): Record<string, FoodUsage>` – "Senaste" byggt från dagboksposter
- const `useFoodStore`

### `src/stores/hydration.ts`
- `useHydrated(): boolean`

### `src/stores/profileStore.ts`
- const `DEFAULT_MEALS : MealConfig[]`
- const `DEFAULT_SETTINGS : Settings`
- const `useProfileStore`

### `src/stores/storage.ts`
- const `idbStorage` – långsam läsning stänger inte av lagringen; osparad data skrivs aldrig över
- `isMemoryOnlyStorage(): boolean`, `subscribeStorageStatus(listener)`, `onLateRead(listener)`
- const `READ_TIMEOUT_MS`
- const `STORE_KEYS`


## Data

### `src/data/activities.ts`
- type `ActivityGroup`
- interface `Activity`
- const `ACTIVITY_GROUPS : Record<ActivityGroup, { label: string; emoji: string }>`
- const `ACTIVITY_GROUP_ORDER : readonly ActivityGroup[]`
- const `ACTIVITIES : readonly Activity[]`
- `getActivity(id: string): Activity | undefined`
- `activitiesByGroup(): Array<{ group: ActivityGroup; label: string; emoji: string; activities: Activity[] }>`
- const `POPULAR_ACTIVITY_IDS : readonly string[]`

### `src/data/tips.ts`
- type `TipCategory`
- interface `Tip`
- const `TIP_CATEGORIES : Record<TipCategory, { label: string; emoji: string }>`
- const `TIPS : readonly Tip[]`
- `tipsForPeriod(season: Season, month: number): Tip[]`
- `tipForDate(date: ISODate, season?: Season): Tip`
- `tipById(id: string): Tip | undefined`
- `tipsByCategory(category: TipCategory): Tip[]`
