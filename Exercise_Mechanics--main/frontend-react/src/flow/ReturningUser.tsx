/* ReturningUser.tsx — the single "existing user" page, V2 flat edition. The
   greeting is the headline (your name, ended by the keypoint node), and every
   profile cached on this device is a selectable card — the active one carries
   a green "tracked" node and a lit avatar. Picking a card only switches which
   saved profile is active — it never deletes anyone. Continue → Dashboard. */
import { useState } from 'react'
import type { CachedUser } from './storage'
import { Eyebrow, NavLink, PillButton, Wordmark } from './uiV2'

export function ReturningUser(
  { users, activeId, onSelect, onContinue, onBack }:
  { users: CachedUser[]; activeId?: string
    onSelect: (u: CachedUser) => void
    onContinue: (u: CachedUser) => void; onBack: () => void },
) {
  // Local selection, seeded with the active profile (or the first known one).
  const initial = users.find((u) => u.user_id === activeId) ?? users[0]
  const [selected, setSelected] = useState<CachedUser | undefined>(initial)

  const pick = (u: CachedUser) => {
    setSelected(u)
    onSelect(u) // promote to active so the Dashboard loads the right profile
  }

  const firstName = selected?.first_name ?? 'Hello'

  return (
    <div className="v2 v2-ru">
      <header className="v2-top"><Wordmark /></header>
      <div className="v2-ru__inner">
        <Eyebrow>Welcome back</Eyebrow>

        <h1 className="v2-h1" style={firstName.length > 11 ? { fontSize: 'clamp(40px, 4.6vw, 68px)' } : undefined}>
          {firstName}
        </h1>

        <p className="v2-ru__sub">Choose your profile to continue.</p>

        {/* Every profile saved on this device — picking one never deletes another. */}
        <div className="v2-ru__cards">
          {users.map((u) => {
            const on = selected?.user_id === u.user_id
            return (
              <button
                key={u.user_id}
                type="button"
                className={`v2-pcard${on ? ' v2-pcard--on' : ''}`}
                onClick={() => pick(u)}
                aria-pressed={on}
              >
                <span className="v2-avatar">{initials(u)}</span>
                <span className="v2-pcard__name">{`${u.first_name} ${u.last_name}`.trim()}</span>
              </button>
            )
          })}
        </div>

        <div className="v2-ru__cta">
          <PillButton onClick={() => selected && onContinue(selected)} disabled={!selected}>
            Continue
          </PillButton>
        </div>

        <div className="v2-ru__back">
          <NavLink onClick={onBack}>← Back</NavLink>
        </div>
      </div>
    </div>
  )
}

function initials(u: CachedUser): string {
  return `${u.first_name[0] ?? ''}${u.last_name?.[0] ?? ''}`.toUpperCase()
}
