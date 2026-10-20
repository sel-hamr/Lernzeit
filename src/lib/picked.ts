/**
 * Cards picked in Flashcards travel to the review page in the navigation
 * state, not the address, so picking hundreds of cards keeps a short URL.
 * The state survives a reload of the review page.
 */
export interface PickedState {
  pickedCards: string[]
}

export const pickedState = (cardIds: Iterable<string>): PickedState => ({ pickedCards: [...cardIds] })

/** The picked card ids in a location's state, or undefined when the round was not picked. */
export function readPicked(state: unknown): string[] | undefined {
  const ids = (state as Partial<PickedState> | null)?.pickedCards
  return Array.isArray(ids) && ids.length && ids.every((id) => typeof id === 'string') ? ids : undefined
}
