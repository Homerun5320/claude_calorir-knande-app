/**
 * Hookar för receptsidorna: egna recept ur butiken och de inbyggda svenska klassikerna, som
 * löses upp mot den inbyggda livsmedelsdatabasen när den har lästs in (`BuiltinCatalog.recipes`,
 * samma recept som registret använder för 'recipe:klassiker-*').
 */
import { useMemo } from 'react'
import type { Recipe } from '../../types'
import { useFoodStore } from '../../stores/foodStore'
import { useBuiltinCatalog } from '../../hooks/useFood'
import { findRecipe, type BuiltinCatalog } from '../../lib/foodRepo'
import { builtinRecipeInfo, isBuiltinRecipeId } from '../../data/recipes'
import { DEFAULT_SERVING_NOUN, recipeFavoriteId, type ServingNoun } from './recipeLogic'

const EMPTY: Recipe[] = []

/** Klassikerna ur katalogen – samma lista i båda stegen av inläsningen (stabil referens). */
function builtinFrom(catalog: BuiltinCatalog | null): Recipe[] | null {
  if (!catalog) return null
  if (catalog.error || catalog.recipes.length === 0) return EMPTY
  return catalog.recipes
}

export interface BuiltinRecipesResult {
  /** null medan databasen laddas. */
  recipes: Recipe[] | null
  error?: string
}

/** De inbyggda svenska klassikerna (null medan livsmedelsdatabasen laddas). */
export function useBuiltinRecipes(): BuiltinRecipesResult {
  const catalog = useBuiltinCatalog()
  const recipes = builtinFrom(catalog)
  const error = catalog?.error
  return useMemo(() => ({ recipes, error }), [recipes, error])
}

/** Användarens egna recept som lista (osorterad, stabil referens). */
export function useOwnRecipes(): Recipe[] {
  const recipes = useFoodStore((s) => s.recipes)
  return useMemo(() => {
    const list = Object.values(recipes)
    return list.length > 0 ? list : EMPTY
  }, [recipes])
}

export interface UseRecipeResult {
  recipe: Recipe | undefined
  loading: boolean
  builtin: boolean
  error?: string
}

/** Ett recept på id: eget ('r_…') eller inbyggt ('klassiker-…'). */
export function useRecipe(id: string | undefined): UseRecipeResult {
  const key = id ?? ''
  const builtin = isBuiltinRecipeId(key)
  const own = useFoodStore((s) => (key && !builtin ? findRecipe(s.recipes, key) : undefined))
  const { recipes, error } = useBuiltinRecipes()
  const fromBuiltin = useMemo(() => (builtin && recipes ? recipes.find((r) => r.id === key) : undefined), [builtin, recipes, key])
  const recipe = builtin ? fromBuiltin : own
  const loading = builtin && recipes === null
  return useMemo(() => ({ recipe, loading, builtin, error: builtin ? error : undefined }), [recipe, loading, builtin, error])
}

/** Om receptet är en favorit. */
export function useIsFavoriteRecipe(recipeId: string): boolean {
  const favId = recipeFavoriteId(recipeId)
  return useFoodStore((s) => s.favorites.includes(favId))
}

/** Portionsordet för ett recept ("bulle/bullar" för vissa klassiker, annars portion/portioner). */
export function servingNounFor(recipe: Pick<Recipe, 'id' | 'builtin'>): ServingNoun {
  if (!recipe.builtin) return DEFAULT_SERVING_NOUN
  return builtinRecipeInfo(recipe.id)?.servingNoun ?? DEFAULT_SERVING_NOUN
}
