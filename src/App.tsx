import { lazy } from 'react'
import { createHashRouter, Navigate, RouterProvider, useLocation } from 'react-router-dom'
import { AppShell, PageFallback } from './components/layout/AppShell'
import { RouteError } from './components/layout/RouteError'
import { useHydrated } from './stores/hydration'
import { useProfileStore } from './stores/profileStore'

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

/** Skickar nya användare till välkomstflödet. */
function Gate({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated()
  const onboardingDone = useProfileStore((s) => s.settings.onboardingDone)
  const { pathname } = useLocation()
  if (!hydrated) return <PageFallback />
  if (!onboardingDone && !pathname.startsWith('/valkommen') && !pathname.startsWith('/om')) {
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
          { path: 'lagg-till', element: <AddFoodPage /> },
          { path: 'skanna', element: <ScanPage /> },
          { path: 'livsmedel/:id', element: <FoodDetailPage /> },
          { path: 'nytt-livsmedel', element: <CustomFoodPage /> },
          { path: 'livsmedel/:id/redigera', element: <CustomFoodPage /> },
          { path: 'recept', element: <RecipesPage /> },
          { path: 'recept/nytt', element: <RecipeEditorPage /> },
          { path: 'recept/:id', element: <RecipeDetailPage /> },
          { path: 'recept/:id/redigera', element: <RecipeEditorPage /> },
          { path: 'vikt', element: <BodyPage /> },
          { path: 'insikter', element: <InsightsPage /> },
          { path: 'traning', element: <ExercisePage /> },
          { path: 'dryck', element: <DrinksPage /> },
          { path: 'fasta', element: <FastingPage /> },
          { path: 'mer', element: <MorePage /> },
          { path: 'om', element: <AboutPage /> },
          { path: 'matkalender', element: <FoodCalendarPage /> },
          { path: 'installningar', element: <SettingsPage /> },
          { path: 'installningar/:section', element: <SettingsPage /> },
          { path: 'valkommen', element: <OnboardingPage /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
