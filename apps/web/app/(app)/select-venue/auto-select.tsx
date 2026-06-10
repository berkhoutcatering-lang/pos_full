"use client"
import { useEffect, useRef } from "react"
import { selectVenueAction } from "./actions"

// Eén locatie = niets te kiezen: submit de keuze automatisch zodat de
// gebruiker direct in de kassa landt in plaats van op een scherm met één
// knop. De zichtbare rij blijft eronder staan als fallback (bv. als JS
// nog laadt).

export function AutoSelectVenue({ venueId }: { venueId: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    formRef.current?.requestSubmit()
  }, [])
  return (
    <form ref={formRef} action={selectVenueAction} hidden aria-hidden>
      <input type="hidden" name="venueId" value={venueId} />
    </form>
  )
}
