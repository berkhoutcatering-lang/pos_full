// One-off dev helper: create a confirmed owner user + membership on the
// local Supabase so login → select-venue → /pos works. Idempotent.
const API = "http://127.0.0.1:54321"
const SR =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
const ORG = "00000000-0000-0000-0000-000000000001"
const EMAIL = "sam@hopbites.dev"
const PASSWORD = "hopbites123"

const h = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" }

let userId
const create = await fetch(`${API}/auth/v1/admin/users`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
})
const cj = await create.json().catch(() => ({}))
userId = cj.id
if (!userId) {
  // Already exists — look it up.
  const list = await fetch(`${API}/auth/v1/admin/users?per_page=200`, { headers: h })
  const lj = await list.json().catch(() => ({}))
  userId = (lj.users || []).find((u) => u.email === EMAIL)?.id
}
console.log("create status:", create.status, "userId:", userId)
if (!userId) {
  console.error("FAILED to obtain userId:", JSON.stringify(cj).slice(0, 300))
  process.exit(1)
}

// Shared-DB tenant model: organization_members with a POS-specific pos_role.
// role stays BBQ's free-text value ('Admin'); pos_role drives POS RLS.
const mem = await fetch(`${API}/rest/v1/organization_members`, {
  method: "POST",
  headers: { ...h, Prefer: "return=representation,resolution=merge-duplicates" },
  body: JSON.stringify({
    organization_id: ORG,
    user_id: userId,
    role: "Admin",
    status: "active",
    pos_role: "owner",
  }),
})
const mt = await mem.text()
console.log("organization_members status:", mem.status, mt.slice(0, 300))
