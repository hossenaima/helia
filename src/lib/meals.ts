export type Macros = { proteinG: number; carbsG: number; fatG: number };

/**
 * A starting name based on the clock, so the common case needs no typing.
 * It is only a suggestion — the field is free text and a day can hold any
 * number of meals with any names.
 */
export function suggestMealName(hour: number): string {
  if (hour < 11) return "Breakfast";
  if (hour < 16) return "Lunch";
  if (hour < 21) return "Dinner";
  return "Snack";
}

export function macroEnergyShares(macros: Macros) {
  const protein = macros.proteinG * 4;
  const carbs = macros.carbsG * 4;
  const fat = macros.fatG * 9;
  const total = protein + carbs + fat;
  if (total <= 0) return null;
  return {
    protein: (protein / total) * 100,
    carbs: (carbs / total) * 100,
    fat: (fat / total) * 100,
  };
}

