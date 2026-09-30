import { lazy } from 'react'
import { createHashRouter, Navigate, RouterProvider, useLocation } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import { AppShell, PageFallback } from './components/layout/AppShell'
import { RouteError } from './components/layout/RouteError'
import { useHydrated } from './stores/hydration'
import { useProfileStore } from './stores/profileStore'
import { AccessGate } from './features/premium/AccessGate'
import { WEB_PURCHASES_BUILD, isInApp } from './config/platform'

/** Sätts av vite.config.ts (`define`); finns inte i testerna. */
declare const __LAGOM_DISTRIBUTION__: string | undefined

/**
 * Webbköpen finns i bygget (bara webbygget). En konstant i samma modul, så att tacksidan efter
 * Stripe Checkout (/tack) inte följer med i butiksapparna – se WEB_PURCHASES_BUILD i
 * src/config/platform.ts.
 */
const WEB_PURCHASES: boolean = typeof __LAGOM_DISTRIBUTION__ === 'string' ? __LAGOM_DISTRIBUTION__ === 'web' : WEB_PURCHASES_BUILD

const TodayPage = lazy(() => import('./features/today/TodayPage'))
const DiaryPage = lazy(() => import('./features/diary/DiaryPage'))
const AddFoodPage = lazy(() => import('./features/add/AddFoodPage'))
const FoodDetailPage = lazy(() => import('./features/add/FoodDetailPage'))
const ScanPage = lazy(() => import('./features/add/ScanPage'))
const CustomFoodPage = lazy(() => import('./features/add/CustomFoodPage'))
const RecipesPage = lazy(() => import('./features/recipes/RecipesPage'))
const RecipeDetailPage = lazy(() => import('./features/recipes/RecipeDetailPage'))
const RecipeEditorPage = lazy(() => import('./features/recipes/RecipeEditorPage'))
const BodyPage = lazy(() => import('./features/body/BodyPage'))
const ProgressPhotosPage = lazy(() => import('./features/body/ProgressPhotosPage'))
const InsightsPage = lazy(() => import('./features/insights/InsightsPage'))
const ExercisePage = lazy(() => import('./features/activity/ExercisePage'))
const DrinksPage = lazy(() => import('./features/activity/DrinksPage'))
const FastingPage = lazy(() => import('./features/activity/FastingPage'))
const MorePage = lazy(() => import('./features/more/MorePage'))
const AboutPage = lazy(() => import('./features/more/AboutPage'))
const FoodCalendarPage = lazy(() => import('./features/more/FoodCalendarPage'))
const MilestonesPage = lazy(() => import('./features/more/MilestonesPage'))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'))
const OnboardingPage = lazy(() => import('./features/onboarding/OnboardingPage'))
const PremiumPage = lazy(() => import('./features/premium/PremiumPage'))
const ThankYouPage = WEB_PURCHASES ? lazy(() => import('./features/premium/ThankYouPage')) : null
const PrivacyPage = lazy(() => import('./features/legal/PrivacyPage'))
const TermsPage = lazy(() => import('./features/legal/TermsPage'))
const ReportPrintPage = lazy(() => import('./features/insights/ReportPrintPage'))
const RecipeImportPage = lazy(() => import('./features/recipes/RecipeImportPage'))
const ImportSharedPage = lazy(() => import('./features/recipes/ImportSharedPage'))
const PlanningPage = lazy(() => import('./features/planning/PlanningPage'))

/**
 * Sidor som nås utan profil: välkomstflödet, Om Lagom, köpsidan, integritetspolicyn, villkoren och
 * tacksidan efter ett webbköp. Tacksidan bara på webben – i butiksapparna finns inga webbköp att
 * hämta, och i butiksbyggena finns varken sidan eller routen.
 */
const OPEN_PATHS: readonly string[] = ['/valkommen', '/om', '/premium', '/integritet', '/villkor', ...(WEB_PURCHASES && !isInApp() ? ['/tack'] : [])]

function isOpenPath(pathname: string): boolean {
  return OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** Sidan för delade recept och måltider (`SHARE_ROUTE` i lib/shareLink.ts). */
const SHARE_PATH = '/dela'

/**
 * En delningslänk (`#/dela?d=…`) som öppnades innan profilen fanns. Den sparas bara i minnet (ingen
 * ny lagring) och öppnas när välkomstflödet är klart och appen landar på startsidan – laddas sidan
 * om under tiden får man öppna länken igen.
 */
let pendingShare: string | null = null

/** Skickar nya användare till välkomstflödet (och tillbaka till en delningslänk efteråt). */
function Gate({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated()
  const onboardingDone = useProfileStore((s) => s.settings.onboardingDone)
  const { pathname, search } = useLocation()
  if (!hydrated) return <PageFallback />
  if (!onboardingDone && !isOpenPath(pathname)) {
    if (pathname === SHARE_PATH && search) pendingShare = `${SHARE_PATH}${search}`
    return <Navigate to="/valkommen" replace />
  }
  if (onboardingDone && pendingShare) {
    // Framme – eller på väg dit från startsidan efter välkomstflödet (aldrig mitt i något annat).
    if (pathname === SHARE_PATH) pendingShare = null
    else if (pathname === '/') return <Navigate to={pendingShare} replace />
  }
  return <>{children}</>
}

const router = createHashRouter([
  {
    path: '/',
    element: (
      <Gate>
        <AppShell />
      </Gate>
    ),
    // Fel i själva ramen (sällsynt): hel felsida utan navigering.
    errorElement: <RouteError />,
    children: [
      {
        // Fel på en sida (rendering eller en koddel som inte gick att hämta) visas inuti ramen,
        // så att navigeringen finns kvar.
        errorElement: <RouteError inShell />,
        children: [
          { index: true, element: <TodayPage /> },
          { path: 'dagbok', element: <DiaryPage /> },
          { path: 'dagbok/:date', element: <DiaryPage /> },
          // Sidor som bara skapar nytt spärras efter provperioden (se AccessGate) – allt annat är öppet.
          // Flikarna med egen data (Mina livsmedel, sparade måltider) går alltid att öppna.
          { path: 'lagg-till', element: <AccessGate action="mat" browseTabs={['mina', 'maltider']}><AddFoodPage /></AccessGate> },
          { path: 'skanna', element: <AccessGate action="skanna"><ScanPage /></AccessGate> },
          { path: 'livsmedel/:id', element: <FoodDetailPage /> },
          { path: 'nytt-livsmedel', element: <AccessGate action="livsmedel"><CustomFoodPage /></AccessGate> },
          { path: 'livsmedel/:id/redigera', element: <CustomFoodPage /> },
          { path: 'recept', element: <RecipesPage /> },
          { path: 'recept/nytt', element: <AccessGate action="recept"><RecipeEditorPage /></AccessGate> },
          // Före 'recept/:id' – annars tolkas "importera" som ett recept-id.
          { path: 'recept/importera', element: <AccessGate action="recept"><RecipeImportPage /></AccessGate> },
          { path: 'recept/:id', element: <RecipeDetailPage /> },
          { path: 'recept/:id/redigera', element: <RecipeEditorPage /> },
          // Delat recept eller delad måltid (#/dela?d=…). Att titta är fritt – sidan anropar
          // requireAccess före sparande.
          { path: 'dela', element: <ImportSharedPage /> },
          { path: 'vikt', element: <BodyPage /> },
          // Framstegsbilder: att titta och radera spärras aldrig – sidan anropar requireAccess('bild')
          // före en ny bild.
          { path: 'vikt/bilder', element: <ProgressPhotosPage /> },
          { path: 'insikter', element: <InsightsPage /> },
          { path: 'rapport', element: <ReportPrintPage /> },
          { path: 'traning', element: <ExercisePage /> },
          { path: 'dryck', element: <DrinksPage /> },
          { path: 'fasta', element: <FastingPage /> },
          { path: 'mer', element: <MorePage /> },
          { path: 'mer/milstolpar', element: <MilestonesPage /> },
          { path: 'om', element: <AboutPage /> },
          { path: 'matkalender', element: <FoodCalendarPage /> },
          { path: 'planering', element: <PlanningPage /> },
          { path: 'installningar', element: <SettingsPage /> },
          { path: 'installningar/:section', element: <SettingsPage /> },
          { path: 'valkommen', element: <OnboardingPage /> },
          { path: 'premium', element: <PremiumPage /> },
          // Tacksidan efter Stripe Checkout – bara i webbygget.
          ...(ThankYouPage ? [{ path: 'tack', element: <ThankYouPage /> }] : []),
          { path: 'integritet', element: <PrivacyPage /> },
          { path: 'villkor', element: <TermsPage /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])

export default function App() {
  // reducedMotion="user": alla motion-animationer (toast, flikpiller, +-knappen …) följer
  // systemets "Minska rörelse" – transformationer stängs av, opacitet och färg finns kvar.
  return (
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  )
}
