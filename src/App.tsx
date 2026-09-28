import { lazy } from 'react'
import { createHashRouter, Navigate, RouterProvider, useLocation } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import { AppShell, PageFallback } from './components/layout/AppShell'
import { RouteError } from './components/layout/RouteError'
import { useHydrated } from './stores/hydration'
import { useProfileStore } from './stores/profileStore'
import { AccessGate } from './features/premium/AccessGate'
import { isInApp } from './config/platform'

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
const InsightsPage = lazy(() => import('./features/insights/InsightsPage'))
const ExercisePage = lazy(() => import('./features/activity/ExercisePage'))
const DrinksPage = lazy(() => import('./features/activity/DrinksPage'))
const FastingPage = lazy(() => import('./features/activity/FastingPage'))
const MorePage = lazy(() => import('./features/more/MorePage'))
const AboutPage = lazy(() => import('./features/more/AboutPage'))
const FoodCalendarPage = lazy(() => import('./features/more/FoodCalendarPage'))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'))
const OnboardingPage = lazy(() => import('./features/onboarding/OnboardingPage'))
const PremiumPage = lazy(() => import('./features/premium/PremiumPage'))
const ThankYouPage = lazy(() => import('./features/premium/ThankYouPage'))
const PrivacyPage = lazy(() => import('./features/legal/PrivacyPage'))
const TermsPage = lazy(() => import('./features/legal/TermsPage'))
const ReportPrintPage = lazy(() => import('./features/insights/ReportPrintPage'))
const RecipeImportPage = lazy(() => import('./features/recipes/RecipeImportPage'))
const PlanningPage = lazy(() => import('./features/planning/PlanningPage'))

/**
 * Sidor som nås utan profil: välkomstflödet, Om Lagom, köpsidan, integritetspolicyn, villkoren och
 * tacksidan efter ett webbköp. Tacksidan bara på webben – i butiksapparna finns inga webbköp att
 * hämta (sidan skickar själv vidare där).
 */
const OPEN_PATHS: readonly string[] = ['/valkommen', '/om', '/premium', '/integritet', '/villkor', ...(isInApp() ? [] : ['/tack'])]

function isOpenPath(pathname: string): boolean {
  return OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** Skickar nya användare till välkomstflödet. */
function Gate({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated()
  const onboardingDone = useProfileStore((s) => s.settings.onboardingDone)
  const { pathname } = useLocation()
  if (!hydrated) return <PageFallback />
  if (!onboardingDone && !isOpenPath(pathname)) {
    return <Navigate to="/valkommen" replace />
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
          { path: 'vikt', element: <BodyPage /> },
          { path: 'insikter', element: <InsightsPage /> },
          { path: 'rapport', element: <ReportPrintPage /> },
          { path: 'traning', element: <ExercisePage /> },
          { path: 'dryck', element: <DrinksPage /> },
          { path: 'fasta', element: <FastingPage /> },
          { path: 'mer', element: <MorePage /> },
          { path: 'om', element: <AboutPage /> },
          { path: 'matkalender', element: <FoodCalendarPage /> },
          { path: 'planering', element: <PlanningPage /> },
          { path: 'installningar', element: <SettingsPage /> },
          { path: 'installningar/:section', element: <SettingsPage /> },
          { path: 'valkommen', element: <OnboardingPage /> },
          { path: 'premium', element: <PremiumPage /> },
          { path: 'tack', element: <ThankYouPage /> },
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
