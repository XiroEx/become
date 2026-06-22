"use client"

import { use } from 'react'
import RecipeForm from '@/components/nutrition/RecipeForm'

export default function RecipeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <RecipeForm recipeId={id} />
}
